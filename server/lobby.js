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
import { VEHICLES, BIKE_COLORS, isSpecial, isPassVehicle } from '../shared/vehicles.js';
import { buildTrack, buildFields, locatePrecise } from '../shared/trackgen.js';
import { LapTracker, GAME } from '../shared/rules.js';
import { GEAR_SETS, RANK_START, rankTier, EXTRA_SLOTS, extraOf } from '../shared/shop.js';
import { CODE_CHARS, CODE_LENGTH, validCode, cleanName, STATE_LEN, MODES, SNAPSHOT_RATE, PROTOCOL_VERSION } from '../shared/protocol.js';

const LOAD_WAIT_MS = 15000; // longest wait for a slow rider to load the track
const GO_DELAY_MS = 3000;   // then 3-2-1 (the gate drops 1 s after goAt on the riders' screens)

const RECONNECT_GRACE = 60_000;   // ms a disconnected player keeps their seat
const PARTY_EXPIRY = 120_000;     // ms an empty party survives
const MAX_PER_IP = 16;
const MAX_CONNECTIONS = 600;
const RACE_LIMIT_AFTER_WINNER = 60_000;
const AFK_MS = Number(process.env.AFK_MS) || 45_000;            // a racer who has not moved this long is out (and a 1v1 ends there)

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
    this.pending = new Map(); // rider account key -> admin waiting to join them
    this.mm = { casual: [], ranked: [], ranked2: [] }; // matchmaking queues (see matchmake)
    setInterval(() => this.matchmake(), 1000);
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

  // token bucket: ~60 messages per second sustained (30 rider states a second + everything else)
  allow(conn) {
    const now = Date.now();
    conn.bucket = Math.min(120, conn.bucket + ((now - conn.bucketTime) / 1000) * 60);
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
      case 'create': this.unqueue(p, true); this.create(p); break;
      case 'queue': this.queue(p, m); break;
      case 'unqueue': this.unqueue(p); break;
      case 'join': this.join(p, m.code); break;
      case 'leave': this.leave(p, true); break;
      case 'ready': p.ready = !!m.ready; if (p.party) this.broadcastParty(p.party); break;
      case 'settings': this.settings(p, m); break;
      case 'start': this.start(p); break;
      case 'end': this.endSession(p); break;
      case 'rejoin': this.rejoin(p); break;
      case 'adminjoin': this.adminJoin(p, m); break;
      case 'pulled': this.pulled(p, m); break;
      case 'adminsummon': this.adminSummon(p, m); break;
      case 'pchat': this.partyChat(p, m); break;
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
    if (m.auth && this.accounts) { const u = this.accounts.user(String(m.auth)); if (u) p.acct = u.key; } // lets a party mate queue a 2v2 duo for both
    if (VEHICLES.some((v) => v.id === m.vehicle) || isSpecial(m.vehicle) || isPassVehicle(m.vehicle)) p.vehicle = m.vehicle;
    // rims / flame / exhaust sound / trail, so the others see (and hear) them in a race
    if (m.cos && typeof m.cos === 'object') { p.cos = {}; for (const k of EXTRA_SLOTS) if (extraOf(k, m.cos[k])) p.cos[k] = m.cos[k]; }
    if (m.color === 'stock' || BIKE_COLORS.some((c) => c.id === m.color)) p.color = m.color;
    if (GEAR_SETS.some((g) => g.id === m.gear)) p.gear = m.gear;
    if (!quiet && p.party) this.broadcastParty(p.party);
  }

  // ------------------------------------------------------------- matchmaking
  // Casual: whoever is queued on this server, 2-8 riders, a random race track. Nobody else
  // after 40 s: the rider is told to race the AI instead. Ranked: needs an online account
  // (only the home server has accounts), 1v1 against a rider of a similar rating - the window widens
  // the longer they wait - and the result moves everyone's rating (see rate).
  // Ranked 2v2 ('ranked2'): two teams of two. Queue alone (you get a teammate of your rank) or
  // as a duo - the leader of a party of exactly two queues for both (both logged in). Teams race
  // on placings (lowest sum of finishing places wins) and the result moves each rider's own 2v2
  // rating (rating2), kept apart from the 1v1 one.
  queue(p, m) {
    const mode = m.mode === 'ranked' ? 'ranked' : m.mode === 'ranked2' ? 'ranked2' : 'casual';
    this.unqueue(p, true);
    if (p.party && p.party.session && !p.party.session.over) return this.err(p, 'IN_RACE', 'Finish your race first.');
    let rating = RANK_START, key = null;
    if (mode !== 'casual') {
      const u = this.accounts && this.accounts.user(String(m.auth || ''));
      if (!u) return this.err(p, 'RANKED_LOGIN', 'Ranked needs an online account - log in first.');
      key = u.key; p.acct = u.key; rating = (mode === 'ranked2' ? u.rating2 : u.rating) || RANK_START;
    }
    const size = p.party && !p.party.match ? p.party.members.size : 1;
    if (mode === 'ranked' && size > 1) return this.err(p, 'PARTY_SIZE', 'Ranked 1v1 is solo only - leave your party to play it.');
    if (mode === 'ranked2' && (size > 2 || (size === 2 && !m.duo))) return this.err(p, 'PARTY_SIZE', 'Ranked 2v2 is for a party of two at most.');
    if (mode === 'ranked2' && m.duo) {
      const P = p.party;
      if (!P || P.match || P.members.size !== 2 || P.leader !== p.id) return this.err(p, 'DUO', 'A duo needs a party of exactly two: you (the leader) and your teammate.');
      const mate = [...P.members.values()].find((x) => x !== p);
      const mu = mate.acct && this.accounts.db.users[mate.acct];
      if (!mu || !mate.connected) return this.err(p, 'DUO_LOGIN', `${mate.name} needs to be logged in to an online account.`);
      this.unqueue(mate, true);
      this.leave(p, true); this.leave(mate, true);
      this.mm.ranked2.push({ p, mate, since: Date.now(), rating: Math.round((rating + (mu.rating2 || RANK_START)) / 2), key, mkey: mu.key });
      return this.queueStatus(mode);
    }
    if (p.party) this.leave(p, false);
    this.mm[mode].push({ p, since: Date.now(), rating, key });
    this.queueStatus(mode);
  }
  unqueue(p, quiet) {
    for (const mode of ['casual', 'ranked', 'ranked2']) {
      const n = this.mm[mode].length, gone = this.mm[mode].filter((e) => e.p === p || e.mate === p);
      this.mm[mode] = this.mm[mode].filter((e) => !gone.includes(e));
      for (const e of gone) for (const x of [e.p, e.mate]) if (x && x.conn && (!quiet || x !== p)) x.conn.send({ t: 'queue', state: 'off', mode });
      if (n !== this.mm[mode].length) this.queueStatus(mode);
    }
  }
  queueStatus(mode) {
    const Q = this.mm[mode], now = Date.now(), n = Q.reduce((k, e) => k + (e.mate ? 2 : 1), 0);
    for (const e of Q) for (const x of [e.p, e.mate]) if (x && x.conn) x.conn.send({ t: 'queue', state: 'waiting', mode, n, waited: now - e.since, duo: e.mate ? (x === e.p ? e.mate.name : e.p.name) : null });
  }
  // 2v2: the oldest entry in the queue picks the closest-rated entries that fit its window
  // (a duo counts as two) until there are four riders; duos stay together, four solos are split
  // best + worst against the middle two
  matchmake2(now) {
    const ok = (x) => x && x.connected && !x.party;
    const Q = this.mm.ranked2 = this.mm.ranked2.filter((e) => ok(e.p) && (!e.mate || ok(e.mate)));
    const win = (e) => 200 + ((now - e.since) / 1000) * 10;
    const size = (e) => (e.mate ? 2 : 1);
    Q.sort((a, b) => a.since - b.since);
    for (let i = 0; i < Q.length; i++) {
      const A = Q[i], pick = [A];
      let n = size(A);
      const near = Q.filter((e) => e !== A && Math.abs(e.rating - A.rating) <= Math.min(win(A), win(e))).sort((a, b) => Math.abs(a.rating - A.rating) - Math.abs(b.rating - A.rating));
      for (const e of near) if (n + size(e) <= 4) { pick.push(e); n += size(e); if (n === 4) break; }
      if (n < 4) continue;
      for (const e of pick) Q.splice(Q.indexOf(e), 1);
      i = -1; // start over with what is left
      const duos = pick.filter((e) => e.mate), solos = pick.filter((e) => !e.mate).sort((a, b) => b.rating - a.rating);
      const flat = (e) => (e.mate ? [{ p: e.p, key: e.key }, { p: e.mate, key: e.mkey }] : [{ p: e.p, key: e.key }]);
      const teams = duos.length === 2 ? [flat(duos[0]), flat(duos[1])]
        : duos.length === 1 ? [flat(duos[0]), solos.flatMap(flat)]
          : [[...flat(solos[0]), ...flat(solos[3])], [...flat(solos[1]), ...flat(solos[2])]];
      this.makeMatch('ranked2', [...teams[0], ...teams[1]], teams);
    }
  }
  matchmake() {
    const now = Date.now();
    for (const mode of ['casual', 'ranked']) {
      const Q = this.mm[mode] = this.mm[mode].filter((e) => e.p.connected && !e.p.party);
      if (mode === 'casual') {
        // a few seconds for more riders to turn up, then go with whoever is here
        if (Q.length >= 2 && (Q.length >= 8 || now - Q[0].since > 6000)) this.makeMatch(mode, Q.splice(0, 8));
        else if (Q.length === 1 && now - Q[0].since > 40000) { const e = Q.shift(); if (e.p.conn) e.p.conn.send({ t: 'queue', state: 'solo', mode }); }
      } else {
        Q.sort((a, b) => a.rating - b.rating);
        const win = (e) => 150 + ((now - e.since) / 1000) * 8; // rating window, wider the longer you wait
        // sorted by rating, so each rider's best opponent is a neighbour: pair the closest
        // neighbours first, and keep going until nobody left fits anybody's window
        for (;;) {
          let best = -1, gap = Infinity;
          for (let i = 0; i < Q.length - 1; i++) {
            const d = Q[i + 1].rating - Q[i].rating;
            if (d <= Math.min(win(Q[i]), win(Q[i + 1])) && d < gap) { gap = d; best = i; }
          }
          if (best < 0) break;
          this.makeMatch(mode, Q.splice(best, 2));
        }
      }
    }
    this.matchmake2(now);
    if (now - (this.mmStatusAt || 0) > 3000) { this.mmStatusAt = now; this.queueStatus('casual'); this.queueStatus('ranked'); this.queueStatus('ranked2'); }
  }
  makeMatch(mode, entries, teams) {
    const lead = entries[0].p;
    this.create(lead);
    const party = lead.party;
    party.match = { mode, keys: new Map(entries.map((e) => [e.p.id, e.key])) };
    if (teams) party.match.team = new Map(teams.flatMap((t, i) => t.map((e) => [e.p.id, i])));
    for (const e of entries.slice(1)) this.addMember(party, e.p);
    const pool = TRACKS.filter((t) => !t.freestyle && !t.open && t.difficulty !== 'Freestyle' && t.id !== 'practice');
    party.settings = { track: pool[Math.floor(Math.random() * pool.length)].id, mode: 'race', laps: 2 };
    this.log(`[${party.code}] ${mode} match: ${entries.map((e) => e.p.name).join(', ')} on ${party.settings.track}`);
    const T = party.match.team;
    for (const e of entries) if (e.p.conn) e.p.conn.send({ t: 'queue', state: 'found', mode, n: entries.length, track: party.settings.track, mate: T ? (entries.find((x) => x !== e && T.get(x.p.id) === T.get(e.p.id)) || {}).p?.name || null : null });
    this.start(lead);
  }
  // ranked result: every pair of riders is a head-to-head (Elo), split over the field
  rate(party, rows) {
    const A = this.accounts, keys = party.match.keys;
    const field = rows.map((r) => ({ r, u: A.db.users[keys.get(r.id)] })).filter((x) => x.u);
    if (field.length < 2) return;
    const K = 40 / (field.length - 1);
    const R = field.map((x) => x.u.rating || RANK_START), d = field.map(() => 0);
    for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) {
      const e = 1 / (1 + 10 ** ((R[j] - R[i]) / 400)); // chance i beats j; i finished ahead
      d[i] += K * (1 - e); d[j] -= K * (1 - e);
    }
    field.forEach((x, i) => {
      const u = x.u, before = R[i];
      u.rating = Math.max(100, Math.round(before + d[i]));
      u.ranked = { races: ((u.ranked && u.ranked.races) || 0) + 1, wins: ((u.ranked && u.ranked.wins) || 0) + (i === 0 ? 1 : 0) };
      const p = this.players.get(x.r.id);
      if (p && p.conn) p.conn.send({ t: 'rank', rating: u.rating, delta: u.rating - before, tier: rankTier(u.rating), was: rankTier(before), pos: x.r.pos });
    });
    A.save();
  }
  // 2v2 result: a team's score is the sum of its riders' places (a rider who left counts as last),
  // lowest wins, a tie goes to the team with the race winner. Team Elo on the two teams' average
  // ratings; both riders of a team move by the same amount.
  rate2(party, rows) {
    const A = this.accounts, M = party.match;
    const riders = [...M.team.entries()].map(([id, t]) => ({ id, t, u: A.db.users[M.keys.get(id)], r: rows.find((x) => x.id === id) })).filter((x) => x.u);
    const teams = [0, 1].map((t) => riders.filter((x) => x.t === t));
    if (!teams[0].length || !teams[1].length) return;
    const score = teams.map((T) => T.reduce((k, x) => k + (x.r && !x.r.out ? x.r.pos : 5), 0) + (2 - T.length) * 5);
    const first = rows.find((r) => r.pos === 1), firstTeam = first ? M.team.get(first.id) : 0;
    const winT = score[0] !== score[1] ? (score[0] < score[1] ? 0 : 1) : firstTeam;
    const avg = teams.map((T) => T.reduce((k, x) => k + (x.u.rating2 || RANK_START), 0) / T.length);
    const e0 = 1 / (1 + 10 ** ((avg[1] - avg[0]) / 400));
    const d0 = Math.round(32 * ((winT === 0 ? 1 : 0) - e0)) || (winT === 0 ? 1 : -1);
    for (const x of riders) {
      const u = x.u, before = u.rating2 || RANK_START, won = x.t === winT;
      u.rating2 = Math.max(100, before + (x.t === 0 ? d0 : -d0));
      u.ranked2 = { races: ((u.ranked2 && u.ranked2.races) || 0) + 1, wins: ((u.ranked2 && u.ranked2.wins) || 0) + (won ? 1 : 0) };
      const p = this.players.get(x.id), mate = teams[x.t].find((y) => y !== x);
      if (p && p.conn) p.conn.send({ t: 'rank', mode: 'ranked2', won, rating: u.rating2, delta: u.rating2 - before, tier: rankTier(u.rating2), was: rankTier(before), pos: x.r ? x.r.pos : null, score, team: x.t, mate: mate ? mate.u.name : null });
    }
    A.save();
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

  // admins (checked with their account login) can drop into any rider - no
  // party needed. If the rider is alone, a party is made around them; if
  // their game is not connected to this server yet (riding solo, or in the
  // menus), it is asked to connect through the friends poll and the admin
  // is let in as soon as it does (see pulled()).
  adminJoin(p, m) {
    const u = this.accounts && this.accounts.user(String(m.auth || ''));
    if (!u || !this.accounts.admin.isAdmin(u)) return this.err(p, 'NOT_ADMIN', 'Admins only.');
    if (m.code) return this.join(p, m.code, true); // a party from the admin panel's list: in, even mid-race (as a spectator)
    const want = String(m.name || '').trim().toLowerCase();
    const t = [...this.players.values()].find((x) => x.connected && x !== p && x.name.toLowerCase() === want);
    if (t) return this.joinRider(p, t);
    const F = this.accounts.friends;
    if (!this.accounts.db.users[want] || !(F && F.online(want))) return this.err(p, 'NOT_FOUND', `${m.name} is not online right now.`);
    this.pending.set(want, { admin: p, at: Date.now() });
    this.accounts.admin.pull(want, p.name);
    if (p.conn) p.conn.send({ t: 'notice', msg: `Joining <b>${String(m.name).replace(/[<>&]/g, '')}</b>... their game connects in a few seconds` });
  }

  // party chat: only the riders in your party get it (spam allowed; 100 ms flood guard)
  partyChat(p, m) {
    if (!p.party) return this.err(p, 'NO_PARTY', 'You are not in a party.');
    const acc = this.accounts && this.accounts.db.users[p.name.toLowerCase()];
    if (acc && this.accounts.admin.muted(acc)) return this.err(p, 'MUTED', 'You are muted in chat right now.');
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) return;
    const now = Date.now();
    if (now - (p.chatAt || 0) < 100) return this.err(p, 'SLOW', 'Slow down a little');
    p.chatAt = now;
    const msg = JSON.stringify({ t: 'pchat', name: p.name, text, at: now });
    for (const x of p.party.members.values()) if (x.conn) x.conn.send(msg);
  }

  // a rider's game answered the admin's call (checked with their account login)
  pulled(p, m) {
    const u = this.accounts && this.accounts.user(String(m.auth || ''));
    if (!u) return;
    const w = this.pending.get(u.key);
    this.pending.delete(u.key);
    if (!w || Date.now() - w.at > 60_000 || !w.admin.connected) return;
    if (w.summon) this.summonRider(w.admin, p); else this.joinRider(w.admin, p);
  }

  // the other way round: bring a rider into the admin's party (and ride, if
  // the admin's party is riding a free ride / time trial / freestyle)
  adminSummon(p, m) {
    const u = this.accounts && this.accounts.user(String(m.auth || ''));
    if (!u || !this.accounts.admin.isAdmin(u)) return this.err(p, 'NOT_ADMIN', 'Admins only.');
    const want = String(m.name || '').trim().toLowerCase();
    const t = [...this.players.values()].find((x) => x.connected && x !== p && x.name.toLowerCase() === want);
    if (t) return this.summonRider(p, t);
    const F = this.accounts.friends;
    if (!this.accounts.db.users[want] || !(F && F.online(want))) return this.err(p, 'NOT_FOUND', `${m.name} is not online right now.`);
    this.pending.set(want, { admin: p, at: Date.now(), summon: true });
    this.accounts.admin.pull(want, p.name);
    if (p.conn) p.conn.send({ t: 'notice', msg: `Bringing <b>${String(m.name).replace(/[<>&]/g, '')}</b> to you... their game connects in a few seconds` });
  }

  summonRider(admin, t) {
    if (!admin.party) this.create(admin);
    if (t.party === admin.party) return;
    this.join(t, admin.party.code, true);
    if (t.conn) t.conn.send({ t: 'summoned', from: admin.name });
    if (admin.conn) admin.conn.send({ t: 'notice', msg: `<b>${t.name.replace(/[<>&]/g, '')}</b> is in your party now` });
  }

  // admin troll: the rider blows up - everyone in their party sees the fireball, and
  // the rider's own game throws them off. Returns false if they are not connected here
  blowUp(name, from) {
    const want = String(name || '').trim().toLowerCase();
    const ts = [...this.players.values()].filter((x) => x.connected && x.name.toLowerCase() === want);
    for (const t of ts) { // every tab they have open
      const msg = JSON.stringify({ t: 'boom', id: t.id, from });
      for (const m of t.party ? t.party.members.values() : [t]) if (m.conn) m.conn.send(msg);
    }
    return ts.length > 0;
  }

  // admin tools: kick a rider out of their party (their game also goes back to
  // the menu through the friends poll); close a whole party
  kick(name) {
    const want = String(name || '').trim().toLowerCase();
    let n = 0;
    for (const p of this.players.values()) {
      if (p.name.toLowerCase() !== want) continue;
      if (p.party) { this.leave(p, true); n++; }
      if (p.conn) p.conn.send({ t: 'kicked' });
    }
    return n;
  }

  closeParty(code) {
    const party = this.parties.get(code);
    if (!party) return -1;
    const members = [...party.members.values()];
    for (const p of members) { if (p.conn) p.conn.send({ t: 'ended' }); this.leave(p, true); }
    this.parties.delete(code);
    return members.length;
  }

  joinRider(admin, t) {
    if (!t.party) this.create(t);
    this.join(admin, t.party.code, true);
    // their game puts the two of you in the same ride if they were riding alone
    if (t.conn) t.conn.send({ t: 'adminjoined', from: admin.name, leader: t.party.leader === t.id });
  }

  // force: an admin - skips the full check and rides into a race already going
  join(p, codeIn, force = false) {
    const code = String(codeIn || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!validCode(code)) return this.err(p, 'BAD_CODE', 'Party codes are 6 letters/numbers, like MX7K2P.');
    const party = this.parties.get(code);
    if (!party) return this.err(p, 'NO_PARTY', `No party with code ${code}. It may have expired - ask your friend for a new code.`);
    if (p.party === party) return this.broadcastParty(party);
    const connected = [...party.members.values()].filter((x) => x.connected || Date.now() - x.lastSeen < RECONNECT_GRACE);
    if (connected.length >= GAME.maxPlayers && !force) return this.err(p, 'FULL', `Party ${code} is full (${GAME.maxPlayers} riders).`);
    if (p.party) this.leave(p, false);
    this.addMember(party, p);
    this.log(`[${code}] ${p.name} joined`);
    // ride straight in if a free ride / time trial is already going
    const S = party.session;
    if (S && !S.over && (S.mode !== 'race' || force)) {
      S.players.push(this.sessionPlayer(p, S.players.length, S.mode === 'race')); // an admin into a race: spectate
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
    const S = party.session;
    if (party.match && S && !S.over && S.mode === 'race' && Date.now() > S.goAt && !p.finished) { p.out = 'left'; this.finishSession(party); }
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

  // spectator: an admin who dropped into a race already going - flies around as their rider, no bike, not in the standings
  sessionPlayer(p, slot, spectator = false) { p.spectator = spectator; return { id: p.id, name: p.name, vehicle: p.vehicle, color: p.color, gear: p.gear || 'match', number: p.number, cos: p.cos || null, slot, ...(spectator ? { spectator: true } : {}) }; }

  setupTracker(party, p) {
    const S = party.session;
    const info = trackInfo(S.track);
    p.lap = new LapTracker(info.T);
    p.lap.reset(S.mode === 'timetrial' ? 'flying' : 'race', 0);
    p.finished = false; p.out = null; p.activeAt = 0; p.afkPos = null; p.finishTime = null; p.score = 0; p.state = null; p.lastPos = null; p.sHint = null; p.flags = 0;
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
    // not in it from the start: watch with the drone camera (no rider on the track, nobody sees you)
    if (!S.players.some((x) => x.id === p.id)) {
      S.players.push(this.sessionPlayer(p, S.players.length, true));
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
    if (p.spectator) { p.state = d; p.stateTime = now; p.lastPos = [x, y, z]; return; } // flying around: no speed or lap rules
    const spd = Math.hypot(d[7], d[8], d[9]);
    if (spd > GAME.maxSpeed * 1.25) return;
    // movement check: big jumps in position only allowed right after a reset
    let trusted = true;
    if (p.lastPos) {
      const dt = Math.max(0.02, (now - p.stateTime) / 1000);
      const dist = Math.hypot(x - p.lastPos[0], z - p.lastPos[2]);
      if (dist > GAME.maxSpeed * dt + 6 && now - (p.resetAt || 0) > 1500) { trusted = false; p.flags = (p.flags || 0) + 1; }
    }
    if (!p.afkPos || Math.hypot(x - p.afkPos[0], z - p.afkPos[2]) > 4) { p.afkPos = [x, y, z]; p.activeAt = now; }
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
    const list = S.players.filter((sp) => !sp.spectator).map((sp) => this.players.get(sp.id)).filter((p) => p && p.lap && p.party === party);
    if (S.mode === 'freestyle') return list.sort((a, b) => (b.score || 0) - (a.score || 0));
    if (S.mode === 'timetrial') return list.sort((a, b) => (a.lap.bestLap ?? 1e9) - (b.lap.bestLap ?? 1e9));
    return list.sort((a, b) => {
      if (!!a.out !== !!b.out) return a.out ? 1 : -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.lap.progress(b.sHint ?? 0) - a.lap.progress(a.sHint ?? 0);
    });
  }

  sendRace(party) {
    const S = party.session;
    if (!S || S.mode === 'freeride') return;
    const T = party.match && party.match.team;
    const rows = this.standings(party).map((p, i) => ({ id: p.id, team: T ? T.get(p.id) : undefined, name: p.name, pos: i + 1, laps: p.lap.laps, best: p.lap.bestLap, last: p.lap.lastLap, finished: !!p.finished, time: p.finishTime, score: p.score || 0, connected: p.connected, out: p.out || null }));
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
    if (party.match && party.match.mode === 'ranked' && S.mode === 'race' && this.accounts && !party.match.rated) { party.match.rated = true; this.rate(party, rows); }
    if (party.match && party.match.mode === 'ranked2' && S.mode === 'race' && this.accounts && !party.match.rated) { party.match.rated = true; this.rate2(party, rows); }
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
        if (!m || !m.state || m.party !== party || sp.spectator) continue; // watchers are invisible
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
        const racers = S.players.filter((sp) => !sp.spectator).map((sp) => this.players.get(sp.id)).filter((x) => x && x.party === party);
        // AFK: not moved for AFK_MS (or never moved since the gate) = out. Fewer than two riders
        // still in it (a 1v1, or everyone else gone) ends the match there and then.
        for (const x of racers) {
          if (x.finished || x.out) continue;
          if (now - Math.max(x.activeAt || 0, S.goAt) > AFK_MS) {
            x.out = 'afk';
            this.log(`[${party.code}] ${x.name} AFK - out of the race`);
            for (const m of party.members.values()) if (m.conn) m.conn.send({ t: 'afk', id: x.id, name: x.name });
          }
        }
        const still = racers.filter((x) => x.connected && !x.out && !x.finished);
        if (racers.some((x) => x.out === 'afk') && racers.length >= 2 && still.length + racers.filter((x) => x.finished).length < 2) { this.finishSession(party); continue; }
        const live = racers.filter((x) => x.connected && !x.out);
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
      t: 'party', code: party.code, leader: party.leader, settings: party.settings, match: party.match ? party.match.mode : null, teams: party.match && party.match.team ? Object.fromEntries(party.match.team) : null,
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
