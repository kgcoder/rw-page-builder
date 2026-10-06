/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Alignment for the collage editor. Boxes are {x, y, w, h} in collage units; targets are the other
// items' boxes and the frame. Each axis snaps on its own: the box's left/center/right (or
// top/middle/bottom) to the nearest line of any target within the threshold.

function xLines(r) {
    return [r.x, r.x + r.w / 2, r.x + r.w]
}

function yLines(r) {
    return [r.y, r.y + r.h / 2, r.y + r.h]
}

// The smallest correction that puts one of `lines` on one of the targets' lines, or null.
function nearest(lines, targets, linesOf, threshold) {
    let best = null
    for (const target of targets) {
        for (const t of linesOf(target)) {
            for (const l of lines) {
                const d = t - l
                if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d
            }
        }
    }
    return best
}

// → {dx, dy}: how much to shift the box.
export function snapMove(box, targets, threshold) {
    const dx = nearest(xLines(box), targets, xLines, threshold)
    const dy = nearest(yLines(box), targets, yLines, threshold)
    return { dx: dx || 0, dy: dy || 0 }
}

// Resizes `box` by dragging the corner `handle` ('nw', 'ne', 'sw' or 'se') to `point`; the opposite
// corner stays. The dragged edges snap. With keepAspect the box keeps its proportions: the snapped
// axis wins, or the one the pointer moved further. → {x, y, w, h}, at least minSize on each side.
export function snapResize(box, handle, point, targets, threshold, keepAspect, minSize) {
    const min = minSize || 1
    const west = handle.indexOf('w') !== -1
    const north = handle.indexOf('n') !== -1
    // The fixed corner.
    const fx = west ? box.x + box.w : box.x
    const fy = north ? box.y + box.h : box.y

    let ex = point.x
    let ey = point.y
    const sx = nearest([ex], targets, xLines, threshold)
    const sy = nearest([ey], targets, yLines, threshold)
    if (sx !== null) ex += sx
    if (sy !== null) ey += sy

    let w = Math.max(min, west ? fx - ex : ex - fx)
    let h = Math.max(min, north ? fy - ey : ey - fy)
    if (keepAspect && box.w > 0 && box.h > 0) {
        const ratio = box.w / box.h
        let useX
        if (sx !== null && sy !== null) useX = Math.abs(sx) <= Math.abs(sy)
        else if (sx !== null || sy !== null) useX = sx !== null
        else useX = w / box.w >= h / box.h
        if (useX) h = w / ratio
        else w = h * ratio
        if (w < min) { w = min; h = w / ratio }
        if (h < min) { h = min; w = h * ratio }
    }
    return { x: west ? fx - w : fx, y: north ? fy - h : fy, w, h }
}

// Red guide lines: every line of `box` that lies on a line of a target (within `tolerance`), drawn
// across all the boxes that share it. → [{x1, y1, x2, y2}]
export function findGuides(box, targets, tolerance) {
    const guides = []
    const tol = tolerance === undefined ? 0.5 : tolerance
    xLines(box).forEach(x => {
        const hits = targets.filter(t => xLines(t).some(tx => Math.abs(tx - x) <= tol))
        if (!hits.length) return
        const all = hits.concat([box])
        guides.push({
            x1: x, x2: x,
            y1: Math.min.apply(null, all.map(r => r.y)),
            y2: Math.max.apply(null, all.map(r => r.y + r.h)),
        })
    })
    yLines(box).forEach(y => {
        const hits = targets.filter(t => yLines(t).some(ty => Math.abs(ty - y) <= tol))
        if (!hits.length) return
        const all = hits.concat([box])
        guides.push({
            y1: y, y2: y,
            x1: Math.min.apply(null, all.map(r => r.x)),
            x2: Math.max.apply(null, all.map(r => r.x + r.w)),
        })
    })
    return guides
}
