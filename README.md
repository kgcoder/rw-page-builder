# RW Page Builder

Build and publish [Reader's Web](https://github.com/kgcoder/readers-web-specs) documents (HDOC, CDOC, CONDOC) as plain static HTML pages. Visitors see the full Reader's Web reader UI without installing anything, and visitors with the RW Reader extension get the extension's own reader.

## Publishing

1. Build (or download) the `rw-reader-1/` folder and upload it to your site once, e.g. as `https://example.com/rw-reader-1/`. The number is the reader's major version; see [Versions](#versions).
2. For each document, upload an HTML page that points at that folder. The [page builder](#page-builder) makes these pages; you can also write them by hand, like the ones in [examples/](examples/):

```html
<meta name="rw-page-format" content="1">   <!-- the major version the page was made for -->
<link rel="stylesheet" href="/rw-reader-1/rw-reader.css">
<link rel="stylesheet" href="/rw-reader-1/themes/light.css">   <!-- any file from rw-reader-1/themes/ -->
<script defer src="/rw-reader-1/rw-reader.js" data-font-set="default"></script>
…
<div id="ui-root" class="theme-light">   <!-- must match the theme file -->
```

The document itself goes into the page:

| Type | Where |
|------|-------|
| HDOC | Content in `#CurrentDocumentMainDiv.hdoc-content`, metadata (header, panels, connections) in `<script type="application/json" id="hdoc-data">` with `"forced": true`. |
| CDOC | `<script type="application/json" id="cdoc-source">{"source": "<cdoc>…</cdoc>"}</script>` |
| CONDOC | `<script type="application/json" id="condoc-source">{"source": "<condoc>…</condoc>"}</script>` |

Connection URLs must be absolute. Browsers don't let a page load pages from other sites, so connected documents and comments on other sites need a [proxy](#proxy). Without one, the reader shows a popup suggesting the [RW Reader extension](https://chromewebstore.google.com/detail/rw-reader/hlckcdbgknflkkciojgdbhomdnegimbm), which can load them.

### Proxy

There are two ways to set one up. Both are checked in this order:

1. **Your own code.** Define `window.rwReaderFetch` in the code added to `<head>`, or in a `.js` file it includes (one file for the whole site):

   ```html
   <script>
   window.rwReaderFetch = async (url, options) => {
       // options: {currentPageUrl, isForCondoc}
       const params = new URLSearchParams({ target_url: url, source_url: options.currentPageUrl })
       if (options.isForCondoc) params.set('is_for_condoc', '1')
       const response = await fetch('https://<project id>.supabase.co/functions/v1/rw-proxy?' + params, {
           headers: { 'apikey': '…' },   // only if your proxy needs keys or other headers
       })
       if (!response.ok) throw new Error('Proxy error ' + response.status)
       return response.text()
   }
   </script>
   ```

   This example calls the [example proxy](#proxy) below; change the request to whatever your proxy expects. It resolves to the page's text and throws if the request fails. If it resolves to `null` or `undefined`, the reader treats the URL as not handled and moves on to the proxy URL.
2. **A proxy URL** (`data-proxy-url` on the reader's `<script>` tag, or *Proxy URL* in the page builder). The reader sends a `GET` with `target_url` and `source_url` query parameters, plus `is_for_condoc=1` when it loads a CONDOC's main page. If the proxy URL contains `{url}`, `{source}` or `{condoc}` (`1` or `0`), those are replaced instead (e.g. `https://proxy.example/?u={url}`). The proxy returns the page as is, allows your site in CORS, and responds with an error status if it can't fetch the page. A 403 means the URL isn't allowed, and the reader then suggests the extension.

[proxy/supabase/functions/rw-proxy/index.ts](proxy/supabase/functions/rw-proxy/index.ts) is a proxy for Supabase Edge Functions (Deno). It only fetches the URLs listed in its `ALLOWED_URLS`, plus `ALLOWED_CONDOC_URLS` for CONDOC main pages. [proxy/supabase/config.toml](proxy/supabase/config.toml) turns off the key check, so pages can call it without keys. Deploy it from the `proxy/` folder with `npx supabase functions deploy rw-proxy --project-ref <project id>`, then use `https://<project id>.supabase.co/functions/v1/rw-proxy` as the proxy URL.

### Comments

A document's comments URL (`panels.comments.url` in `hdoc-data`, *Comments* in the page builder) must return Reader's Web comments JSON: `{"comments": […], "total": n, "page": n, "per_page": n}`, each comment with `id`, `parent` (`0` at the top level), `author_name`, `date`, `content.rendered` (HTML), and optionally `author_avatar_urls["48"]` and `reply-url`. The reader adds `page` and `order=asc` to the URL. The RW Publisher WordPress plugin serves this format; [examples/comments.json](examples/comments.json) is a static example.

"Leave a comment" and "Reply" open their URL in a popup. When a comment is posted there, the page in the popup sends `window.parent.postMessage({type: 'swp-comment-submitted'}, '*')`, and the reader closes the popup and reloads the comments.

> **Experimental.** The Disqus and Hyvor Talk integration (the comments bridge, the form pages in `rw-reader-1/comments/` and the page builder's comments services) hasn't been tested with the real services, and it may be removed completely in the future.

**Comments services.** Disqus and Hyvor Talk don't serve this format, so a small server function, the **comments bridge** ([proxy/supabase/functions/rw-comments/index.ts](proxy/supabase/functions/rw-comments/index.ts)), loads a page's comments from the service and returns them as Reader's Web comments. The page's comments URL points at the bridge, so the comments also work for visitors with the RW Reader extension. To set it up:

1. List your Disqus forum in `ALLOWED_FORUMS` (or your Hyvor Talk website ID in `ALLOWED_HYVOR_WEBSITES`), set the API key with `npx supabase secrets set DISQUS_API_KEY=…` (or `HYVOR_API_KEY`), and deploy it from the `proxy/` folder with `npx supabase functions deploy rw-comments --project-ref <project id>`.
2. In the page builder's site settings, set the *Comments bridge URL* (`https://<project id>.supabase.co/functions/v1/rw-comments`), your Disqus short name or Hyvor Talk website ID, and add the bridge's origin to *Direct origins* (`data-direct-origins`): the reader loads URLs on those origins directly, without the proxy, so they must allow your site in CORS.
3. In a document's *Comments* section, choose the service and give the page's thread identifier.

Comments are posted on the service's own form page, `rw-reader-1/comments/disqus.html` or `hyvor.html`, which the popup opens. Add your site's domain to the forum's trusted domains in Disqus, or to the allowed domains in the Hyvor Talk console. The bridge caches each thread for a minute; when a comment is posted, the form page asks it to refresh that thread before the reader reloads the comments. Comments that wait for moderation appear once they're approved.

## Versions

Releases use [semantic versioning](https://semver.org/), and the major version is the **page format**: the version of the HTML that pages contain.

- **Minor and patch releases** work with existing pages. Replace the contents of your `rw-reader-1/` folder with the new one.
- **Major releases** need pages in the new format, so they come in a new folder (`rw-reader-2/`). Upload it next to the old one, which keeps the old pages working, then open each page in the page builder, set the reader assets URL to the new folder, and save it. Remove the old folder when no page uses it.

Each page says which format it's in (`<meta name="rw-page-format">`) and which version of the page builder made it (`<meta name="generator">`). The page builder warns when it opens a page in an older format. `rw-reader-1/VERSION`, and the first line of `rw-reader.js` and `rw-reader.css`, give the reader's version.

Browsers may keep using a cached `rw-reader.js` for a while after you replace it. If your host lets you, give the reader folder a short cache time.

The version is set in [generator/version.js](generator/version.js) and must match `package.json`.

## Development

```sh
git submodule update --init
npm install
npm run dev        # http://localhost:8000/examples/hdoc.html (also cdoc.html, condoc.html)
                   # page builder: http://localhost:8000/dist/rw-tool/index.html
npm run build      # minified dist/rw-reader-1/ and dist/rw-tool/
npm test           # generator tests
npm run preview    # build + serve the production files on :8000
```

In dev mode the bundle is rebuilt in memory on each request, so edits in `adapter/` or `reader/` only need a page reload. The example pages use the same URLs in both modes.

## Page builder

`rw-tool/` is a client-side page that makes these HTML files. Open `rw-tool/index.html` from a local build, or upload the folder next to `rw-reader-1/` on your site (the preview uses the `rw-reader-1/` folder next to it).

- **Documents.** Choose HDOC, CDOC or CONDOC, fill in the title and the other fields, and save the `.html` file (or copy its HTML). Saving is disabled while there are errors, such as a missing title or a connection URL that isn't absolute.
- **HDOC content** is edited as blocks (paragraphs, headings, lists, quotes, images, YouTube videos, code, separators) or as HTML; both tabs edit the same content. Markup that can't be shown as blocks is kept as an HTML block, unchanged. Select text to format it or add a link (⌘K). A video block takes any YouTube link (watch, youtu.be, Shorts) and writes the standard embed `<iframe>`.
- **Load from Markdown…** replaces the content with converted Markdown (pasted or opened from a `.md` file): headings, emphasis, links, images, lists, quotes, code, tables. HTML in it (e.g. a video embed) is kept as is, a YouTube link on its own line becomes a video, and the title comes from a leading `# Title` (and is cleared if there is none).
- **CDOC collage** is edited visually or as SVG; both tabs edit the same SVG. The frame can be any whole-number size (400×300 by default) with a transparent or colored background. Add images by URL and texts, then move and resize them with the mouse. They snap to each other and to the frame, and red lines show what lines up (hold Alt to turn snapping off). Texts can be aligned left, center or right (SVG's `text-anchor`), and resizing a text changes its font size. Shapes the editor doesn't know (from an SVG written by hand) are shown but locked, and kept exactly as written. In the reader, images are always drawn above texts and shapes.
- **CDOC editor page.** The same editor is also its own page, `rw-tool/cdoc.html` (toolbar: *CDOC editor*). It only makes the SVG: *Copy SVG* copies it, ready to paste into a CDOC. The work in progress is kept in your browser.
- **Connections.** Flinks are made in the RW Reader extension and pasted into a connection, one per line. When you edit an HDOC's content, its flinks follow the text they point at; a flink whose text was changed or removed is kept and marked "Not found".
- **Opening pages.** Open an existing page from a file, a URL, or by dropping it on the window, edit it and save it again. The page is the source of truth: nothing is stored anywhere else.
- **Preview.** The page is shown with the real reader as you type.
- **Comments.** A comments URL as is, or Disqus or Hyvor Talk through the [comments bridge](#comments): the tool then builds the comments and "Leave a comment" URLs from the service settings, and reads them back when you open the page. Disqus and Hyvor Talk are experimental: untested, and they may be removed.
- **Site settings** (toolbar: *Site settings*): the reader assets URL, theme, font set, default language, [proxy URL](#proxy), [direct origins and comments service defaults](#comments), code added to every page's `<head>` (e.g. a Google Analytics snippet; it isn't run in the preview), and the top, sidebar and bottom panels. New documents use them, and so does every document that was made with them; a page with different settings keeps its own until you choose *Use site settings*. Previous/next links and comments are set per document.

Site settings are saved in your browser. *Copy rw-site.json* copies them, ready to paste into a new `rw-site.json` file created in the `rw-tool/` folder on your site (e.g. with your host's file manager); *Export rw-site.json* downloads the same file. With `rw-site.json` there, the tool loads it automatically, so every browser starts with the same settings. If a browser already has different settings, they're kept, and the tool offers to use the file instead.

## Later

- **CLI.** The generator (`generator/`) is shared code with no UI, so a command-line tool for batch generation is mostly a small script.
- **CDOC editor: lines and hyperlinks.** The collage editor makes frames, images and texts; lines and hyperlinks could come next.
- **Cross-origin connections.** Site owners may run a proxy endpoint, on their site or on a service (Supabase, Firebase, etc.); restrictions such as allowed URLs are up to them, outside this project. Without a proxy endpoint, the current popup stays: it lists the documents that can't be loaded and links to the RW Reader extension.
- **Preview isolation.** The preview runs in a frame on the tool's own origin, so a page opened in the tool could run scripts there. Fine for your own pages; to be revisited before the tool is offered publicly (e.g. on readersweb.org).
