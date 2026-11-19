// Production build: the minified reader (bundle + CSS + themes + images) in dist/rw-reader-<major>/,
// and the page builder tool in dist/rw-tool/. Both folders are then zipped, at the top level of
// the archive (no parent folder), into dist/rw-page-builder-<version>.zip.
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import * as esbuild from 'esbuild'
import { READER_FOLDER, VERSION } from '../generator/version.js'
import { copyStaticAssets, distDir, esbuildOptions } from './common.mjs'

rmSync(distDir, { recursive: true, force: true })
copyStaticAssets()
await esbuild.build({ ...esbuildOptions, minify: true })

// Run zip from inside dist/ so the archive's entries are rw-reader-N/... and rw-tool/...
const zipName = `rw-page-builder-${VERSION}.zip`
execFileSync('zip', ['-r', '-q', '-X', zipName, READER_FOLDER, 'rw-tool', '-x', '*.DS_Store'], { cwd: distDir, stdio: 'inherit' })
console.log(`dist/${zipName}`)
