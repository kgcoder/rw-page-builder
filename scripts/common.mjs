// Shared by build.mjs and dev.mjs so dev and production produce the same files at the same URLs.
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { READER_FOLDER, VERSION } from '../generator/version.js'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const distDir = join(root, 'dist')
// The reader bundle that site owners upload, named after the major version (rw-reader-1/).
export const readerDir = join(distDir, READER_FOLDER)

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
        { in: 'adapter/startup.js', out: READER_FOLDER + '/rw-reader' },
        { in: 'adapter/styles.css', out: READER_FOLDER + '/rw-reader' },
        // Comment form pages for comments services (opened in the reader's comment popup).
        { in: 'adapter/comments/disqus.html', out: READER_FOLDER + '/comments/disqus' },
        { in: 'adapter/comments/hyvor.html', out: READER_FOLDER + '/comments/hyvor' },
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
    banner: {
        js: `/*! RW Page Builder ${VERSION} | MIT | https://github.com/kgcoder/rw-page-builder */`,
        css: `/*! RW Page Builder ${VERSION} | MIT | https://github.com/kgcoder/rw-page-builder */`,
    },
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
    writeFileSync(join(readerDir, 'VERSION'), VERSION + '\n')
}
