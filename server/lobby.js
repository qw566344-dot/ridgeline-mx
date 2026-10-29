// =====================================================================
//  PARTIES + SESSIONS (the multiplayer brain)
//  - Players connect, get an id and a reconnect token.
//  - Anyone can create a party (random 6-character code) or join one.
//  - The party leader picks track / mode / laps and starts sessions.
//  - During a session the server relays everyone's rider state as
//    snapshots (20 Hz) and runs the lap/checkpoint rules itself, so race
//    results come from the server, not from what a client claims.
//  - Disconnected players keep their seat for 60 s so they can rejoin.
// =====================================================================
import crypto from 'crypto';
import { getTrack, TRACKS } from '../shared/tracks.js';
import { VEHICLES, BIKE_COLORS } from '../shared/vehicles.js';
import { buildTrack, buildFields, locatePrecise } from '../shared/trackgen.js';
import { LapTracker, GAME } from '../shared/rules.js';
import { GEAR_SETS } from '../shared/shop.js';
import { CODE_CHARS, CODE_LENGTH, validCode, cleanName, STATE_LEN, MODES, SNAPSHOT_RATE, PROTOCOL_VERSION } from '../shared/protocol.js';

const LOAD_WAIT_MS = 15000; // longest wait for a slow rider to load the track
const GO_DELAY_MS = 3000;   // then 3-2-1 (the gate drops 1 s after goAt on the riders' screens)

const RECONNECT_GRACE = 60_000;   // ms a disconnected player keeps their seat
const PARTY_EXPIRY = 120_000;     // ms an empty party survives
const MAX_PER_IP = 16;
const MAX_CONNECTIONS = 600;
const RACE_LIMIT_AFTER_WINNER = 60_000;

const tracks = new Map();
function trackInfo(id) {
  if (!tracks.has(id)) {
    const T = buildTrack(getTrack(id));
    tracks.set(id, { T, F: buildFields(T, 1.0, 34), half: getTrack(id).worldSize / 2 });
  }
  return tracks.get(id);
}

function newCode(existing) {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    const bytes = crypto.randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i++) c += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    if (!existing.has(c)) return c;
  }
  throw new Error('no free party codes');
}

export class Lobby {
  constructor(log = console.log) {
    this.log = log;
    this.players = new Map();   // id -> player
    this.tokens = new Map();    // token -> player
    this.parties = new Map();   // code -> party
    this.ipCount = new Map();
    this.conns = 0;
    this.nextId = 1;
    setInterval(() => this.tick(), 1000 / SNAPSHOT_RATE);
    setInterval(() => this.cleanup(), 5000);
    setInterval(() => this.heartbeat(), 10_000);
    this.live = new Set();
  }

  // ------------------------------------------------------------- connections
  onConnection(conn) {
    const n = this.ipCount.get(conn.ip) || 0;
    if (n >= MAX_PER_IP || this.conns >= MAX_CONNECTIONS) { conn.send({ t: 'error', code: 'SERVER_FULL', msg: 'Too many connections from this address. Close some tabs and try again.' }); conn.close(1013, 'full'); return; }
    this.ipCount.set(conn.ip, n + 1);
    this.conns++;
    this.live.add(conn);
    conn.bucket = 60; conn.bucketTime = Date.now(); conn.drops = 0; conn.player = null;
    conn.on('message', (txt) => this.onMessage(conn, txt));
    conn.on('close', () => {
      this.live.delete(conn);
      this.conns--;
      this.ipCount.set(conn.ip, Math.max(0, (this.ipCount.get(conn.ip) || 1) - 1));
      const p = conn.player;
      if (p && p.conn === conn) {
        p.connected = false; p.conn = null; p.lastSeen = Date.now();
        if (p.party) { this.broadcastParty(p.party); this.log(`[${p.party.code}] ${p.name} disconnected`); }
      }
    });
  }

