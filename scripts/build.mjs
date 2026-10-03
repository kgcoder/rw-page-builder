// Production build: minified bundle + CSS + themes + images in dist/rw-reader/.
import { rmSync } from 'node:fs'
import * as esbuild from 'esbuild'
import { copyStaticAssets, esbuildOptions, outdir } from './common.mjs'

rmSync(outdir, { recursive: true, force: true })
copyStaticAssets()
await esbuild.build({ ...esbuildOptions, minify: true })
