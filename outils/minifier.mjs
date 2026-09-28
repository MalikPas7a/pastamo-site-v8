// Génère les versions minifiées du site à partir des sources lisibles (qui restent intactes pour les modifications) :
//   js/main.js    → js/main.min.js
//   css/style.css → css/style.min.css
// Minification prudente : pas de transformation « risquée », les calculs de position, la gestion des vidéos
// et les appels requestAnimationFrame restent identiques ; seuls les espaces, commentaires et noms locaux sont réduits.
// Usage (une fois) : npm install terser clean-css   puis, à chaque modification :   node outils/minifier.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { minify } from 'terser';
import CleanCSS from 'clean-css';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const outJs = await minify(js, {
  ecma: 2020,
  compress: { passes: 1, unsafe: false, pure_getters: false, keep_fargs: true, drop_console: false },
  mangle: { toplevel: false },
  format: { comments: false },
});
fs.writeFileSync(path.join(root, 'js/main.min.js'), outJs.code + '\n');

const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const outCss = new CleanCSS({ level: 1 }).minify(css);
if (outCss.errors.length) throw new Error(outCss.errors.join('\n'));
fs.writeFileSync(path.join(root, 'css/style.min.css'), outCss.styles + '\n');

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' Ko';
console.log(`main.js ${kb(js)} → main.min.js ${kb(outJs.code)} ; style.css ${kb(css)} → style.min.css ${kb(outCss.styles)}`);
if (outCss.warnings.length) console.log('avertissements CSS :', outCss.warnings.join(' | '));