  heartbeat() {
    const now = Date.now();
    for (const c of this.live) {
      if (now - c.lastPong > 35_000 && now - (c.lastMsg || 0) > 35_000) c.close(1001, 'timeout');
      else c.ping();
    }
  }

  // token bucket: ~40 messages per second sustained
  allow(conn) {
    const now = Date.now();
    conn.bucket = Math.min(80, conn.bucket + ((now - conn.bucketTime) / 1000) * 40);
    conn.bucketTime = now;
    if (conn.bucket < 1) {
      conn.drops++;
      if (conn.drops > 200) conn.close(1008, 'rate limit');
      return false;
    }
    conn.bucket -= 1;
    if (conn.drops > 0 && Math.random() < 0.01) conn.drops--;
    return true;
  }

  onMessage(conn, txt) {
    conn.lastMsg = Date.now();
    if (!this.allow(conn)) return;
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const p = conn.player;
    if (m.t === 'hello') return this.hello(conn, m);
    if (!p) return conn.send({ t: 'error', code: 'NO_HELLO', msg: 'Say hello first' });
    switch (m.t) {
      case 'ping': conn.send({ t: 'pong', c: m.c, s: Date.now() }); if (Number.isFinite(m.rtt)) p.ping = Math.max(0, Math.min(9999, Math.round(m.rtt))); break;
      case 'profile': this.profile(p, m); break;
      case 'create': this.create(p); break;
      case 'join': this.join(p, m.code); break;
      case 'leave': this.leave(p, true); break;
      case 'ready': p.ready = !!m.ready; if (p.party) this.broadcastParty(p.party); break;
      case 'settings': this.settings(p, m); break;
      case 'start': this.start(p); break;
      case 'end': this.endSession(p); break;
      case 'rejoin': this.rejoin(p); break;
      case 'adminjoin': this.adminJoin(p, m); break;
      case 'loaded': this.loaded(p, m); break;
      case 's': this.state(p, m.d); break;
      case 'ev':
        if (m.e === 'reset' || m.e === 'crash') p.resetAt = Date.now();
        // freestyle jams: trick points count towards the party leaderboard
        if (m.e === 'trick' && p.party && p.party.session && p.party.session.mode === 'freestyle' && !p.party.session.over) {
          const v = Math.round(Number(m.v));
          if (Number.isFinite(v) && v > 0) p.score = (p.score || 0) + Math.min(20000, v);
        }
        break;
      default: break;
    }
  }

  hello(conn, m) {
    if (m.v !== PROTOCOL_VERSION) { conn.send({ t: 'error', code: 'VERSION', msg: 'Game version mismatch - refresh the page.' }); return; }
    let p = typeof m.token === 'string' ? this.tokens.get(m.token) : null;
    if (p) {
      if (p.conn && p.conn !== conn) p.conn.close(4000, 'replaced');
      p.conn = conn; p.connected = true;
      this.log(`${p.name} reconnected`);
    } else {
      const token = crypto.randomBytes(16).toString('hex');
      p = { id: this.nextId++, token, name: cleanName(m.name), vehicle: 'mx450', color: 'red', number: 0, conn, connected: true, party: null, ready: false, ping: null, state: null, stateTime: 0, lastSeen: Date.now() };
      this.players.set(p.id, p);
      this.tokens.set(token, p);
    }
    conn.player = p;
    this.profile(p, m, true);
    conn.send({ t: 'welcome', id: p.id, token: p.token, s: Date.now(), tracks: TRACKS.map((t) => ({ id: t.id, name: t.name })) });
    if (p.party) {
      this.broadcastParty(p.party);
      const S = p.party.session;
      if (S && !S.over) conn.send(this.sessionMsg(p.party));
    }
  }

