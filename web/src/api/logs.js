import { db, rpc, select } from './client.js';

const PAGE = 1000; // PostgREST caps rows per request (max_rows); page through.

async function selectAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await select(build().range(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// ------------------------------------------------------------------ prayers
export const prayers = {
  /** [{ date, prayer, status, points, edited }] (rows with null status omitted) */
  async list(from, to) {
    const rows = await selectAll(() => db().from('prayer_logs')
      .select('log_date, prayer, status, points, edited')
      .gte('log_date', from).lte('log_date', to)
      .not('status', 'is', null)
      .order('log_date', { ascending: true })
      .order('prayer', { ascending: true }));
    return rows.map((r) => ({ date: r.log_date, prayer: r.prayer, status: r.status, points: r.points, edited: r.edited }));
  },
  /** status = jamaat | alone | qaza | missed | null (clear) */
  async mark(date, prayer, status) {
    return rpc('set_prayer', { p_date: date, p_prayer: prayer, p_status: status ?? null });
  },
};

// --------------------------------------------------------------------- zikr
export const zikr = {
  async list(from, to) {
    const rows = await selectAll(() => db().from('zikr_logs').select('log_date, slot, done')
      .gte('log_date', from).lte('log_date', to).order('log_date').order('slot'));
    return rows.map((r) => ({ date: r.log_date, slot: r.slot, done: r.done }));
  },
  async set(date, slot, done) {
    return rpc('set_zikr', { p_date: date, p_slot: slot, p_done: Boolean(done) });
  },
};

// -------------------------------------------------------------------- quran
export const quran = {
  /** { entries: [{ date, pages }], totalPages } (total is all-time) */
  async list(from, to) {
    const [rows, totalPages] = await Promise.all([
      selectAll(() => db().from('quran_logs').select('log_date, pages')
        .gte('log_date', from).lte('log_date', to).order('log_date')),
      rpc('get_quran_total'),
    ]);
    return { entries: rows.map((r) => ({ date: r.log_date, pages: r.pages })), totalPages: totalPages ?? 0 };
  },
  async set(date, pages) {
    return rpc('set_quran', { p_date: date, p_pages: Math.round(Number(pages) || 0) });
  },
};

// --------------------------------------------------------------------- nafl
export const nafl = {
  async list(from, to) {
    const rows = await selectAll(() => db().from('nafl_logs').select('log_date, name, done, value')
      .gte('log_date', from).lte('log_date', to).order('log_date').order('name'));
    return rows.map((r) => ({ date: r.log_date, name: r.name, done: r.done, value: r.value }));
  },
  async set(date, name, done, value = null) {
    return rpc('set_nafl', { p_date: date, p_name: name, p_done: Boolean(done), p_value: value });
  },
};

// ---------------------------------------------------------------- quranListen
export const quranListen = {
  async setPosition(reciter, surah, position) {
    return rpc('set_listen_position', {
      p_reciter: reciter,
      p_surah: Math.round(Number(surah) || 1),
      p_position: Math.max(0, Math.round(Number(position) || 0)),
    });
  },
  async addSeconds(seconds) {
    const s = Math.round(Number(seconds) || 0);
    if (s <= 0) return null;
    return rpc('add_listen_seconds', { p_seconds: s });
  },
  async summary() {
    const raw = await rpc('get_listen_summary');
    if (!raw) return null;
    const today = typeof raw.today === 'number' ? raw.today : (raw.today?.seconds ?? 0);
    const week = typeof raw.week === 'number' ? raw.week : (raw.week?.seconds ?? 0);
    const total = typeof raw.total === 'number' ? raw.total : (raw.total?.seconds ?? 0);
    return {
      ...raw,
      today,
      week,
      total,
    };
  },
};
