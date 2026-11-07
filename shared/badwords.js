// =====================================================================
//  CHAT FILTER - bad words are not removed, they are blurred on screen.
//  censor(text) splits a message into [{ t: 'text', bad: bool }] pieces.
//  Catches simple dodges too: repeated letters (fuuuck), symbols for
//  letters (f*ck, sh1t, @ss) and spaces/dots between letters (f u c k).
//  Add words to WORDS (lower case). Whole-word-only words go in EXACT
//  (so "class", "assume", "scunthorpe" stay clean).
// =====================================================================
const WORDS = [
  'fuck', 'fucker', 'fucking', 'fuk', 'fck', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'cunt',
  'dick', 'cock', 'pussy', 'whore', 'slut', 'twat', 'wank', 'wanker', 'bollocks', 'prick', 'jizz', 'cum',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'tranny', 'chink', 'spic', 'kike', 'wetback',
  'dyke', 'coon', 'gook', 'rape', 'rapist', 'porn', 'penis', 'vagina', 'tits', 'boobs', 'dildo', 'kys',
  'niger', 'nigguh', 'nibba', 'negro', 'fags', 'faggots', 'beaner', 'paki', 'raghead', 'towelhead', 'sandnigger', 'blowjob', 'handjob',
  'masturbate', 'cunts', 'shithead', 'dumbass', 'jackass', 'asshat', 'dipshit', 'cuck', 'incel', 'pedo', 'pedophile', 'molest', 'hitler',
  'killyourself', 'kill yourself', 'ky5', 'k y s', 'autist', 'mongoloid', 'spastic', 'spaz',
];
const EXACT = new Set(['anal', 'tard', 'nig', 'jap', 'kkk', 'ass', 'asshole', 'arse', 'hoe', 'hell', 'damn', 'crap', 'piss', 'sex', 'nazi', 'stfu', 'wtf', 'gay']);
// words that are fine on their own even though a bad word is inside them
const SAFE = new Set(['nigeria', 'nigerian', 'nigerians', 'analyst', 'analysis', 'analog', 'canal', 'banal', 'japan', 'japanese', 'cocktail', 'cockpit', 'peacock', 'hancock', 'shitake', 'scunthorpe', 'dickens', 'cumulative', 'document', 'circumstance', 'cucumber', 'cumin', 'therapist', 'grape', 'drape', 'scrape', 'skyscraper', 'title', 'titan', 'spice', 'raccoon', 'cocoon', 'tycoon', 'hello', 'shell', 'shells', 'class', 'pass', 'mass', 'bass', 'grass', 'glass', 'assume', 'assist', 'hellcat', 'hellfire']);

const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '*': '', '(': 'c' };
const squash = (w) => w.toLowerCase().split('').map((ch) => (ch in LEET ? LEET[ch] : ch)).join('').replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
const BAD = new Set(WORDS.map(squash)), BADX = new Set([...EXACT].map(squash));
const SAFE_SQ = new Set([...SAFE].map(squash));

function isBad(word) {
  const s = squash(word);
  if (s.length < 2 || SAFE_SQ.has(s)) return false;
  if (BAD.has(s) || BADX.has(s)) return true;
  // a bad word inside a longer word (fuckface, bullshitter), but not the EXACT ones (classic, assume)
  for (const b of BAD) if (b.length >= 4 && s.includes(b)) return true;
  return false;
}

// Fancy fonts and look-alike letters: bold/italic/fullwidth/circled/squared letters, accents,
// small caps and Cyrillic/Greek twins are all folded back to plain letters before checking.
// One character in, one character out, so the blurred pieces still line up with what was typed.
const TWINS = {};
const twin = (from, to) => { for (let i = 0; i < from.length; i++) TWINS[from[i]] = to[i]; };
twin('аеорсухіѕјкмнтвАЕОРСУХІЅЈКМНТВ', 'aeopcyxisjkmhtbAEOPCYXISJKMHTB');
twin('οανικρετυΟΑΝΙΚΡΕΤΥ', 'oavikpetuOAVIKPETY');
twin('ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀsᴛᴜᴠᴡʏᴢ', 'abcdefghijklmnoprstuvwyz');
twin('ǀ|ӏ', 'lll');
const BLOCKS = [[0x1F130, 65], [0x1F150, 65], [0x1F170, 65], [0x1F1E6, 65]]; // squared / circled / regional letters
const foldChar = (ch) => {
  const cp = ch.codePointAt(0);
  if (cp < 128) return ch;
  for (const [base, a] of BLOCKS) if (cp >= base && cp < base + 26) return String.fromCharCode(a + cp - base);
  if (TWINS[ch]) return TWINS[ch];
  const n = ch.normalize('NFKD').replace(/\p{M}/gu, '');
  if (!n) return '·';
  const c = n[0];
  return TWINS[c] || (c.codePointAt(0) > 0xFFFF ? '·' : c);
};
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;

export function censor(text) {
  const orig = Array.from(String(text).replace(INVISIBLE, ''));
  const out = [];
  let pos = 0;
  for (const p of censorFolded(orig.map(foldChar).join(''))) {
    const t = orig.slice(pos, pos + p.t.length).join('');
    pos += p.t.length;
    out.push({ t, bad: p.bad });
  }
  return out;
}

function censorFolded(text) {
  const out = [];
  // spread-out letters first: "f u c k", "s.h.i.t"
  const tokens = String(text).split(/(\s+)/);
  const merged = [];
  for (let i = 0; i < tokens.length; i++) {
    // join runs of single letters separated by spaces / dots
    if (/^[a-z0-9@$!*.]$/i.test(tokens[i]) ) {
      let j = i, word = '';
      while (j < tokens.length && (/^[a-z0-9@$!*.]$/i.test(tokens[j]) || /^\s$/.test(tokens[j]))) { word += tokens[j]; j++; }
      const letters = word.replace(/\s/g, '');
      if (letters.length >= 3 && isBad(letters)) { merged.push({ t: word.trimEnd(), bad: true }); if (/\s$/.test(word)) merged.push({ t: ' ', bad: false }); i = j - 1; continue; }
    }
    merged.push({ t: tokens[i], bad: false });
  }
  for (const piece of merged) {
    if (piece.bad || /^\s*$/.test(piece.t)) { out.push(piece); continue; }
    // letters joined by symbols with no spaces: "f.u.c.k", "sh-it", "n_i_g_g_a"
    if (/[A-Za-z][^A-Za-z0-9\s]+[A-Za-z]/.test(piece.t) && piece.t.replace(/[^A-Za-z]/g, '').length >= 3 && isBad(piece.t)) { out.push({ t: piece.t, bad: true }); continue; }
    // split words off punctuation so "fuck!" blurs just the word
    for (const part of piece.t.split(/([^A-Za-z0-9@$!*+(]+)/)) if (part) out.push({ t: part, bad: isBad(part) });
  }
  return out;
}

export const hasBadWords = (text) => censor(text).some((p) => p.bad);
