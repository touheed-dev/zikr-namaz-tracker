import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowGlobalAnnouncement,
} from './announcements.js';

test('global announcement visibility', () => {
  // launch day true
  assert.equal(
    shouldShowGlobalAnnouncement({ today: '2026-11-13', optedIn: false, dismissed: false }),
    true,
    'launch day true',
  );

  // day 6 true
  assert.equal(
    shouldShowGlobalAnnouncement({ today: '2026-11-19', optedIn: false, dismissed: false }),
    true,
    'day 6 true',
  );

  // day 7 false
  assert.equal(
    shouldShowGlobalAnnouncement({ today: '2026-11-20', optedIn: false, dismissed: false }),
    false,
    'day 7 false',
  );

  // day -1 false
  assert.equal(
    shouldShowGlobalAnnouncement({ today: '2026-11-12', optedIn: false, dismissed: false }),
    false,
    'day -1 false',
  );

  // optedIn false-case
  assert.equal(
    shouldShowGlobalAnnouncement({ today: '2026-11-13', optedIn: true, dismissed: false }),
    false,
    'optedIn false-case',
  );

  // dismissed false-case
  assert.equal(
    shouldShowGlobalAnnouncement({ today: '2026-11-13', optedIn: false, dismissed: true }),
    false,
    'dismissed false-case',
  );
});
