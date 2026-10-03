// Dev server: serves the repo root, and builds dist/rw-reader/rw-reader.{js,css} in memory
// (unminified, with sourcemaps) on every request, so edits in adapter/ or reader/ only need a reload.
import * as esbuild from 'esbuild'
import { copyStaticAssets, esbuildOptions, root } from './common.mjs'

const port = Number(process.env.PORT) || 8000

copyStaticAssets()
const ctx = await esbuild.context({ ...esbuildOptions, sourcemap: true, write: false })
await ctx.serve({ servedir: root, port })

console.log(`\nExamples:\n  http://localhost:${port}/examples/hdoc.html\n  http://localhost:${port}/examples/cdoc.html\n  http://localhost:${port}/examples/condoc.html\n`)