  profile(p, m, quiet) {
    if (m.name !== undefined) p.name = cleanName(m.name);
    if (VEHICLES.some((v) => v.id === m.vehicle)) p.vehicle = m.vehicle;
    if (m.color === 'stock' || BIKE_COLORS.some((c) => c.id === m.color)) p.color = m.color;
    if (GEAR_SETS.some((g) => g.id === m.gear)) p.gear = m.gear;
    if (!quiet && p.party) this.broadcastParty(p.party);
  }

  // ------------------------------------------------------------- parties
  create(p) {
    if (p.party) this.leave(p, false);
    const code = newCode(this.parties);
    const party = { code, leader: p.id, members: new Map(), settings: { track: TRACKS[0].id, mode: 'freeride', laps: 3 }, session: null, emptySince: null, created: Date.now() };
    this.parties.set(code, party);
    this.addMember(party, p);
    this.log(`[${code}] party created by ${p.name}`);
  }

  // admins (checked with their account login) can drop into any rider's party -
  // if that rider is alone, a party is made around them first
  adminJoin(p, m) {
    const u = this.accounts && this.accounts.user(String(m.auth || ''));
    if (!u || !this.accounts.admin.isAdmin(u)) return this.err(p, 'NOT_ADMIN', 'Admins only.');
    const want = String(m.name || '').trim().toLowerCase();
    const t = [...this.players.values()].find((x) => x.connected && x !== p && x.name.toLowerCase() === want);
    if (!t) return this.err(p, 'NOT_FOUND', `${m.name} is not online on this server (they may be in another region).`);
    if (!t.party) this.create(t);
    this.join(p, t.party.code);
  }

  join(p, codeIn) {
    const code = String(codeIn || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!validCode(code)) return this.err(p, 'BAD_CODE', 'Party codes are 6 letters/numbers, like MX7K2P.');
    const party = this.parties.get(code);
    if (!party) return this.err(p, 'NO_PARTY', `No party with code ${code}. It may have expired - ask your friend for a new code.`);
    if (p.party === party) return this.broadcastParty(party);
    const connected = [...party.members.values()].filter((x) => x.connected || Date.now() - x.lastSeen < RECONNECT_GRACE);
    if (connected.length >= GAME.maxPlayers) return this.err(p, 'FULL', `Party ${code} is full (${GAME.maxPlayers} riders).`);
    if (p.party) this.leave(p, false);
    this.addMember(party, p);
    this.log(`[${code}] ${p.name} joined`);
    // ride straight in if a free ride / time trial is already going
    const S = party.session;
    if (S && !S.over && S.mode !== 'race') {
      S.players.push(this.sessionPlayer(p, S.players.length));
      this.setupTracker(party, p);
      for (const m of party.members.values()) if (m.conn) m.conn.send(this.sessionMsg(party, m !== p));
    }
  }

  addMember(party, p) {
    const used = new Set([...party.members.values()].map((m) => m.number));
    let num;
    do { num = 2 + Math.floor(Math.random() * 98); } while (used.has(num));
    p.number = num; p.party = party; p.ready = false; p.state = null;
    party.members.set(p.id, p);
    party.emptySince = null;
    this.broadcastParty(party);
  }

  leave(p, notify) {
    const party = p.party;
    if (!party) return;
    party.members.delete(p.id);
    p.party = null; p.state = null; p.ready = false;
    if (party.session) party.session.players = party.session.players.filter((x) => x.id !== p.id);
    if (party.leader === p.id) {
      const next = [...party.members.values()].find((m) => m.connected) || [...party.members.values()][0];
      party.leader = next ? next.id : null;
    }
    this.log(`[${party.code}] ${p.name} left`);
    if (party.members.size === 0) { this.parties.delete(party.code); this.log(`[${party.code}] closed`); }
    else this.broadcastParty(party);
    if (notify && p.conn) p.conn.send({ t: 'left' });
  }

