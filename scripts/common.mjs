// Shared by build.mjs and dev.mjs so dev and production produce the same files at the same URLs.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const outdir = join(root, 'dist', 'rw-reader')

export const esbuildOptions = {
    absWorkingDir: root,
    entryPoints: [
        { in: 'adapter/startup.js', out: 'rw-reader' },
        { in: 'adapter/styles.css', out: 'rw-reader' },
    ],
    outdir,
    bundle: true,
    // IIFE, not ESM: a classic <script defer> works from file:// too, and lets the
    // adapter read its config from document.currentScript.
    format: 'iife',
    target: 'es2019',
    logLevel: 'info',
    // reader/Icons.js falls back to import.meta.url only when getAssetsUrl() returns null;
    // our adapter always derives it from the script's src.
    logOverride: { 'empty-import-meta': 'silent' },
}

// Themes and images are loaded by URL at runtime, not bundled.
export function copyStaticAssets() {
    mkdirSync(outdir, { recursive: true })
    cpSync(join(root, 'reader', 'themes'), join(outdir, 'themes'), { recursive: true })
    cpSync(join(root, 'reader', 'images'), join(outdir, 'images'), { recursive: true })
}
