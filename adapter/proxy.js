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
