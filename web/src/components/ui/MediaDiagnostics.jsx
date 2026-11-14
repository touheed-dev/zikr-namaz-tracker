import { useState, useEffect, useCallback } from 'react';
import { Card } from './index.jsx';
import { useQuranPlayer } from '../../context/QuranPlayerContext.jsx';
import { collectDiagnostics, formatDiagnosticsText } from '../../utils/mediaDiagnostics.js';

export function MediaDiagnostics() {
  const player = useQuranPlayer();
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState(() =>
    collectDiagnostics(
      player.audioRef?.current,
      player.mediaSessionErrors,
      player.userGestureFlag,
    ),
  );

  useEffect(() => {
    const update = () => {
      setData(
        collectDiagnostics(
          player.audioRef?.current,
          player.mediaSessionErrors,
          player.userGestureFlag,
        ),
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [player.audioRef, player.mediaSessionErrors, player.userGestureFlag]);

  const handleCopy = useCallback(() => {
    if (!data) return;
    const text = formatDiagnosticsText(data);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch((err) => {
        console.error('Failed to copy diagnostics:', err);
      });
    }
  }, [data]);

  if (!data) return null;

  return (
    <Card title="Media diagnostics" aside={`Build: ${data.buildStamp}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="tiny muted">Refreshes every 1s · {data.timestamp}</span>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={handleCopy}
          style={{ padding: '4px 10px', fontSize: 13 }}
        >
          {copied ? 'Copied!' : 'Copy diagnostics'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
        <div style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', padding: 10, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>MediaSession API</div>
          <div>&apos;mediaSession&apos; in navigator: <strong>{data.hasMediaSession ? 'Yes' : 'No'}</strong></div>
          <div>Playback state: <strong>{data.playbackState}</strong></div>
          <div>
            Metadata: {data.metadata ? (
              <span>&ldquo;{data.metadata.title}&rdquo; by {data.metadata.artist}</span>
            ) : (
              <span className="muted">(none)</span>
            )}
          </div>
          <div>
            Artwork: {data.metadata?.artwork?.length ? (
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {data.metadata.artwork.map((a, i) => (
                  <li key={i} className="tiny muted" style={{ wordBreak: 'break-all' }}>
                    {a.src} ({a.sizes || 'auto'})
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted">(none)</span>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', padding: 10, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>&lt;audio&gt; Element</div>
          {data.audioInfo ? (
            <>
              <div>Connected in DOM: <strong>{data.audioInfo.isConnected ? 'Yes' : 'No'}</strong></div>
              <div>
                display:none: <strong>{data.audioInfo.isDisplayNone ? 'YES (Warning: hidden)' : 'No'}</strong> (computed: {data.audioInfo.computedDisplay})
              </div>
              <div>Paused: <strong>{data.audioInfo.paused ? 'Yes' : 'No'}</strong></div>
              <div>Muted: <strong>{data.audioInfo.muted ? 'Yes' : 'No'}</strong> | Volume: <strong>{data.audioInfo.volume}</strong></div>
              <div style={{ wordBreak: 'break-all' }}>Current src: <strong>{data.audioInfo.currentSrc || '(empty)'}</strong></div>
              <div>
                Duration: <strong>{data.audioInfo.duration ?? '—'}s</strong> | Position: <strong>{data.audioInfo.currentTime}s</strong>
              </div>
              <div>Ready state: <strong>{data.audioInfo.readyState}</strong></div>
              <div>Network state: <strong>{data.audioInfo.networkState}</strong></div>
              <div>Preload: <strong>{data.audioInfo.preload}</strong> | CrossOrigin: <strong>{data.audioInfo.crossOrigin}</strong></div>
            </>
          ) : (
            <div className="muted">No &lt;audio&gt; element found</div>
          )}
        </div>

        <div style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', padding: 10, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Page Media &amp; User Gesture</div>
          <div>
            Page media elements: <strong>{data.counts.total}</strong> ({data.counts.audio} audio, {data.counts.video} video)
          </div>
          <div>Playback started from user gesture: <strong>{data.userGestureFlag ? 'Yes' : 'No'}</strong></div>
          <div className="tiny muted">
            navigator.userActivation: {typeof data.userActivation === 'object' ? JSON.stringify(data.userActivation) : data.userActivation}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            SW Controller: {data.swController}
          </div>
        </div>

        <div style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', padding: 10, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            MediaSession Errors ({data.mediaErrors.length})
          </div>
          {data.mediaErrors.length === 0 ? (
            <div className="tiny muted">No errors recorded</div>
          ) : (
            <div style={{ maxHeight: 150, overflowY: 'auto' }}>
              {data.mediaErrors.map((err, i) => (
                <div key={i} className="tiny" style={{ color: 'var(--danger, #f87171)', marginBottom: 4 }}>
                  [{err.time}] [{err.context}]: {err.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
