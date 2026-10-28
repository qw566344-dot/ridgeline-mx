// =====================================================================
//  CLOUD SAVE for accounts (optional). Free hosting wipes the server's
//  disk on every restart, so accounts made on one computer could vanish.
//  If these two environment variables are set (from a free Upstash Redis
//  database - see README.md), every account is also saved there and loaded
//  back when the server starts:
//      UPSTASH_REDIS_REST_URL     UPSTASH_REDIS_REST_TOKEN
//  Without them the server just uses its local accounts.json as before.
// =====================================================================
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.ACCOUNTS_KEY || 'ridgeline-mx:accounts';

export const cloudEnabled = !!(URL_ && TOKEN);

async function command(args) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

// the saved accounts database, or null if there is none yet / no cloud save
export async function cloudLoad() {
  if (!cloudEnabled) return null;
  const v = await command(['GET', KEY]);
  return v ? JSON.parse(v) : null;
}

export async function cloudSave(db) {
  if (!cloudEnabled) return;
  await command(['SET', KEY, JSON.stringify(db)]);
}
