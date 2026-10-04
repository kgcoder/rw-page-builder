// Production build: the minified reader (bundle + CSS + themes + images) in dist/rw-reader/,
// and the page builder tool in dist/rw-tool/.
import { rmSync } from 'node:fs'
import * as esbuild from 'esbuild'
import { copyStaticAssets, distDir, esbuildOptions } from './common.mjs'

rmSync(distDir, { recursive: true, force: true })
copyStaticAssets()
await esbuild.build({ ...esbuildOptions, minify: true })
