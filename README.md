# RW Reader in HTML

Publish [Reader's Web](https://github.com/kgcoder/readers-web-specs) documents (HDOC, CDOC, CONDOC) as plain static HTML pages. Visitors see the full Reader's Web reader UI without installing anything, and visitors with the RW Reader extension get the extension's own reader.

## Publishing

1. Build (or download) the `rw-reader/` folder and upload it to your site once, e.g. as `https://example.com/rw-reader/`.
2. For each document, upload an HTML page like the ones in [examples/](examples/), pointing at that folder:

```html
<link rel="stylesheet" href="/rw-reader/rw-reader.css">
<link rel="stylesheet" href="/rw-reader/themes/light.css">   <!-- any file from rw-reader/themes/ -->
<script defer src="/rw-reader/rw-reader.js" data-font-set="default"></script>
…
<div id="ui-root" class="theme-light">   <!-- must match the theme file -->
```

The document itself goes into the page:

| Type | Where |
|------|-------|
| HDOC | Content in `#CurrentDocumentMainDiv.hdoc-content`, metadata (header, panels, connections) in `<script type="application/json" id="hdoc-data">` with `"forced": true`. |
| CDOC | `<script type="application/json" id="cdoc-source">{"source": "<cdoc>…</cdoc>"}</script>` |
| CONDOC | `<script type="application/json" id="condoc-source">{"source": "<condoc>…</condoc>"}</script>` |

Connection URLs must be absolute. Connections to pages on other sites can't be opened yet, because a static site has no proxy; the reader shows an alert instead.

## Development

```sh
git submodule update --init
npm install
npm run dev        # http://localhost:8000/examples/hdoc.html (also cdoc.html, condoc.html)
npm run build      # minified dist/rw-reader/
npm run preview    # build + serve the production files on :8000
```

In dev mode the bundle is rebuilt in memory on each request, so edits in `adapter/` or `reader/` only need a page reload. The example pages use the same URLs in both modes.

## Later: a document tool

Planned: a form-based page (`tool/`) that generates these HTML files. It is pure client-side, so it can be used on readersweb.org or uploaded next to your own pages.

- Fields: document type, title, author, date, language, republishing policy, content (HTML for HDOC, SVG for CDOC, main URL for CONDOC), connections, and site-wide settings (asset URL, theme, font set, panels, comments).
- Site-wide settings are kept in localStorage and can be exported or imported as `rw-site.json`, which the tool loads automatically when it runs on the same site.
- Existing pages can be opened back into the form; the generated HTML is the source of truth.
- Live preview in an iframe using the real reader bundle.
- One generator module shared by the tool and a possible CLI for batch generation; the example pages become its test fixtures.
- Cross-origin connections: the users may implement a proxy endpoint either on their site or using some service (Supabase, Firebase, etc.). Any restrictions (allowed URLs) will be implemented by the user outside of this project. If they don't implement a proxy endpoint a popup with an iframe will be shown prompting readers to install the Chrome extension. It will be done similar to promo popup but using another page on my site.
- CDOC editor. There will also be another tool that will allow users to create an SVG for the CDOC. It shoule allow users to create a frame (a rectangle of any size) and add images by url and possibly draw lines, add hyperlinks. Then exported source code will be used in a new CDOC.
