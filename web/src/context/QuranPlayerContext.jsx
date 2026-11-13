import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext.jsx';
import { quranListen } from '../api/index.js';
import { SURAHS } from '../assets/surahs.js';
import {
  fetchReciters,
  getAudioUrl,
  DEFAULT_RECITER_ID,
} from '../utils/quranAudio.js';
import { getItem, setItem } from '../utils/storage.js';

const QuranPlayerContext = createContext(null);

const RECITER_STORAGE_KEY = 'zn_quran_reciter';

export function QuranPlayerProvider({ children }) {
  const { status } = useAuth();
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
  const pendingSecondsRef = useRef(0);
  const lastSavedPosRef = useRef(0);
  const currentSurahRef = useRef(currentSurah);
  currentSurahRef.current = currentSurah;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const loadReciters = useCallback(async () => {
    setRecitersLoading(true);
    setRecitersError(null);
    try {
      const list = await fetchReciters();
      setReciters(list);
      // If selected reciter is not in list, fallback to default or first
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
    } catch {
      // Non-blocking error
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

  // Flush pending seconds to database
  const flushSeconds = useCallback(async () => {
    if (status !== 'signedIn') {
      pendingSecondsRef.current = 0;
      return;
    }
    const toFlush = Math.min(pendingSecondsRef.current, 300);
    if (toFlush <= 0) return;

    pendingSecondsRef.current -= toFlush;
    try {
      await quranListen.addSeconds(toFlush);
      loadSummary();
    } catch {
      // On failure, return back to pending
      pendingSecondsRef.current += toFlush;
    }
  }, [status, loadSummary]);

  // Save current position for khatam mode
  const savePosition = useCallback(async (surah, pos) => {
    if (status !== 'signedIn' || !surah || !selectedReciter) return;
    try {
      await quranListen.setPosition(selectedReciter.displayName, surah, Math.floor(pos));
      lastSavedPosRef.current = pos;
    } catch {
      // Non-blocking
    }
  }, [status, selectedReciter]);

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

    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.currentTime = initialPos;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        // User-interaction / autoplay block or network error
        if (err.name !== 'AbortError') {
          setAudioError('Playback failed. Tap play to start.');
        }
        setIsPlaying(false);
      });
    }

    if (nextMode === 'khatam' && status === 'signedIn') {
      savePosition(num, initialPos);
    }

    return true;
  }, [reciters, selectedReciter, savePosition, status]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    flushSeconds();
    if (modeRef.current === 'khatam' && currentSurahRef.current) {
      savePosition(currentSurahRef.current, currentTimeRef.current);
    }
  }, [flushSeconds, savePosition]);

  const resume = useCallback(() => {
    if (audioRef.current && currentSurahRef.current) {
      audioRef.current.play().catch(() => {
        setAudioError('Could not resume audio');
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
    playSurah(targetSurah, { mode: 'khatam', position: targetSeconds });
  }, [summary, playSurah]);

  // Switch reciter while playing if needed
  const handleReciterChange = useCallback((newReciterId) => {
    setSelectedReciterId(newReciterId);
    if (currentSurahRef.current && isPlayingRef.current) {
      const newRec = reciters.find((r) => r.id === newReciterId);
      if (newRec && (!newRec.surahSet || newRec.surahSet.has(currentSurahRef.current))) {
        playSurah(currentSurahRef.current, {
          reciterId: newReciterId,
          position: currentTimeRef.current,
          mode: modeRef.current,
        });
      }
    }
  }, [setSelectedReciterId, reciters, playSurah]);

  // Audio element event listeners
  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    setCurrentTime(cur);

    // Save khatam position every 15 seconds
    if (modeRef.current === 'khatam' && currentSurahRef.current && isPlayingRef.current) {
      if (Math.abs(cur - lastSavedPosRef.current) >= 15) {
        savePosition(currentSurahRef.current, cur);
      }
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
    setAudioLoading(false);
  };

  const onEnded = () => {
    flushSeconds();
    if (modeRef.current === 'khatam' && currentSurahRef.current) {
      if (currentSurahRef.current < 114) {
        const nextSurah = currentSurahRef.current + 1;
        savePosition(nextSurah, 0);
        playSurah(nextSurah, { mode: 'khatam', position: 0 });
        return;
      }
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // 1-second interval for tracking listening time
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      const isMediaSessionPlaying =
        typeof navigator !== 'undefined' &&
        'mediaSession' in navigator &&
        navigator.mediaSession.playbackState === 'playing';

      if (isVisible || isMediaSessionPlaying) {
        pendingSecondsRef.current += 1;
      }

      if (pendingSecondsRef.current >= 60) {
        flushSeconds();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, flushSeconds]);

  // Flush on unload
  useEffect(() => {
    const handleUnload = () => {
      if (isPlayingRef.current) {
        if (modeRef.current === 'khatam' && currentSurahRef.current) {
          savePosition(currentSurahRef.current, currentTimeRef.current);
        }
        flushSeconds();
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [savePosition, flushSeconds]);

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
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (currentSurah > 1) {
          playSurah(currentSurah - 1, { mode, position: 0 });
        }
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (currentSurah < 114) {
          playSurah(currentSurah + 1, { mode, position: 0 });
        }
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          seekTo(details.seekTime);
        }
      });
    } else {
      navigator.mediaSession.playbackState = 'none';
    }
  }, [currentSurah, isPlaying, selectedReciter, mode, resume, pause, playSurah, seekTo]);

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
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onWaiting={() => setAudioLoading(true)}
        onCanPlay={() => setAudioLoading(false)}
        onEnded={onEnded}
        onError={() => {
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