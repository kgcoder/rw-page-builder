/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Prerendered panel HTML, built from the hdoc-data "panels" JSON so that the page shows (and search
// engines see) the panels before the reader script runs. Same markup as the plugin's reader-template.php.
import { escapeHtml } from './escape.js'

const HIDDEN = ' style="display:none"'

function linksHtml(links) {
    return (links || [])
        .filter(l => l && l.href && l.text)
        .map(l => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.text)}</a>`)
        .join('')
}

export function topPanel(panels) {
    const top = panels && panels.top
    const siteName = top && top['site-name'] ? top['site-name'] : {}
    const logo = top && top.logo ? top.logo : {}
    const href = logo.href || siteName.href || '#'
    return {
        panelAttr: top ? '' : HIDDEN,
        href: escapeHtml(href),
        logoSrc: escapeHtml(logo.src || ''),
        logoAttr: logo.src ? '' : HIDDEN,
        titleAttr: siteName.text ? '' : HIDDEN,
        title: escapeHtml(siteName.text || ''),
        links: top ? linksHtml(top.links) : '',
    }
}

export function sidebarHtml(panels) {
    const sidebar = panels && panels.sidebar
    if (!sidebar || !Array.isArray(sidebar.items)) return ''
    return sidebar.items.map(item => {
        const title = item.title ? `<h3>${escapeHtml(item.title)}</h3>` : ''
        if (item.type === 'links' && Array.isArray(item.items) && item.items.length) {
            const lis = item.items
                .filter(a => a.href && a.text)
                .map(a => `<li><a href="${escapeHtml(a.href)}">${escapeHtml(a.text)}</a></li>`)
                .join('')
            return `${title}<ul>${lis}</ul>`
        }
        if (item.type === 'recent-comments' && Array.isArray(item.comments) && item.comments.length) {
            const lis = item.comments
                .filter(c => c['post-href'] && c.author)
                .map(c => `<li><a href="${escapeHtml(c['post-href'])}">${escapeHtml(c['post-title'] || '')}</a> — ${escapeHtml(c.author)}</li>`)
                .join('')
            return `${title}<ul>${lis}</ul>`
        }
        if (item.type === 'search' && item.action) {
            const placeholder = item.placeholder ? ` placeholder="${escapeHtml(item.placeholder)}"` : ''
            return `<form action="${escapeHtml(item.action.replace('%s', ''))}" method="get"><input type="search" name="s"${placeholder}/><button type="submit">Search</button></form>`
        }
        return ''
    }).join('')
}

export function postNavHtml(panels) {
    const postNav = panels && panels['post-nav']
    if (!postNav || !((postNav.prev && postNav.prev.href) || (postNav.next && postNav.next.href))) return ''
    const link = l => (l && l.href) ? `<a href="${escapeHtml(l.href)}">${escapeHtml(l.title || '')}</a>` : ''
    return `<div class="PostNavBarSide" style="justify-content:flex-start">${link(postNav.prev)}</div>`
        + `<div class="PostNavBarSide" style="justify-content:flex-end">${link(postNav.next)}</div>`
}

export function bottomPanel(panels) {
    const bottom = panels && panels.bottom
    const sections = bottom && Array.isArray(bottom.sections) ? bottom.sections : []
    return {
        panelAttr: bottom ? '' : HIDDEN,
        sections: sections.map(s => {
            const titleAttr = s.title ? ` title="${escapeHtml(s.title)}"` : ''
            return `<section${titleAttr}>${linksHtml(s.links)}</section>`
        }).join(''),
        message: bottom && bottom['bottom-message'] ? escapeHtml(bottom['bottom-message']) : '',
    }
}
