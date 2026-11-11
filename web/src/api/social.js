import { rpc } from './client.js';

// ------------------------------------------------------------------ friends
export const friends = {
  /** [{ id, name, points, streak, isMe }] sorted by points desc */
  async leaderboard(period = 'week') {
    const rows = await rpc('get_leaderboard', { p_period: period });
    return (rows || []).map((r) => ({
      id: r.id, name: r.name, points: r.points ?? 0, streak: r.streak ?? 0, isMe: Boolean(r.is_me),
    }));
  },
  /** { incoming: [{ id, name, email }], outgoing: [{ id, email }] } */
  async requests() {
    const r = await rpc('list_friend_requests');
    return { incoming: r?.incoming || [], outgoing: r?.outgoing || [] };
  },
  /** Always a generic message for unknown emails (no account enumeration). */
  async invite(email) {
    return rpc('send_friend_request', { p_email: email });
  },
  async accept(id) {
    return rpc('accept_friend_request', { p_id: id });
  },
  /** Removes a friend (user id) or declines / cancels a request (request id). */
  async remove(id) {
    return rpc('remove_friend', { p_id: id });
  },
  /** null unless friends AND the owner shares their heatmap */
  async heatmap(friendId, days = 21) {
    return rpc('friend_heatmap', { p_friend_id: friendId, p_days: days });
  },
  async quranStreak(friendId) {
    return rpc('friend_quran_streak', { p_friend_id: friendId });
  },
  async badges(friendId) {
    return rpc('friend_badges', { p_friend_id: friendId });
  },
};

// --------------------------------------------------------------- challenges
export const challenges = {
  /** [{ id, type, kind, title, progress, target, members: [{ id, name }], reward, ... }] */
  async list(type) {
    return (await rpc('list_challenges', { p_type: type })) || [];
  },
  /** { type, kind, title, target, prayer?, slot?, pages?, invites?, reward?, template? } */
  async create(payload) {
    return rpc('create_challenge', { payload });
  },
  async respond(id, accept) {
    return rpc('respond_challenge', { p_id: id, p_accept: Boolean(accept) });
  },
  async leave(id) {
    return rpc('leave_challenge', { p_id: id });
  },
};

// ------------------------------------------------------------------- badges
export const badges = {
  /** [{ id, group, name, note, earned, visibility, progress, target }] */
  async list() {
    return (await rpc('list_badges')) || [];
  },
};

// ------------------------------------------------------------------- report
export const report = {
  async weekly(weekOffset = 0) {
    return rpc('weekly_report', { p_week_offset: weekOffset });
  },
};

// ------------------------------------------------------------------ profile
export const profile = {
  /** partial settings (and/or name, timezone) -> updated user */
  async update(patch) {
    return rpc('update_settings', { patch });
  },
  /** { points, weekRank, streak, quranStreak, ... } */
  async summary() {
    return rpc('get_profile_summary');
  },
  async exportData() {
    return rpc('export_my_data');
  },
  async deleteAccount(confirmText) {
    return rpc('delete_my_account', { p_confirm: confirmText });
  },
};
