import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  READY_STATES,
  NETWORK_STATES,
  collectDiagnostics,
  formatDiagnosticsText,
} from './mediaDiagnostics.js';

test('mediaDiagnostics constants', () => {
  assert.equal(READY_STATES.length, 5);
  assert.equal(NETWORK_STATES.length, 4);
});

test('collectDiagnostics handles undefined window / mock environment', () => {
  const mockErrors = [
    { time: '10:00:00 AM', context: 'metadata', message: 'Failed to set' },
  ];
  const diag = collectDiagnostics(null, mockErrors, true, 'build-123');

  assert.equal(diag.buildStamp, 'build-123');
  assert.equal(diag.userGestureFlag, true);
  assert.equal(diag.mediaErrors.length, 1);
  assert.equal(diag.audioInfo, null);
});

test('formatDiagnosticsText formats all required sections including visibility, opacity, rect', () => {
  const diag = {
    timestamp: '10:00:00 AM',
    buildStamp: 'test-build-1',
    swController: 'https://example.com/sw.js',
    hasMediaSession: true,
    playbackState: 'playing',
    metadata: {
      title: 'Surah 1. Al-Fatiha',
      artist: 'Yasser Al-Dosari',
      album: 'Zikr & Namaz',
      artwork: [
        { src: 'https://example.com/icon-96.png', sizes: '96x96', type: 'image/png' },
      ],
    },
    audioInfo: {
      isConnected: true,
      hasControls: true,
      paused: false,
      muted: false,
      volume: 1,
      currentSrc: 'https://server11.mp3quran.net/yasser/001.mp3',
      duration: 42.5,
      currentTime: 10.2,
      readyState: 'HAVE_ENOUGH_DATA (4)',
      networkState: 'NETWORK_LOADING (2)',
      crossOrigin: '(none)',
      preload: 'metadata',
      isDisplayNone: false,
      computedDisplay: 'block',
      computedVisibility: 'visible',
      computedOpacity: '1',
      computedWidth: '350px',
      computedHeight: '54px',
      rect: { top: 120, left: 20, bottom: 174, right: 370, width: 350, height: 54 },
      intersectsViewport: true,
    },
    counts: {
      audio: 1,
      video: 0,
      total: 1,
    },
    userGestureFlag: true,
    userActivation: {
      hasBeenActive: true,
      isActive: true,
    },
    mediaErrors: [
      { time: '09:59:00 AM', context: 'playbackState', message: 'test error' },
    ],
  };

  const text = formatDiagnosticsText(diag);
  assert.ok(text.includes('=== Media Diagnostics ==='));
  assert.ok(text.includes('test-build-1'));
  assert.ok(text.includes('https://example.com/sw.js'));
  assert.ok(text.includes("'mediaSession' in navigator: true"));
  assert.ok(text.includes('playbackState: playing'));
  assert.ok(text.includes('Surah 1. Al-Fatiha'));
  assert.ok(text.includes('Yasser Al-Dosari'));
  assert.ok(text.includes('https://example.com/icon-96.png'));
  assert.ok(text.includes('isConnected: true'));
  assert.ok(text.includes('controls: true'));
  assert.ok(text.includes('display: block (display:none: false)'));
  assert.ok(text.includes('visibility: visible'));
  assert.ok(text.includes('opacity: 1'));
  assert.ok(text.includes('width / height: 350px × 54px'));
  assert.ok(text.includes('intersects viewport: true'));
  assert.ok(text.includes('https://server11.mp3quran.net/yasser/001.mp3'));
  assert.ok(text.includes('<audio> count: 1'));
  assert.ok(text.includes('<video> count: 0'));
  assert.ok(text.includes('User gesture flag (in player): true'));
  assert.ok(text.includes('[playbackState]: test error'));
});

test('formatDiagnosticsText handles null or missing audio element gracefully', () => {
  const emptyText = formatDiagnosticsText(null);
  assert.equal(emptyText, 'No diagnostics data available');

  const diagNoAudio = {
    timestamp: '10:00:00 AM',
    buildStamp: 'dev',
    swController: '(none)',
    hasMediaSession: false,
    playbackState: '(none)',
    metadata: null,
    audioInfo: null,
    counts: { audio: 0, video: 0, total: 0 },
    userGestureFlag: false,
    userActivation: 'unsupported',
    mediaErrors: [],
  };

  const text = formatDiagnosticsText(diagNoAudio);
  assert.ok(text.includes('No <audio> element found'));
  assert.ok(text.includes('No errors recorded'));
});
