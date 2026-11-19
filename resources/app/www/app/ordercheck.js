// "Check this one" on a bot order (owner, 19 Nov 2026, idea 6): the things worth a second look
// before shipping something the Instagram bot wrote down. Pure: no Firestore, no DOM.
// Only orders the bot made, and only while they're still open.

const OPEN = new Set(['New Lead', 'Ordered', 'Pending', 'Processing']);
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ç/g, 'c').replace(/ë/g, 'e');

// Albania's municipalities and their main towns, plus the areas people write instead of the city
// (Tirana and Durrës neighbourhoods, coastal places). Spelled without ë/ç, as customers type.
const PLACES = ['tirane', 'tirana', 'durres', 'vlore', 'vlora', 'shkoder', 'shkodra', 'elbasan', 'fier', 'korce', 'korca', 'berat',
    'lushnje', 'kavaje', 'gjirokaster', 'lezhe', 'kukes', 'pogradec', 'diber', 'peshkopi', 'sarande', 'kamez', 'vore', 'kruje', 'shijak',
    'lac', 'kurbin', 'mamurras', 'rrogozhine', 'peqin', 'cerrik', 'belsh', 'gramsh', 'librazhd', 'prrenjas', 'bulqize', 'burrel', 'mat',
    'klos', 'rreshen', 'mirdite', 'puke', 'fushe-arrez', 'fushe arrez', 'vau i dejes', 'koplik', 'malesi e madhe', 'bajram curri', 'tropoje',
    'krume', 'has', 'kucove', 'ura vajgurore', 'polican', 'corovode', 'skrapar', 'permet', 'kelcyre', 'tepelene', 'memaliaj', 'libohove',
    'delvine', 'konispol', 'finiq', 'himare', 'dropull', 'erseke', 'kolonje', 'bilisht', 'devoll', 'maliq', 'pustec',
    'patos', 'roskovec', 'ballsh', 'mallakaster', 'selenice', 'divjake', 'orikum', 'radhime', 'golem', 'sukth', 'manez', 'rrashbull',
    'kashar', 'paskuqan', 'farke', 'sauk', 'yzberisht', 'dajt', 'petrele', 'baldushk', 'zall herr', 'ndroq', 'berxull', 'babrru',
    'laprake', 'kombinat', 'selite', 'ali dem', 'don bosko', 'bllok', 'astir', 'fresk', 'porcelan', 'myslym shyri', 'xhamlliku',
    'komuna e parisit', '21 dhjetori', 'medrese', 'tufine', 'currila', 'shkozet', 'plazh', 'shkembi i kavajes', 'skele', 'uji i ftohte',
    'qender', 'qendra', 'velipoje', 'shengjin', 'ksamil', 'dhermi', 'lukove', 'qafe mali', 'gjader', 'bushat', 'vaqarr', 'preze'];
const KOSOVO = ['prishtine', 'prishtina', 'pristina', 'prizren', 'peje', 'gjakove', 'ferizaj', 'mitrovice', 'gjilan', 'podujeve',
    'vushtrri', 'suhareke', 'rahovec', 'drenas', 'lipjan', 'malisheve', 'kamenice', 'decan', 'istog', 'kline', 'skenderaj', 'kosove', 'kosovo'];
const has = (text, words) => words.some(w => new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, '[-\\s]?')}([^a-z]|$)`).test(text));

const digits = s => String(s || '').replace(/\D/g, '');
// An Albanian mobile: 06x xxx xxxx, or 355 6x xxx xxxx.
export const albanianMobile = phone => /^(?:355|0)?6[6-9]\d{7}$/.test(digits(phone).replace(/^00/, ''));

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

// [{k, text}] - empty when nothing looks off. orderTime(o) -> ms, passed in.
export function orderChecks(o, orders = [], orderTime = x => Number(x.timestamp) || 0) {
    if (!o || o.source !== 'Instagram Chatbot' || !OPEN.has(o.status || 'Ordered')) return [];
    const out = [];
    const name = String(o.clientName || '').trim();
    if (name.split(/\s+/).filter(Boolean).length < 2) out.push({ k: 'name', text: 'only one name' });
    const addr = fold(o.address || o.deliveryAddress || '');
    if (!addr) out.push({ k: 'address', text: 'no address' });
    else if (has(addr, KOSOVO)) out.push({ k: 'kosovo', text: 'Kosovo address - you don’t deliver there' });
    else if (!has(addr, PLACES)) out.push({ k: 'town', text: 'no town found in the address' });
    const phone = o.telephone || o.phoneNumber || '';
    if (!phone) out.push({ k: 'phone', text: 'no phone number' });
    else if (!albanianMobile(phone)) out.push({ k: 'phone', text: 'the phone doesn’t look like an Albanian mobile' });
    const items = o.items || [];
    if (!items.length || items.some(i => !i.id || i.name === '00')) out.push({ k: 'item', text: 'a product to fill in' });
    const t = orderTime(o), key = digits(phone).slice(-8);
    const twin = orders.find(x => x !== o && x._id !== o._id && sameDay(orderTime(x), t)
        && ((o.instagramId && x.instagramId === o.instagramId) || (key && digits(x.telephone || x.phoneNumber).slice(-8) === key)));
    if (twin) out.push({ k: 'twice', text: 'a second order from the same person today' });
    return out;
}

// Prices the shop agreed in the chat that differ from the catalogue: [{name, price, catalogPrice}].
export const agreedPrices = o => (o.items || []).filter(i => i.catalogPrice !== undefined && Number(i.catalogPrice) !== Number(i.price))
    .map(i => ({ name: i.name, price: Number(i.price) || 0, catalogPrice: Number(i.catalogPrice) || 0 }));
