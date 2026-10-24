// Selling prices: what a product should cost on the shelf, worked out from what it costs, what the
// shop costs to run, how it has sold and how much people want it.
//
// Only suggestions. A price changes when the owner clicks: Stock › Prices, Receive delivery (a
// new delivery's cost) and the product drawer use these. Every step is kept, so the screens can
// say why a price is suggested.
//
// What the October 2026 study of the sales showed (the figures stay out of this public repository;
// Stock › Prices shows them), and why the rules look like this:
// - the running costs take a large share of a 2026 month's sales, so a sale has to keep a good
//   part of its price before it makes any profit;
// - margins differ a lot by kind of product (detergents and supplies far above machines), so a new
//   product starts from what similar products carry, not one markup for everything;
// - EasyPOS often charges less than today's price, so a price has to stay above the floor after
//   the discount the product usually gets;
// - more than half the catalogue has not sold for half a year, most of it priced like its peers:
//   cutting all of it says nothing. Only what is priced above similar products is suggested a
//   lower price; deeper cuts belong to the clearance planner (Insights › Stock).
import { VAT, DAY, RESTOCK_DAYS, salesLedger, productNetCost, productFamily, recurringFor, toMs } from './data.js';

export const MIN_PROFIT_DEFAULT = 0.10;    // profit left after the goods and the running costs, share of the net price
const SIMILAR_MIN = 3;                     // fewer similar products than this is no guide
const DEMAND_RAISE = 0.05;                 // a product that sells well at full price: up to +5%
const SLOW_CUT = 0.10;                     // a product priced above its peers that has stood still: up to -10%
const SLOW_DAYS = 183;
const SLOW_MIN_VALUE = 100;                // stock worth less than this at cost isn't worth a new label
const MAX_DISCOUNT_ALLOWED = 0.15;         // a deeper usual discount is a question for the owner, not a reason to lift the price
const KEEP_BELOW = 0.02;                   // a change under 2% is not worth a new shelf label
const WANTED_ASKS = 5;                     // chatbot questions in 6 months that count as "people want it"
const SETTLE_DAYS = 60;                    // after a price change, sales at the new price come before the next raise or cut

