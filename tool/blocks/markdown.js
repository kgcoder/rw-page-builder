/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Markdown -> HTML for "Load from Markdown". Pure (no DOM), so it runs in Node tests too.
//
// Covers the common subset: headings, paragraphs, line breaks, emphasis, code, links, images,
// quotes, nested lists, fenced and indented code, rules and GFM tables. Raw HTML is kept: a line
// starting with a block-level tag (an <iframe> embed, a <div>, a <figure>…) starts an HTML block that
// runs to the next blank line, and inline tags pass through. A paragraph that is only a YouTube link
// becomes an embed, and one that is only an image becomes a <figure>.
//
// The output is shaped for the block editor: list items and quotes hold inline HTML (no <p> inside
// <li>), so they open as list and quote blocks rather than HTML blocks.
import { youtubeEmbedUrl } from './convert.js'

const HTML_BLOCK_TAGS = ['address', 'article', 'aside', 'audio', 'blockquote', 'canvas', 'center', 'details', 'dialog',
    'dd', 'div', 'dl', 'dt', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
    'h6', 'header', 'hr', 'iframe', 'li', 'main', 'math', 'nav', 'object', 'ol', 'p', 'picture', 'section', 'summary',
    'svg', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'video']
// These may hold blank lines, so they run to their closing tag instead.
const HTML_RAW_TAGS = ['pre', 'script', 'style', 'textarea']

const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^ {0,3}> ?/
const LIST_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const REFERENCE = /^ {0,3}\[([^\]]+)\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/

// Returns {html, title}. A "# Title" at the very top becomes the title instead of a heading.
export function markdownToHtml(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')
    const refs = collectReferences(lines)
    const tokens = parseBlocks(removeFrontMatter(lines), refs)

    let title = ''
    if (tokens.length && tokens[0].type === 'heading' && tokens[0].level === 1) {
        title = plainText(tokens.shift().html)
    }
    // The document's own <h1> is the title, so if headings start at # they move down a level.
    const shift = tokens.some(t => t.type === 'heading' && t.level === 1) ? 1 : 0
    const html = tokens.map(t => {
        if (t.type !== 'heading') return t.html
        const level = Math.min(6, Math.max(2, t.level + shift))
        return `<h${level}>${t.html}</h${level}>`
    }).join('\n')
    return { html, title }
}


// ---- blocks

