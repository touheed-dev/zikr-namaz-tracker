import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToday } from '../context/AuthContext.jsx';
import { useQuran } from '../hooks/useLogs.js';
import { useSummary } from '../hooks/useSummary.js';
import { useQuranPlayer } from '../context/QuranPlayerContext.jsx';
import { QuranMap } from '../components/heatmap/Heatmaps.jsx';
import { HadithCard } from '../components/ui/HadithCard.jsx';
import {
  Card,
  Icon,
  ProgressBar,
  LoadingBlocks,
  ErrorState,
  Tabs,
  Skeleton,
} from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { addDays, startOfWeek, daysBetween, isoWeekday } from '../utils/dates.js';
import { paraLabel, khatamProgress } from '../utils/points.js';
import { formatListenDuration, calculateKhatamProgress } from '../utils/quranAudio.js';
import { SURAHS, JUZ_LIST } from '../assets/surahs.js';
import { useToast } from '../context/ToastContext.jsx';
import { getItem, setItem } from '../utils/storage.js';

const QUICK = [
  { pages: 5, label: '+¼ para' },
  { pages: 10, label: '+½ para' },
  { pages: 20, label: '+1 para' },
  { pages: 40, label: '+2 para' },
];

const QURAN_TABS = [
  { value: 'read', label: 'Read' },
  { value: 'listen', label: 'Listen' },
];

const BROWSE_TABS = [
  { value: 'surah', label: 'By Surah' },
  { value: 'juz', label: 'By Juz' },
];

const SURAH_GROUPS = [
  { id: '1-10', start: 1, end: 10, label: '1–10' },
  { id: '11-20', start: 11, end: 20, label: '11–20' },
  { id: '21-30', start: 21, end: 30, label: '21–30' },
  { id: '31-40', start: 31, end: 40, label: '31–40' },
  { id: '41-50', start: 41, end: 50, label: '41–50' },
  { id: '51-60', start: 51, end: 60, label: '51–60' },
  { id: '61-70', start: 61, end: 70, label: '61–70' },
  { id: '71-80', start: 71, end: 80, label: '71–80' },
  { id: '81-90', start: 81, end: 90, label: '81–90' },
  { id: '91-100', start: 91, end: 100, label: '91–100' },
  { id: '101-110', start: 101, end: 110, label: '101–110' },
  { id: '111-114', start: 111, end: 114, label: '111–114' },
];

const FRIDAY_SURAHS = [18, 62, 63, 87, 88];

