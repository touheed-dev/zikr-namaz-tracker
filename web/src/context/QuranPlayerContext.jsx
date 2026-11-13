import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';
import { quranListen } from '../api/index.js';
import { SURAHS } from '../assets/surahs.js';
import {
  fetchReciters,
  getAudioUrl,
  DEFAULT_RECITER_ID,
  REWIND_SECONDS,
  rewindPosition,
  mapAcrossReciters,
} from '../utils/quranAudio.js';
import { getItem, setItem } from '../utils/storage.js';

const QuranPlayerContext = createContext(null);

const RECITER_STORAGE_KEY = 'zn_quran_reciter';

export function QuranPlayerProvider({ children }) {
  const { status } = useAuth();
  const toast = useToast();

  const audioRef = useRef(null);

  const [reciters, setReciters] = useState([]);
  const [recitersLoading, setRecitersLoading] = useState(true);
  const [recitersError, setRecitersError] = useState(null);

  const [selectedReciterId, setSelectedReciterIdState] = useState(() => {
    return getItem(RECITER_STORAGE_KEY) || DEFAULT_RECITER_ID;
  });

  const [currentSurah, setCurrentSurah] = useState(null);
  const [mode, setMode] = useState('single'); // 'khatam' | 'single'
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState(null);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // References to track flush state across renders
  const lastPlayTimestampRef = useRef(null);
  const unflushedSecondsRef = useRef(0);
  const isFlushingRef = useRef(false);

  const lastSavedPosTimeRef = useRef(0);
  const lastSavedPosValRef = useRef(-1);
  const isSavingPosRef = useRef(false);

  const lastToastTimeRef = useRef(0);

  const pendingReciterChangeRef = useRef(null);
  const pendingInitialSeekRef = useRef(null);

  const currentSurahRef = useRef(currentSurah);
  currentSurahRef.current = currentSurah;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const notifyListenError = useCallback((msg = "Couldn't save listening time") => {
    const now = Date.now();
    if (now - lastToastTimeRef.current > 10000) {
      lastToastTimeRef.current = now;
      if (toast && typeof toast.show === 'function') {
        toast.show(msg, { tone: 'error' });
      }
    }
  }, [toast]);

  const capturePlayedTime = useCallback(() => {
    if (lastPlayTimestampRef.current != null) {
      const now = Date.now();
      const elapsedSec = (now - lastPlayTimestampRef.current) / 1000;
      lastPlayTimestampRef.current = now;
      if (elapsedSec > 0) {
        // Discard impossible leaps (e.g. laptop wake from long sleep)
        const valid = Math.min(elapsedSec, 35);
        unflushedSecondsRef.current += valid;
      }
    }
  }, []);

  const loadReciters = useCallback(async () => {
    setRecitersLoading(true);
    setRecitersError(null);
    try {
      const list = await fetchReciters();
      setReciters(list);
      if (list.length > 0) {
        setSelectedReciterIdState((cur) => {
          const match = list.find((r) => r.id === cur);
          return match ? cur : list[0].id;
        });
      }
    } catch (err) {
      setRecitersError(err.message || 'Failed to load reciters');
    } finally {
      setRecitersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReciters();
  }, [loadReciters]);

  const loadSummary = useCallback(async () => {
    if (status !== 'signedIn') return;
    setSummaryLoading(true);
    try {
      const data = await quranListen.summary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to load listen summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const selectedReciter = useMemo(() => {
    return reciters.find((r) => r.id === selectedReciterId) || reciters[0] || null;
  }, [reciters, selectedReciterId]);

  const setSelectedReciterId = useCallback((id) => {
    setSelectedReciterIdState(id);
    setItem(RECITER_STORAGE_KEY, id);
  }, []);

  // Flush pending seconds to database in chunks of <= 300
  const flushSeconds = useCallback(async () => {
    if (status !== 'signedIn') {
      return;
    }
    capturePlayedTime();
    if (isFlushingRef.current) return;

    const totalWhole = Math.floor(unflushedSecondsRef.current);
    if (totalWhole < 1) return;

    isFlushingRef.current = true;
    let anySuccess = false;

    try {
      while (Math.floor(unflushedSecondsRef.current) >= 1) {
        const chunk = Math.min(Math.floor(unflushedSecondsRef.current), 300);
        if (chunk < 1) break;

        unflushedSecondsRef.current -= chunk;
        try {
          await quranListen.addSeconds(chunk);
          anySuccess = true;
        } catch (err) {
          unflushedSecondsRef.current += chunk;
          throw err;
        }
      }
    } catch (err) {
      console.error('Failed to save listen seconds:', err);
      notifyListenError("Couldn't save listening time");
    } finally {
      isFlushingRef.current = false;
      if (anySuccess) {
        loadSummary();
      }
    }
  }, [status, capturePlayedTime, loadSummary, notifyListenError]);

  // Save current position for khatam mode (throttled)
  const savePosition = useCallback(async (surah, pos, force = false) => {
    if (status !== 'signedIn' || !surah || !selectedReciter) return;
    if (modeRef.current !== 'khatam') return;

    const now = Date.now();
    const roundedPos = Math.max(0, Math.floor(pos));

    if (!force) {
      if (now - lastSavedPosTimeRef.current < 10000 && Math.abs(roundedPos - lastSavedPosValRef.current) < 5) {
        return;
      }
    }

    if (isSavingPosRef.current) return;
    isSavingPosRef.current = true;

    try {
      await quranListen.setPosition(selectedReciter.displayName, surah, roundedPos);
      lastSavedPosTimeRef.current = now;
      lastSavedPosValRef.current = roundedPos;
    } catch (err) {
      console.error('Failed to save listen position:', err);
      notifyListenError("Couldn't save listening time");
    } finally {
      isSavingPosRef.current = false;
    }
  }, [status, selectedReciter, notifyListenError]);

  // Main play function
  const playSurah = useCallback((surahNumber, options = {}) => {
    const num = Number(surahNumber);
    if (!num || num < 1 || num > 114) return false;

    const reciter = options.reciterId
      ? reciters.find((r) => r.id === options.reciterId) || selectedReciter
      : selectedReciter;

    if (!reciter) {
      setAudioError('Reciter data not ready');
      return false;
    }

    if (reciter.surahSet && !reciter.surahSet.has(num)) {
      setAudioError(`Surah ${num} is not available for ${reciter.displayName}`);
      return false;
    }

    // Flush and save position on surah change
    if (currentSurahRef.current && currentSurahRef.current !== num) {
      capturePlayedTime();
      flushSeconds();
      if (modeRef.current === 'khatam') {
        savePosition(currentSurahRef.current, currentTimeRef.current, true);
      }
    }

    const nextMode = options.mode || (modeRef.current || 'single');
    setMode(nextMode);
    modeRef.current = nextMode;

    const audioUrl = getAudioUrl(reciter.server, num);
    if (!audioUrl) {
      setAudioError('Audio URL could not be generated');
      return false;
    }

    setAudioError(null);
    setAudioLoading(true);
    setCurrentSurah(num);

    const initialPos = Math.max(0, options.position || 0);
    pendingReciterChangeRef.current = null;
    pendingInitialSeekRef.current = initialPos;

    if (audioRef.current) {
      if (audioRef.current.src !== audioUrl) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
      } else {
        audioRef.current.currentTime = initialPos;
        pendingInitialSeekRef.current = null;
      }
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        if (err.name !== 'AbortError') {
          setAudioError('Playback failed. Tap play to start.');
        }
        setIsPlaying(false);
      });
    }

    if (nextMode === 'khatam' && status === 'signedIn') {
      savePosition(num, initialPos, true);
    }

    return true;
  }, [reciters, selectedReciter, savePosition, status, capturePlayedTime, flushSeconds]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    capturePlayedTime();
    lastPlayTimestampRef.current = null;
    setIsPlaying(false);
    flushSeconds();
    if (modeRef.current === 'khatam' && currentSurahRef.current) {
      savePosition(currentSurahRef.current, currentTimeRef.current, true);
    }
  }, [capturePlayedTime, flushSeconds, savePosition]);

  const resume = useCallback(() => {
    if (audioRef.current && currentSurahRef.current) {
      const cur = audioRef.current.currentTime || currentTimeRef.current || 0;
      const target = rewindPosition(cur, REWIND_SECONDS.PAUSE);
      try {
        audioRef.current.currentTime = target;
      } catch (err) {
        console.error('Failed to set rewind currentTime on resume:', err);
      }
      setCurrentTime(target);
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        if (err.name !== 'AbortError') {
          setAudioError('Could not resume audio');
        }
      });
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const seekTo = useCallback((posSeconds) => {
    if (audioRef.current) {
      const clamped = Math.max(0, Math.min(duration || 0, posSeconds));
      audioRef.current.currentTime = clamped;
      setCurrentTime(clamped);
      if (modeRef.current === 'khatam' && currentSurahRef.current) {
        savePosition(currentSurahRef.current, clamped);
      }
    }
  }, [duration, savePosition]);

  const seekBy = useCallback((delta) => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime ?? currentTimeRef.current ?? 0;
      const target = Math.max(0, Math.min(duration || 0, cur + delta));
      seekTo(target);
    }
  }, [duration, seekTo]);

  const nextSurah = useCallback(() => {
    if (currentSurahRef.current && currentSurahRef.current < 114) {
      playSurah(currentSurahRef.current + 1, { mode: modeRef.current, position: 0 });
    }
  }, [playSurah]);

  const previousSurah = useCallback(() => {
    if (currentSurahRef.current && currentSurahRef.current > 1) {
      playSurah(currentSurahRef.current - 1, { mode: modeRef.current, position: 0 });
    }
  }, [playSurah]);

  const closePlayer = useCallback(() => {
    pause();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setCurrentSurah(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setAudioLoading(false);
    setAudioError(null);
  }, [pause]);

  const resumeKhatam = useCallback(() => {
    const pos = summary?.position;
    const targetSurah = pos?.surah || 1;
    const targetSeconds = pos?.position_seconds || 0;
    const targetPos = rewindPosition(targetSeconds, REWIND_SECONDS.RESUME_SAVED);
    playSurah(targetSurah, { mode: 'khatam', position: targetPos });
  }, [summary, playSurah]);

  // Reciter change mid-surah: map by fraction, wait for loadedmetadata before seeking
  const handleReciterChange = useCallback((newReciterId) => {
    setSelectedReciterId(newReciterId);
    const curSurah = currentSurahRef.current;
    if (!curSurah) return;

    capturePlayedTime();
    flushSeconds();
    if (modeRef.current === 'khatam') {
      savePosition(curSurah, currentTimeRef.current, true);
    }

    const newRec = reciters.find((r) => r.id === newReciterId);
    if (!newRec) return;

    if (newRec.surahSet && !newRec.surahSet.has(curSurah)) {
      setAudioError(`Surah ${curSurah} is not available for ${newRec.displayName}`);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      return;
    }

    const oldPos = audioRef.current ? audioRef.current.currentTime : currentTimeRef.current;
    const oldDur = (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration))
      ? audioRef.current.duration
      : (duration || 0);
    const wasPlaying = isPlayingRef.current;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    pendingReciterChangeRef.current = { oldPos, oldDur, wasPlaying };
    setAudioLoading(true);
    setAudioError(null);

    const audioUrl = getAudioUrl(newRec.server, curSurah);
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
    }
  }, [setSelectedReciterId, reciters, duration, capturePlayedTime, flushSeconds, savePosition]);

  // Audio element event listeners
  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    setCurrentTime(cur);

    if (!audioRef.current.paused && !audioRef.current.seeking) {
      capturePlayedTime();
      if (unflushedSecondsRef.current >= 30) {
        flushSeconds();
      }
    }

    if (modeRef.current === 'khatam' && currentSurahRef.current && isPlayingRef.current) {
      savePosition(currentSurahRef.current, cur, false);
    }
  };

  const onLoadedMetadata = () => {
    if (!audioRef.current) return;
    const newDur = audioRef.current.duration || 0;
    setDuration(newDur);
    setAudioLoading(false);

    if (pendingReciterChangeRef.current) {
      const { oldPos, oldDur, wasPlaying } = pendingReciterChangeRef.current;
      pendingReciterChangeRef.current = null;
      const newPos = mapAcrossReciters(oldPos, oldDur, newDur, REWIND_SECONDS.RECITER_CHANGE);
      try {
        audioRef.current.currentTime = newPos;
      } catch (e) {
        console.error('Failed to seek new reciter position:', e);
      }
      setCurrentTime(newPos);
      if (modeRef.current === 'khatam' && currentSurahRef.current) {
        savePosition(currentSurahRef.current, newPos, true);
      }
      if (wasPlaying) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch((err) => {
          if (err.name !== 'AbortError') {
            setAudioError('Playback failed. Tap play to start.');
          }
          setIsPlaying(false);
        });
      }
    } else if (pendingInitialSeekRef.current != null) {
      const pos = pendingInitialSeekRef.current;
      pendingInitialSeekRef.current = null;
      try {
        audioRef.current.currentTime = pos;
      } catch (e) {
        console.error('Failed to seek initial position:', e);
      }
      setCurrentTime(pos);
    }
  };

  const onEnded = () => {
    capturePlayedTime();
    lastPlayTimestampRef.current = null;
    setIsPlaying(false);
    flushSeconds();
    if (modeRef.current === 'khatam' && currentSurahRef.current) {
      if (currentSurahRef.current < 114) {
        const nextSurah = currentSurahRef.current + 1;
        savePosition(nextSurah, 0, true);
        playSurah(nextSurah, { mode: 'khatam', position: 0 });
        return;
      }
      savePosition(114, duration || currentTimeRef.current, true);
    }
    setCurrentTime(0);
  };

  // Periodic flush & position save check every second while playing
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        capturePlayedTime();
        if (unflushedSecondsRef.current >= 30) {
          flushSeconds();
        }
        if (modeRef.current === 'khatam' && currentSurahRef.current) {
          savePosition(currentSurahRef.current, currentTimeRef.current, false);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [capturePlayedTime, flushSeconds, savePosition]);

  // Flush on visibility change (hidden) and pagehide / beforeunload
  useEffect(() => {
    const handleHiddenOrLeave = () => {
      capturePlayedTime();
      flushSeconds();
      if (modeRef.current === 'khatam' && currentSurahRef.current) {
        savePosition(currentSurahRef.current, currentTimeRef.current, true);
      }
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        handleHiddenOrLeave();
      } else if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (audioRef.current && !audioRef.current.paused) {
          lastPlayTimestampRef.current = Date.now();
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', handleHiddenOrLeave);
    window.addEventListener('beforeunload', handleHiddenOrLeave);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', handleHiddenOrLeave);
      window.removeEventListener('beforeunload', handleHiddenOrLeave);
    };
  }, [capturePlayedTime, flushSeconds, savePosition]);

  // Media Session API integration
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    if (currentSurah) {
      const s = SURAHS.find((item) => item.n === currentSurah);
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: s ? `Surah ${s.en} (${s.ar})` : `Surah ${currentSurah}`,
        artist: selectedReciter?.displayName || 'Reciter',
        album: 'Holy Quran',
        artwork: [
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => previousSurah());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextSurah());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          seekTo(details.seekTime);
        }
      });
      try {
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const offset = details.seekOffset || 10;
          seekBy(-offset);
        });
      } catch {
        /* unsupported action handler in some browsers */
      }
      try {
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const offset = details.seekOffset || 10;
          seekBy(offset);
        });
      } catch {
        /* unsupported action handler in some browsers */
      }
    } else {
      navigator.mediaSession.playbackState = 'none';
    }
  }, [currentSurah, isPlaying, selectedReciter, resume, pause, previousSurah, nextSurah, seekTo, seekBy]);

  // Position state for media session
  useEffect(() => {
    if (
      typeof navigator !== 'undefined' &&
      'mediaSession' in navigator &&
      navigator.mediaSession.setPositionState &&
      duration > 0
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(currentTime, duration),
        });
      } catch {
        // Some browsers throw if position is out of range
      }
    }
  }, [currentTime, duration]);

  const value = {
    reciters,
    recitersLoading,
    recitersError,
    loadReciters,
    selectedReciter,
    selectedReciterId,
    setSelectedReciterId: handleReciterChange,
    currentSurah,
    mode,
    isPlaying,
    currentTime,
    duration,
    audioLoading,
    audioError,
    summary,
    summaryLoading,
    refreshSummary: loadSummary,
    playSurah,
    pause,
    resume,
    togglePlay,
    seekTo,
    seekBy,
    nextSurah,
    previousSurah,
    closePlayer,
    resumeKhatam,
  };

  return (
    <QuranPlayerContext.Provider value={value}>
      {children}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlaying={() => {
          lastPlayTimestampRef.current = Date.now();
          setIsPlaying(true);
          setAudioLoading(false);
        }}
        onPause={() => {
          capturePlayedTime();
          lastPlayTimestampRef.current = null;
          setIsPlaying(false);
        }}
        onWaiting={() => {
          capturePlayedTime();
          lastPlayTimestampRef.current = null;
          setAudioLoading(true);
        }}
        onSeeking={() => {
          capturePlayedTime();
          lastPlayTimestampRef.current = null;
        }}
        onSeeked={() => {
          if (audioRef.current && !audioRef.current.paused) {
            lastPlayTimestampRef.current = Date.now();
          }
        }}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onCanPlay={() => setAudioLoading(false)}
        onEnded={onEnded}
        onError={() => {
          capturePlayedTime();
          lastPlayTimestampRef.current = null;
          setAudioLoading(false);
          setIsPlaying(false);
          setAudioError('Failed to stream audio from mp3quran.net');
        }}
      />
    </QuranPlayerContext.Provider>
  );
}

export function useQuranPlayer() {
  const ctx = useContext(QuranPlayerContext);
  if (!ctx) {
    throw new Error('useQuranPlayer must be used within a QuranPlayerProvider');
  }
  return ctx;
}