// Returns tokens: {type: 'heading', level, html} or {type: 'paragraph' | 'block', html}.
function parseBlocks(lines, refs) {
    const tokens = []
    let i = 0
    while (i < lines.length) {
        const line = lines[i]
        let match

        if (isBlank(line)) {
            i++
            continue
        }

        if ((match = FENCE.exec(line))) {
            const indent = match[1].length
            const fence = match[2]
            const lang = match[3]
            const code = []
            i++
            while (i < lines.length && !isClosingFence(lines[i], fence)) {
                code.push(lines[i].replace(new RegExp('^ {0,' + indent + '}'), ''))
                i++
            }
            i++ // the closing fence
            const langAttr = lang ? ` class="language-${escapeAttr(lang)}"` : ''
            tokens.push(block(`<pre><code${langAttr}>${escapeHtml(code.join('\n'))}</code></pre>`))
            continue
        }

        if (/^ {4}/.test(line)) {
            const code = []
            while (i < lines.length && (/^ {4}/.test(lines[i]) || isBlank(lines[i]))) {
                code.push(lines[i].slice(4))
                i++
            }
            while (code.length && isBlank(code[code.length - 1])) code.pop()
            tokens.push(block(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`))
            continue
        }

        if ((match = ATX.exec(line))) {
            tokens.push({ type: 'heading', level: match[1].length, html: inline(match[2] || '', refs) })
            i++
            continue
        }

        if (RULE.test(line)) {
            tokens.push(block('<hr>'))
            i++
            continue
        }

        if (QUOTE.test(line)) {
            const inner = []
            while (i < lines.length && !isBlank(lines[i])) {
                if (QUOTE.test(lines[i])) inner.push(lines[i].replace(QUOTE, ''))
                else if (startsBlock(lines[i])) break
                else inner.push(lines[i]) // a lazy continuation of the quoted paragraph
                i++
            }
            const innerTokens = parseBlocks(inner, refs)
            const innerHtml = innerTokens.map(t => t.type === 'heading' ? `<h${Math.max(2, t.level)}>${t.html}</h${Math.max(2, t.level)}>` : t.html).join('\n')
            tokens.push(block(`<blockquote>${innerTokens.length > 1 ? '\n' + innerHtml + '\n' : innerHtml}</blockquote>`))
            continue
        }

        if (htmlBlockKind(line)) {
            const kind = htmlBlockKind(line)
            const html = []
            if (kind === 'comment' || kind.raw) {
                const end = kind === 'comment' ? '-->' : '</' + kind.raw + '>'
                while (i < lines.length) {
                    html.push(lines[i])
                    i++
                    if (html[html.length - 1].toLowerCase().indexOf(end) !== -1) break
                }
            } else {
                while (i < lines.length && !isBlank(lines[i])) html.push(lines[i++])
            }
            tokens.push(block(html.join('\n')))
            continue
        }

        if (LIST_ITEM.test(line)) {
            i = parseList(lines, i, refs, tokens)
            continue
        }

        if (line.indexOf('|') !== -1 && i + 1 < lines.length && TABLE_DELIMITER.test(lines[i + 1]) && lines[i + 1].indexOf('|') !== -1) {
            i = parseTable(lines, i, refs, tokens)
            continue
        }

        // A paragraph, or a setext heading if its lines are underlined with === or ---.
        const text = [line]
        i++
        let setext = 0
        while (i < lines.length && !isBlank(lines[i])) {
            if ((match = SETEXT.exec(lines[i]))) {
                setext = match[1][0] === '=' ? 1 : 2
                i++
                break
            }
            if (startsBlock(lines[i])) break
            text.push(lines[i])
            i++
        }
        if (setext) tokens.push({ type: 'heading', level: setext, html: inline(text.map(l => l.trim()).join('\n'), refs) })
        else tokens.push(paragraph(text, refs))
    }
    return tokens
}

function block(html) {
    return { type: 'block', html }
}

function paragraph(lines, refs) {
    const source = lines.map(l => l.replace(/^ +/, '')).join('\n').replace(/[ \t]+$/, '').replace(/\\$/, '')

    const link = /^<?(\S+?)>?$/.exec(source)
    const video = link && youtubeEmbedUrl(link[1])
    if (video && /^(https?:\/\/|www\.|youtu)/i.test(link[1])) {
        return block(`<iframe width="560" height="315" src="${escapeAttr(video)}" frameborder="0" allowfullscreen></iframe>`)
    }

    const html = inline(source, refs)
    if (/^<img [^>]*>$/.test(html)) return block(`<figure>${html}</figure>`)
    return { type: 'paragraph', html: `<p>${html}</p>`, inner: html }
}

function parseList(lines, start, refs, tokens) {
    const first = LIST_ITEM.exec(lines[start])
    const ordered = /\d/.test(first[2])
    const delimiter = first[2].slice(-1) // -, *, +, . or )
    const items = []
    let i = start

    while (i < lines.length) {
        const match = LIST_ITEM.exec(lines[i])
        if (!match || /\d/.test(match[2]) !== ordered || match[2].slice(-1) !== delimiter || RULE.test(lines[i])) break
        const spaces = match[3].length
        const contentIndent = match[1].length + match[2].length + (spaces > 4 || !match[4] ? 1 : spaces)
        const body = [spaces > 4 ? ' '.repeat(spaces - 1) + match[4] : match[4]]
        i++
        let sawBlank = false
        while (i < lines.length) {
            const next = lines[i]
            if (isBlank(next)) {
                sawBlank = true
                body.push('')
                i++
                continue
            }
            const indent = next.match(/^ */)[0].length
            if (indent >= contentIndent) {
                body.push(next.slice(contentIndent))
                sawBlank = false
                i++
                continue
            }
            // A lazy continuation line of the item's paragraph.
            if (!sawBlank && !startsBlock(next) && !LIST_ITEM.test(next)) {
                body.push(next)
                i++
                continue
            }
            break
        }
        while (body.length && isBlank(body[body.length - 1])) body.pop()
        items.push(body)
        if (sawBlank && !(i < lines.length && LIST_ITEM.test(lines[i]))) break
    }

    // List items hold inline HTML (tight or loose); an item's paragraphs are separated by <br><br>.
    const lis = items.map(body => {
        const parts = parseBlocks(body, refs)
        let html = ''
        let afterText = false
        for (const t of parts) {
            if (t.type === 'paragraph') {
                html += (afterText ? '<br><br>' : '') + t.inner
                afterText = true
            } else {
                html += t.type === 'heading' ? `<strong>${t.html}</strong>` : t.html
                afterText = t.type === 'heading'
            }
        }
        return `<li>${html}</li>`
    })
    const tag = ordered ? 'ol' : 'ul'
    const startNumber = ordered ? parseInt(first[2], 10) : 1
    const startAttr = startNumber !== 1 ? ` start="${startNumber}"` : ''
    tokens.push(block(`<${tag}${startAttr}>${lis.join('')}</${tag}>`))
    return i
}

function parseTable(lines, start, refs, tokens) {
    const aligns = splitRow(lines[start + 1]).map(cell => {
        const left = /^:/.test(cell)
        const right = /:$/.test(cell)
        return left && right ? 'center' : right ? 'right' : left ? 'left' : ''
    })
    const cells = (row, tag) => '<tr>' + aligns.map((align, n) => {
        const style = align ? ` style="text-align: ${align}"` : ''
        return `<${tag}${style}>${inline(row[n] || '', refs)}</${tag}>`
    }).join('') + '</tr>'

    const head = cells(splitRow(lines[start]), 'th')
    const body = []
    let i = start + 2
    while (i < lines.length && !isBlank(lines[i]) && lines[i].indexOf('|') !== -1 && !startsBlock(lines[i])) {
        body.push(cells(splitRow(lines[i]), 'td'))
        i++
    }
    tokens.push(block('<table>\n<thead>\n' + head + '\n</thead>' + (body.length ? '\n<tbody>\n' + body.join('\n') + '\n</tbody>' : '') + '\n</table>'))
    return i
}

// Splits a table row on unescaped pipes outside code spans.
function splitRow(line) {
    const text = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    const cells = []
    let cell = ''
    let inCode = false
    for (let n = 0; n < text.length; n++) {
        const ch = text[n]
        if (ch === '\\' && text[n + 1] === '|') {
            cell += '|'
            n++
        } else if (ch === '`') {
            inCode = !inCode
            cell += ch
        } else if (ch === '|' && !inCode) {
            cells.push(cell.trim())
            cell = ''
        } else {
            cell += ch
        }
    }
    cells.push(cell.trim())
    return cells
}

// Whether a line ends a paragraph by starting another block.
function startsBlock(line) {
    if (FENCE.test(line) || ATX.test(line) || RULE.test(line) || QUOTE.test(line) || htmlBlockKind(line)) return true
    const item = LIST_ITEM.exec(line)
    // Only a list starting at 1 (or a bullet) with some text interrupts a paragraph.
    return !!(item && item[4] && (!/\d/.test(item[2]) || parseInt(item[2], 10) === 1))
}

function htmlBlockKind(line) {
    if (/^ {0,3}<!--/.test(line)) return 'comment'
    const match = /^ {0,3}<\/?([a-zA-Z][a-zA-Z0-9-]*)(?=[\s/>]|$)/.exec(line)
    if (!match) return null
    const tag = match[1].toLowerCase()
    if (HTML_RAW_TAGS.indexOf(tag) !== -1 && line.trim()[1] !== '/') return { raw: tag }
    return HTML_BLOCK_TAGS.indexOf(tag) !== -1 ? 'block' : null
}

function isClosingFence(line, fence) {
    const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
    return !!match && match[1][0] === fence[0] && match[1].length >= fence.length
}

function isBlank(line) {
    return !/\S/.test(line)
}

// Reference definitions ([id]: url "title") anywhere outside code. They're removed from the lines.
function collectReferences(lines) {
    const refs = {}
    let fence = null
    for (let n = 0; n < lines.length; n++) {
        const line = lines[n]
        if (fence) {
            if (isClosingFence(line, fence)) fence = null
            continue
        }
        const fenceMatch = FENCE.exec(line)
        if (fenceMatch) {
            fence = fenceMatch[2]
            continue
        }
        const match = REFERENCE.exec(line)
        if (match && (n === 0 || isBlank(lines[n - 1]) || REFERENCE.test(lines[n - 1]) || lines[n - 1] === '')) {
            const key = normalizeLabel(match[1])
            if (!refs[key]) refs[key] = { url: match[2], title: match[3] || match[4] || match[5] || '' }
            lines[n] = ''
        }
    }
    return refs
}

// YAML front matter (--- ... ---) at the very top is metadata, not content.
function removeFrontMatter(lines) {
    if (lines[0] !== '---') return lines
    for (let n = 1; n < lines.length; n++) {
        if (lines[n] === '---' || lines[n] === '...') return lines.slice(n + 1)
        if (!/^[\w-]+:|^\s|^$/.test(lines[n])) return lines
    }
    return lines
}

function normalizeLabel(label) {
    return label.trim().replace(/\s+/g, ' ').toLowerCase()
}


// ---- inline

// Pieces that are already HTML (code spans, links, tags…) are swapped for placeholders so the later
// steps (escaping, emphasis) leave them alone, then put back at the end.
function inline(text, refs) {
    const stash = []
    const hold = (html, raw) => {
        stash.push({ html, raw: raw != null ? raw : html })
        return '\u0000' + (stash.length - 1) + '\u0000'
    }
    const restore = (s, raw) => {
        let prev
        do {
            prev = s
            s = s.replace(/\u0000(\d+)\u0000/g, (m, n) => raw ? stash[n].raw : stash[n].html)
        } while (s !== prev)
        return s
    }

    let s = text

    // Code spans.
    s = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (m, ticks, code) => {
        const trimmed = /^ [\s\S]* $/.test(code) && /\S/.test(code) ? code.slice(1, -1) : code
        return hold(`<code>${escapeHtml(trimmed.replace(/\n/g, ' '))}</code>`, trimmed)
    })
    // Hard line breaks: two spaces or a backslash at the end of a line.
    s = s.replace(/(?: {2,}|\\)\n/g, () => hold('<br>\n'))
    // Backslash escapes.
    s = s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, (m, ch) => hold(escapeHtml(ch), ch))
    // Autolinks: <https://…>, <mail@example.com>.
    s = s.replace(/<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/g, (m, url) => hold(`<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`))
    s = s.replace(/<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/g, (m, mail) => hold(`<a href="mailto:${escapeAttr(mail)}">${escapeHtml(mail)}</a>`))
    // Inline HTML tags and comments pass through.
    s = s.replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g,
        m => hold(m))

    s = links(s, refs, hold, restore)

    // Bare URLs.
    s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<\u0000]*[^\s<\u0000.,:;"')\]!?*_~])/g,
        (m, before, url) => before + hold(`<a href="${escapeAttr(/^www\./.test(url) ? 'http://' + url : url)}">${escapeHtml(url)}</a>`))

    s = escapeHtml(s, true)
    s = emphasis(s)
    return restore(s)
}

