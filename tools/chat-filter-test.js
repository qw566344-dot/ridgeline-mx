// The chat filter blurs bad words (including simple dodges) and leaves normal words alone.
//   node tools/chat-filter-test.js
import { censor } from '../shared/badwords.js';
const blurred = (t) => censor(t).filter((p) => p.bad).map((p) => p.t.trim());
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
for (const [t, want] of [
  ['what the fuck', ['fuck']], ['FUUUCK that', ['FUUUCK']], ['sh1t happens', ['sh1t']], ['you @ss', ['@ss']],
  ['f u c k off', ['f u c k']], ['bullshitter lol', ['bullshitter']], ['fuck!', ['fuck!']], ['b!tch', ['b!tch']],
  ['𝐟𝐮𝐜𝐤 you', ['𝐟𝐮𝐜𝐤']], ['ｆｕｃｋ', ['ｆｕｃｋ']], ['ѕhіt', ['ѕhіt']], ['f.u.c.k', ['f.u.c.k']], ['sh-it', ['sh-it']], ['ni​gga', ['nigga']], ['Nigeria analyst', []], ['nice whip bro', []], ['classic assume pass', []], ['hello shell', []], ['cocktail cockpit', []], ['gg wp 123', []], ['grape juice', []],
]) {
  const got = blurred(t);
  ok(JSON.stringify(got) === JSON.stringify(want), `"${t}" -> blurred [${got.join(', ')}]`);
}
ok(censor('a fuck b').map((p) => p.t).join('') === 'a fuck b', 'the message text itself is kept (only blurred)');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
