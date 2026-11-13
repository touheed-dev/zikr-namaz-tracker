import { useState } from 'react';
import { useQuranPlayer } from '../../context/QuranPlayerContext.jsx';
import { SURAHS } from '../../assets/surahs.js';
import { Icon } from './Icon.jsx';
import { Dialog } from './index.jsx';
import { formatPlaybackTime } from '../../utils/quranAudio.js';

export function QuranMiniPlayer() {
  const {
    currentSurah,
    isPlaying,
    currentTime,
    duration,
    selectedReciter,
    audioLoading,
    togglePlay,
    seekTo,
    seekBy,
    nextSurah,
    previousSurah,
    closePlayer,
  } = useQuranPlayer();

  const [isSheetOpen, setIsSheetOpen] = useState(false);

  if (!currentSurah) return null;

  const surah = SURAHS.find((s) => s.n === currentSurah) || {
    n: currentSurah,
    en: `Surah ${currentSurah}`,
    ar: '',
    ayahs: 0,
    type: 'makki',
  };

  const maxDuration = Math.max(1, Math.round(duration || 0));
  const roundedCurrent = Math.min(maxDuration, Math.max(0, Math.round(currentTime || 0)));
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <>
      <aside className="quran-mini-player" aria-label="Quran audio player">
        <div className="quran-mini-player__bar">
          {/* Draggable & accessible seek progress bar */}
          <div className="quran-mini-player__track">
            <div
              className="quran-mini-player__progress"
              style={{ width: `${progressPercent}%` }}
              aria-hidden="true"
            />
            <input
              type="range"
              min={0}
              max={maxDuration}
              value={roundedCurrent}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="quran-mini-player__seeker"
              aria-label="Seek track"
              aria-valuemin={0}
              aria-valuemax={maxDuration}
              aria-valuenow={roundedCurrent}
              aria-valuetext={`${formatPlaybackTime(currentTime)} of ${formatPlaybackTime(duration)}`}
            />
          </div>

          {/* Tapping info opens Now Playing sheet */}
          <div
            className="quran-mini-player__info"
            onClick={() => setIsSheetOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsSheetOpen(true);
              }
            }}
            aria-label={`Open Now Playing sheet for Surah ${surah.en}`}
          >
            <div className="quran-mini-player__icon">
              <Icon name="headphones" size={18} />
            </div>
            <div className="quran-mini-player__titles">
              <div className="quran-mini-player__title">
                <span className="num">{surah.n}.</span> {surah.en}
              </div>
              <div className="quran-mini-player__sub">
                {selectedReciter?.displayName || 'Reciter'} · {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
              </div>
            </div>
          </div>

          {/* Controls: -10s, play/pause, +10s, close */}
          <div className="quran-mini-player__actions">
            <button
              type="button"
              className="quran-mini-player__btn"
              onClick={() => seekBy(-10)}
              aria-label="Rewind 10 seconds"
              title="-10s"
            >
              <Icon name="rewind10" size={19} />
            </button>
            <button
              type="button"
              className="quran-mini-player__btn quran-mini-player__btn--play"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              disabled={audioLoading}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
            </button>
            <button
              type="button"
              className="quran-mini-player__btn"
              onClick={() => seekBy(10)}
              aria-label="Forward 10 seconds"
              title="+10s"
            >
              <Icon name="forward10" size={19} />
            </button>
            <button
              type="button"
              className="quran-mini-player__btn quran-mini-player__btn--close"
              onClick={closePlayer}
              aria-label="Close player"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Now Playing Sheet */}
      {isSheetOpen && (
        <Dialog title="Now Playing" onClose={() => setIsSheetOpen(false)}>
          <div className="now-playing">
            <div className="now-playing__badge">
              <Icon name="headphones" size={14} />
              <span>Surah {surah.n} of 114</span>
            </div>

            <div className="now-playing__titles">
              <div className="now-playing__ar">{surah.ar}</div>
              <div className="now-playing__en">{surah.en}</div>
              <div className="now-playing__reciter">
                {selectedReciter?.displayName || 'Reciter'}
              </div>
            </div>

            {/* Seek slider with current/total time */}
            <div className="now-playing__seek">
              <input
                type="range"
                min={0}
                max={maxDuration}
                value={roundedCurrent}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="now-playing__slider"
                aria-label="Seek track"
                aria-valuemin={0}
                aria-valuemax={maxDuration}
                aria-valuenow={roundedCurrent}
                aria-valuetext={`${formatPlaybackTime(currentTime)} of ${formatPlaybackTime(duration)}`}
              />
              <div className="row row--between small muted">
                <span>{formatPlaybackTime(currentTime)}</span>
                <span>{formatPlaybackTime(duration)}</span>
              </div>
            </div>

            {/* Controls: previous surah, -10s, play/pause, +10s, next surah */}
            <div className="now-playing__controls">
              <button
                type="button"
                className="now-playing__btn"
                onClick={previousSurah}
                disabled={surah.n <= 1}
                aria-label="Previous Surah"
                title="Previous Surah"
              >
                <Icon name="skipBack" size={20} />
              </button>

              <button
                type="button"
                className="now-playing__btn"
                onClick={() => seekBy(-10)}
                aria-label="Rewind 10 seconds"
                title="-10 seconds"
              >
                <Icon name="rewind10" size={22} />
              </button>

              <button
                type="button"
                className="now-playing__play-btn"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                disabled={audioLoading}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={28} />
              </button>

              <button
                type="button"
                className="now-playing__btn"
                onClick={() => seekBy(10)}
                aria-label="Forward 10 seconds"
                title="+10 seconds"
              >
                <Icon name="forward10" size={22} />
              </button>

              <button
                type="button"
                className="now-playing__btn"
                onClick={nextSurah}
                disabled={surah.n >= 114}
                aria-label="Next Surah"
                title="Next Surah"
              >
                <Icon name="skipForward" size={20} />
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
