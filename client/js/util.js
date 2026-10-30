// small helpers shared by the menu code
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// special tags shown above a rider's name tag (in the lobby and on the track)
export const STAFF_TAGS = { lmkk: [['DEV', 'dev'], ['CREATOR', 'creator']] };
const BASE_TAGS = { ...STAFF_TAGS };
// riders an admin gave the DEV tag (from the server's /api/tags); the built-in ones stay
export function setStaffTags(map) {
  for (const k of Object.keys(STAFF_TAGS)) if (!BASE_TAGS[k]) delete STAFF_TAGS[k];
  for (const [name, list] of Object.entries(map || {})) {
    const k = name.toLowerCase();
    if (!BASE_TAGS[k]) STAFF_TAGS[k] = list.map((l) => [l, l.toLowerCase()]);
  }
}
export function staffTags(name) {
  const t = STAFF_TAGS[String(name || '').trim().toLowerCase()];
  return t ? `<div class="staff-tags">${t.map(([label, cls]) => `<b class="stag ${cls}">${label}</b>`).join('')}</div>` : '';
}
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
export function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
export function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' days ago';
}