  settings(p, m) {
    const party = p.party;
    if (!party || party.leader !== p.id) return this.err(p, 'NOT_LEADER', 'Only the party leader can change that.');
    if (TRACKS.some((t) => t.id === m.track)) party.settings.track = m.track;
    if (MODES.includes(m.mode)) party.settings.mode = m.mode;
    const laps = Number(m.laps);
    if (Number.isInteger(laps) && laps >= 1 && laps <= 10) party.settings.laps = laps; // minutes in freestyle
    this.broadcastParty(party);
  }

  sessionPlayer(p, slot) { return { id: p.id, name: p.name, vehicle: p.vehicle, color: p.color, gear: p.gear || 'match', number: p.number, slot }; }

  setupTracker(party, p) {
    const S = party.session;
    const info = trackInfo(S.track);
    p.lap = new LapTracker(info.T);
    p.lap.reset(S.mode === 'timetrial' ? 'flying' : 'race', 0);
    p.finished = false; p.finishTime = null; p.score = 0; p.state = null; p.lastPos = null; p.sHint = null; p.flags = 0;
  }

  start(p) {
    const party = p.party;
    if (!party || party.leader !== p.id) return this.err(p, 'NOT_LEADER', 'Only the party leader can start.');
    const members = [...party.members.values()].filter((m) => m.connected);
    const now = Date.now();
    const st = party.settings;
    party.session = {
      id: crypto.randomBytes(4).toString('hex'), track: st.track, mode: st.mode, laps: st.laps,
      // the countdown starts once every rider has loaded the track (or after LOAD_WAIT_MS)
      goAt: now + LOAD_WAIT_MS + GO_DELAY_MS, waiting: st.mode !== 'freeride', loaded: new Set(), started: now, over: false, firstFinish: null, results: null,
      players: members.map((m, i) => this.sessionPlayer(m, i)),
    };
    for (const m of members) this.setupTracker(party, m);
    for (const m of party.members.values()) m.ready = false;
    this.log(`[${party.code}] session ${party.session.id}: ${st.mode} on ${st.track}, ${members.length} riders`);
    for (const m of party.members.values()) if (m.conn) m.conn.send(this.sessionMsg(party));
    this.broadcastParty(party);
  }

  // a rider finished loading the session's track
  loaded(p, m) {
    const party = p.party, S = party && party.session;
    if (!S || S.id !== m.id || !S.waiting) return;
    S.loaded.add(p.id);
    const need = S.players.map((sp) => this.players.get(sp.id)).filter((x) => x && x.connected && x.party === party);
    if (need.every((x) => S.loaded.has(x.id))) this.go(party);
  }

  // everyone is ready: 3-2-1 from now
  go(party) {
    const S = party.session;
    if (!S || !S.waiting) return;
    S.waiting = false;
    S.goAt = Date.now() + GO_DELAY_MS;
    for (const m of party.members.values()) if (m.conn) m.conn.send({ t: 'go', id: S.id, goAt: S.goAt, s: Date.now() });
  }

  // back into a running session (after visiting the menu, or a page reload)
  rejoin(p) {
    const party = p.party, S = party && party.session;
    if (!S || S.over) return this.err(p, 'NO_SESSION', 'No session is running right now.');
    if (S.mode === 'race' && !S.players.some((x) => x.id === p.id)) return this.err(p, 'RACE_RUNNING', 'A race is in progress - you can join the next one.');
    if (!S.players.some((x) => x.id === p.id)) {
      S.players.push(this.sessionPlayer(p, S.players.length));
      this.setupTracker(party, p);
      for (const m of party.members.values()) if (m.conn && m !== p) m.conn.send(this.sessionMsg(party, true));
    }
    if (p.conn) p.conn.send(this.sessionMsg(party));
  }

  endSession(p) {
    const party = p.party;
    if (!party || party.leader !== p.id || !party.session) return;
    this.finishSession(party);
    party.session = null;
    for (const m of party.members.values()) if (m.conn) m.conn.send({ t: 'ended' });
    this.broadcastParty(party);
  }

