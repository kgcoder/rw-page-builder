# RW Page Builder — CLAUDE.md

## Project Overview

**RW Page Builder** (formerly "RW Reader in HTML", repo `kgcoder/rw-page-builder`) lets anyone publish **Reader's Web** documents (HDOC, CDOC, CONDOC) as plain static `.html` files that show the full Reader UI even when the visitor doesn't have the RW Reader extension. It is the static equivalent of the WordPress plugin's `doc_in_reader` display mode (plugin: Reader's Web Publisher, `static-web-publisher`).

A site owner uploads the `dist/rw-reader/` folder once (bundled JS, CSS, themes, images), then uploads one HTML file per document. A form-based tool that generates those files is planned (see "Later" in README.md).

The **RW Reader** Chrome extension is the primary Reader's Web client. When the user mentions "the extension", they mean this extension. The "plugin" is the WordPress plugin, the reference implementation this project was derived from.

## Layout

| Path | Purpose |
|------|---------|
| [reader/](reader/) | Git submodule [kgcoder/rw-reader-ui](https://github.com/kgcoder/rw-reader-ui), shared with the extension and the plugin. Its own rules: [reader/CLAUDE.md](reader/CLAUDE.md), interface: [reader/docs/host-adapter.md](reader/docs/host-adapter.md). |
| [adapter/startup.js](adapter/startup.js) | Bundle entry: sets `g.hostAdapter`, imports `reader/readerStartUp.js`. |
| [adapter/HostAdapter.js](adapter/HostAdapter.js) | This host's `g.hostAdapter`. Reads its config from the `<script>` tag (`data-font-set`, `data-comments-label`; `assetsUrl` = `images/` next to the script). `window.vcReaderData` overrides it. |
| [adapter/styles.css](adapter/styles.css) | CSS bundle entry (reader CSS + [adapter/reader.css](adapter/reader.css) host overrides). Themes are linked separately per page. |
| [examples/](examples/) | Hand-written HDOC, CDOC and CONDOC pages, connected to each other. The DOM is copied from the plugin's `templates/reader-template.php`. |
| [generator/](generator/) | Pure modules shared by the tool and a later CLI: `generate(model)` → page HTML, `parse(html, DOMParser)` → model. The page skeleton is [generator/template.js](generator/template.js); keep it in sync with `examples/`. |
| [tool/](tool/) | The page builder (form, connections, preview, open/save). Built into `dist/rw-tool/`. It must not import `reader/` modules: `reader/Globals.js` constructs the whole reader on import. Theme and font set lists come from `RW_THEMES` / `RW_FONT_SETS`, defined at build time in `scripts/common.mjs`. |
| [tool/blocks/](tool/blocks/) | The HDOC block editor. `convert.js` (pure, tested) maps HTML ↔ blocks; untouched blocks are written back from their original `source`, so editing one block never reformats the rest (flink offsets depend on the text). Anything it can't map stays an HTML block. Content from opened pages goes through `safeHtml`/`parseInert` before it touches the tool's DOM. |
| [test/](test/) | `npm test` (node:test + linkedom). The example pages are the generator's round-trip fixtures. |
| [scripts/](scripts/) | `common.mjs` (shared esbuild options + asset copy), `build.mjs`, `dev.mjs`. |
| `dist/rw-reader/` | Build output (gitignored). This folder is what users upload. |
| `dist/rw-tool/` | Build output: the page builder. Must sit next to `rw-reader/`, which its preview uses. |

## Key Rules

- `reader/` changes are committed and pushed in the submodule's own repo, then the pin is bumped here with `git add reader`. The extension and plugin pins are bumped separately. After cloning, run `git submodule update --init`.
- The reader never talks to the host directly. Anything specific to static hosting goes in `adapter/`, never in `reader/`.
- If the reader starts relying on a new DOM element, the example pages (and later the generator template) must provide it.
- DOM ids that the plugin suffixes with `-rwp` use `-rw` here (`CurrentDocumentInfoButton-rw`, `CurrentDocumentTitleSpan-rw`). They must differ from the extension's ids so the extension's takeover is detectable.
- Do not use optional chaining or nullish coalescing (the bundle targets es2019).
- New JS files start with the license header used in [generator/model.js](generator/model.js) ("RW Page Builder", Copyright (c) 2026 Karen Grigorian, MIT, Reader's Web CC BY-ND 4.0 note). Files in `reader/` keep their own "RW Reader UI" header.
- The bundle is **IIFE**, loaded with a classic `<script defer>`, not `type="module"`. The adapter reads `document.currentScript` at module evaluation time; that only works in a classic script.
- `fetchWebPage` (cross-origin requests only) currently just shows an alert: a static host has no proxy. Same-host connections are fetched directly by `reader/NetworkManager.js`.
- Connection URLs and CONDOC `<main>` URLs must be **absolute**. The reader does `new URL(url)` without a base. The examples use `http://localhost:8000/examples/...`, so open them on `localhost:8000`, not `127.0.0.1` or another port, or they count as cross-origin.
- Do not test in the browser yourself. Verify with `node --check`, `npm run build` and curl against the dev server, then let the user test in the browser.

## Commands

- `npm run dev`: dev server on port 8000 (override with `PORT`). `dist/rw-reader/` bundles and all of `dist/rw-tool/` are rebuilt in memory on every request, unminified and with sourcemaps, at the same URLs as production. Only themes and images are copied to disk.
- `npm run build`: production build into `dist/rw-reader/` and `dist/rw-tool/` (minified). Rebuild after every reader pin bump.
- `npm test`: generator tests.
- `npm run preview`: build, then serve the repo with `python3 -m http.server 8000`.
