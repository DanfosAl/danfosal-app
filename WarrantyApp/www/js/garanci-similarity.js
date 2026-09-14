// Lightweight, dependency-free text similarity for surfacing past claims with a similar defect
// description — no ML model, no external API, just word-overlap (Jaccard) scoring. Good enough
// to point staff at "3 other claims mentioned this" without adding any backend infrastructure.

const STOPWORDS = new Set([
    'dhe', 'me', 'per', 'për', 'nga', 'ne', 'në', 'te', 'të', 'qe', 'që', 'eshte', 'është',
    'ka', 'nuk', 'edhe', 'ose', 'si', 'kur', 'pas', 'para', 'ky', 'kjo', 'ai', 'ajo', 'jane',
    'janë', 'pa', 'shume', 'shumë', 'mund', 'ishte', 'kane', 'kanë', 'sepse', 'ndaj', 'the',
    'and', 'with', 'from', 'this', 'that',
    // Domain-specific: these show up in nearly every claim regardless of the actual defect
    // (the machine/device/product being the subject of literally every sentence), so counting
    // them as "overlap" produced false-positive matches between otherwise-unrelated claims.
    // Listed post-diacritic-stripping form only (tokenize() strips accents before this filter
    // runs, so an entry like "makinë" would never actually match anything).
    'makina', 'makinen', 'makines', 'makine', 'pajisja', 'pajisjen', 'pajisje', 'produkti',
    'produktin', 'produkt'
]);

export function tokenize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics for looser matching
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

export function jaccardSimilarity(tokensA, tokensB) {
    const setA = new Set(tokensA), setB = new Set(tokensB);
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    setA.forEach(t => { if (setB.has(t)) intersection++; });
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

export function normalizeProductName(name) {
    return (name || '').trim().toLowerCase();
}

// Scores every ticket that has a description against the given (productName, description) pair.
// Same-product matches get a flat bonus since two claims on the identical machine are relevant
// even with fairly different wording; text overlap alone still surfaces cross-model patterns.
export function findSimilarClaims(tickets, productName, description, excludeId, { limit = 5, minScore = 0.12 } = {}) {
    const descTokens = tokenize(description);
    if (descTokens.length === 0) return [];
    const normProduct = normalizeProductName(productName);
    return tickets
        .filter(t => t.id !== excludeId && t.issueDescription)
        .map(t => {
            const sameProduct = normalizeProductName(t.productName) === normProduct && normProduct !== '';
            const score = jaccardSimilarity(descTokens, tokenize(t.issueDescription)) + (sameProduct ? 0.15 : 0);
            return { ticket: t, score, sameProduct };
        })
        .filter(x => x.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