  sessionMsg(party, rejoin = false) {
    const S = party.session;
    return { t: 'session', id: S.id, track: S.track, mode: S.mode, laps: S.laps, goAt: S.goAt, waiting: !!S.waiting, players: S.players, rejoin, s: Date.now() };
  }

  // ------------------------------------------------------------- rider state
  state(p, d) {
    const party = p.party;
    if (!party || !party.session || party.session.over && party.session.mode === 'race' && Date.now() - party.session.over > 15000) return;
    if (!Array.isArray(d) || d.length !== STATE_LEN) return;
    for (let i = 0; i < STATE_LEN; i++) if (typeof d[i] !== 'number' || !Number.isFinite(d[i])) return;
    const S = party.session;
    const info = trackInfo(S.track);
    const now = Date.now();
    const [x, y, z] = d;
    if (Math.abs(x) > info.half + 30 || Math.abs(z) > info.half + 30 || Math.abs(y) > 500) return;
    const spd = Math.hypot(d[7], d[8], d[9]);
    if (spd > GAME.maxSpeed * 1.25) return;
    // movement check: big jumps in position only allowed right after a reset
    let trusted = true;
    if (p.lastPos) {
      const dt = Math.max(0.02, (now - p.stateTime) / 1000);
      const dist = Math.hypot(x - p.lastPos[0], z - p.lastPos[2]);
      if (dist > GAME.maxSpeed * dt + 6 && now - (p.resetAt || 0) > 1500) { trusted = false; p.flags = (p.flags || 0) + 1; }
    }
    p.state = d; p.stateTime = now; p.lastPos = [x, y, z];
    // the server runs the lap rules itself
    if (p.lap && trusted && S.mode !== 'freeride' && S.mode !== 'freestyle' && now >= S.goAt && !p.finished) {
      const loc = locatePrecise(info.T, info.F, x, z, p.sHint);
      if (loc && Math.abs(loc.u) < 40) {
        p.sHint = loc.s;
        const ev = p.lap.update(loc.s, (now - S.goAt) / 1000);
        if (ev && ev.type === 'lap' && S.mode === 'race' && p.lap.laps >= S.laps) {
          p.finished = true; p.finishTime = (now - S.goAt) / 1000;
          if (!S.firstFinish) S.firstFinish = now;
          this.log(`[${party.code}] ${p.name} finished in ${p.finishTime.toFixed(2)}s`);
        }
        if (ev) this.sendRace(party);
      } else p.sHint = null;
    } else if (!trusted) p.sHint = null;
  }

