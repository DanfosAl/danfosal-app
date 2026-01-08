// Smart Inventory Management & Analytics
class SmartInventory {
    constructor(db, firebaseImports = {}) {
        this.db = db;
        this.collection = firebaseImports.collection;
        this.getDocs = firebaseImports.getDocs;
        this.query = firebaseImports.query;
        this.where = firebaseImports.where;
        this.analysisCache = null;
        this.lastAnalysis = null;
    }

    // Analyze product sales performance
    async analyzeProductPerformance(timeRange = 30) {
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const storeSalesRef = this.collection(this.db, 'storeSales');
        const productsRef = this.collection(this.db, 'products');
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - timeRange);
        const cutoffTimestamp = cutoffDate.getTime();

        const [ordersSnapshot, storeSalesSnapshot, productsSnapshot] = await Promise.all([
            this.getDocs(ordersRef),
            this.getDocs(storeSalesRef),
            this.getDocs(productsRef)
        ]);

        // Build product catalog
        const productCatalog = {};
        const productCatalogById = {};
        const productCatalogNormalized = {};
        const productCatalogByCode = {};

        // Helper to normalize string for fuzzy matching (removes special chars, spaces, case)
        const normalizeString = (str) => {
            if (!str) return '';
            return str.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        };

        // Levenshtein distance for fuzzy matching
        const levenshteinDistance = (a, b) => {
            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;
            const matrix = [];
            for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
            for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) == a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                    }
                }
            }
            return matrix[b.length][a.length];
        };

        productsSnapshot.forEach(doc => {
            const product = doc.data();
            const productData = {
                id: doc.id,
                ...product,
                totalSold: 0,
                revenue: 0,
                profit: 0,
                orderCount: 0,
                avgQuantity: 0,
                lastSold: null,
                trend: 'stable'
            };
            productCatalog[product.name] = productData;
            productCatalogById[doc.id] = productData;
            
            // Create normalized key for fuzzy matching
            const normName = normalizeString(product.name);
            if (normName) {
                productCatalogNormalized[normName] = productData;
            }

            // Map by Code if available
            if (product.code) {
                productCatalogByCode[product.code] = productData;
                productCatalogByCode[normalizeString(product.code)] = productData;
            }
        });

        // Analyze orders
        const productSales = {};
        const salesByDate = {};

        // Helper to process items
        const processItems = (items, timestamp, source) => {
             if (!items || !Array.isArray(items)) return;
             
             items.forEach(item => {
                // Try to find product by ID first, then by Code, then by Name
                let productKey = null;
                let productInfo = null;

                // 1. Check by ID (item.id or item.productId)
                const itemId = item.id || item.productId;
                if (itemId && productCatalogById[itemId]) {
                    productInfo = productCatalogById[itemId];
                    productKey = productInfo.name;
                } 
                // 2. Check by Code (expanded to check multiple possible fields)
                else {
                    const itemCode = item.code || item.sku || item.productCode || item.barcode;
                    const itemName = item.name || item.product;
                    
                    // Check explicit code field
                    if (itemCode && (productCatalogByCode[itemCode] || productCatalogByCode[normalizeString(itemCode)])) {
                        productInfo = productCatalogByCode[itemCode] || productCatalogByCode[normalizeString(itemCode)];
                        productKey = productInfo.name;
                    }
                    // Check if name is actually a code
                    else if (itemName && (productCatalogByCode[itemName] || productCatalogByCode[normalizeString(itemName)])) {
                        productInfo = productCatalogByCode[itemName] || productCatalogByCode[normalizeString(itemName)];
                        productKey = productInfo.name;
                    }
                    // 3. Fallback to Name Matching (Exact -> Normalized -> Fuzzy)
                    else {
                        if (!itemName || itemName === '00') return;
                        
                        // A. Exact match
                        if (productCatalog[itemName]) {
                            productInfo = productCatalog[itemName];
                            productKey = itemName;
                        } 
                        // B. Normalized match
                        else {
                            const normalizedItemName = normalizeString(itemName);
                            if (productCatalogNormalized[normalizedItemName]) {
                                productInfo = productCatalogNormalized[normalizedItemName];
                                productKey = productInfo.name;
                            } 
                            // C. Fuzzy Match (Levenshtein) - Catches typos like 5L vs SL
                            else {
                                let bestMatchName = null;
                                let minDistance = Infinity;
                                const threshold = 3; // Allow up to 3 edits

                                for (const normKey in productCatalogNormalized) {
                                    // Optimization: skip if length difference is too big
                                    if (Math.abs(normKey.length - normalizedItemName.length) > threshold) continue;

                                    const dist = levenshteinDistance(normalizedItemName, normKey);
                                    if (dist < minDistance && dist <= threshold) {
                                        minDistance = dist;
                                        bestMatchName = normKey;
                                    }
                                }

                                if (bestMatchName) {
                                    productInfo = productCatalogNormalized[bestMatchName];
                                    productKey = productInfo.name;
                                } else {
                                    // No match found
                                    productKey = itemName;
                                }
                            }
                        }
                    }
                }

                if (!productSales[productKey]) {
                    productSales[productKey] = {
                        quantity: 0,
                        revenue: 0,
                        profit: 0,
                        orders: [],
                        dates: []
                    };
                }

                const quantity = parseFloat(item.quantity) || 1;
                const price = parseFloat(item.price) || 0;
                
                // Try to get cost from item, otherwise from catalog
                let cost = parseFloat(item.cost) || 0;
                if (cost === 0 && productInfo) {
                    cost = parseFloat(productInfo.cost) || 0;
                }

                const profit = (price - cost) * quantity;

                productSales[productKey].quantity += quantity;
                productSales[productKey].revenue += price * quantity;
                productSales[productKey].profit += profit;
                productSales[productKey].orders.push({ timestamp, source, ...item });
                productSales[productKey].dates.push(timestamp);

                // Track sales by date
                const dateKey = new Date(timestamp).toISOString().split('T')[0];
                if (!salesByDate[dateKey]) salesByDate[dateKey] = {};
                if (!salesByDate[dateKey][productKey]) {
                    salesByDate[dateKey][productKey] = 0;
                }
                salesByDate[dateKey][productKey] += quantity;
            });
        };

        // Process Online Orders
        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            let orderTime = order.timestamp;
            
            if (typeof orderTime === 'object' && orderTime.toMillis) {
                orderTime = orderTime.toMillis();
            } else if (typeof orderTime === 'object' && orderTime.seconds) {
                orderTime = orderTime.seconds * 1000;
            } else {
                orderTime = new Date(orderTime).getTime();
            }

            if (orderTime < cutoffTimestamp) return; // Skip old orders

            processItems(order.items, orderTime, 'online');
        });

        // Process Store Sales
        storeSalesSnapshot.forEach(doc => {
            const sale = doc.data();
            let saleTime = sale.timestamp;

            if (typeof saleTime === 'object' && saleTime.toMillis) {
                saleTime = saleTime.toMillis();
            } else if (typeof saleTime === 'object' && saleTime.seconds) {
                saleTime = saleTime.seconds * 1000;
            } else {
                saleTime = new Date(saleTime).getTime();
            }

            if (saleTime < cutoffTimestamp) return;

            processItems(sale.items, saleTime, 'store');
        });

        // Calculate metrics and trends
        const analysis = [];
        
        // Get all unique product names from both catalog and sales
        const allProductNames = new Set([
            ...Object.keys(productCatalog),
            ...Object.keys(productSales)
        ]);

        for (const productName of allProductNames) {
            const productInfo = productCatalog[productName] || {};
            const sales = productSales[productName] || {
                quantity: 0,
                revenue: 0,
                profit: 0,
                orders: [],
                dates: []
            };
            
            const trend = this.calculateTrend(sales.dates, timeRange);
            const avgDaysBetweenSales = this.calculateAvgDaysBetween(sales.dates);
            const velocityScore = sales.quantity / timeRange; // Items per day
            
            // Calculate profit margin: use sales data if available, otherwise use catalog price/cost
            let profitMargin = 0;
            if (sales.revenue > 0) {
                // Use actual sales profit margin
                profitMargin = (sales.profit / sales.revenue * 100);
            } else if (productInfo.price && productInfo.cost && productInfo.price > 0) {
                // Use catalog profit margin when no sales data
                profitMargin = ((productInfo.price - productInfo.cost) / productInfo.price * 100);
            }
            
            analysis.push({
                name: productName,
                quantitySold: sales.quantity,
                revenue: sales.revenue,
                profit: sales.profit,
                orderCount: sales.orders.length,
                avgQuantity: sales.orders.length > 0 ? sales.quantity / sales.orders.length : 0,
                lastSold: sales.dates.length > 0 ? Math.max(...sales.dates) : 0,
                trend: trend,
                velocityScore: velocityScore,
                avgDaysBetweenSales: avgDaysBetweenSales,
                profitMargin: profitMargin,
                currentStock: productInfo.stock || 0,
                cost: productInfo.cost || 0,
                price: productInfo.price || 0,
                producer: productInfo.producer || 'Unknown'
            });
        }

        // Sort by velocity (fastest selling first)
        analysis.sort((a, b) => b.velocityScore - a.velocityScore);

        this.analysisCache = analysis;
        this.lastAnalysis = Date.now();

        return analysis;
    }

    // Calculate sales trend (growing, declining, stable)
    calculateTrend(dates, timeRange) {
        if (dates.length < 2) return 'stable';

        const sortedDates = [...dates].sort((a, b) => a - b);
        const midpoint = Math.floor(sortedDates.length / 2);
        
        const firstHalf = sortedDates.slice(0, midpoint);
        const secondHalf = sortedDates.slice(midpoint);

        const firstHalfRate = firstHalf.length / (timeRange / 2);
        const secondHalfRate = secondHalf.length / (timeRange / 2);

        if (secondHalfRate > firstHalfRate * 1.2) return 'growing';
        if (secondHalfRate < firstHalfRate * 0.8) return 'declining';
        return 'stable';
    }

    // Calculate average days between sales
    calculateAvgDaysBetween(dates) {
        if (dates.length < 2) return null;

        const sortedDates = [...dates].sort((a, b) => a - b);
        let totalDays = 0;

        for (let i = 1; i < sortedDates.length; i++) {
            const daysDiff = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
            totalDays += daysDiff;
        }

        return totalDays / (sortedDates.length - 1);
    }

    // Predict demand for next period
    async predictDemand(productName, daysAhead = 30) {
        const analysis = await this.analyzeProductPerformance(60); // Look at 60 days of history
        const product = analysis.find(p => p.name === productName);

        if (!product) {
            return {
                predicted: 0,
                confidence: 'low',
                recommendation: 'No sales history available'
            };
        }

        // Simple linear prediction based on velocity
        const predictedQuantity = Math.ceil(product.velocityScore * daysAhead);
        
        // Adjust for trend
        let adjustedPrediction = predictedQuantity;
        if (product.trend === 'growing') {
            adjustedPrediction = Math.ceil(predictedQuantity * 1.3); // 30% increase
        } else if (product.trend === 'declining') {
            adjustedPrediction = Math.ceil(predictedQuantity * 0.7); // 30% decrease
        }

        // Confidence based on data points
        let confidence = 'medium';
        if (product.orderCount > 20) confidence = 'high';
        if (product.orderCount < 5) confidence = 'low';

        return {
            predicted: adjustedPrediction,
            current: product.quantitySold,
            trend: product.trend,
            confidence: confidence,
            velocityScore: product.velocityScore.toFixed(2),
            recommendation: this.getRecommendation(product, adjustedPrediction)
        };
    }

    // Get reorder suggestions
    async getReorderSuggestions() {
        // Analyze last 180 days (6 months) to catch items that have been out of stock for a long time
        const analysis = await this.analyzeProductPerformance(180);
        
        // Load active products to filter out inactive ones
        const productsSnapshot = await this.getDocs(this.collection(this.db, 'products'));
        const activeProductNames = new Set();
        const activeProductCodes = new Set();
        
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            activeProductNames.add(product.name);
            if (product.code) {
                activeProductCodes.add(product.code);
            }
        });
        
        const suggestions = [];

        for (const product of analysis) {
            // Skip if product is not in active catalog
            if (!activeProductNames.has(product.name)) {
                continue;
            }
            
            // Calculate prediction locally to avoid re-fetching data
            const daysAhead = 30;
            
            // Velocity is items/day over 180 days
            let predictedDemand = Math.ceil(product.velocityScore * daysAhead);
            
            // Adjust for trend
            if (product.trend === 'growing') {
                predictedDemand = Math.ceil(predictedDemand * 1.25);
            } else if (product.trend === 'declining') {
                predictedDemand = Math.ceil(predictedDemand * 0.8);
            }

            const currentStock = product.currentStock || 0;
            
            // Suggest if:
            // 1. Predicted demand exceeds stock
            // 2. Stock is 0 and it has ANY sales history in the last 6 months
            if (predictedDemand > currentStock || (currentStock === 0 && product.quantitySold > 0)) {
                
                // Ensure at least 1 unit if it has history
                if (predictedDemand === 0 && product.quantitySold > 0) predictedDemand = 1;

                const shortage = predictedDemand - currentStock;
                const suggestedOrder = Math.max(shortage, 1);
                
                // Calculate urgency
                let urgency = 'low';
                const daysUntilStockout = this.estimateDaysUntilStockout(currentStock, product.velocityScore);
                
                if (currentStock === 0) urgency = 'critical';
                else if (daysUntilStockout <= 7) urgency = 'high';
                else if (daysUntilStockout <= 14) urgency = 'medium';

                suggestions.push({
                    product: product.name,
                    currentStock: currentStock,
                    predictedDemand: predictedDemand,
                    suggestedOrder: Math.ceil(suggestedOrder * 1.2), // 20% buffer
                    urgency: urgency,
                    daysUntilStockout: daysUntilStockout,
                    trend: product.trend,
                    supplier: product.producer,
                    estimatedCost: product.cost * Math.ceil(suggestedOrder * 1.2),
                    reason: this.getReorderReason(urgency, product, currentStock, predictedDemand)
                });
            }
        }

        // Sort by urgency
        const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

        return suggestions;
    }

    calculateUrgency(product, currentStock, predictedDemand) {
        const daysUntilStockout = this.estimateDaysUntilStockout(currentStock, product.velocityScore);
        
        if (daysUntilStockout <= 3 || currentStock === 0) return 'critical';
        if (daysUntilStockout <= 7) return 'high';
        if (daysUntilStockout <= 14) return 'medium';
        return 'low';
    }

    estimateDaysUntilStockout(currentStock, velocityScore) {
        if (velocityScore === 0) return 999;
        return Math.floor(currentStock / velocityScore);
    }

    getReorderReason(urgency, product, currentStock, predictedDemand) {
        if (urgency === 'critical') {
            return currentStock === 0 ? 'OUT OF STOCK' : 'Stock critically low - order immediately!';
        }
        if (urgency === 'high') {
            return 'Stock running low - will run out within a week';
        }
        if (product.trend === 'growing') {
            return 'Sales increasing - stock up to meet demand';
        }
        return 'Regular restock needed';
    }

    getRecommendation(product, prediction) {
        if (product.currentStock === 0) {
            return `⚠️ OUT OF STOCK - Order ${prediction} units immediately`;
        }
        if (prediction > product.currentStock) {
            return `📦 Low stock - Order ${prediction - product.currentStock} more units`;
        }
        if (product.trend === 'growing') {
            return `📈 Sales growing - Consider increasing stock`;
        }
        return `✅ Stock adequate for now`;
    }

    // Get fastest selling products
    async getFastestSelling(limit = 10, timeRange = 30) {
        const analysis = await this.analyzeProductPerformance(timeRange);
        return analysis.slice(0, limit);
    }

    // Get slowest selling products
    async getSlowestSelling(limit = 10, timeRange = 30) {
        const analysis = await this.analyzeProductPerformance(timeRange);
        return analysis.slice(-limit).reverse();
    }

    // Get trending products
    async getTrendingProducts() {
        const analysis = await this.analyzeProductPerformance(30);
        return analysis.filter(p => p.trend === 'growing');
    }

    // Get products needing attention
    async getProductsNeedingAttention() {
        const analysis = await this.analyzeProductPerformance(30);
        const attention = [];

        for (const product of analysis) {
            const issues = [];
            
            if (product.currentStock === 0) {
                issues.push('OUT OF STOCK');
            } else if (product.currentStock < product.velocityScore * 7) {
                issues.push('Low stock (< 1 week supply)');
            }
            
            if (product.trend === 'declining') {
                issues.push('Sales declining');
            }
            
            if (product.profitMargin < 10) {
                issues.push('Low profit margin');
            }

            const daysSinceLastSale = (Date.now() - product.lastSold) / (1000 * 60 * 60 * 24);
            if (daysSinceLastSale > 30 && product.currentStock > 0) {
                issues.push('No sales in 30+ days');
            }

            if (issues.length > 0) {
                attention.push({
                    ...product,
                    issues: issues
                });
            }
        }

        return attention;
    }

    // Revenue & profit forecasting
    async forecastRevenue(daysAhead = 30) {
        const analysis = await this.analyzeProductPerformance(60);
        
        let totalRevenue = 0;
        let totalProfit = 0;
        let totalOrders = 0;

        // Calculate predictions directly from analysis data instead of calling predictDemand
        for (const product of analysis) {
            // Simple linear prediction based on velocity
            let predictedQuantity = Math.ceil(product.velocityScore * daysAhead);
            
            // Adjust for trend
            if (product.trend === 'growing') {
                predictedQuantity = Math.ceil(predictedQuantity * 1.3);
            } else if (product.trend === 'declining') {
                predictedQuantity = Math.ceil(predictedQuantity * 0.7);
            }
            
            totalRevenue += predictedQuantity * product.price;
            totalProfit += predictedQuantity * (product.price - product.cost);
            totalOrders += Math.ceil(predictedQuantity / (product.avgQuantity || 1));
        }

        return {
            predictedRevenue: totalRevenue,
            predictedProfit: totalProfit,
            predictedOrders: totalOrders,
            profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0,
            daysAhead: daysAhead
        };
    }

    // Calculate daily progress towards a goal
    async getDailyProgress(goalAmount = 500) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();

        const allSales = new Map();

        // Helper to add sales
        const addSale = (doc, isOnline) => {
            const data = doc.data();
            const id = doc.id;
            if (allSales.has(id)) return;

            let time = data.timestamp;
            if (typeof time === 'object' && time.toMillis) time = time.toMillis();
            else if (typeof time === 'object' && time.seconds) time = time.seconds * 1000;
            else if (time instanceof Date) time = time.getTime();

            if (time >= todayTimestamp) {
                if (isOnline) {
                    // Online orders use 'price' field and have statuses like 'Ordered', 'Shipped', 'Paid', 'Returned'
                    if (data.status !== 'cancelled' && data.status !== 'refunded' && data.status !== 'Returned') {
                        // Try 'price' first (standard), then 'totalPrice' (legacy/alternative), then 'total'
                        const revenue = parseFloat(data.price) || parseFloat(data.totalPrice) || parseFloat(data.total) || 0;
                        allSales.set(id, revenue);
                    }
                } else {
                    // Store sales use 'total' field
                    allSales.set(id, parseFloat(data.total) || 0);
                }
            }
        };

        // Execute queries in parallel for efficiency
        const queries = [
            // Store Sales - Date query
            this.getDocs(this.query(this.collection(this.db, 'storeSales'), this.where('timestamp', '>=', today)))
                .then(snap => snap.forEach(d => addSale(d, false)))
                .catch(() => {}),
            
            // Store Sales - Number query
            this.getDocs(this.query(this.collection(this.db, 'storeSales'), this.where('timestamp', '>=', todayTimestamp)))
                .then(snap => snap.forEach(d => addSale(d, false)))
                .catch(() => {}),

            // Online Orders - Date query
            this.getDocs(this.query(this.collection(this.db, 'onlineOrders'), this.where('timestamp', '>=', today)))
                .then(snap => snap.forEach(d => addSale(d, true)))
                .catch(() => {}),

            // Online Orders - Number query
            this.getDocs(this.query(this.collection(this.db, 'onlineOrders'), this.where('timestamp', '>=', todayTimestamp)))
                .then(snap => snap.forEach(d => addSale(d, true)))
                .catch(() => {})
        ];

        await Promise.all(queries);

        const totalRevenue = Array.from(allSales.values()).reduce((a, b) => a + b, 0);

        const percentage = Math.min((totalRevenue / goalAmount) * 100, 100);
        
        return {
            current: totalRevenue,
            goal: goalAmount,
            percentage: percentage,
            remaining: Math.max(goalAmount - totalRevenue, 0)
        };
    }
}

// Make it globally available
window.SmartInventory = SmartInventory;
