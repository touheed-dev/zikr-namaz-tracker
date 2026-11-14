import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useToday } from '../../context/AuthContext.jsx';
import {
  getActiveAnnouncements,
  getDismissedAnnouncementIds,
  dismissAnnouncement,
} from '../../utils/announcements.js';
import { Icon } from './Icon.jsx';

export function AnnouncementCarousel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = useToday();
  const [dismissedIds, setDismissedIds] = useState(() => getDismissedAnnouncementIds());
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    const handler = () => setDismissedIds(getDismissedAnnouncementIds());
    window.addEventListener('zn:announce_dismissed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('zn:announce_dismissed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const items = getActiveAnnouncements({
    today,
    user,
    dismissedIds,
  });

  const total = items.length;

  // Keep active index in bounds if an item was dismissed
  useEffect(() => {
    if (activeIndex >= total && total > 0) {
      setActiveIndex(total - 1);
    }
  }, [activeIndex, total]);

  const scrollToIndex = useCallback((idx) => {
    if (!trackRef.current) return;
    const clamped = Math.max(0, Math.min(idx, total - 1));
    const width = trackRef.current.clientWidth;
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    trackRef.current.scrollTo({
      left: clamped * width,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
    setActiveIndex(clamped);
  }, [total]);

  const handleScroll = useCallback(() => {
    if (!trackRef.current) return;
    const { scrollLeft, clientWidth } = trackRef.current;
    if (clientWidth > 0) {
      const idx = Math.round(scrollLeft / clientWidth);
      if (idx !== activeIndex && idx >= 0 && idx < total) {
        setActiveIndex(idx);
      }
    }
  }, [activeIndex, total]);

  const handleKeyDown = (e) => {
    if (total <= 1) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollToIndex(activeIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollToIndex(activeIndex + 1);
    }
  };

  if (total === 0) return null;

  const handleDismiss = (id) => {
    dismissAnnouncement(id);
    setDismissedIds(getDismissedAnnouncementIds());
  };

  const handleCta = (item) => {
    dismissAnnouncement(item.id);
    setDismissedIds(getDismissedAnnouncementIds());
    if (item.cta?.to) {
      navigate(item.cta.to);
    }
  };

  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    <section
      className="announcement-carousel"
      aria-roledescription="carousel"
      aria-label="New feature announcements"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="announcement-carousel__viewport">
        {total > 1 && (
          <button
            type="button"
            className="announcement-carousel__arrow announcement-carousel__arrow--prev btn btn--ghost btn--sm"
            onClick={() => scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Previous announcement"
          >
            <Icon name="chevronLeft" size={20} />
          </button>
        )}

        <div
          ref={trackRef}
          className="announcement-carousel__track"
          onScroll={handleScroll}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className="announcement-carousel__slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${total}`}
            >
              <div className="card card--gold" role="status" style={{ position: 'relative', width: '100%', margin: 0 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => handleDismiss(item.id)}
                  aria-label="Dismiss"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 44,
                    height: 44,
                    minWidth: 44,
                    minHeight: 44,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  <Icon name="close" size={18} />
                </button>

                <div className="row" style={{ alignItems: 'flex-start', gap: 12, paddingRight: 36 }}>
                  <span style={{ color: 'var(--gold)', marginTop: 2 }}>
                    <Icon name={item.icon || 'sparkle'} size={20} />
                  </span>
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="eyebrow eyebrow--gold">New</div>
                    <div className="strong">{item.title}</div>
                    <div className="small muted">{item.body}</div>
                    {item.cta && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          onClick={() => handleCta(item)}
                        >
                          {item.cta.label}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {total > 1 && (
          <button
            type="button"
            className="announcement-carousel__arrow announcement-carousel__arrow--next btn btn--ghost btn--sm"
            onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex === total - 1}
            aria-label="Next announcement"
          >
            <Icon name="chevronRight" size={20} />
          </button>
        )}
      </div>

      {total > 1 && (
        <div className="announcement-carousel__dots" role="tablist" aria-label="Announcement slides">
          {items.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={`announcement-carousel__dot ${isActive ? 'announcement-carousel__dot--active' : ''}`}
                onClick={() => scrollToIndex(index)}
                aria-label={`Go to slide ${index + 1}: ${item.title}`}
                aria-selected={isActive}
              />
            );
          })}
        </div>
      )}
    </section>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}
