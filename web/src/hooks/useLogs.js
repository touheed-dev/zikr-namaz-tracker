import { useCallback, useMemo, useRef, useState } from 'react';
import { prayers, zikr, quran, nafl } from '../api/index.js';
import { useAsync } from './useAsync.js';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Generic keyed list with optimistic writes:
 *  - the UI updates immediately,
 *  - a second write to the same key is ignored while one is in flight
 *    (no double submits, no accidental "edit" from a double click),
 *  - on failure the previous value is restored and a toast explains why.
 */
function useKeyedLogs({ load, deps, keyOf, write, toEntry }) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(load, deps);
  const [pending, setPending] = useState(() => new Set());
  const pendingRef = useRef(new Set());

  const entries = useMemo(() => data || [], [data]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const byKey = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(keyOf(e), e);
    return m;
  }, [entries, keyOf]);

  const setPendingKey = (key, on) => {
    if (on) pendingRef.current.add(key);
    else pendingRef.current.delete(key);
    setPending(new Set(pendingRef.current));
  };

  const update = useCallback(async (...args) => {
    const optimistic = toEntry(...args);
    const key = keyOf(optimistic);
    if (pendingRef.current.has(key)) return null;
    const previous = entriesRef.current.find((e) => keyOf(e) === key);
    setData((list = []) => {
      const rest = list.filter((e) => keyOf(e) !== key);
      return optimistic.__remove ? rest : [...rest, optimistic];
    });
    setPendingKey(key, true);
    try {
      const saved = await write(...args);
      setData((list = []) => {
        const rest = list.filter((e) => keyOf(e) !== key);
        const entry = toEntry.fromServer ? toEntry.fromServer(saved, optimistic) : { ...optimistic, ...saved };
        return entry && !entry.__remove ? [...rest, entry] : rest;
      });
      return saved;
    } catch (err) {
      setData((list = []) => {
        const rest = list.filter((e) => keyOf(e) !== key);
        return previous ? [...rest, previous] : rest;
      });
      if (!err.auth) toast.show(`Not saved: ${err.message}`);
      throw err;
    } finally {
      setPendingKey(key, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setData, toast]);

  return { entries, byKey, error, loading, reload, update, pending };
}

// ------------------------------------------------------------------ prayers
const prayerKey = (e) => `${e.date}|${e.prayer}`;
const prayerEntry = (date, prayer, status) => (
  status ? { date, prayer, status, points: null, edited: null } : { date, prayer, __remove: true }
);
prayerEntry.fromServer = (saved) => (saved?.status
  ? { date: saved.date, prayer: saved.prayer, status: saved.status, points: saved.points, edited: saved.edited }
  : { __remove: true });

export function usePrayers(from, to) {
  const r = useKeyedLogs({
    load: () => prayers.list(from, to),
    deps: [from, to],
    keyOf: prayerKey,
    write: (date, prayer, status) => prayers.mark(date, prayer, status),
    toEntry: prayerEntry,
  });
  const get = useCallback((date, prayer) => r.byKey.get(`${date}|${prayer}`), [r.byKey]);
  const isPending = useCallback((date, prayer) => r.pending.has(`${date}|${prayer}`), [r.pending]);
  return { ...r, mark: r.update, get, isPending };
}

// --------------------------------------------------------------------- zikr
const zikrKey = (e) => `${e.date}|${e.slot}`;
const zikrEntry = (date, slot, done) => ({ date, slot, done: Boolean(done) });

export function useZikr(from, to) {
  const r = useKeyedLogs({
    load: () => zikr.list(from, to),
    deps: [from, to],
    keyOf: zikrKey,
    write: (date, slot, done) => zikr.set(date, slot, done),
    toEntry: zikrEntry,
  });
  const isDone = useCallback((date, slot) => Boolean(r.byKey.get(`${date}|${slot}`)?.done), [r.byKey]);
  const isPending = useCallback((date, slot) => r.pending.has(`${date}|${slot}`), [r.pending]);
  return { ...r, set: r.update, isDone, isPending };
}

// --------------------------------------------------------------------- nafl
const naflKey = (e) => `${e.date}|${e.name}`;
const naflEntry = (date, name, done, value = null) => ({ date, name, done: Boolean(done), value });

export function useNafl(from, to) {
  const r = useKeyedLogs({
    load: () => nafl.list(from, to),
    deps: [from, to],
    keyOf: naflKey,
    write: (date, name, done, value = null) => nafl.set(date, name, done, value),
    toEntry: naflEntry,
  });
  const get = useCallback((date, name) => r.byKey.get(`${date}|${name}`), [r.byKey]);
  const isPending = useCallback((date, name) => r.pending.has(`${date}|${name}`), [r.pending]);
  return { ...r, set: r.update, get, isPending };
}

// -------------------------------------------------------------------- quran
export function useQuran(from, to) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => quran.list(from, to), [from, to]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const entries = useMemo(() => data?.entries || [], [data]);
  const totalPages = data?.totalPages ?? 0;
  const dataRef = useRef(data);
  dataRef.current = data;
  const pagesOn = useCallback((date) => entries.find((e) => e.date === date)?.pages || 0, [entries]);

  const save = useCallback(async (date, pages) => {
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    const previous = dataRef.current;
    setData((d) => {
      const list = (d?.entries || []).filter((e) => e.date !== date);
      const old = (d?.entries || []).find((e) => e.date === date)?.pages || 0;
      return { entries: [...list, { date, pages }], totalPages: (d?.totalPages || 0) - old + pages };
    });
    try {
      return await quran.set(date, pages);
    } catch (err) {
      setData(previous);
      if (!err.auth) toast.show(`Not saved: ${err.message}`);
      throw err;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [setData, toast]);

  return { entries, totalPages, pagesOn, loading, error, reload, save, saving };
}
