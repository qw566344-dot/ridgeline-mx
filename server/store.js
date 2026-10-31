// =====================================================================
//  CLOUD SAVE for accounts (optional). Free hosting wipes the server's
//  disk on every restart and every update, so accounts need to live
//  somewhere else. Either of these works:
//   - Render Key Value (free, in the same Render account - see render.yaml):
//       REDIS_URL = redis://red-xxxxx:6379   (Render fills this in)
//   - Upstash Redis (free, see README.md):
//       UPSTASH_REDIS_REST_URL     UPSTASH_REDIS_REST_TOKEN
//  Without either, the server keeps accounts in its local accounts.json, and
//  players' browsers put their own accounts back after a wipe (revive).
// =====================================================================
import net from 'net';

const REDIS = process.env.REDIS_URL;
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.ACCOUNTS_KEY || 'ridgeline-mx:accounts';

export const cloudEnabled = !!(REDIS || (URL_ && TOKEN));
export const cloudKind = REDIS ? 'Render Key Value' : URL_ && TOKEN ? 'Upstash' : null;

// --- a tiny Redis client (RESP over TCP): enough for AUTH / GET / SET, no packages needed
function redis(args) {
  const u = new URL(REDIS);
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(u.port) || 6379, u.hostname);
    const enc = (a) => `*${a.length}\r\n` + a.map((x) => { const b = Buffer.from(String(x)); return `$${b.length}\r\n${b}\r\n`; }).join('');
    const cmds = [];
    if (u.password) cmds.push(u.username && u.username !== 'default' ? ['AUTH', decodeURIComponent(u.username), decodeURIComponent(u.password)] : ['AUTH', decodeURIComponent(u.password)]);
    cmds.push(args);
    let buf = Buffer.alloc(0), replies = [];
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('timed out')); }, 8000);
    // read one reply starting at i; returns [value, next index] or null if more data is needed
    const read = (i) => {
      const nl = buf.indexOf('\r\n', i);
      if (nl < 0) return null;
      const type = String.fromCharCode(buf[i]), line = buf.toString('utf8', i + 1, nl);
      if (type === '+') return [line, nl + 2];
      if (type === '-') return [new Error(line), nl + 2];
      if (type === ':') return [Number(line), nl + 2];
      if (type === '$') {
        const n = Number(line);
        if (n < 0) return [null, nl + 2];
        if (buf.length < nl + 2 + n + 2) return null;
        return [buf.toString('utf8', nl + 2, nl + 2 + n), nl + 2 + n + 2];
      }
      return [new Error('unexpected reply'), buf.length];
    };
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      let i = 0, r;
      replies = [];
      while (replies.length < cmds.length && (r = read(i))) { replies.push(r[0]); i = r[1]; }
      if (replies.length < cmds.length) return;
      clearTimeout(timer); sock.end();
      const bad = replies.find((x) => x instanceof Error);
      if (bad) reject(bad); else resolve(replies[replies.length - 1]);
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
    sock.write(cmds.map(enc).join(''));
  });
}

async function command(args) {
  if (REDIS) return redis(args);
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
