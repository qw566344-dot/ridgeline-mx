// Builds RidgelineMX.html: the whole game in ONE file you can double-click.
//   node tools/build-html.js
// (Run it again after changing any code.)
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(ROOT, 'client');

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
// the vehicle models go inside the file too (base64), so it works when double-clicked
const models = {};
const mdir = path.join(client, 'models');
for (const f of fs.existsSync(mdir) ? fs.readdirSync(mdir) : []) {
  if (f.endsWith('.glb')) models['models/' + f] = fs.readFileSync(path.join(mdir, f)).toString('base64');
}
const modelScript = `<script>window.__MX_MODELS=${JSON.stringify(models)};</script>`;
html = html.replace(/<script type="module" src="js\/main.js"><\/script>/, () => `${modelScript}\n<script>\n${js}\n</script>`);
if (html.includes('js/main.js') || html.includes('css/style.css')) throw new Error('bundle still references external files');
const out = path.join(ROOT, 'RidgelineMX.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
