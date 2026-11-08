/* Copia app/css/estilos.css (el prototipo) en src/interna/estilos.css con todas sus reglas dentro de .jsl.
   Uso: npx -p postcss -p postcss-prefix-selector node scripts/estilos-prototipo.mjs ../app/css/estilos.css src/interna/estilos.css */
import fs from 'fs';
import postcss from 'postcss';
import prefixer from 'postcss-prefix-selector';
const [,, ent, sal] = process.argv;
const css = fs.readFileSync(ent, 'utf8');
const r = await postcss([prefixer({ prefix: '.jsl', transform(prefix, selector, prefijado) {
  const raiz = selector.match(/^(?::root|html|body)((?:\[[^\]]+\]|:not\([^)]*\)|::?[a-z-]+)*)(.*)$/);
  if (raiz) return `${prefix}${raiz[1]}${raiz[2]}`;
  return prefijado; } })]).process(css, { from: ent });
const cab = `/* Generado desde app/css/estilos.css (el prototipo) con todas sus reglas dentro de .jsl.
   No lo edites a mano: si cambia el prototipo, vuelve a generarlo (ver frontend/README.md). Los ajustes propios van en ajustes.css. */\n`;
fs.writeFileSync(sal, cab + r.css);