  standings(party) {
    const S = party.session;
    const list = S.players.map((sp) => this.players.get(sp.id)).filter((p) => p && p.lap && p.party === party);
    if (S.mode === 'freestyle') return list.sort((a, b) => (b.score || 0) - (a.score || 0));
    if (S.mode === 'timetrial') return list.sort((a, b) => (a.lap.bestLap ?? 1e9) - (b.lap.bestLap ?? 1e9));
    return list.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.lap.progress(b.sHint ?? 0) - a.lap.progress(a.sHint ?? 0);
    });
  }

  sendRace(party) {
    const S = party.session;
    if (!S || S.mode === 'freeride') return;
    const rows = this.standings(party).map((p, i) => ({ id: p.id, name: p.name, pos: i + 1, laps: p.lap.laps, best: p.lap.bestLap, last: p.lap.lastLap, finished: !!p.finished, time: p.finishTime, score: p.score || 0, connected: p.connected }));
    const msg = JSON.stringify({ t: 'race', mode: S.mode, laps: S.laps, rows, over: !!S.over });
    for (const m of party.members.values()) if (m.conn) m.conn.send(msg);
    return rows;
  }

  finishSession(party) {
    const S = party.session;
    if (!S || S.over) return;
    S.over = Date.now();
    if (S.mode === 'freeride') return;
    const rows = this.sendRace(party);
    S.results = rows;
    for (const m of party.members.values()) if (m.conn) m.conn.send({ t: 'results', mode: S.mode, rows });
    this.log(`[${party.code}] session over`);
  }

  // ------------------------------------------------------------- 20 Hz tick
  tick() {
    const now = Date.now();
    for (const party of this.parties.values()) {
      const S = party.session;
      if (!S) continue;
      const p = [];
      for (const sp of S.players) {
        const m = this.players.get(sp.id);
        if (!m || !m.state || m.party !== party) continue;
        if (now - m.stateTime > 3000) continue;
        p.push([m.id, m.stateTime, ...m.state]);
      }
      if (p.length) {
        const msg = JSON.stringify({ t: 'snap', st: now, p });
        for (const m of party.members.values()) if (m.conn) m.conn.send(msg);
      }
      // nobody connected is in it any more: end it so the party can start fresh
      if (!S.over && !S.players.some((sp) => { const m = this.players.get(sp.id); return m && m.connected && m.party === party; })) { party.session = null; this.broadcastParty(party); continue; }
      // someone is taking too long to load: start without waiting any longer
      if (S.waiting && now - S.started > LOAD_WAIT_MS) this.go(party);
      // race end conditions
      if (S.mode === 'race' && !S.over && now > S.goAt) {
        const racers = S.players.map((sp) => this.players.get(sp.id)).filter((x) => x && x.party === party);
        const live = racers.filter((x) => x.connected);
        if ((live.length && live.every((x) => x.finished)) || (S.firstFinish && now - S.firstFinish > RACE_LIMIT_AFTER_WINNER)) this.finishSession(party);
      }
      if (S.mode === 'freestyle' && !S.over && now > S.goAt + S.laps * 60_000) this.finishSession(party);
      if (!S.over && now % 1000 < 50 && S.mode !== 'freeride' && now > S.goAt) this.sendRace(party);
    }
  }

  cleanup() {
    const now = Date.now();
    for (const p of [...this.players.values()]) {
      if (!p.connected && now - p.lastSeen > RECONNECT_GRACE) {
        if (p.party) this.leave(p, false);
        this.players.delete(p.id);
        this.tokens.delete(p.token);
      }
    }
    for (const party of [...this.parties.values()]) {
      const anyone = [...party.members.values()].some((m) => m.connected);
      if (!anyone) {
        if (!party.emptySince) party.emptySince = now;
        else if (now - party.emptySince > PARTY_EXPIRY) { this.parties.delete(party.code); this.log(`[${party.code}] expired`); }
      } else party.emptySince = null;
      // a disconnected leader hands over to someone still here
      const leader = party.members.get(party.leader);
      if ((!leader || !leader.connected) && anyone) {
        const next = [...party.members.values()].find((m) => m.connected);
        if (next && (!leader || now - leader.lastSeen > 10_000)) { party.leader = next.id; this.broadcastParty(party); }
      }
    }
  }

  partyMsg(party) {
    return {
      t: 'party', code: party.code, leader: party.leader, settings: party.settings,
      session: party.session && !party.session.over ? { id: party.session.id, mode: party.session.mode } : null,
      members: [...party.members.values()].map((m) => ({ id: m.id, name: m.name, vehicle: m.vehicle, color: m.color, ready: m.ready, connected: m.connected, ping: m.ping, number: m.number })),
    };
  }

  broadcastParty(party) {
    const msg = JSON.stringify(this.partyMsg(party));
    for (const m of party.members.values()) if (m.conn) m.conn.send(msg);
  }

  err(p, code, msg) { if (p.conn) p.conn.send({ t: 'error', code, msg }); }

  // is there a party with this code here? (lets a client find which region it is on)
  hasParty(code) { return this.parties.has(String(code || '').toUpperCase()); }

  stats() { return { players: this.players.size, parties: this.parties.size, connections: this.conns }; }
}
