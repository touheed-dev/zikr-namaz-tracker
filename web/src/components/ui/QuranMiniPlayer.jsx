import { useNavigate, useLocation } from 'react-router-dom';
import { useQuranPlayer } from '../../context/QuranPlayerContext.jsx';
import { SURAHS } from '../../assets/surahs.js';
import { Icon } from './Icon.jsx';
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
    closePlayer,
  } = useQuranPlayer();

  const navigate = useNavigate();
  const location = useLocation();

  if (!currentSurah) return null;

  const surah = SURAHS.find((s) => s.n === currentSurah) || {
    n: currentSurah,
    en: `Surah ${currentSurah}`,
    ar: '',
  };

  const handleOpenListen = () => {
    if (location.pathname === '/quran' && location.search.includes('tab=listen')) {
      return;
    }
    navigate('/quran?tab=listen');
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <aside className="quran-mini-player" aria-label="Quran audio player">
      <div className="quran-mini-player__bar">
        <div
          className="quran-mini-player__progress"
          style={{ width: `${progressPercent}%` }}
          aria-hidden="true"
        />
        <div
          className="quran-mini-player__info"
          onClick={handleOpenListen}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenListen();
            }
          }}
          aria-label={`Open Surah ${surah.en} player`}
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

        <div className="quran-mini-player__actions">
          <button
            type="button"
            className="quran-mini-player__btn"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            disabled={audioLoading}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
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
  );
}