const r2 = n => Math.round(n * 100) / 100;
const median = list => { const s = list.filter(v => v !== null && v !== undefined && !isNaN(v)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const marginOf = (net, cost) => net > 0 && cost > 0 ? (net - cost) / net : null;
const pct = v => `${Math.round(v * 100)}%`;
// €1,850 for whole euros, €12.50 otherwise - as the screens write prices.
const eu = v => { const x = r2(v); return '€' + x.toLocaleString('en-US', Number.isInteger(x) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const longDay = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// The shop's own way of writing prices (VAT included): under €10 in halves, whole euros up to
// €100, then fives, tens from €300 and fifties from €1,000 - never more than ~2.5% off.
// `how`: 'near' (nearest), 'down' (a raise never overshoots), 'up' (a cut never overshoots).
// Never below `atLeast`.
const STEPS = [[10, 0.5], [100, 1], [300, 5], [1000, 10], [Infinity, 50]];
const stepFor = v => STEPS.find(([hi]) => v < hi)[1];
export function roundPrice(v, atLeast = 0, how = 'near') {
    if (!(v > 0)) return 0;
    const st = stepFor(v), x = v / st;
    let r = (how === 'down' ? Math.floor(x + 1e-9) : how === 'up' ? Math.ceil(x - 1e-9) : Math.round(x)) * st;
    if (r < atLeast - 0.004) r = Math.ceil(atLeast / stepFor(atLeast) - 1e-9) * stepFor(atLeast);
    return r2(Math.max(r, st));
}

// ------------------------------------------------------------------ what the shop and each product look like

// The product's price changes, oldest first (priceHistory, written by every price change in the app).
const historyOf = p => (Array.isArray(p.priceHistory) ? p.priceHistory : []).filter(h => Number(h.at) > 0).sort((a, b) => a.at - b.at);
// Its price on a day: a sale is compared with the price it had then, not today's - else every
// raise would make the sales before it look discounted, and lift the next suggestion again.
function priceOn(p, history, t) {
    if (!history.length) return Number(p.price) || 0;
    let price = Number(history[0].was) || Number(history[0].price) || 0;
    for (const h of history) { if (h.at <= t) price = Number(h.price) || price; else break; }
    return price;
}

// Worked out once per data load: running costs against sales, the floors every price must clear,
// and each product's and each family's sales. `a` is analyze(m); m.pricing comes from
// settings/pricing (Settings › General).
export function pricingBasis(m, a, now = a.now) {
    if (m._pricing && m._pricing.now === now) return m._pricing;
    const L = salesLedger(m);
    const d = new Date(now);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const halfYearAgo = new Date(d.getFullYear(), d.getMonth() - 6, 1).getTime();

    // Sales per month, net of VAT and refunds: this year's whole months - 2026 is the baseline,
    // not 2025, which sold three times as much (owner, 22 Sep 2026). Early in a year, when fewer
    // than six months are whole, the last twelve whole months instead.
    const yearStart = new Date(d.getFullYear(), 0, 1).getTime();
    const months = d.getMonth() >= 6 ? d.getMonth() : 12;
    const from = d.getMonth() >= 6 ? yearStart : new Date(d.getFullYear(), d.getMonth() - 12, 1).getTime();
    const inRange = t => t >= from && t < monthStart;
    const salesNet = L.sales.filter(s => inRange(s.t)).reduce((x, s) => x + s.net, 0) + L.orders.filter(o => inRange(o.t)).reduce((x, o) => x + o.net, 0);
    const revenueMonthly = salesNet / months;
    // Running costs per month: what repeats now, plus the one-off expenses of the last six months
    // spread over them. Older one-offs are left out: rent was paid that way before it became a
    // repeating cost (Sep 2026).
    const repeating = recurringFor(m, monthStart).reduce((x, r) => x + (Number(r.amount) || 0), 0);
    const oneOffs = (m.expenses || []).filter(e => { const t = toMs(e.date) || toMs(e.createdAt); return t >= halfYearAgo && t < monthStart; })
        .reduce((x, e) => x + (Number(e.amount) || 0), 0) / 6;
    const runningMonthly = repeating + oneOffs;
    const overhead = revenueMonthly > 0 ? Math.min(0.5, runningMonthly / revenueMonthly) : 0;
    const minProfit = m.pricing && m.pricing.minProfitPct !== undefined && Number(m.pricing.minProfitPct) >= 0 ? Number(m.pricing.minProfitPct) / 100 : MIN_PROFIT_DEFAULT;
    const floorMargin = Math.min(0.7, overhead + minProfit);

    // Each product's last 12 months: units (refunds off), the last 90 days against the 90 before,
    // and what each sale really charged against today's price.
    const since12 = now - 365 * DAY, since90 = now - 90 * DAY, since180 = now - 180 * DAY;
    const byId = new Map(m.products.map(p => [p._id, p]));
    const histories = new Map(m.products.map(p => [p._id, historyOf(p)]));
    const byProduct = new Map();
    let costedNet = 0, costedCost = 0;
    L.lines.forEach(l => {
        if (l.t < since12 || !l.pid || l.isService || l.pre) return;
        const p = byId.get(l.pid); if (!p) return;
        const x = byProduct.get(l.pid) || { units12: 0, units90: 0, unitsPrev90: 0, lines: 0, ratios: [] };
        x.units12 += l.qty;
        if (l.t >= since90) x.units90 += l.qty; else if (l.t >= since180) x.unitsPrev90 += l.qty;
        const list = priceOn(p, histories.get(l.pid), l.t) / VAT;
        if (!l.refund && l.qty > 0) { x.lines++; if (list > 0) x.ratios.push((l.net / l.qty) / list); }
        if (l.cost !== null) { costedNet += l.net; costedCost += l.cost; }
        byProduct.set(l.pid, x);
    });
    byProduct.forEach(x => { x.ratio = x.ratios.length >= 3 ? median(x.ratios) : null; });

    // Each family's products with a price and a cost: what margin their prices carry, and the
    // discount they usually get.
    const families = new Map();
    m.products.forEach(p => {
        const cost = productNetCost(p), list = (Number(p.price) || 0) / VAT;
        if (!cost || !list) return;
        const fam = productFamily(p.name);
        const f = families.get(fam) || { products: [], ratios: [] };
        const s = byProduct.get(p._id);
        f.products.push({ id: p._id, cost, margin: marginOf(list, cost), sold: s ? s.units12 > 0 : false });
        if (s && s.ratios.length >= 2) f.ratios.push(median(s.ratios));
        families.set(fam, f);
    });
    families.forEach(f => { f.ratio = f.ratios.length >= 3 ? median(f.ratios) : null; });
    const shopListMargin = median([...families.values()].flatMap(f => f.products.filter(x => x.sold).map(x => x.margin)));

    return (m._pricing = {
        now, months, revenueMonthly, runningMonthly, repeating, oneOffs, overhead, minProfit, floorMargin,
        shopMargin: costedNet > 0 ? (costedNet - costedCost) / costedNet : null, shopListMargin,
        byProduct, families, a, ledger: L, kept: (m.pricing && m.pricing.kept) || {}
    });
}

// The margin a product should carry by its peers: products of the same kind at a similar cost
// (half to twice as much), preferring the ones that sell; then the whole family; then the shop.
export function similarMargin(basis, family, cost, exceptId = null) {
    const f = basis.families.get(family);
    const pool = f ? f.products.filter(x => x.id !== exceptId && x.margin !== null && x.margin > 0) : [];
    const near = pool.filter(x => x.cost >= cost / 2 && x.cost <= cost * 2);
    const tries = [
        [near.filter(x => x.sold), 'similar'], [near, 'similar'],
        [pool.filter(x => x.sold), 'family'], [pool, 'family']
    ];
    for (const [list, how] of tries) if (list.length >= SIMILAR_MIN) {
        const costs = list.map(x => x.cost);
        return { margin: median(list.map(x => x.margin)), n: list.length, how, lo: Math.min(...costs), hi: Math.max(...costs) };
    }
    return { margin: basis.shopListMargin ?? 0.4, n: 0, how: 'shop' };
}
const peersText = (sim, family) => sim.how === 'shop' ? `the shop's usual ${pct(sim.margin)}`
    : `${sim.n} ${family.toLowerCase()}${sim.how === 'similar' ? ` at a similar cost (${eu(Math.round(sim.lo))}–${eu(Math.round(sim.hi))})` : ''}: ${pct(sim.margin)}`;

// ------------------------------------------------------------------ one price

// A suggested shelf price (VAT included) and why.
//   product  the catalogue product, or null for a new one
//   cost     the unit cost to price from, net of VAT (a delivery's landed cost, or today's)
//   name     the name, for a new product (its family)
//   asked    chatbot questions about its model in the last 6 months, or null when not known
export function suggestPrice(basis, { product = null, cost, name = '', asked = null }) {
    if (!(cost > 0)) return null;
    const steps = [];
    const family = productFamily(product ? product.name : name);
    const current = product ? Number(product.price) || 0 : 0;
    const oldCost = product ? productNetCost(product) : null;
    const s = product ? basis.byProduct.get(product._id) : null;
    const sim = similarMargin(basis, family, cost, product && product._id);
    let net;

    // 1. Where it starts: today's price carried to the new cost, or what similar products carry.
    if (current > 0) {
        net = current / VAT;
        if (oldCost && cost > oldCost * 1.005) {
            net = net * cost / oldCost;
            steps.push({ key: 'cost', net, text: `Cost up ${pct(cost / oldCost - 1)} (${eu(oldCost)} → ${eu(cost)}): the price goes up with it, so it keeps its ${pct(marginOf(current / VAT, oldCost))} margin.` });
        } else steps.push({ key: 'start', net, text: `Today's price, ${eu(current)}: a ${pct(marginOf(net, cost))} margin on ${oldCost && cost < oldCost * 0.995 ? `the new, lower cost (${eu(oldCost)} → ${eu(cost)})` : 'its cost'}.` });
    } else {
        const margin = Math.min(0.8, Math.max(sim.margin, basis.floorMargin));
        net = cost / (1 - margin);
        steps.push({ key: 'similar', net, text: `Priced like its peers - ${peersText(sim, family)} margin on their price.` });
    }

    // 2. Demand: sells well at full price, or people keep asking for it -> a little more; priced
    //    above its peers and standing still for half a year -> a little less.
    const stock = product ? Number(product.stock) || 0 : 0;
    const last = product ? basis.a.lastSoldAt[product._id] || 0 : 0;
    const created = product ? toMs(product.createdAt) : NaN;
    const fullPrice = s && (s.ratio === null ? s.ratios.length > 0 && Math.min(...s.ratios) >= 0.97 : s.ratio >= 0.97);
    const fast = s && s.units90 >= 3 && fullPrice;
    const rising = s && s.units90 >= 3 && s.units90 >= 1.5 * Math.max(1, s.unitsPrev90);
    const wanted = asked !== null && asked >= WANTED_ASKS && (!product || (s && s.units12 >= 2 && (s.ratio === null || s.ratio >= 0.95)));
    const cover = s && s.units90 > 0 ? stock / (s.units90 / 90) : Infinity;
    const standing = product && stock > 0 && (last ? basis.now - last > SLOW_DAYS * DAY : !(created > basis.now - SLOW_DAYS * DAY));
    // Changed lately: wait for sales at the new price before raising or cutting it again.
    const changed = product ? historyOf(product).pop() : null;
    const settling = changed && basis.now - changed.at < SETTLE_DAYS * DAY;
    const myMargin = marginOf(net, cost);
    const abovePeers = sim.how !== 'shop' && myMargin !== null && myMargin > sim.margin + 0.05;
    let demand = null;
    if (settling && (fast || wanted || standing)) {
        steps.push({ key: 'settling', net, text: `Changed ${longDay(changed.at)} (${eu(Number(changed.was) || 0)} → ${eu(Number(changed.price) || 0)}): no more change for demand until it has sold ${SETTLE_DAYS} days at that price.` });
    } else if (fast || wanted) {
        net *= 1 + DEMAND_RAISE; demand = 'up';
        const why = [fast ? `${s.units90} sold in the last 90 days at full price` : '', rising ? `up from ${s.unitsPrev90} the 90 days before` : '',
            wanted ? `${asked} chatbot questions in 6 months` : '', fast && cover < RESTOCK_DAYS ? `the stock lasts ${Math.max(0, Math.round(cover))} days` : ''].filter(Boolean).join(', ');
        steps.push({ key: 'demand', net, text: `Wanted (${why}): up to +${pct(DEMAND_RAISE)}.` });
    } else if (standing && abovePeers && stock * cost >= SLOW_MIN_VALUE) {
        const peerNet = cost / (1 - sim.margin);
        net = Math.max(peerNet, net * (1 - SLOW_CUT)); demand = 'down';
        steps.push({ key: 'slow', net, text: `${last ? `No sale since ${longDay(last)}` : 'Never sold'}, ${stock} in stock (${eu(Math.round(stock * cost))} at cost), and priced above its peers (${peersText(sim, family)}; this one ${pct(myMargin)}): a little less to get it moving.` });
    }

    // 3. The floors: a sale must pay for the goods and its share of the running costs (else it
    //    loses money), and should leave the profit asked for - after the discount this product
    //    (or its family) usually gets.
    const famRatio = (basis.families.get(family) || {}).ratio;
    const ratio = s && s.ratio !== null ? s.ratio : famRatio ?? null;
    const allowance = ratio !== null && ratio < 0.98 ? Math.max(1 - MAX_DISCOUNT_ALLOWED, ratio) : 1;
    const breakEvenNet = cost / (1 - basis.overhead) / allowance;
    const floorNet = cost / (1 - basis.floorMargin) / allowance;
    const floor = roundPrice(floorNet * VAT, floorNet * VAT);
    const afterDiscount = allowance < 1 ? `, after the usual ${pct(1 - allowance)} discount` : '';
    if (net < floorNet) {
        const loses = net < breakEvenNet * 0.995;
        steps.push({ key: loses ? 'floor' : 'thin', net: floorNet, text: loses
            ? `Loses money once running costs are paid: a sale has to bring in at least ${eu(roundPrice(breakEvenNet * VAT))} to pay the cost and its ${pct(basis.overhead)} share of running costs${afterDiscount}. ${eu(floor)} also leaves ${pct(basis.minProfit)} profit.`
            : `Profit too thin: it pays its ${pct(basis.overhead)} share of running costs but leaves under ${pct(basis.minProfit)} profit${afterDiscount}. ${eu(floor)} leaves ${pct(basis.minProfit)}.` });
        net = floorNet;
    }

    // 4. Rounded the way the shop writes prices, never below the floor. A demand raise rounds
    //    down and a cut rounds up, so neither goes further than meant.
    const lifted = steps.some(x => ['cost', 'floor', 'thin'].includes(x.key));
    let price = roundPrice(net * VAT, floor, lifted || !demand ? 'near' : demand === 'up' ? 'down' : 'up');
    let kind = current > 0 ? (price > current ? 'raise' : 'lower') : 'new';
    // Nothing but rounding (€15.54 → €16), or under 2%: not worth a new label.
    if (current > 0 && (Math.abs(price - current) / current < KEEP_BELOW || !steps.some(x => x.key !== 'start' && x.key !== 'settling'))) { price = current; kind = 'keep'; }
    // Only a product that stands still is offered a lower price - never one that just rounds down.
    if (kind === 'lower' && demand !== 'down') { price = current; kind = 'keep'; }
    const reason = kind === 'keep' ? 'keep' : ['floor', 'cost', 'thin', 'demand', 'slow', 'similar'].find(k => steps.some(x => x.key === k)) || 'keep';
    return {
        price, net: r2(price / VAT), margin: marginOf(price / VAT, cost), current, change: current > 0 ? (price - current) / current : null,
        currentMargin: current > 0 ? marginOf(current / VAT, cost) : null, floor, breakEven: roundPrice(breakEvenNet * VAT), kind, reason, steps, family, cost,
        discount: ratio !== null && ratio < 0.98 ? 1 - ratio : 0, units12: s ? s.units12 : 0, units90: s ? s.units90 : 0, asked, peers: sim
    };
}

// ------------------------------------------------------------------ the whole catalogue

export const REASONS = {
    floor: ['Loses money', 'bad'],
    check: ['Check the data', 'bad'],
    cost: ['Cost went up', 'warn'],
    thin: ['Profit too thin', 'warn'],
    demand: ['Sells well', 'ok'],
    slow: ['Not selling', ''],
    similar: ['No price yet', 'vio']
};

// Stock › Prices: every product whose price should change, worst first. `asked` maps product id
// to its chatbot questions (askedByProduct; empty until the chatbot log is read). A suggestion the
// owner chose to keep stays hidden until it changes.
export function priceReview(basis, products, asked = new Map()) {
    const rows = [];
    let noCost = 0;
    products.forEach(p => {
        const cost = productNetCost(p);
        if (!cost) { noCost++; return; }
        const q = asked.get(p._id);
        const sug = suggestPrice(basis, { product: p, cost, asked: q ? q.questions_6m : null });
        if (!sug || sug.kind === 'keep') return;
        // A price far under its cost is a typing error in one of the two (a hose priced at a fifth of its cost),
        // not a price to lift tenfold: say so instead.
        if (sug.current > 0 && sug.current / VAT < cost * 0.6) {
            sug.reason = 'check';
            sug.steps = [{ key: 'check', net: sug.net, text: `The cost (${eu(cost)}, net) is ${Math.round(cost / (sug.current / VAT))} times the price (${eu(sug.current)} incl. VAT): one of them is probably wrong. Check the cost on its last invoice first; ${eu(sug.price)} is what the cost, if right, needs.` }];
        }
        const kept = basis.kept[p._id];
        rows.push({ p, ...sug, hidden: kept !== undefined && Math.abs(Number(kept) - sug.price) < 0.01,
            // What the change is worth over a year at last year's pace, net of VAT.
            yearEffect: (sug.price - sug.current) / VAT * Math.max(sug.units12, 0) });
    });
    const order = { floor: 0, check: 1, cost: 2, thin: 3, demand: 4, slow: 5, similar: 6 };
    rows.sort((x, y) => order[x.reason] - order[y.reason] || Math.abs(y.yearEffect) - Math.abs(x.yearEffect) || y.current - x.current);
    return { rows, noCost };
}

// Price changes made in the app (products.priceHistory), each with how it sold in the days
// before and after - so a raise that stopped the sales shows.
export function priceChanges(basis, products, limit = 20) {
    const out = [];
    products.forEach(p => (Array.isArray(p.priceHistory) ? p.priceHistory : []).forEach(h => {
        const at = Number(h.at); if (!at) return;
        out.push({ p, at, price: Number(h.price) || 0, was: Number(h.was) || 0, why: h.why || '' });
    }));
    out.sort((a, b) => b.at - a.at);
    // Units in the days since the change, against as many days just before it (at most 90).
    return out.slice(0, limit).map(c => {
        const days = Math.max(1, Math.min(90, Math.floor((basis.now - c.at) / DAY)));
        const units = (from, to) => basis.ledger.lines.filter(l => l.pid === c.p._id && l.t >= from && l.t < to && !l.isService).reduce((x, l) => x + l.qty, 0);
        return { ...c, days, after: units(c.at, c.at + days * DAY), before: units(c.at - days * DAY, c.at) };
    });
}

// The price-history entry every price change writes (products.priceHistory, arrayUnion).
export const historyEntry = (price, was, why) => ({ price: r2(price), was: r2(Number(was) || 0), at: Date.now(), why: String(why || '').slice(0, 120) });
