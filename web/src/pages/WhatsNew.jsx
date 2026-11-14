import { useEffect, useState } from 'react';
import { PageHead } from '../components/layout/AppShell.jsx';
import { Card } from '../components/ui/index.jsx';
import {
  RELEASES,
  getUnseenReleases,
  setLastSeenVersion,
} from '../utils/announcements.js';

export default function WhatsNew() {
  // Capture unseen releases at the time of opening
  const [unseenVersions] = useState(() => {
    const unseen = getUnseenReleases();
    return new Set(unseen.map((r) => r.version));
  });

  useEffect(() => {
    // Mark current release as seen so the gold indicator clears
    if (RELEASES.length > 0) {
      setLastSeenVersion(RELEASES[0].version);
    }
  }, []);

  return (
    <>
      <PageHead
        title="What's new"
        sub="Recent updates and improvements to Zikr &amp; Namaz"
      />

      <div className="stack" style={{ gap: 12 }}>
        {RELEASES.map((rel) => {
          const isNew = unseenVersions.has(rel.version);
          return (
            <Card
              key={rel.version}
              className={isNew ? 'card--gold' : ''}
              style={{ position: 'relative' }}
            >
              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="strong" style={{ fontSize: 16 }}>
                    Version {rel.version}
                  </span>
                  {isNew && (
                    <span className="eyebrow eyebrow--gold" style={{ fontSize: 11 }}>
                      New
                    </span>
                  )}
                </div>
                <span className="small muted">{rel.date}</span>
              </div>

              <div className="strong" style={{ fontSize: 15, marginBottom: 8 }}>
                {rel.title}
              </div>

              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {rel.highlights.map((highlight, idx) => (
                  <li
                    key={idx}
                    className="small"
                    style={{ lineHeight: 1.45, color: 'var(--text)' }}
                  >
                    {highlight}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
