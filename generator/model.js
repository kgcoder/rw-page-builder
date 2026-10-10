/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// The document model edited by the tool. generate() turns it into a page, parse() reads a page back.
//
// panels uses the same shape as the "panels" object in hdoc-data (top, post-nav, sidebar, comments,
// bottom), so it round-trips without conversion. Panels exist only for HDOC.
// extra keeps hdoc-data keys the tool doesn't know (e.g. "removal-selectors"), and sourceExtra keeps
// unknown top-level CDOC/CONDOC elements (e.g. <copy-info>) as raw XML, so re-saving loses nothing.
// pageFormat is the format the page was opened in (its rw-page-format meta); generate() always writes
// the current PAGE_FORMAT.

import { PAGE_FORMAT, READER_FOLDER } from './version.js'

export const DOC_TYPES = ['hdoc', 'cdoc', 'condoc']

export function createModel(type) {
    return {
        type: type || 'hdoc',
        pageTitle: '',
        lang: 'en',
        header: { h1: '', author: '', date: '' },
        republishingPolicy: '',
        contentHtml: '',
        svg: '',
        mainUrl: '',
        description: '',
        connections: [],
        panels: {},
        site: createSiteSettings(),
        extra: {},
        sourceExtra: [],
        pageFormat: PAGE_FORMAT,
    }
}

export function createSiteSettings() {
    return {
        assetsUrl: '/' + READER_FOLDER + '/',
        theme: 'light',
        fontSet: 'default',
        commentsLabel: '',
        // The site's proxy for connected documents and comments on other sites (data-proxy-url).
        proxyUrl: '',
        // Origins the reader fetches directly, e.g. the comments bridge (data-direct-origins, separated by spaces).
        directOrigins: '',
        // Code added to the page's <head> as is (e.g. an analytics snippet).
        headCode: '',
    }
}
