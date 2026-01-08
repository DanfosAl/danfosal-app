// Advanced Analytics Engine
class AdvancedAnalytics {
    constructor(db) {
        this.db = db;
        this.orders = [];
        this.products = [];
        this.initialized = false;
    }

    async initialize() {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        
        // Fetch ALL orders (both online and store sales)
        const [onlineOrdersSnap, storeSalesSnap, productsSnap] = await Promise.all([
            getDocs(collection(this.db, 'onlineOrders')),
            getDocs(collection(this.db, 'storeSales')),
            getDocs(collection(this.db, 'products'))
        ]);
        
        // Documents already have 1 item each from import - no flattening needed
        const onlineOrders = onlineOrdersSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: 'online' }));
        const storeSales = storeSalesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: 'store' }));
        this.orders = [...onlineOrders, ...storeSales];
        
        // Fetch products
        this.products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Create product lookup map for performance
        this.productMap = new Map();
        this.products.forEach(p => {
            this.productMap.set(p.name, p);
            if (p.code) this.productMap.set(p.code, p);
        });
        
        console.log(`Loaded ${this.orders.length} total orders (${onlineOrders.length} online, ${storeSales.length} store) and ${this.products.length} products`);
        
        this.initialized = true;
        return this;
    }

    async init(orders, products) {
        this.orders = orders;
        this.products = products;
        this.initialized = true;
    }

    // 1. Profit Margin Analysis
    calculateProfitMargins() {
        if (!Array.isArray(this.products)) {
            return [];
        }
        
        const margins = [];
        
        this.products.forEach(product => {
            const cost = parseFloat(product.cost) || 0;
            const price = parseFloat(product.price) || 0;
            const margin = price - cost;
            const marginPercent = cost > 0 ? ((margin / cost) * 100) : 0;
            
            // Exclude replacements (0% margin)
            if (marginPercent === 0) {
                return;
            }
            
            margins.push({
                name: product.name,
                cost: cost,
                price: price,
                profit: margin,
                marginPercent: marginPercent,
                rating: this.categorizeMargin(marginPercent)
            });
        });

        return margins;
    }

    categorizeMargin(percent) {
        if (percent < 20) return 'Low';
        if (percent < 50) return 'Medium';
        if (percent < 100) return 'Good';
        return 'Excellent';
    }

    // 2. Product Performance Analysis
    analyzeProductPerformance() {
        if (!Array.isArray(this.orders)) {
            return [];
        }
        
        const performance = {};
        
        this.orders.forEach(order => {
            // Skip cancelled/returned orders
            if (order.status === 'Returned' || order.status === 'Cancelled') {
                return;
            }
            
            if (order.items) {
                order.items.forEach(item => {
                    if (!performance[item.name]) {
                        performance[item.name] = {
                            name: item.name,
                            unitsSold: 0,
                            revenue: 0,
                            cost: 0,
                            profit: 0,
                            orders: 0
                        };
                    }
                    
                    const quantity = parseInt(item.quantity) || 0;
                    const price = parseFloat(item.price) || 0;
                    
                    // Get product cost from products database
                    let cost = parseFloat(item.cost) || 0;
                    if (cost === 0 && this.productMap) {
                        const product = this.productMap.get(item.name) || this.productMap.get(item.code);
                        if (product) {
                            cost = parseFloat(product.cost) || 0;
                        }
                    }
                    
                    performance[item.name].unitsSold += quantity;
                    performance[item.name].revenue += price * quantity;
                    performance[item.name].cost += cost * quantity;
                    performance[item.name].profit += (price - cost) * quantity;
                    performance[item.name].orders += 1;
                });
            }
        });

        // Sort by profit
        return Object.values(performance).sort((a, b) => b.profit - a.profit);
    }

    // 3. Customer Lifetime Value
    calculateCustomerLTV() {
        if (!Array.isArray(this.orders)) {
            return [];
        }
        
        const customers = {};
        
        this.orders.forEach(order => {
            // Skip invalid orders
            if (!order.clientName && !order.customerName) return;
            
            const customerName = order.clientName || order.customerName;
            
            if (!customers[customerName]) {
                customers[customerName] = {
                    name: customerName,
                    orders: 0,
                    totalSpent: 0,
                    averageOrder: 0,
                    firstOrder: order.timestamp,
                    lastOrder: order.timestamp,
                    status: order.status
                };
            }
            
            customers[customerName].orders += 1;
            // Use total for order amount, not price
            customers[customerName].totalSpent += parseFloat(order.total) || parseFloat(order.price) || 0;
            
            if (order.timestamp < customers[order.clientName].firstOrder) {
                customers[order.clientName].firstOrder = order.timestamp;
            }
            if (order.timestamp > customers[order.clientName].lastOrder) {
                customers[order.clientName].lastOrder = order.timestamp;
            }
        });

        // Calculate averages
        Object.values(customers).forEach(customer => {
            customer.averageOrder = customer.totalSpent / customer.orders;
            
            // Convert timestamp to milliseconds if it's a Firestore Timestamp
            let firstOrderTime = customer.firstOrder;
            if (typeof firstOrderTime === 'object' && firstOrderTime.toMillis) {
                firstOrderTime = firstOrderTime.toMillis();
            } else if (typeof firstOrderTime === 'object' && firstOrderTime.seconds) {
                firstOrderTime = firstOrderTime.seconds * 1000;
            }
            
            customer.daysSinceFirst = Math.floor(
                (Date.now() - firstOrderTime) / (1000 * 60 * 60 * 24)
            );
        });

        return Object.values(customers).sort((a, b) => b.totalSpent - a.totalSpent);
    }

    // 4. Sales Forecasting (Simple Linear Regression)
    forecastSales(days = 30) {
        if (!Array.isArray(this.orders)) {
            return { forecast: 0, growthRate: 0, confidence: 'Low' };
        }
        
        // Group orders by day
        const dailySales = {};
        
        this.orders.forEach(order => {
            if (order.timestamp && order.status !== 'Returned' && order.status !== 'Cancelled') {
                let date;
                if (order.timestamp.toDate) {
                    date = order.timestamp.toDate().toDateString();
                } else if (order.timestamp.seconds) {
                    date = new Date(order.timestamp.seconds * 1000).toDateString();
                } else {
                    date = new Date(order.timestamp).toDateString();
                }
                
                if (!dailySales[date]) {
                    dailySales[date] = 0;
                }
                // Use total for order amount
                dailySales[date] += parseFloat(order.total) || parseFloat(order.price) || 0;
            }
        });

        // Convert to array and sort
        const salesData = Object.entries(dailySales)
            .map(([date, amount]) => ({
                date: new Date(date),
                amount
            }))
            .sort((a, b) => a.date - b.date);

        if (salesData.length < 7) {
            return { forecast: 0, growthRate: 0, confidence: 'Low' }; // Need at least 7 days of data
        }

        // Calculate trend (simple moving average)
        const recentDays = salesData.slice(-30);
        const average = recentDays.reduce((sum, day) => sum + day.amount, 0) / recentDays.length;
        
        // Calculate growth rate
        const firstHalf = recentDays.slice(0, Math.floor(recentDays.length / 2));
        const secondHalf = recentDays.slice(Math.floor(recentDays.length / 2));
        
        const firstAvg = firstHalf.reduce((sum, day) => sum + day.amount, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, day) => sum + day.amount, 0) / secondHalf.length;
        
        const growthRate = (secondAvg - firstAvg) / firstAvg;

        // Forecast
        return {
            forecast: average * 30 * (1 + growthRate),
            growthRate: growthRate * 100,
            confidence: this.calculateConfidence(recentDays)
        };
    }

    calculateConfidence(data) {
        // Calculate standard deviation
        const mean = data.reduce((sum, day) => sum + day.amount, 0) / data.length;
        const variance = data.reduce((sum, day) => sum + Math.pow(day.amount - mean, 2), 0) / data.length;
        const stdDev = Math.sqrt(variance);
        
        // Lower standard deviation = higher confidence
        const coefficientOfVariation = stdDev / mean;
        
        if (coefficientOfVariation < 0.2) return 'High';
        if (coefficientOfVariation < 0.5) return 'Medium';
        return 'Low';
    }

    // 5. Peak Hours Analysis
    analyzePeakHours() {
        if (!Array.isArray(this.orders)) {
            return [];
        }
        
        const hourlyOrders = new Array(24).fill(0);
        const hourlyRevenue = new Array(24).fill(0);
        
        this.orders.forEach(order => {
            // Skip cancelled/returned orders
            if (order.status === 'Cancelled' || order.status === 'Returned') {
                return;
            }
            
            // Only count orders with REAL timestamps (not just dates)
            if (!order.timestamp) return;
            
            // Check if order has real timestamp flag
            // hasRealTimestamp is set during import if 'Koha e Krijimit' column has data
            // For non-imported orders (source !== 'imported'), always include them
            const hasRealTime = (order.source !== 'imported') || (order.hasRealTimestamp === true);
            
            if (!hasRealTime) return; // Skip orders without real timestamps
            
            // Parse timestamp and get hour
            let date;
            if (order.timestamp.toDate) {
                date = order.timestamp.toDate();
            } else if (order.timestamp.seconds) {
                date = new Date(order.timestamp.seconds * 1000);
            } else {
                date = new Date(order.timestamp);
            }
            
            const hour = date.getHours();
            const minutes = date.getMinutes();
            const seconds = date.getSeconds();
            
            // Extra check: Even if hasRealTimestamp flag is set, verify time is not 00:00:00
            // This catches any edge cases where timestamp exists but is midnight
            if (hour === 0 && minutes === 0 && seconds === 0) return;
            
            if (hour >= 0 && hour < 24) {
                hourlyOrders[hour]++;
                hourlyRevenue[hour] += parseFloat(order.total) || 0;
            }
        });

        const peakHour = hourlyOrders.indexOf(Math.max(...hourlyOrders));
        const peakRevenue = hourlyRevenue.indexOf(Math.max(...hourlyRevenue));

        // Return as array for easy rendering
        return hourlyOrders.map((orders, hour) => ({
            hour,
            orders,
            revenue: hourlyRevenue[hour]
        }));
    }

    // 6. Geographic Analysis
    analyzeGeographic() {
        if (!Array.isArray(this.orders)) {
            return [];
        }
        
        const cities = {};
        
        this.orders.forEach(order => {
            // Skip cancelled/returned orders
            if (order.status === 'Cancelled' || order.status === 'Returned') {
                return;
            }
            
            let city = 'Unknown';
            
            // First try to get city from city field (imported orders)
            if (order.city && order.city.trim() !== '') {
                city = order.city.trim();
            }
            // Fallback to extracting from address
            else if (order.address || order.deliveryAddress) {
                const address = (order.address || order.deliveryAddress).toLowerCase().trim();
                
                // Expanded list of Albanian cities and common variations (80+ variations)
                const cityVariations = {
                    'Tirana': ['tirana', 'tirane', 'tiranes', 'tiranë', 'tiranës', 'tr', 'tir', 'capital', 'kryeqytet'],
                    'Durres': ['durres', 'durrës', 'durresit', 'durrësi', 'durr', 'dr', 'durrazzo'],
                    'Vlore': ['vlore', 'vlorë', 'vlores', 'vlorës', 'vlora', 'vl', 'valona'],
                    'Elbasan': ['elbasan', 'elbasanit', 'elbasani', 'elbas', 'el'],
                    'Shkoder': ['shkoder', 'shkodër', 'shkodres', 'shkodra', 'shkodër', 'shkod', 'sh', 'scutari'],
                    'Fier': ['fier', 'fieri', 'fierit', 'fi'],
                    'Korce': ['korce', 'korcë', 'korçë', 'korces', 'korça', 'korç', 'kc', 'korça'],
                    'Berat': ['berat', 'berati', 'beratit', 'ber', 'br'],
                    'Lushnje': ['lushnje', 'lushnjë', 'lushnja', 'lushnjes', 'lushnjës', 'lush', 'lu'],
                    'Kavaje': ['kavaje', 'kavajë', 'kavaja', 'kavajas', 'kavajës', 'kav', 'ka'],
                    'Kamze': ['kamze', 'kamëz', 'kamza', 'kamez', 'kamëza', 'kam'],
                    'Gjirokaster': ['gjirokaster', 'gjirokastër', 'gjirokastre', 'gjirokastra', 'gjiro', 'gj', 'argyrokastro'],
                    'Sarande': ['sarand', 'sarandë', 'saranda', 'sarande', 'sarandës', 'sar'],
                    'Kukes': ['kukes', 'kukës', 'kukesi', 'kukësi', 'kuk', 'kk'],
                    'Lac': ['lac', 'laç', 'laci', 'laçi', 'laqi'],
                    'Pogradec': ['pogradec', 'pogradeci', 'pograd', 'pg'],
                    'Permet': ['permet', 'përmeti', 'përmet', 'perm', 'pr'],
                    'Kruje': ['kruje', 'krujë', 'kruja', 'krujes', 'krujës', 'kruj'],
                    'Lezhe': ['lezhe', 'lezhë', 'lezha', 'lezhes', 'lezhës', 'lezh', 'le'],
                    'Fushe-Kruje': ['fushe', 'fushë', 'fushe-kruje', 'fushë-krujë', 'fushe kruje', 'fk'],
                    'Vore': ['vore', 'vorë', 'vora', 'vorës'],
                    'Kashar': ['kashar', 'kashara', 'kashari'],
                    'Shijak': ['shijak', 'shijaku', 'shij'],
                    'Patos': ['patos', 'patosi'],
                    'Peshkopi': ['peshkopi', 'peshkopia', 'pesh'],
                    'Burrel': ['burrel', 'burreli'],
                    'Corovode': ['corovode', 'çorovodë', 'corovoda', 'çorovod'],
                    'Tepelene': ['tepelene', 'tepelenë', 'tepelena', 'tepel'],
                    'Gramsh': ['gramsh', 'gramshi'],
                    'Bulqize': ['bulqize', 'bulqizë'],
                    'Rrogozhine': ['rrogozhine', 'rrogozhinë', 'rrogozhina', 'rrogozh'],
                    'Ballsh': ['ballsh', 'ballshi'],
                    'Mamurras': ['mamurras', 'mamurrasi', 'mamurr'],
                    'Librazhd': ['librazhd', 'librazhdi'],
                    'Erseke': ['erseke', 'ersekë'],
                    'Peqin': ['peqin', 'peqini'],
                    'Cerrik': ['cerrik', 'çerrik', 'cerriku', 'çerriku'],
                    'Divjake': ['divjake', 'divjakë'],
                    'Selenice': ['selenice', 'selenicë'],
                    'Rreshen': ['rreshen', 'rresheni'],
                    'Sukth': ['sukth', 'sukthi'],
                    'Paskuqan': ['paskuqan', 'paskuqani'],
                    'Bathore': ['bathore', 'bathores'],
                    'Farke': ['farke', 'farkë', 'farkes'],
                    'Peze': ['peze', 'pezë', 'pezes'],
                    'Ndroq': ['ndroq', 'ndroqi'],
                    'Preze': ['preze', 'prezë', 'prezes'],
                    'Dajt': ['dajt', 'dajti'],
                    'Zall-Herr': ['zall-herr', 'zall herr', 'zallherr', 'zall'],
                    'Zall-Bastar': ['zall-bastar', 'zall bastar', 'zallbastar'],
                    'Petrel': ['petrel', 'petroli', 'petrela'],
                    'Thumanë': ['thuman', 'thumanë', 'thumana', 'thumanës']
                };
                
                // First pass: Try exact/partial match with all variations
                for (const [mainCity, variations] of Object.entries(cityVariations)) {
                    for (const variant of variations) {
                        if (address.includes(variant)) {
                            city = mainCity;
                            break;
                        }
                    }
                    if (city !== 'Unknown') break;
                }
                
                // Second pass: Try pattern matching if still unknown
                if (city === 'Unknown') {
                    // Remove common address prefixes and clean up
                    const cleaned = address
                        .replace(/^rruga\s+/gi, '')
                        .replace(/^rr\.?\s*/gi, '')
                        .replace(/^lagjja\s+/gi, '')
                        .replace(/^lagj\.?\s*/gi, '')
                        .replace(/^qyteti\s+/gi, '')
                        .replace(/^qyt\.?\s*/gi, '')
                        .replace(/^zona\s+/gi, '')
                        .replace(/^zon\.?\s*/gi, '')
                        .replace(/\s+\d+.*$/g, '') // Remove street numbers and everything after
                        .trim();
                    
                    // Try comma-separated patterns
                    if (cleaned.includes(',')) {
                        const parts = cleaned.split(',').map(p => p.trim());
                        
                        // Check each part against city variations
                        for (const part of parts) {
                            for (const [mainCity, variations] of Object.entries(cityVariations)) {
                                if (variations.some(v => part === v || part.startsWith(v + ' ') || part.endsWith(' ' + v))) {
                                    city = mainCity;
                                    break;
                                }
                            }
                            if (city !== 'Unknown') break;
                        }
                    }
                    
                    // Try space-separated patterns (last word)
                    if (city === 'Unknown' && cleaned.includes(' ')) {
                        const words = cleaned.split(/\s+/);
                        const lastWord = words[words.length - 1];
                        const firstWord = words[0];
                        
                        // Check last word
                        for (const [mainCity, variations] of Object.entries(cityVariations)) {
                            if (variations.includes(lastWord) || variations.includes(firstWord)) {
                                city = mainCity;
                                break;
                            }
                        }
                    }
                }
                
                // Third pass: Tirana-specific patterns (most comprehensive)
                if (city === 'Unknown') {
                    const tiranaIndicators = [
                        // Major areas and neighborhoods
                        'blloku', 'kombinat', 'astir', 'myslym shyri', 'don bosko', 
                        'selite', 'fresku', 'sauk', 'medrese', '21 dhjetori',
                        'partizani', 'kalabria', 'komuna e parisit', 'station',
                        'pazari i ri', 'laprakë', 'laprak', 'liqen', 'artificial',
                        'yzberisht', 'linze', 'mezez', 'porcelan', 'kinostudio',
                        'casa', 'italia', 'qemal stafa', 'elbasani street', 'e elbasanit',
                        'sami frasheri', 'ibrahim rugova', 'zogu i zi', 'kavajes street',
                        'e kavajës', 'durresi street', 'e durrësit', '5 maji',
                        'tek', 'prane', 'afër', 'mall', 'qtu', 'teg', 'tek stacioni',
                        'tirana mall', 'city park', 'qendra', 'brryli', 'dinamo',
                        // Additional neighborhoods and areas
                        'kopshtit botanik', 'botanical garden', 'liqeni artificial',
                        'grand park', 'park i madh', 'nene tereza', 'mother teresa',
                        'rruga e elbasanit', 'unaza', 'ringjallja', 'sheshi wilson',
                        'wilson square', 'sheshi skenderbej', 'skanderbeg square',
                        'bulevardy', 'bulevardi', 'boulevard', 'rruga e kavajes',
                        'kavaja street', 'rruga e durresit', 'durres street',
                        'kompleksi', 'complex', 'pallatet', 'buildings', 'ndertesa',
                        'building', 'rezidenca', 'residence', 'vila', 'villa',
                        // Specific areas and landmarks
                        'akademia e arteve', 'academy of arts', 'teatri kombetar',
                        'national theater', 'opera', 'pallati i kultures',
                        'palace of culture', 'biblioteka kombetare', 'national library',
                        'universiteti', 'university', 'fakulteti', 'faculty',
                        'spitali universitar', 'university hospital', 'qsut',
                        'rogner', 'plaza', 'sheraton', 'maritim', 'hotel',
                        '21 dhjetori', 'ish blloku', 'former block', 'ekspozita',
                        'fair ground', 'pallati sportit', 'sports palace',
                        'stadiumi', 'stadium', 'dajti center', 'toptani',
                        // Streets and major roads
                        'bulevardi deshmoret e kombit', 'boulevard of martyrs',
                        'bulevardi zogu i pare', 'zog boulevard', 'rinia park',
                        'youth park', 'parku rinia', 'lana river', 'lumi lana',
                        'artificial lake', 'liqeni artificial', 'grand park mall',
                        'east gate', 'west gate', 'north gate', 'south gate',
                        // Districts and zones
                        'unit administrative', 'njesia administrative', 'lagje',
                        'neighborhood', 'mahalla', 'rrethi', 'district',
                        'zona', 'zone', 'sektor', 'sector', 'pjesa', 'part',
                        // Transport and infrastructure
                        'stacioni i autobusave', 'bus station', 'aeroporti',
                        'airport', 'hekurudha', 'railway', 'treni', 'train',
                        'metro', 'underground', 'nentoka', 'subway',
                        'termini', 'terminal', 'parking', 'garazh', 'garage',
                        // Shopping and business areas
                        'tregtare', 'commercial', 'biznes', 'business',
                        'zyre', 'office', 'qender tregtare', 'shopping center',
                        'market', 'treg', 'dyqan', 'shop', 'magazina', 'store',
                        'supermarket', 'hipermarket', 'mall', 'galeria',
                        // Residential areas
                        'banues', 'residential', 'apartament', 'apartment',
                        'shtepie', 'house', 'pallat', 'building', 'kompleks',
                        'complex', 'rezidencial', 'residential', 'vile', 'villas',
                        'kondominium', 'condominium', 'kooperative', 'cooperative'
                    ];
                    
                    for (const indicator of tiranaIndicators) {
                        if (address.includes(indicator)) {
                            city = 'Tirana';
                            break;
                        }
                    }
                }
                
                // Fourth pass: Ultra-aggressive fuzzy matching for remaining unknowns
                if (city === 'Unknown') {
                    // Try partial matches (at least 3 characters)
                    for (const [mainCity, variations] of Object.entries(cityVariations)) {
                        for (const variant of variations) {
                            if (variant.length >= 3) {
                                // Check if address contains variant as a word boundary
                                const regex = new RegExp('\\b' + variant + '\\w*', 'i');
                                if (regex.test(address)) {
                                    city = mainCity;
                                    break;
                                }
                            }
                        }
                        if (city !== 'Unknown') break;
                    }
                }
                
                // Fifth pass: Default to Tirana for any address with Albanian characteristics
                if (city === 'Unknown') {
                    // If address has typical Albanian patterns but no city detected, assume Tirana (capital, most orders)
                    const albanianPatterns = [
                        /\brruga\b/i, /\brr\.\b/i, /\blagjja\b/i, /\blagj\.\b/i,
                        /\bpallati\b/i, /\bpal\.\b/i, /\bshkalla\b/i, /\bsh\.\b/i,
                        /\bapartamenti\b/i, /\bap\.\b/i, /\bkati\b/i, /\bkt\.\b/i,
                        /\bnr\.\b/i, /\bnr\b/i, /\bhyrja\b/i,
                        /\brreth\b/i, /\bafer\b/i, /\bprane\b/i, /\bpër\b/i,
                        /\balbanië\b/i, /\balbania\b/i, /\bshqipëri/i
                    ];
                    
                    const hasAlbanianPattern = albanianPatterns.some(pattern => pattern.test(address));
                    if (hasAlbanianPattern || address.length > 10) {
                        city = 'Tirana'; // Most orders are from Tirana (capital city)
                    }
                }
                
                if (!cities[city]) {
                    cities[city] = {
                        orders: 0,
                        revenue: 0,
                        customers: new Set(),
                        areas: {} // Track specific areas within cities
                    };
                }
                
                // Extract specific area for Tirana orders
                let area = 'General';
                if (city === 'Tirana') {
                    area = this.extractTiranaArea(address);
                }
                
                if (!cities[city].areas[area]) {
                    cities[city].areas[area] = {
                        orders: 0,
                        revenue: 0,
                        customers: new Set()
                    };
                }

                cities[city].orders++;
                cities[city].revenue += parseFloat(order.price) || 0;
                cities[city].customers.add(order.clientName);
                
                cities[city].areas[area].orders++;
                cities[city].areas[area].revenue += parseFloat(order.price) || 0;
                cities[city].areas[area].customers.add(order.clientName);
            }
        });

        // Convert sets to counts and return as array
        return Object.entries(cities)
            .map(([city, data]) => ({
                city,
                orders: data.orders,
                revenue: data.revenue,
                avgOrder: data.revenue / data.orders,
                customers: data.customers.size,
                areas: Object.entries(data.areas || {})
                    .map(([area, areaData]) => ({
                        area,
                        orders: areaData.orders,
                        revenue: areaData.revenue,
                        avgOrder: areaData.revenue / areaData.orders,
                        customers: areaData.customers.size
                    }))
                    .sort((a, b) => b.revenue - a.revenue)
            }))
            .sort((a, b) => b.revenue - a.revenue);
    }

    // Extract specific area within Tirana based on address
    extractTiranaArea(address) {
        const lowerAddress = address.toLowerCase();
        
        // Define Tirana areas with their indicators
        const tiranaAreas = {
            'Blloku (Block)': ['blloku', 'ish blloku', 'former block', 'villa zone'],
            'Qendra (Center)': ['qendra', 'center', 'skenderbej', 'skanderbeg', 'wilson', 'teatri kombetar'],
            'Kombinat': ['kombinat', 'kombinati', 'industrial area'],
            'Astir': ['astir', 'astiri'],
            'Myslym Shyri': ['myslym shyri', 'myslym', 'shyri'],
            'Don Bosko': ['don bosko', 'don bosco', 'bosko'],
            'Selitë': ['selite', 'selitë', 'selita'],
            'Fresku': ['fresku', 'freskut'],
            'Sauk': ['sauk', 'sauku'],
            'Lapraka': ['laprakë', 'laprak', 'lapraka'],
            'Medrese': ['medrese', 'medresa'],
            '21 Dhjetori': ['21 dhjetori', '21 dhjetor', 'december 21'],
            'Partizani': ['partizani', 'partizan'],
            'Kalabria': ['kalabria', 'kalabri'],
            'Komuna e Parisit': ['komuna e parisit', 'paris commune', 'komuna parisit'],
            'Pazari i Ri': ['pazari i ri', 'new bazaar', 'pazari ri'],
            'Yzberisht': ['yzberisht', 'yzberish'],
            'Linza': ['linza', 'linze'],
            'Mezez': ['mezez', 'mezezi'],
            'Porcelan': ['porcelan', 'porcelani'],
            'Kinostudio': ['kinostudio', 'kinema', 'cinema studio'],
            'Casa Italia': ['casa italia', 'casa', 'italia'],
            'Artificial Lake': ['liqeni artificial', 'artificial lake', 'liqen artificial'],
            'Grand Park': ['grand park', 'park i madh', 'parku i madh'],
            'Tirana Mall Area': ['tirana mall', 'mall area', 'shopping area'],
            'Dajti Area': ['dajti', 'mali dajt', 'mount dajt'],
            'Ring Road Area': ['unaza', 'ring road', 'rruga unazore'],
            'Elbasani Street': ['rruga e elbasanit', 'elbasani street', 'elbasani road'],
            'Kavaja Street': ['rruga e kavajes', 'kavaja street', 'kavajes'],
            'Durres Street': ['rruga e durresit', 'durres street', 'durresi']
        };
        
        // Check for specific area indicators
        for (const [area, indicators] of Object.entries(tiranaAreas)) {
            for (const indicator of indicators) {
                if (lowerAddress.includes(indicator)) {
                    return area;
                }
            }
        }
        
        // Check for general directional areas
        if (lowerAddress.includes('veri') || lowerAddress.includes('north')) return 'North Tirana';
        if (lowerAddress.includes('jugu') || lowerAddress.includes('south')) return 'South Tirana';
        if (lowerAddress.includes('lindje') || lowerAddress.includes('east')) return 'East Tirana';
        if (lowerAddress.includes('perendim') || lowerAddress.includes('west')) return 'West Tirana';
        
        return 'General Tirana';
    }

    // 6. Competitor Data Fetching
    async fetchCompetitorData() {
        try {
            const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            const competitorRef = collection(this.db, 'competitor_tracking');
            const snapshot = await getDocs(competitorRef);
            
            if (!snapshot.empty) {
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            
            return [];
        } catch (error) {
            console.error("Error in fetchCompetitorData:", error);
            return [];
        }
    }

    async addCompetitor(data) {
        try {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const docRef = await addDoc(collection(this.db, 'competitor_tracking'), data);
            return docRef.id;
        } catch (error) {
            console.error("Error adding competitor:", error);
            throw error;
        }
    }

    async deleteCompetitor(id) {
        try {
            const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            await deleteDoc(doc(this.db, 'competitor_tracking', id));
        } catch (error) {
            console.error("Error deleting competitor:", error);
            throw error;
        }
    }

    async updateCompetitorStatus(id, status) {
        try {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            await updateDoc(doc(this.db, 'competitor_tracking', id), { status: status });
        } catch (error) {
            console.error("Error updating competitor status:", error);
            throw error;
        }
    }

    // Check prices for all active competitors
    async checkCompetitorPrices() {
        const competitors = await this.fetchCompetitorData();
        const activeCompetitors = competitors.filter(c => c.status === 'Active' && c.url);
        
        if (activeCompetitors.length === 0) {
            return { checked: 0, updated: 0 };
        }

        let updatedCount = 0;
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

        for (const item of activeCompetitors) {
            try {
                let html = null;
                
                // Strategy 1: Try AllOrigins (JSON response)
                try {
                    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(item.url)}`;
                    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.contents) html = data.contents;
                    }
                } catch (e) {
                    // Silent fail for first attempt
                }

                // Strategy 2: Try CorsProxy.io (Raw HTML)
                if (!html) {
                    try {
                        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(item.url)}`;
                        const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
                        if (response.ok) {
                            html = await response.text();
                        }
                    } catch (e) {
                        // Silent fail for second attempt
                    }
                }

                // Strategy 3: Try ThingProxy (Raw HTML)
                if (!html) {
                    try {
                        const proxyUrl = `https://thingproxy.freeboard.io/fetch/${item.url}`;
                        const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
                        if (response.ok) {
                            html = await response.text();
                        }
                    } catch (e) {
                        // Silent fail for third attempt
                    }
                }

                if (!html) {
                    console.warn(`Could not fetch data for ${item.productName} from any proxy.`);
                    continue;
                }

                const anchorPrice = item.myPrice || item.theirPrice;
                const newPrice = this.extractPrice(html, anchorPrice);

                if (newPrice && newPrice !== item.theirPrice) {
                    // Price changed!
                    await updateDoc(doc(this.db, 'competitor_tracking', item.id), {
                        theirPrice: newPrice,
                        lastChecked: new Date().toISOString(),
                        lastPriceChange: new Date().toISOString(),
                        previousPrice: item.theirPrice
                    });
                    
                    this.notifyPriceChange(item, newPrice);
                    updatedCount++;
                } else {
                    // Just update last checked
                    await updateDoc(doc(this.db, 'competitor_tracking', item.id), {
                        lastChecked: new Date().toISOString()
                    });
                }

            } catch (error) {
                console.error(`Error checking price for ${item.productName}:`, error);
            }
        }

        return { checked: activeCompetitors.length, updated: updatedCount };
    }

    extractPrice(html, anchorPrice) {
        // Regex to find prices like 10.00 €, €10.00, 1,000.00 €, 1.000 €
        const priceRegex = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*€|€\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g;
        const matches = [...html.matchAll(priceRegex)];
        
        if (matches.length === 0) return null;

        // Convert matches to numbers
        let prices = matches.map(m => {
            const val = m[1] || m[2];
            let cleanVal = val.replace(/\s/g, '');
            
            // Smart parsing for EU/US formats
            if (cleanVal.indexOf('.') !== -1 && cleanVal.indexOf(',') !== -1) {
                 if (cleanVal.indexOf('.') < cleanVal.indexOf(',')) {
                     cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
                 } else {
                     cleanVal = cleanVal.replace(/,/g, '');
                 }
            } else if (cleanVal.indexOf(',') !== -1) {
                if (/\,\d{2}$/.test(cleanVal)) {
                    cleanVal = cleanVal.replace(',', '.');
                } else {
                    cleanVal = cleanVal.replace(',', '');
                }
            } else if (cleanVal.indexOf('.') !== -1) {
                if (/\.\d{3}$/.test(cleanVal)) {
                    cleanVal = cleanVal.replace('.', '');
                }
            }
            
            return parseFloat(cleanVal);
        }).filter(p => !isNaN(p) && p > 0);

        if (prices.length === 0) return null;

        // Filter logic using Anchor Price (My Price)
        if (anchorPrice) {
            // Keep prices between 40% and 300% of anchor price
            // This filters out accessories (usually < 30%) but keeps deep sales (down to 40%)
            prices = prices.filter(p => p > anchorPrice * 0.4 && p < anchorPrice * 3.0);
        } else {
            // Fallback: Remove outliers < 20% of max price found
            const maxPrice = Math.max(...prices);
            prices = prices.filter(p => p > maxPrice * 0.2);
        }

        if (prices.length === 0) return null;

        // Return the LOWEST valid price found (Sale Price Logic)
        return Math.min(...prices);
    }

    notifyPriceChange(item, newPrice) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const diff = newPrice - item.theirPrice;
            const direction = diff > 0 ? 'increased' : 'decreased';
            const icon = diff > 0 ? '📈' : '📉';
            
            new Notification(`Price Alert: ${item.productName}`, {
                body: `${item.competitorName} ${direction} price to €${newPrice.toFixed(2)} (${diff > 0 ? '+' : ''}€${diff.toFixed(2)})`,
                icon: 'https://cdn-icons-png.flaticon.com/512/2534/2534204.png' // Generic price icon
            });
        }
    }

    // 7. Comprehensive Dashboard Data
    generateDashboard() {
        const margins = this.calculateProfitMargins();
        const performance = this.analyzeProductPerformance();
        const customers = this.calculateCustomerLTV();
        const forecast = this.forecastSales();
        const peakHours = this.analyzePeakHours();
        const geography = this.analyzeGeography();

        // Calculate totals
        const totalRevenue = this.orders
            .filter(o => o.status !== 'Returned')
            .reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);
        
        const totalCost = this.orders
            .filter(o => o.status !== 'Returned')
            .reduce((sum, o) => sum + (parseFloat(o.cost) || 0), 0);
        
        const totalProfit = totalRevenue - totalCost;
        const avgOrderValue = this.orders.length > 0 ? totalRevenue / this.orders.length : 0;

        return {
            overview: {
                totalRevenue,
                totalCost,
                totalProfit,
                profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0,
                avgOrderValue,
                totalOrders: this.orders.length,
                totalCustomers: new Set(this.orders.map(o => o.clientName)).size
            },
            margins,
            performance,
            topCustomers: customers.slice(0, 10),
            forecast,
            peakHours,
            geography
        };
    }

    // Export analytics report
    exportReport() {
        const dashboard = this.generateDashboard();
        
        let report = `DANFOSAL ANALYTICS REPORT\n`;
        report += `Generated: ${new Date().toLocaleString()}\n`;
        report += `\n${'='.repeat(60)}\n\n`;
        
        report += `OVERVIEW\n`;
        report += `Total Revenue: €${dashboard.overview.totalRevenue.toFixed(2)}\n`;
        report += `Total Cost: €${dashboard.overview.totalCost.toFixed(2)}\n`;
        report += `Total Profit: €${dashboard.overview.totalProfit.toFixed(2)}\n`;
        report += `Profit Margin: ${dashboard.overview.profitMargin}%\n`;
        report += `Average Order Value: €${dashboard.overview.avgOrderValue.toFixed(2)}\n`;
        report += `Total Orders: ${dashboard.overview.totalOrders}\n`;
        report += `Total Customers: ${dashboard.overview.totalCustomers}\n`;
        
        report += `\n${'='.repeat(60)}\n\n`;
        report += `TOP 5 PERFORMING PRODUCTS\n\n`;
        dashboard.performance.slice(0, 5).forEach((product, i) => {
            report += `${i + 1}. ${product.name}\n`;
            report += `   Units Sold: ${product.unitsSold}\n`;
            report += `   Revenue: €${product.revenue.toFixed(2)}\n`;
            report += `   Profit: €${product.profit.toFixed(2)}\n\n`;
        });
        
        if (dashboard.forecast) {
            report += `\n${'='.repeat(60)}\n\n`;
            report += `SALES FORECAST (Next 30 Days)\n`;
            report += `Predicted Revenue: €${dashboard.forecast.forecast30Days.toFixed(2)}\n`;
            report += `Growth Rate: ${dashboard.forecast.growthRate.toFixed(2)}%\n`;
            report += `Confidence: ${dashboard.forecast.confidence}\n`;
        }
        
        return report;
    }

    // 5. Dead Stock Detection
    identifyDeadStock(daysThreshold = 60) {
        if (!Array.isArray(this.products) || !Array.isArray(this.orders)) {
            return [];
        }

        const now = Date.now();
        const thresholdTime = daysThreshold * 24 * 60 * 60 * 1000;
        const lastSoldMap = new Map();

        // Initialize all products with 0 last sold
        this.products.forEach(p => {
            lastSoldMap.set(p.name, 0);
        });

        // Find last sold date for each product from orders
        this.orders.forEach(order => {
            if (order.items && order.status !== 'Returned') {
                let orderTime = order.timestamp;
                // Handle Firestore Timestamp
                if (typeof orderTime === 'object' && orderTime.toMillis) {
                    orderTime = orderTime.toMillis();
                } else if (typeof orderTime === 'object' && orderTime.seconds) {
                    orderTime = orderTime.seconds * 1000;
                }

                order.items.forEach(item => {
                    const currentLastSold = lastSoldMap.get(item.name) || 0;
                    if (orderTime > currentLastSold) {
                        lastSoldMap.set(item.name, orderTime);
                    }
                });
            }
        });

        const deadStock = [];

        this.products.forEach(product => {
            // Only consider products with stock > 0
            // Assuming 'stock' or 'quantity' field exists. If not, we might need to fetch inventory.
            // Looking at products.html, it seems products have a 'stock' field in the table, 
            // but let's check the data structure in advanced-analytics.js init.
            // It fetches 'products' collection.
            
            const stock = parseInt(product.stock) || 0;
            if (stock <= 0) return;

            const lastSold = lastSoldMap.get(product.name) || 0;
            const daysSinceSale = lastSold === 0 ? 'Never' : Math.floor((now - lastSold) / (24 * 60 * 60 * 1000));

            if (lastSold === 0 || (now - lastSold) > thresholdTime) {
                deadStock.push({
                    name: product.name,
                    stock: stock,
                    cost: parseFloat(product.baseCost) || 0,
                    value: (parseFloat(product.baseCost) || 0) * stock,
                    lastSold: lastSold === 0 ? 'Never' : new Date(lastSold).toLocaleDateString(),
                    daysInactive: daysSinceSale
                });
            }
        });

        // Sort by value (highest tied up capital first)
        return deadStock.sort((a, b) => b.value - a.value);
    }

    // 6. Competitor Data Fetching
    async fetchCompetitorData() {
        try {
            const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            const competitorRef = collection(this.db, 'competitor_tracking');
            const snapshot = await getDocs(competitorRef);
            
            if (!snapshot.empty) {
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            
            return [];
        } catch (error) {
            console.error("Error in fetchCompetitorData:", error);
            return [];
        }
    }
}

// Initialize analytics
if (typeof window !== 'undefined') {
    window.advancedAnalytics = new AdvancedAnalytics();
}
