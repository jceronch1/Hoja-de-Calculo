/* Carga el motor (sin interfaz) en Node para las pruebas. */
const path = require('path');
const files = [
  'core/base.js', 'formula/syntax.js', 'formula/numfmt.js', 'formula/eval.js',
  'formula/fn-math.js', 'formula/fn-stats.js', 'formula/fn-text.js', 'formula/fn-logic.js',
  'formula/fn-lookup.js', 'formula/fn-date.js', 'formula/fn-fin.js', 'formula/fn-eng.js',
  'model/workbook.js', 'model/ops.js',
];
for (const f of files) {
  try { require(path.join(__dirname, '..', 'js', f)); } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND' && /ops\.js/.test(e.message)) continue;
    throw e;
  }
}
module.exports = globalThis.HC;
