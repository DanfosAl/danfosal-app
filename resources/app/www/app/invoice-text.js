// Reading a Platforma Qendrore e-invoice the way Sell > Import invoice does, shared with the Paper
// Autopilot (tools/paper-autopilot/sales-import.js) so a sale added automatically is read and matched
// exactly like one imported by hand. No imports on purpose: it runs in the app and under Node.

// Same line builder as the classic page: a gap wider than 3pt is a column break, not a word break.
export function textItemsToLines(items) {
    const rows = [];
    for (const item of items) {
        const str = item.str || ''; if (!str.trim()) continue;
        const x = item.transform[4], y = item.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) <= 2);
        if (!row) { row = { y, cells: [] }; rows.push(row); }
        row.cells.push({ x, str, width: item.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map(row => {
        row.cells.sort((a, b) => a.x - b.x);
        let line = '', prevEnd = null;
        for (const c of row.cells) { if (prevEnd !== null && c.x - prevEnd > 3) line += ' '; line += c.str; prevEnd = c.x + c.width; }
        return line.replace(/\s+/g, ' ').trim();
    }).filter(Boolean).join('\n');
}

// The text the processor reads: every page, each headed "=== PAGE n ===".
export const pageText = (n, lines) => `\n\n=== PAGE ${n} ===\n\n` + lines;

// An invoice line's name without the price the platform sometimes prints after it.
export const cleanItemName = s => String(s || '').replace(/\s*\d{1,5}[.,]\d{2}\s*$/g, '').trim();

// Product matching (classic rules), with the model-number guard: "K 5" never matches "K 7".
const modelNumbers = name => (name.match(/\d+(?:[/\-.,]\d+)*/g) || []).join(' ');
const stripProducer = name => name.replace(/^(k[aä]rcher|karcher|kaercher)\s+/i, '').trim();
export function findBestProductMatch(products, searchName) {
    if (!searchName) return null;
    const bare = stripProducer(searchName.toLowerCase().trim()), model = modelNumbers(bare);
    let best = null, bestScore = 0;
    products.forEach(p => {
        const pb = stripProducer((p.name || '').toLowerCase().trim()); if (!pb) return;
        const pm = modelNumbers(pb);
        if (model && pm && model !== pm) return;
        let score = 0;
        if (pb === bare) score = 100;
        else if (pb.startsWith(bare)) score = 90;
        else if (bare.startsWith(pb)) score = 85;
        else if (pb.includes(bare)) score = 45;
        else if (bare.includes(pb)) score = 70;
        else {
            const sw = bare.split(/\s+/).filter(w => w.length >= 2), pw = pb.split(/\s+/).filter(w => w.length >= 2);
            const hit = sw.filter(w => pw.some(x => x === w || (w.length >= 4 && x.includes(w)) || (x.length >= 4 && w.includes(x))));
            if (hit.length && sw.length) score = (hit.length / sw.length) * 85 - Math.min((pw.length - hit.length) * 2, 10);
        }
        if (score > bestScore) { bestScore = score; best = p; }
    });
    return bestScore >= 50 ? best : null;
}
