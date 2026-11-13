import { useCallback, useState } from 'react';
import { friends } from '../api/index.js';
import { useAsync } from './useAsync.js';
import { useToast } from '../context/ToastContext.jsx';

export function useFriends(period) {
  const toast = useToast();
  const board = useAsync(() => friends.leaderboard(period), [period]);
  const globalBoard = useAsync(() => friends.global(period), [period]);
  const requests = useAsync(() => friends.requests(), []);
  const [busy, setBusy] = useState(null);

  const act = useCallback(async (key, fn, okMessage) => {
    if (busy) return null;
    setBusy(key);
    try {
      const res = await fn();
      if (okMessage) toast.show(okMessage);
      await Promise.all([
        board.reload({ silent: true }),
        globalBoard.reload({ silent: true }),
        requests.reload({ silent: true }),
      ]);
      return res;
    } catch (err) {
      if (!err.auth) toast.show(err.message);
      throw err;
    } finally {
      setBusy(null);
    }
  }, [busy, board, globalBoard, requests, toast]);

  const invite = useCallback((email) => act('invite', () => friends.invite(email)), [act]);

  const inviteUser = useCallback((id) => {
    // Optimistic update for global board
    globalBoard.setData((data) => {
      if (!data?.rows) return data;
      return {
        ...data,
        rows: data.rows.map((r) => (r.id === id ? { ...r, requested: true } : r)),
      };
    });
    return act(`inviteUser:${id}`, () => friends.inviteUser(id), 'Friend request sent').catch((err) => {
      globalBoard.reload({ silent: true });
      throw err;
    });
  }, [act, globalBoard]);

  const block = useCallback((id, message = 'User blocked') => {
    // Optimistically update
    requests.setData((d) => (d ? {
      incoming: d.incoming.filter((r) => r.id !== id),
      outgoing: d.outgoing.filter((r) => r.id !== id),
    } : d));
    board.setData((rows) => (rows ? rows.filter((r) => r.id !== id) : rows));
    return act(`block:${id}`, () => friends.block(id), message).catch((err) => {
      requests.reload({ silent: true });
      board.reload({ silent: true });
      throw err;
    });
  }, [act, board, requests]);

  const unblock = useCallback((id, message = 'User unblocked') => (
    act(`unblock:${id}`, () => friends.unblock(id), message)
  ), [act]);

  const accept = useCallback((id) => {
    // optimistic: drop it from incoming immediately
    const prev = requests.data;
    requests.setData((d) => (d ? { ...d, incoming: d.incoming.filter((r) => r.id !== id) } : d));
    return act(`accept:${id}`, () => friends.accept(id), 'Friend added').catch((e) => {
      requests.setData(prev);
      throw e;
    });
  }, [act, requests]);

  const remove = useCallback((id, message) => {
    const prevReq = requests.data;
    const prevBoard = board.data;
    requests.setData((d) => (d ? {
      incoming: d.incoming.filter((r) => r.id !== id), outgoing: d.outgoing.filter((r) => r.id !== id),
    } : d));
    board.setData((rows) => (rows ? rows.filter((r) => r.id !== id) : rows));
    return act(`remove:${id}`, () => friends.remove(id), message).catch((e) => {
      requests.setData(prevReq);
      board.setData(prevBoard);
      throw e;
    });
  }, [act, board, requests]);

  return { board, globalBoard, requests, invite, inviteUser, block, unblock, accept, remove, busy };
}
