export const READY_STATES = [
  'HAVE_NOTHING (0)',
  'HAVE_METADATA (1)',
  'HAVE_CURRENT_DATA (2)',
  'HAVE_FUTURE_DATA (3)',
  'HAVE_ENOUGH_DATA (4)',
];

export const NETWORK_STATES = [
  'NETWORK_EMPTY (0)',
  'NETWORK_IDLE (1)',
  'NETWORK_LOADING (2)',
  'NETWORK_NO_SOURCE (3)',
];

export function collectDiagnostics(audioEl, mediaErrors, userGesture, customBuild) {
  if (typeof window === 'undefined') {
    return {
      timestamp: 'mock-time',
      buildStamp: customBuild || (typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'),
      swController: '(none)',
      hasMediaSession: false,
      playbackState: '(none)',
      metadata: null,
      audioInfo: null,
      counts: { audio: 0, video: 0, total: 0 },
      userGestureFlag: Boolean(userGesture),
      userActivation: 'unsupported',
      mediaErrors: mediaErrors || [],
    };
  }

  const hasMediaSession = typeof navigator !== 'undefined' && 'mediaSession' in navigator;
  const ms = hasMediaSession ? navigator.mediaSession : null;
  const metadata = ms?.metadata;

  let audioInfo = null;
  if (audioEl) {
    let isDisplayNone = false;
    let computedDisplay = 'unknown';
    try {
      const comp = window.getComputedStyle(audioEl);
      computedDisplay = comp.display;
      isDisplayNone = comp.display === 'none';
    } catch {
      // ignore
    }

    audioInfo = {
      isConnected: Boolean(audioEl.isConnected),
      paused: Boolean(audioEl.paused),
      muted: Boolean(audioEl.muted),
      volume: typeof audioEl.volume === 'number' ? audioEl.volume : null,
      currentSrc: audioEl.currentSrc || audioEl.src || '',
      duration: Number.isFinite(audioEl.duration) ? Number(audioEl.duration.toFixed(2)) : null,
      currentTime: Number.isFinite(audioEl.currentTime) ? Number(audioEl.currentTime.toFixed(2)) : 0,
      readyState: READY_STATES[audioEl.readyState] || String(audioEl.readyState),
      networkState: NETWORK_STATES[audioEl.networkState] || String(audioEl.networkState),
      crossOrigin: audioEl.crossOrigin || '(none)',
      preload: audioEl.preload || '(none)',
      isDisplayNone,
      computedDisplay,
    };
  }

  const audioCount = document.querySelectorAll('audio').length;
  const videoCount = document.querySelectorAll('video').length;

  let swController = '(none)';
  try {
    swController = navigator.serviceWorker?.controller?.scriptURL || '(none)';
  } catch {
    // ignore
  }

  let userActivation = 'unsupported';
  if (typeof navigator !== 'undefined' && navigator.userActivation) {
    userActivation = {
      hasBeenActive: navigator.userActivation.hasBeenActive,
      isActive: navigator.userActivation.isActive,
    };
  }

  let artworkList = [];
  if (metadata?.artwork) {
    try {
      artworkList = Array.from(metadata.artwork).map((a) => ({
        src: a.src,
        sizes: a.sizes || '',
        type: a.type || '',
      }));
    } catch {
      // ignore
    }
  }

  return {
    timestamp: new Date().toLocaleTimeString(),
    buildStamp: customBuild || (typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'),
    swController,
    hasMediaSession,
    playbackState: ms?.playbackState || '(none)',
    metadata: metadata
      ? {
          title: metadata.title || '',
          artist: metadata.artist || '',
          album: metadata.album || '',
          artwork: artworkList,
        }
      : null,
    audioInfo,
    counts: {
      audio: audioCount,
      video: videoCount,
      total: audioCount + videoCount,
    },
    userGestureFlag: Boolean(userGesture),
    userActivation,
    mediaErrors: mediaErrors || [],
  };
}

export function formatDiagnosticsText(diag) {
  if (!diag) return 'No diagnostics data available';
  const lines = [
    '=== Media Diagnostics ===',
    `Timestamp: ${diag.timestamp}`,
    `Build Stamp (__BUILD__): ${diag.buildStamp}`,
    `Service Worker Controller: ${diag.swController}`,
    '',
    '-- MediaSession API --',
    `'mediaSession' in navigator: ${diag.hasMediaSession}`,
    `playbackState: ${diag.playbackState}`,
    `Title: ${diag.metadata?.title || '(none)'}`,
    `Artist: ${diag.metadata?.artist || '(none)'}`,
    `Album: ${diag.metadata?.album || '(none)'}`,
    `Artwork count: ${diag.metadata?.artwork?.length || 0}`,
    ...(diag.metadata?.artwork || []).map(
      (a, i) => `  [${i + 1}] src: ${a.src} (sizes: ${a.sizes || 'n/a'}, type: ${a.type || 'n/a'})`,
    ),
    '',
    '-- <audio> Element --',
    diag.audioInfo
      ? [
          `isConnected: ${diag.audioInfo.isConnected}`,
          `display:none: ${diag.audioInfo.isDisplayNone} (computed display: ${diag.audioInfo.computedDisplay})`,
          `paused: ${diag.audioInfo.paused}`,
          `muted: ${diag.audioInfo.muted}`,
          `volume: ${diag.audioInfo.volume}`,
          `currentSrc: ${diag.audioInfo.currentSrc || '(empty)'}`,
          `duration: ${diag.audioInfo.duration ?? 'unknown'}s`,
          `currentTime: ${diag.audioInfo.currentTime}s`,
          `readyState: ${diag.audioInfo.readyState}`,
          `networkState: ${diag.audioInfo.networkState}`,
          `crossOrigin: ${diag.audioInfo.crossOrigin}`,
          `preload: ${diag.audioInfo.preload}`,
        ].join('\n')
      : 'No <audio> element found',
    '',
    '-- Media Elements on Page --',
    `<audio> count: ${diag.counts.audio}`,
    `<video> count: ${diag.counts.video}`,
    `Total: ${diag.counts.total}`,
    '',
    '-- User Gesture & Activation --',
    `User gesture flag (in player): ${diag.userGestureFlag}`,
    `navigator.userActivation: ${
      typeof diag.userActivation === 'object'
        ? JSON.stringify(diag.userActivation)
        : diag.userActivation
    }`,
    '',
    '-- MediaSession Setup Errors (Last 10) --',
    diag.mediaErrors.length === 0
      ? 'No errors recorded'
      : diag.mediaErrors
          .map((e, i) => `[${i + 1}] ${e.time} [${e.context}]: ${e.message}`)
          .join('\n'),
    '=========================',
  ];
  return lines.join('\n');
}
