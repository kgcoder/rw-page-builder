/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// The request URL for the site's proxy (data-proxy-url). {url} and {source} in the proxy URL are
// replaced with the encoded target and current page URLs; without them, target_url and source_url
// are added as query parameters (the names the plugin's /sw-proxy/ endpoint uses), plus
// is_for_condoc=1 for a CONDOC's main page ({condoc} in the proxy URL: 1 or 0).
export function proxyRequestUrl(proxyUrl, targetUrl, sourceUrl, isForCondoc) {
    const source = sourceUrl || ''
    if (/\{(url|source|condoc)\}/.test(proxyUrl)) {
        return proxyUrl
            .split('{url}').join(encodeURIComponent(targetUrl))
            .split('{source}').join(encodeURIComponent(source))
            .split('{condoc}').join(isForCondoc ? '1' : '0')
    }

    const hashIndex = proxyUrl.indexOf('#')
    const base = hashIndex === -1 ? proxyUrl : proxyUrl.slice(0, hashIndex)
    let separator = '&'
    if (base.indexOf('?') === -1) separator = '?'
    else if (base.endsWith('?') || base.endsWith('&')) separator = ''
    return base + separator + 'target_url=' + encodeURIComponent(targetUrl) + '&source_url=' + encodeURIComponent(source)
        + (isForCondoc ? '&is_for_condoc=1' : '')
}

// Origins the reader may fetch directly, without the proxy (data-direct-origins: separated by spaces
// or commas). They must send CORS headers, like the comments bridge. Entries that aren't http(s)
// URLs are ignored; paths are dropped ("https://x.example/fn" counts as "https://x.example").
export function parseOrigins(value) {
    const origins = []
    String(value || '').split(/[\s,]+/).forEach(entry => {
        if (!entry) return
        try {
            const url = new URL(entry)
            if ((url.protocol === 'http:' || url.protocol === 'https:') && origins.indexOf(url.origin) === -1) origins.push(url.origin)
        } catch (e) {
            // not a URL
        }
    })
    return origins
}

export function isDirectUrl(url, origins) {
    try {
        return origins.indexOf(new URL(url).origin) !== -1
    } catch (e) {
        return false
    }
}
