/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// generate(model) -> the full HTML page for one document.
import { escapeHtml, escapeJsonForScript } from './escape.js'
import { bottomPanel, postNavHtml, sidebarHtml, topPanel } from './panels.js'
import { buildCdocSource, buildCondocSource } from './sources.js'
import { pageHtml } from './template.js'

const NO_PANELS = {}

export function generate(model) {
    const site = model.site
    const isHdoc = model.type === 'hdoc'
    const panels = isHdoc ? (model.panels || NO_PANELS) : NO_PANELS

    let assetsUrl = site.assetsUrl || ''
    if (assetsUrl && !assetsUrl.endsWith('/')) assetsUrl += '/'

    let mainDivClass = ''
    let mainContent
    let dataScript = ''
    if (isHdoc) {
        mainDivClass = ' hdoc-content'
        mainContent = model.contentHtml.trim()
        dataScript = `<script type="application/json" id="hdoc-data">\n${escapeJsonForScript(JSON.stringify(hdocData(model), null, 2))}\n</script>\n\n`
    } else {
        const id = model.type === 'cdoc' ? 'cdoc-source' : 'condoc-source'
        const source = model.type === 'cdoc' ? buildCdocSource(model) : buildCondocSource(model)
        mainContent = `<script type="application/json" style="display:none;" id="${id}">{"source": ${escapeJsonForScript(JSON.stringify(source))}}</script>`
        // Hidden by the reader's CSS; the reader shows it when the main document can't be loaded.
        if (model.type === 'condoc') mainContent += '\n                                <a id="MainDocDownloadLink">Download main document</a>'
    }

    return pageHtml({
        lang: escapeHtml(model.lang || 'en'),
        pageTitle: escapeHtml(model.pageTitle || model.header.h1),
        assetsUrl: escapeHtml(assetsUrl),
        theme: escapeHtml(site.theme || 'light'),
        fontSet: escapeHtml(site.fontSet || 'default'),
        scriptExtraAttrs: scriptExtraAttrs(site),
        headCode: headCodeHtml(site.headCode),
        h1: escapeHtml(model.header.h1),
        mainDivClass,
        mainContent,
        top: topPanel(panels),
        sidebar: sidebarHtml(panels),
        postNav: postNavHtml(panels),
        bottom: bottomPanel(panels),
        dataScript,
    })
}

// Optional attributes of the reader's <script> tag.
function scriptExtraAttrs(site) {
    let attrs = ''
    if (site.commentsLabel) attrs += ` data-comments-label="${escapeHtml(site.commentsLabel)}"`
    if (site.proxyUrl) attrs += ` data-proxy-url="${escapeHtml(site.proxyUrl)}"`
    return attrs
}

// The site's own code (e.g. analytics), written as is between marker comments so parse() can read it back.
export const HEAD_CODE_START = '<!-- rw-head-code -->'
export const HEAD_CODE_END = '<!-- /rw-head-code -->'

function headCodeHtml(code) {
    const trimmed = (code || '').trim()
    if (!trimmed) return ''
    return `\n    ${HEAD_CODE_START}\n${trimmed}\n    ${HEAD_CODE_END}\n`
}

// The hdoc-data JSON. Keys the tool doesn't know (model.extra) are written after the known ones.
export function hdocData(model) {
    const data = {}
    if (model.lang) data.lang = model.lang
    data.forced = true

    const header = { h1: model.header.h1 }
    if (model.header.author) header.author = model.header.author
    if (model.header.date) header.date = model.header.date
    data.header = header

    if (model.republishingPolicy) data['republishing-policy'] = model.republishingPolicy
    if (model.panels && Object.keys(model.panels).length) data.panels = orderedPanels(model.panels)

    if (model.connections.length) {
        data.connections = model.connections.map(con => {
            const c = { url: con.url }
            if (con.title) c.title = con.title
            c.flinks = con.flinks
            return c
        })
    }

    for (const key of Object.keys(model.extra || {})) {
        if (!(key in data)) data[key] = model.extra[key]
    }
    return data
}

// The panels in a fixed order (the order of the plugin's hdoc-data), so saved pages don't change when
// panels are switched off and on in the editor. Unknown keys come last.
const PANEL_ORDER = ['top', 'post-nav', 'sidebar', 'comments', 'bottom']

function orderedPanels(panels) {
    const ordered = {}
    for (const key of PANEL_ORDER) {
        if (key in panels) ordered[key] = panels[key]
    }
    for (const key of Object.keys(panels)) {
        if (!(key in ordered)) ordered[key] = panels[key]
    }
    return ordered
}
