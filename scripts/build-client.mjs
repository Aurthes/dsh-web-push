/**
 * Build the browser half of dsh-web-push into the DSH ModuleLoader
 * closure-factory bundle at client/client.js.
 *
 * The bundle wraps the esbuild CJS output in the exact envelope the notify /
 * pocket plugins ship:
 *
 *   window.__ModuleLoader__.load({ id: "...", factory: (require) => {
 *     var module = { exports: {} }; var exports = module.exports;
 *     <bundled code — external specifiers become require("...") calls>
 *     return module.exports;
 *   } });
 *
 * `react` stays external: the DSH shell bundle's frozen module table supplies
 * it at runtime (same as dsh-notify-plugin's client).
 */

import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const result = await build({
  entryPoints: [join(root, 'src/client/client.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'transform',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  external: ['react'],
  write: false,
  banner: {
    js: [
      'window.__ModuleLoader__.load({ id: "dsh-web-push", factory: (require) => {',
      '  var module = { exports: {} };',
      '  var exports = module.exports;',
    ].join('\n'),
  },
  footer: {
    js: '\n  return module.exports;\n}});',
  },
})

const outFile = join(root, 'client', 'client.js')
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, result.outputFiles[0].text, 'utf8')
console.log(`client bundle written: ${outFile} (${(result.outputFiles[0].text.length / 1024).toFixed(1)} KiB)`)