function SurahRow({ s, player }) {
  const isCur = player.currentSurah === s.n;
  const isCurPlaying = isCur && player.isPlaying;
  const isAvailable =
    !player.selectedReciter ||
    !player.selectedReciter.surahSet ||
    player.selectedReciter.surahSet.has(s.n);

  return (
    <div className={`surah-item ${isCur ? 'surah-item--active' : ''}`}>
      <div className="surah-item__num">{s.n}</div>
      <div className="surah-item__info">
        <div className="surah-item__names">
          <span className="surah-item__en">{s.en}</span>
          <span className="surah-item__ar">{s.ar}</span>
        </div>
        <div className="surah-item__meta">
          {s.ayahs} ayahs · {s.type === 'makki' ? 'Makki' : 'Madani'}
          {!isAvailable && (
            <span className="muted" style={{ marginLeft: 6 }}>
              (Not available for this reciter)
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="surah-item__btn"
        onClick={() => {
          if (isCur) {
            player.togglePlay();
          } else {
            player.playSurah(s.n, { mode: 'single', position: 0 });
          }
        }}
        disabled={!isAvailable}
        aria-label={
          isCurPlaying
            ? `Pause Surah ${s.en}`
            : `Play Surah ${s.en}`
        }
      >
        <Icon name={isCurPlaying ? 'pause' : 'play'} size={18} />
      </button>
    </div>
  );
}

export default function Quran() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') === 'listen' ? 'listen' : 'read';

  const setTab = (tab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'read') next.delete('tab');
        else next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  };

  const today = useToday();
  const from = addDays(addDays(startOfWeek(today), 6), -34);
  const qr = useQuran(from, today);
  const summary = useSummary();
  const toast = useToast();
  const saved = qr.pagesOn(today);
  const [pages, setPages] = useState(null);
  const value = pages ?? saved;

  const player = useQuranPlayer();
  const [surahFilter, setSurahFilter] = useState('');

  const [browseMode, setBrowseModeState] = useState(() => {
    return getItem('zn_quran_browse_mode', 'surah');
  });
  const setBrowseMode = (mode) => {
    setBrowseModeState(mode);
    setItem('zn_quran_browse_mode', mode);
  };

  const [openSurahGroup, setOpenSurahGroupState] = useState(() => {
    return getItem('zn_quran_open_surah_group', '1-10');
  });
  const setOpenSurahGroup = (id) => {
    setOpenSurahGroupState(id);
    setItem('zn_quran_open_surah_group', id || '');
  };

  const [openJuz, setOpenJuzState] = useState(() => {
    const v = getItem('zn_quran_open_juz', '1');
    return v ? Number(v) : 1;
  });
  const setOpenJuz = (n) => {
    setOpenJuzState(n);
    setItem('zn_quran_open_juz', n ? String(n) : '');
  };

  // when today's saved value arrives (or the day changes), reset the stepper
  useEffect(() => {
    setPages(null);
  }, [today, saved]);

  const weekStart = startOfWeek(today);
  const weekPages = qr.entries
    .filter((e) => daysBetween(weekStart, e.date) >= 0 && daysBetween(e.date, today) >= 0)
    .reduce((n, e) => n + e.pages, 0);
  const k = khatamProgress(qr.totalPages);
  const s = summary.data;
  const clamp = (n) => Math.max(0, Math.min(604, n));

  const save = async () => {
    try {
      await qr.save(today, value);
      setPages(null);
      summary.refresh();
      toast.show(`Saved: ${value} pages today`);
    } catch {
      /* rolled back + toast */
    }
  };

  // Filter surahs for listen tab
  const filteredSurahs = useMemo(() => {
    const q = surahFilter.trim().toLowerCase();
    if (!q) return SURAHS;
    return SURAHS.filter((s) => {
      return (
        String(s.n) === q ||
        s.en.toLowerCase().includes(q) ||
        s.ar.includes(q)
      );
    });
  }, [surahFilter]);

  const isFriday = isoWeekday(today) === 5;

  const khatamSurahNum = player.summary?.position?.surah || 1;
  const khatamSurahObj = SURAHS.find((item) => item.n === khatamSurahNum) || SURAHS[0];
  const isKhatamActive = player.currentSurah === khatamSurahNum && player.mode === 'khatam';
  const isKhatamPlaying = player.isPlaying && isKhatamActive;

  const currentPos = isKhatamActive
    ? player.currentTime
    : (player.summary?.position?.position_seconds || 0);
  const currentDur = isKhatamActive && player.duration > 0 ? player.duration : 0;

  const khatamProg = useMemo(() => {
    return calculateKhatamProgress(khatamSurahNum, currentPos, currentDur);
  }, [khatamSurahNum, currentPos, currentDur]);

  if (qr.loading) {
    return (
      <>
        <PageHead title="Quran" />
        <LoadingBlocks heights={[96, 330, 250, 90]} />
      </>
    );
  }
  if (qr.error) {
    return (
      <>
        <PageHead title="Quran" />
        <ErrorState error={qr.error} onRetry={qr.reload} />
      </>
    );
  }

  return (
    <>
      <PageHead title="Quran" />
      <Tabs
        label="Quran sections"
        items={QURAN_TABS}
        value={currentTab}
        onChange={setTab}
      />

      {currentTab === 'read' ? (
        <>
          <div className="grid-2">
            <div className="stat">
              <div className="stat__label">Quran streak</div>
              <div className="stat__value">
                {s ? `${s.quranStreak} ${s.quranStreak === 1 ? 'day' : 'days'}` : '—'}
              </div>
              <div className="stat__sub">Best {s ? s.quranBest : '—'}</div>
            </div>
            <div className="stat">
              <div className="stat__label">This week</div>
              <div className="stat__value">{weekPages} pages</div>
              <div className="stat__sub">≈ {paraLabel(weekPages)}</div>
            </div>
          </div>

          <Card title="Log today's recitation">
            <div className="field__label" id="pages-label">Pages</div>
            <div className="stepper" role="group" aria-labelledby="pages-label">
              <button
                type="button"
                className="stepper__btn"
                onClick={() => setPages(clamp(value - 1))}
                aria-label="One page less"
                disabled={value <= 0}
              >
                <Icon name="minus" />
              </button>
              <div className="stepper__val" aria-live="polite">
                <div className="stepper__num">{value}</div>
                <div className="small muted">pages · ≈ {paraLabel(value)}</div>
              </div>
              <button
                type="button"
                className="stepper__btn stepper__btn--plus"
                onClick={() => setPages(clamp(value + 1))}
                aria-label="One page more"
                disabled={value >= 604}
              >
                <Icon name="plus" />
              </button>
            </div>
            <div className="small muted">Or by para (1 para ≈ 20 pages)</div>
            <div className="row row--wrap">
              {QUICK.map((q) => (
                <button
                  key={q.pages}
                  type="button"
                  className="chip chip--btn"
                  onClick={() => setPages(clamp(value + q.pages))}
                >
                  {q.label}
                </button>
              ))}
              <button type="button" className="chip chip--btn" onClick={() => setPages(0)}>
                Reset
              </button>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={save}
              disabled={qr.saving || value === saved}
            >
              {qr.saving ? 'Saving…' : 'Save for today'}
            </button>
            <div className="tiny muted center">
              Save sets today&apos;s total. Quran never adds leaderboard points.
            </div>
          </Card>

          <Card title="Quran map" aside="Last 5 weeks">
            <QuranMap entries={qr.entries} today={today} />
            <div className="legend">
              <span className="legend__item">
                <span className="cell" />
                None
              </span>
              <span className="legend__item">
                <span className="cell cell--z1" />
                Under ¼ para
              </span>
              <span className="legend__item">
                <span className="cell cell--z2" />
                ¼ para or more
              </span>
            </div>
          </Card>

          <Card title="Khatam progress" aside={`Para ${k.para} · ${k.percent}%`}>
            <ProgressBar value={k.current} max={604} label="Khatam progress" />
            <div className="small muted">
              {k.completed > 0 ? `${k.completed} khatam${k.completed > 1 ? 's' : ''} completed. ` : ''}
              {qr.totalPages} pages in total. Private by default. Friends see your Quran streak only if you turn it on in Profile.
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Private listening stats line */}
          <div className="card card--deep row" style={{ gap: 10, padding: '12px 14px' }}>
            <Icon name="lock" size={18} className="muted" />
            <div className="grow small">
              <div>
                <span className="strong">Listened today:</span>{' '}
                {formatListenDuration(
                  typeof player.summary?.today === 'number'
                    ? player.summary.today
                    : player.summary?.today?.seconds || 0,
                )}
                <span className="muted"> · </span>
                <span className="strong">This week:</span>{' '}
                {formatListenDuration(
                  typeof player.summary?.week === 'number'
                    ? player.summary.week
                    : player.summary?.week?.seconds || 0,
                )}
              </div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                Private to you. Listening never gives leaderboard points and never marks pages as read.
              </div>
            </div>
          </div>

          {/* Reciter selector */}
          <Card title="Reciter">
            {player.recitersLoading ? (
              <Skeleton height={46} />
            ) : player.recitersError ? (
              <div className="stack">
                <div className="small muted">Could not load reciters: {player.recitersError}</div>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={player.loadReciters}
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="field">
                <select
                  value={player.selectedReciterId}
                  onChange={(e) => player.setSelectedReciterId(e.target.value)}
                  className="input"
                  aria-label="Select reciter"
                >
                  {player.reciters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Card>

          {/* Continue my Khatam Card */}
          <Card title="Continue my khatam" aside={`Surah ${khatamSurahNum} / 114`}>
            <ProgressBar
              value={khatamProg.percent}
              max={100}
              label="Khatam listening progress"
            />
            <div className="small muted row row--between">
              <span>{khatamSurahObj.en} ({khatamSurahObj.ar})</span>
              <span>{khatamProg.formattedPercent}</span>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--block mt-8"
              onClick={() => {
                if (isKhatamPlaying) {
                  player.togglePlay();
                } else if (isKhatamActive && player.currentTime > 0) {
                  player.resume();
                } else {
                  player.resumeKhatam();
                }
              }}
            >
              <Icon name={isKhatamPlaying ? 'pause' : 'play'} size={18} />
              <span>
                {isKhatamPlaying
                  ? 'Pause khatam'
                  : player.summary?.position?.position_seconds > 0 || (isKhatamActive && player.currentTime > 0)
                    ? `Resume Khatam (${khatamSurahObj.en})`
                    : `Start Khatam (${khatamSurahObj.en})`}
              </span>
            </button>
            <div className="tiny muted center">
              Plays sequentially through all 114 surahs and auto-advances.
            </div>
          </Card>

          {/* Friday Sunnah Recitations Card */}
          {isFriday && (
            <Card title="Friday Sunnah recitations" aside="Jumu'ah">
              <div className="small muted">
                Surahs recommended for recitation and reflection on Friday:
              </div>
              <div className="stack stack--sm mt-8">
                {FRIDAY_SURAHS.map((num) => {
                  const s = SURAHS.find((item) => item.n === num);
                  if (!s) return null;
                  return <SurahRow key={s.n} s={s} player={player} />;
                })}
              </div>
            </Card>
          )}

          {/* Browse Quran: By Surah | By Juz */}
          <Card title="Browse" aside="114 surahs · 30 juz">
            <div style={{ marginBottom: 14 }}>
              <Tabs
                label="Browse mode"
                items={BROWSE_TABS}
                value={browseMode}
                onChange={setBrowseMode}
              />
            </div>

            {browseMode === 'surah' ? (
              <>
                <div className="field">
                  <input
                    type="search"
                    className="input"
                    placeholder="Search surah name or number…"
                    value={surahFilter}
                    onChange={(e) => setSurahFilter(e.target.value)}
                    aria-label="Search surahs"
                  />
                </div>

                {surahFilter.trim() ? (
                  <div className="stack stack--sm mt-8">
                    {filteredSurahs.map((s) => (
                      <SurahRow key={s.n} s={s} player={player} />
                    ))}
                    {filteredSurahs.length === 0 && (
                      <div className="small muted center" style={{ padding: '16px 0' }}>
                        No surahs matching &quot;{surahFilter}&quot;
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="quran-accordion mt-8">
                    {SURAH_GROUPS.map((grp) => {
                      const isOpen = openSurahGroup === grp.id;
                      const groupSurahs = SURAHS.slice(grp.start - 1, grp.end);
                      const hasActive = groupSurahs.some((s) => s.n === player.currentSurah);
                      return (
                        <div
                          key={grp.id}
                          className={`quran-accordion__item ${isOpen ? 'quran-accordion__item--open' : ''}`}
                        >
                          <button
                            type="button"
                            className="quran-accordion__header"
                            onClick={() => setOpenSurahGroup(isOpen ? null : grp.id)}
                            aria-expanded={isOpen}
                          >
                            <span className="quran-accordion__title">
                              Surahs {grp.label}
                              {hasActive && (
                                <span className="chip chip--light chip--xs">Playing</span>
                              )}
                            </span>
                            <span className="row row--center" style={{ gap: 6 }}>
                              <span className="small muted">{groupSurahs.length} surahs</span>
                              <Icon
                                name={isOpen ? 'chevronUp' : 'chevronDown'}
                                size={18}
                                className="muted"
                              />
                            </span>
                          </button>
                          {isOpen && (
                            <div className="quran-accordion__content stack stack--sm">
                              {groupSurahs.map((s) => (
                                <SurahRow key={s.n} s={s} player={player} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="quran-accordion">
                {JUZ_LIST.map((j) => {
                  const isOpen = openJuz === j.n;
                  const juzSurahs = SURAHS.filter((s) => s.juzStart === j.n);
                  const hasActive = juzSurahs.some((s) => s.n === player.currentSurah);
                  return (
                    <div
                      key={j.n}
                      className={`quran-accordion__item ${isOpen ? 'quran-accordion__item--open' : ''}`}
                    >
                      <button
                        type="button"
                        className="quran-accordion__header"
                        onClick={() => setOpenJuz(isOpen ? null : j.n)}
                        aria-expanded={isOpen}
                      >
                        <span className="quran-accordion__title">
                          Juz {j.n} <span className="quran-accordion__ar">{j.ar}</span>
                          {hasActive && (
                            <span className="chip chip--light chip--xs">Playing</span>
                          )}
                        </span>
                        <span className="row row--center" style={{ gap: 6 }}>
                          <span className="small muted">
                            {juzSurahs.length > 0
                              ? `${juzSurahs.length} surah${juzSurahs.length === 1 ? '' : 's'}`
                              : 'Continues'}
                          </span>
                          <Icon
                            name={isOpen ? 'chevronUp' : 'chevronDown'}
                            size={18}
                            className="muted"
                          />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="quran-accordion__content stack stack--sm">
                          {juzSurahs.length > 0 ? (
                            juzSurahs.map((s) => (
                              <SurahRow key={s.n} s={s} player={player} />
                            ))
                          ) : (
                            <div className="small muted" style={{ padding: '8px 4px' }}>
                              No surah begins in Juz {j.n} (continues previous Surah).
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="tiny muted center mt-12">
              Audio provided by{' '}
              <a
                href="https://mp3quran.net"
                target="_blank"
                rel="noopener noreferrer"
              >
                mp3quran.net
              </a>
              .
            </div>
          </Card>
        </>
      )}

      <HadithCard screen="quran" />
    </>
  );
}