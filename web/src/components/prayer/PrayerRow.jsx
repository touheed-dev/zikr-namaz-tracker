import { PRAYER_LABELS } from '../../utils/points.js';

const MAIN = [
  { status: 'jamaat', label: 'Jamaat' },
  { status: 'alone', label: 'Alone' },
  { status: 'missed', label: 'Missed' },
];

/**
 * One prayer: Jamaat / Alone / Missed segmented buttons, plus "Qaza" when the
 * prayer is missed (or already made up). Tapping the active status clears it.
 * Buttons are disabled while that prayer's request is in flight.
 */
export function PrayerRow({ prayer, timeLabel, entry, pending, onMark, eligible = true }) {
  const status = entry?.status || null;
  const label = PRAYER_LABELS[prayer];
  const showQaza = status === 'missed' || status === 'qaza';

  const tap = (s) => {
    if (pending) return;
    onMark(status === s ? null : s);
  };

  let note = null;
  if (entry?.edited) note = 'Edited · 0 pts';
  else if (status === 'qaza') note = entry?.points ? 'Qaza made up · +2' : 'Qaza made up';
  else if (status && entry?.points === 0 && status !== 'missed' && !eligible) note = 'Record only · 0 pts';

  return (
    <div className="prayer-row" role="group" aria-labelledby={`pr-${prayer}`}>
      <div>
        <div className="prayer-row__name" id={`pr-${prayer}`}>{label}</div>
        {timeLabel && <div className="prayer-row__time">{timeLabel}</div>}
      </div>
      <div className="prayer-row__actions">
        <div className="seg">
          {MAIN.map((b) => (
            <button
              key={b.status}
              type="button"
              className={`seg__btn is-${b.status}`}
              aria-pressed={status === b.status}
              aria-busy={pending || undefined}
              disabled={pending}
              aria-label={`${label}: ${b.label}`}
              onClick={() => tap(b.status)}
            >
              {b.label}
            </button>
          ))}
        </div>
        {showQaza && (
          <button
            type="button"
            className="seg__btn is-qaza"
            aria-pressed={status === 'qaza'}
            disabled={pending}
            aria-label={`${label}: Qaza made up`}
            onClick={() => tap('qaza')}
          >
            {status === 'qaza' ? 'Qaza made up' : 'Mark qaza made up'}
          </button>
        )}
      </div>
      {note && <div className="prayer-row__note">{note}</div>}
    </div>
  );
}
