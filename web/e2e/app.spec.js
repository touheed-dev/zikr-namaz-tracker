import { test, expect } from '@playwright/test';

// REST endpoint + anon key of the stack under test (local: `supabase status`).
const SUPA = process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const uniq = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const A = { name: 'Amina', email: `amina.${uniq}@e2e.test`, password: 'password-123' };
const B = { name: 'Bilal', email: `bilal.${uniq}@e2e.test`, password: 'password-123' };
const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

const TIMES = { Fajr: '05:12', Sunrise: '06:30', Dhuhr: '12:24', Asr: '15:44', Maghrib: '18:04', Isha: '19:18' };

async function prepare(page) {
  await page.route('https://api.aladhan.com/**', (r) => r.fulfill({ json: { data: { timings: TIMES } } }));
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  return problems;
}

/** Access token of the signed-in user, read from supabase-js storage. */
async function token(page) {
  return page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (/^sb-.*-auth-token$/.test(k)) return JSON.parse(localStorage.getItem(k)).access_token;
    }
    return null;
  });
}

/** Call the REST API directly, as that user, to prove the server enforces the rules. */
async function api(page, method, path, data) {
  const t = await token(page);
  const res = await page.request.fetch(`${SUPA}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    data,
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status(), body };
}

const rpc = (page, fn, args = {}) => api(page, 'POST', `rpc/${fn}`, args);

async function signUp(page, u) {
  await page.goto('/signup');
  await page.getByLabel('Name').fill(u.name);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel(/Password/).fill(u.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function nav(page, path) {
  await page.goto(path);
  await expect(page.locator('main')).toBeVisible();
}

test.describe.serial('Zikr & Namaz end to end', () => {
  let a;
  let b;
  let aErrors;
  let bErrors;
  let today;

  test.beforeAll(async ({ browser }) => {
    a = await (await browser.newContext()).newPage();
    b = await (await browser.newContext()).newPage();
    aErrors = await prepare(a);
    bErrors = await prepare(b);
  });

  test.afterAll(async () => {
    expect(aErrors, 'no uncaught errors for user A').toEqual([]);
    expect(bErrors, 'no uncaught errors for user B').toEqual([]);
  });

  test('sign up and log 5 prayers in one tap each', async () => {
    await signUp(a, A);
    for (const p of PRAYERS) {
      const btn = a.getByRole('button', { name: `${p}: Jamaat` });
      await btn.click();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(a.locator('.stat__value').nth(1)).toHaveText('5 / 5');
    // 5 x 10 + full-day bonus 5
    await expect(a.locator('.points-chip__pts')).toHaveText('55 pts');
    today = (await rpc(a, 'get_profile_summary')).body.today;
  });

  test('heatmap and streak update', async () => {
    await nav(a, '/streak');
    await expect(a.locator('figcaption').first()).toContainText('5 in Jamaat');
    await expect(a.locator('.stat').first()).toContainText('1');
    await nav(a, '/');
    await expect(a.locator('.stat__value').first()).toHaveText('1 day');
  });

  test('editing an entry gives 0 points', async () => {
    await a.getByRole('button', { name: 'Fajr: Alone' }).click();
    await expect(a.getByText('Edited · 0 pts')).toBeVisible();
    // fajr 10 -> 0, and the full-day bonus is lost because a row is edited
    await expect(a.locator('.points-chip__pts')).toHaveText('40 pts');
  });

  test('a prayer logged 4 days ago gives 0 points', async () => {
    await nav(a, '/history');
    const items = a.locator('.day-item');
    await expect(items).toHaveCount(7);
    await items.nth(4).click();
    await expect(items.nth(4)).toContainText('Record only · 0 pts');
    await a.getByRole('button', { name: 'Isha: Jamaat' }).click();
    await expect(a.getByRole('button', { name: 'Isha: Jamaat' })).toHaveAttribute('aria-pressed', 'true');
    const all = await rpc(a, 'get_leaderboard', { p_period: 'all' });
    expect(all.body.find((r) => r.is_me).points).toBe(40);
  });

  test('future date is rejected by the server', async () => {
    const [y, m, d] = today.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    const tomorrow = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
    const res = await rpc(a, 'set_prayer', { p_date: tomorrow, p_prayer: 'fajr', p_status: 'jamaat' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toContain('Future dates');
    // and direct table writes are refused
    const direct = await api(a, 'POST', 'prayer_logs', { log_date: today, prayer: 'asr', status: 'jamaat', eligible: true, points: 10 });
    expect(direct.status).toBeGreaterThanOrEqual(400);
  });

  test('friend invite and accept (no account enumeration)', async () => {
    await signUp(b, B);
    await nav(b, '/friends');
    await b.getByLabel('Their email').fill(`nobody.${uniq}@e2e.test`);
    await b.getByRole('button', { name: 'Send request' }).click();
    const unknownMsg = await b.locator('.notice--ok').innerText();
    await b.getByLabel('Their email').fill(A.email);
    await b.getByRole('button', { name: 'Send request' }).click();
    await expect(b.locator('.notice--ok')).toHaveText(unknownMsg);
    expect(unknownMsg).toContain('If that person has an account');

    await nav(a, '/friends');
    await a.getByRole('button', { name: 'Accept' }).click();
    await expect(a.getByRole('list', { name: 'Leaderboard' })).toContainText('Bilal');
  });

  test('leaderboard order', async () => {
    await nav(b, '/');
    await b.getByRole('button', { name: 'Dhuhr: Jamaat' }).click();
    await b.getByRole('button', { name: 'Asr: Alone' }).click();
    await expect(b.getByRole('button', { name: 'Asr: Alone' })).toHaveAttribute('aria-pressed', 'true');
    await nav(a, '/friends');
    const rows = a.getByRole('list', { name: 'Leaderboard' }).getByRole('listitem');
    await expect(rows.nth(0)).toContainText('You');
    await expect(rows.nth(0)).toContainText('40');
    await expect(rows.nth(1)).toContainText('Bilal');
    await expect(rows.nth(1)).toContainText('14');
  });

  test('privacy: a friend cannot see nafl, Ramadan items, heatmap or report', async () => {
    await nav(a, '/nafl');
    await a.getByRole('switch', { name: 'Tahajjud' }).click();
    await expect(a.getByRole('switch', { name: 'Tahajjud' })).toHaveAttribute('aria-checked', 'true');
    await rpc(a, 'set_nafl', { p_date: today, p_name: 'ramadan:roza', p_done: true, p_value: null });

    const aId = (await rpc(b, 'get_leaderboard', { p_period: 'all' })).body.find((r) => !r.is_me).id;
    expect((await rpc(b, 'friend_heatmap', { p_friend_id: aId, p_days: 21 })).body).toBeNull();
    expect((await rpc(b, 'friend_quran_streak', { p_friend_id: aId })).body).toBeNull();
    const nafl = await api(b, 'GET', 'nafl_logs?select=*');
    expect(nafl.body).toEqual([]);
    const pr = await api(b, 'GET', 'prayer_logs?select=user_id');
    expect(pr.body.every((r) => r.user_id !== aId)).toBe(true);
    const report = await rpc(b, 'weekly_report', { p_week_offset: 0 });
    expect(JSON.stringify(report.body)).not.toContain('tahajjud');

    // the owner opts in -> heatmap becomes visible, nafl still never is
    await nav(a, '/profile');
    await a.getByRole('switch', { name: 'Friends see my Namaz heatmap' }).click();
    await expect(a.getByRole('switch', { name: 'Friends see my Namaz heatmap' })).toHaveAttribute('aria-checked', 'true');
    const heat = (await rpc(b, 'friend_heatmap', { p_friend_id: aId, p_days: 21 })).body;
    expect(heat.length).toBe(6);
    expect(JSON.stringify(heat)).not.toContain('tahajjud');
  });

  test('challenge progress is computed from logs', async () => {
    await nav(a, '/challenges/personal');
    await a.getByRole('button', { name: /Namaz goal/ }).click();
    await a.getByLabel('Number of days').fill('3');
    await a.getByRole('button', { name: 'Add goal' }).click();
    await expect(a.getByText('All 5 prayers for 3 days')).toBeVisible();
    await expect(a.getByText('1 / 3')).toBeVisible();
  });

  test('Ramadan mode switch', async () => {
    await nav(a, '/profile');
    await a.getByRole('button', { name: 'Always on' }).click();
    await expect(a.locator('html')).toHaveAttribute('data-theme', 'ramadan');
    await expect(a.getByRole('navigation', { name: 'Main' })).toContainText('Ramadan');
    await nav(a, '/');
    await expect(a.getByText(/of 20 rakats/)).toBeVisible();
    await nav(a, '/profile');
    await a.getByRole('button', { name: 'Always off' }).click();
    await expect(a.locator('html')).not.toHaveAttribute('data-theme', 'ramadan');
  });

  test('logout', async () => {
    await a.getByRole('button', { name: 'Sign out' }).click();
    await expect(a).toHaveURL(/\/login$/);
    await a.goto('/friends');
    await expect(a).toHaveURL(/\/login$/);
  });
});