// [text](url "title"), ![alt](src "title"), [text][id], [text][] and [text] (if id is defined).
function links(s, refs, hold, restore) {
    let out = ''
    let n = 0
    while (n < s.length) {
        const image = s[n] === '!' && s[n + 1] === '['
        if (s[n] !== '[' && !image) {
            out += s[n++]
            continue
        }
        const open = image ? n + 1 : n
        const close = matchingBracket(s, open)
        if (close === -1) {
            out += s[n++]
            continue
        }
        const label = s.slice(open + 1, close)
        let target = null
        let end = close + 1

        if (s[end] === '(') {
            const parsed = parseDestination(s, end)
            if (parsed) {
                target = { url: restore(parsed.url, true), title: restore(parsed.title, true) }
                end = parsed.end
            }
        }
        if (!target) {
            const ref = /^\[([^\]]*)\]/.exec(s.slice(end))
            const key = normalizeLabel(ref && ref[1] ? ref[1] : restore(label, true))
            if (refs[key]) {
                target = refs[key]
                if (ref) end += ref[0].length
            }
        }
        if (!target) {
            out += s[n++]
            continue
        }

        const title = target.title ? ` title="${escapeAttr(target.title)}"` : ''
        if (image) {
            const alt = restore(label, true).replace(/[*_`~]/g, '')
            out += hold(`<img src="${escapeAttr(target.url)}" alt="${escapeAttr(alt)}"${title}>`)
        } else {
            out += hold(`<a href="${escapeAttr(target.url)}"${title}>${emphasis(escapeHtml(label, true))}</a>`)
        }
        n = end
    }
    return out
}

function matchingBracket(s, open) {
    let depth = 0
    for (let n = open; n < s.length; n++) {
        if (s[n] === '[') depth++
        else if (s[n] === ']' && --depth === 0) return n
    }
    return -1
}

// (url "title") starting at s[start] === '('. Returns {url, title, end} or null.
function parseDestination(s, start) {
    let n = start + 1
    while (s[n] === ' ' || s[n] === '\n') n++
    let url = ''
    if (s[n] === '<') {
        const close = s.indexOf('>', n)
        if (close === -1) return null
        url = s.slice(n + 1, close)
        n = close + 1
    } else {
        let depth = 0
        while (n < s.length && !/\s/.test(s[n])) {
            if (s[n] === '(') depth++
            else if (s[n] === ')') {
                if (depth === 0) break
                depth--
            }
            url += s[n++]
        }
    }
    while (s[n] === ' ' || s[n] === '\n') n++
    let title = ''
    const quote = s[n] === '"' || s[n] === "'" ? s[n] : s[n] === '(' ? ')' : null
    if (quote) {
        const close = s.indexOf(quote, n + 1)
        if (close === -1) return null
        title = s.slice(n + 1, close)
        n = close + 1
        while (s[n] === ' ' || s[n] === '\n') n++
    }
    if (s[n] !== ')') return null
    return { url, title, end: n + 1 }
}

function emphasis(s) {
    return s
        .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
        .replace(/\*(?=[^\s*])([\s\S]*?[^\s*])\*/g, '<em>$1</em>')
        .replace(/(^|[^\w])_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>')
        .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
}


// ---- text

// keepEntities: leave &amp; &copy; &#123; … as they are (they're already HTML), escape other &s.
function escapeHtml(text, keepEntities) {
    const amp = keepEntities ? /&(?!#\d+;|#x[0-9a-f]+;|[a-z][a-z0-9]*;)/gi : /&/g
    return String(text).replace(amp, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// The text of inline HTML, for the title field.
function plainText(html) {
    return html.replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ').trim()
}
