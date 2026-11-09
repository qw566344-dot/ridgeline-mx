// Builds RidgelineMX.html: the whole game in ONE file you can double-click.
//   node tools/build-html.js
// (Run it again after changing any code.)
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(ROOT, 'client');
const GM = process.argv.includes('--gamemonetize');   // GameMonetize build: dist-gamemonetize/index.html (same offline game, their SDK)
const CRAZY = process.argv.includes('--crazy') || GM;   // CrazyGames build: dist-crazygames/index.html (see client/js/crazy.js)

// the game imports '/shared/...' (served by the dev server) and 'three'
const resolvePlugin = {
  name: 'mx-paths',
  setup(b) {
    b.onResolve({ filter: /^\/shared\// }, (a) => ({ path: path.join(ROOT, a.path) }));
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(client, 'vendor', 'three.module.js') }));
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(client, 'js', 'main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2020',
  plugins: [resolvePlugin],
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(client, 'css', 'style.css'), 'utf8');
let html = fs.readFileSync(path.join(client, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
// images in the page (the logo) go inside the file too
html = html.replace(/src="(img\/[\w.-]+\.png)"/g, (m, f) => `src="data:image/png;base64,${fs.readFileSync(path.join(client, f)).toString('base64')}"`);
// the vehicle models go inside the file too (base64), so it works when double-clicked
const models = {};
const mdir = path.join(client, 'models');
for (const f of fs.existsSync(mdir) ? fs.readdirSync(mdir) : []) {
  if (f.endsWith('.glb')) models['models/' + f] = fs.readFileSync(path.join(mdir, f)).toString('base64');
}
const modelScript = `<script>window.__MX_MODELS=${JSON.stringify(models)};</script>`;
if (CRAZY) html = html.replace(/<link[^>]*fonts.(googleapis|gstatic).com[^>]*>s*/g, ''); // no outside requests but CrazyGames' own SDK
const GM_ID = process.env.GM_GAME_ID || '8h4q4xxy2vqub1gous4qtclkjcg58qlz';
const gmHead = `<script>window.__MX_CRAZY=true;window.__MX_GM=true;
window.SDK_OPTIONS = { gameId: "${GM_ID}", onEvent: function (a) { switch (a.name) { case "SDK_GAME_PAUSE": if (window.__gmPause) window.__gmPause(true); break; case "SDK_GAME_START": if (window.__gmPause) window.__gmPause(false); break; case "SDK_READY": break; } } };
(function (a, b, c) { var d = a.getElementsByTagName(b)[0]; a.getElementById(c) || (a = a.createElement(b), a.id = c, a.src = "https://api.gamemonetize.com/sdk.js", d.parentNode.insertBefore(a, d)); })(document, "script", "gamemonetize-sdk");
</script>\n`;
const crazyHead = GM ? gmHead : CRAZY ? '<script>window.__MX_CRAZY=true;</script>\n<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n' : '';
html = html.replace(/<script type="module" src="js\/main.js"><\/script>/, () => `${crazyHead}${modelScript}\n<script>\n${js}\n</script>`);
if (html.includes('js/main.js') || html.includes('css/style.css')) throw new Error('bundle still references external files');
const out = GM ? path.join(ROOT, 'dist-gamemonetize', 'index.html') : CRAZY ? path.join(ROOT, 'dist-crazygames', 'index.html') : path.join(ROOT, 'RidgelineMX.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
