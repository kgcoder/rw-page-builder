// Shared by build.mjs and dev.mjs so dev and production produce the same files at the same URLs.
import { cpSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const distDir = join(root, 'dist')
// The reader bundle that site owners upload.
export const readerDir = join(distDir, 'rw-reader')

// Lists the tool offers in its theme and font set selects, read from the reader so they stay in sync.
function themeNames() {
    return readdirSync(join(root, 'reader', 'themes'))
        .filter(f => f.endsWith('.css'))
        .map(f => f.slice(0, -'.css'.length))
        .sort()
}

function fontSets() {
    const source = readFileSync(join(root, 'reader', 'Fonts.js'), 'utf8')
    const sets = []
    const re = /id:\s*'([^']+)',\s*label:\s*'([^']+)'/g
    let match
    while ((match = re.exec(source))) sets.push({ id: match[1], label: match[2] })
    return sets
}

export const esbuildOptions = {
    absWorkingDir: root,
    entryPoints: [
        { in: 'adapter/startup.js', out: 'rw-reader/rw-reader' },
        { in: 'adapter/styles.css', out: 'rw-reader/rw-reader' },
        // The page builder tool (dist/rw-tool/), optional for site owners.
        { in: 'tool/main.js', out: 'rw-tool/rw-tool' },
        { in: 'tool/tool.css', out: 'rw-tool/rw-tool' },
        { in: 'tool/index.html', out: 'rw-tool/index' },
        { in: 'tool/preview.html', out: 'rw-tool/preview' },
        // The CDOC editor on its own page.
        { in: 'tool/cdoc/standalone.js', out: 'rw-tool/rw-cdoc' },
        { in: 'tool/cdoc.html', out: 'rw-tool/cdoc' },
    ],
    outdir: distDir,
    bundle: true,
    loader: { '.html': 'copy' },
    // IIFE, not ESM: a classic <script defer> works from file:// too, and lets the
    // adapter read its config from document.currentScript.
    format: 'iife',
    target: 'es2019',
    logLevel: 'info',
    // reader/Icons.js falls back to import.meta.url only when getAssetsUrl() returns null;
    // our adapter always derives it from the script's src.
    logOverride: { 'empty-import-meta': 'silent' },
    define: {
        RW_THEMES: JSON.stringify(themeNames()),
        RW_FONT_SETS: JSON.stringify(fontSets()),
    },
}

// Themes and images are loaded by URL at runtime, not bundled.
export function copyStaticAssets() {
    mkdirSync(readerDir, { recursive: true })
    cpSync(join(root, 'reader', 'themes'), join(readerDir, 'themes'), { recursive: true })
    cpSync(join(root, 'reader', 'images'), join(readerDir, 'images'), { recursive: true })
}
