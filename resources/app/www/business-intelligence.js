// Business Intelligence & Advanced Forecasting
export default class BusinessIntelligence {
    constructor(db, firebaseImports = {}) {
        this.db = db;
        this.collection = firebaseImports.collection;
        this.getDocs = firebaseImports.getDocs;
        this.query = firebaseImports.query; // NEW
        this.where = firebaseImports.where; // NEW
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    // === AI-POWERED DEMAND FORECASTING (ML MODELS) ===
    
    /**
     * Advanced ML-based demand forecasting using multiple algorithms
     * Combines: Linear Regression, Moving Average, Exponential Smoothing
     */
    async advancedDemandForecast(productName, daysAhead = 30) {
        const cacheKey = `forecast_${productName}_${daysAhead}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        const historicalData = await this.getProductSalesHistory(productName, 90); // 90 days history
        
        if (historicalData.length < 7) {
            return {
                predicted: 0,
                confidence: 'very-low',
                model: 'insufficient-data',
                details: 'Need at least 7 days of sales history'
            };
        }

        // Run multiple forecasting models
        const linearForecast = this.linearRegressionForecast(historicalData, daysAhead);
        const movingAvgForecast = this.movingAverageForecast(historicalData, daysAhead);
        const exponentialForecast = this.exponentialSmoothingForecast(historicalData, daysAhead);
        const seasonalForecast = this.seasonalForecast(historicalData, daysAhead);

        // Ensemble method: weighted average of models
        const weights = {
            linear: 0.25,
            movingAvg: 0.25,
            exponential: 0.30,
            seasonal: 0.20
        };

        const ensembleForecast = (
            linearForecast.value * weights.linear +
            movingAvgForecast.value * weights.movingAvg +
            exponentialForecast.value * weights.exponential +
            seasonalForecast.value * weights.seasonal
        );

        // Calculate confidence based on model agreement
        const predictions = [
            linearForecast.value,
            movingAvgForecast.value,
            exponentialForecast.value,
            seasonalForecast.value
        ];
        const variance = this.calculateVariance(predictions);
        const confidence = this.determineConfidence(variance, historicalData.length);

        const result = {
            predicted: Math.round(ensembleForecast * 100) / 100,
            confidence: confidence,
            daysAhead: daysAhead,
            models: {
                linear: linearForecast.value,
                movingAverage: movingAvgForecast.value,
                exponentialSmoothing: exponentialForecast.value,
                seasonal: seasonalForecast.value
            },
            variance: variance,
            historicalDataPoints: historicalData.length,
            recommendation: this.generateRecommendation(ensembleForecast, historicalData)
        };

        this.setCache(cacheKey, result);
        return result;
    }

    /**
     * Linear Regression Forecasting
     * Finds the best-fit line through historical data points
     */
    linearRegressionForecast(data, daysAhead) {
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        data.forEach((point, index) => {
            sumX += index;
            sumY += point.quantity;
            sumXY += index * point.quantity;
            sumX2 += index * index;
        });

        // Calculate slope (m) and intercept (b): y = mx + b
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Predict future value
        const futureX = n + daysAhead - 1;
        const predicted = Math.max(0, slope * futureX + intercept);

        return {
            value: predicted,
            slope: slope,
            trend: slope > 0 ? 'growing' : slope < 0 ? 'declining' : 'stable'
        };
    }

    /**
     * Moving Average Forecast
     * Uses weighted average of recent periods
     */
    movingAverageForecast(data, daysAhead, window = 7) {
        const recentData = data.slice(-window);
        const sum = recentData.reduce((acc, point) => acc + point.quantity, 0);
        const average = sum / recentData.length;

        // Apply growth factor from trend
        const trend = this.calculateSimpleTrend(recentData);
        const growthFactor = 1 + (trend * (daysAhead / 30));

        return {
            value: average * growthFactor,
            average: average,
            trendFactor: growthFactor
        };
    }

    /**
     * Exponential Smoothing Forecast
     * Recent data has more weight than older data
     */
    exponentialSmoothingForecast(data, daysAhead, alpha = 0.3) {
        if (data.length === 0) return { value: 0 };

        let smoothed = data[0].quantity;
        
        for (let i = 1; i < data.length; i++) {
            smoothed = alpha * data[i].quantity + (1 - alpha) * smoothed;
        }

        // Trend adjustment
        const recentTrend = this.calculateSimpleTrend(data.slice(-14));
        const trendAdjustment = 1 + (recentTrend * (daysAhead / 30));

        return {
            value: smoothed * trendAdjustment,
            smoothed: smoothed,
            alpha: alpha
        };
    }

    /**
     * Seasonal Forecast
     * Detects weekly/monthly patterns
     */
    seasonalForecast(data, daysAhead) {
        const seasonal = this.detectSeasonalPattern(data);
        
        if (!seasonal.hasPattern) {
            return this.movingAverageForecast(data, daysAhead);
        }

        const baseAverage = data.reduce((sum, p) => sum + p.quantity, 0) / data.length;
        const seasonalMultiplier = seasonal.multipliers[daysAhead % 7] || 1;

        return {
            value: baseAverage * seasonalMultiplier * seasonal.strength,
            pattern: seasonal.pattern,
            strength: seasonal.strength
        };
    }

    // === SEASONAL TREND DETECTION ===

    /**
     * Detect seasonal patterns in sales data
     * Identifies weekly, monthly, and yearly patterns
     */
    async detectSeasonalTrends(productName = null, months = 12) {
        const historicalData = await this.getProductSalesHistory(productName, months * 30);
        
        if (historicalData.length < 30) {
            return {
                hasSeasonality: false,
                message: 'Insufficient data for seasonal analysis'
            };
        }

        const patterns = {
            weekly: this.analyzeWeeklyPattern(historicalData),
            monthly: this.analyzeMonthlyPattern(historicalData),
            seasonal: this.detectSeasonalPattern(historicalData)
        };

        return {
            hasSeasonality: patterns.weekly.hasPattern || patterns.monthly.hasPattern,
            patterns: patterns,
            recommendations: this.generateSeasonalRecommendations(patterns),
            peakPeriods: this.identifyPeakPeriods(patterns),
            lowPeriods: this.identifyLowPeriods(patterns)
        };
    }

    /**
     * Analyze weekly patterns (which days sell more)
     */
    analyzeWeeklyPattern(data) {
        const dayTotals = Array(7).fill(0); // Sun=0, Mon=1, ... Sat=6
        const dayCounts = Array(7).fill(0);

        data.forEach(point => {
            const day = new Date(point.date).getDay();
            dayTotals[day] += point.quantity;
            dayCounts[day]++;
        });

        const dayAverages = dayTotals.map((total, i) => 
            dayCounts[i] > 0 ? total / dayCounts[i] : 0
        );

        const overallAvg = dayAverages.reduce((a, b) => a + b, 0) / 7;
        const variance = this.calculateVariance(dayAverages);
        
        // Significant variance indicates pattern
        const hasPattern = variance > overallAvg * 0.3;

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const bestDay = dayNames[dayAverages.indexOf(Math.max(...dayAverages))];
        const worstDay = dayNames[dayAverages.indexOf(Math.min(...dayAverages))];

        return {
            hasPattern: hasPattern,
            averages: dayAverages.map((avg, i) => ({
                day: dayNames[i],
                average: Math.round(avg * 100) / 100,
                percentage: Math.round((avg / overallAvg) * 100)
            })),
            bestDay: bestDay,
            worstDay: worstDay,
            variance: variance
        };
    }

    /**
     * Analyze monthly patterns (which months sell more)
     */
    analyzeMonthlyPattern(data) {
        const monthTotals = Array(12).fill(0);
        const monthCounts = Array(12).fill(0);

        data.forEach(point => {
            const month = new Date(point.date).getMonth();
            monthTotals[month] += point.quantity;
            monthCounts[month]++;
        });

        const monthAverages = monthTotals.map((total, i) => 
            monthCounts[i] > 0 ? total / monthCounts[i] : 0
        );

        const overallAvg = monthAverages.reduce((a, b) => a + b, 0) / 12;
        const variance = this.calculateVariance(monthAverages);
        
        const hasPattern = variance > overallAvg * 0.5;

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const peakMonth = monthNames[monthAverages.indexOf(Math.max(...monthAverages))];
        const slowMonth = monthNames[monthAverages.indexOf(Math.min(...monthAverages))];

        return {
            hasPattern: hasPattern,
            averages: monthAverages.map((avg, i) => ({
                month: monthNames[i],
                average: Math.round(avg * 100) / 100,
                percentage: overallAvg > 0 ? Math.round((avg / overallAvg) * 100) : 0
            })),
            peakMonth: peakMonth,
            slowMonth: slowMonth,
            variance: variance
        };
    }

    /**
     * Detect repeating patterns
     */
    detectSeasonalPattern(data) {
        if (data.length < 14) {
            return { hasPattern: false, multipliers: Array(7).fill(1) };
        }

        const weekly = this.analyzeWeeklyPattern(data);
        const overallAvg = data.reduce((sum, p) => sum + p.quantity, 0) / data.length;

        const multipliers = weekly.averages.map(day => 
            overallAvg > 0 ? day.average / overallAvg : 1
        );

        return {
            hasPattern: weekly.hasPattern,
            pattern: 'weekly',
            multipliers: multipliers,
            strength: weekly.variance / overallAvg
        };
    }

    /**
     * Identify peak selling periods
     */
    identifyPeakPeriods(patterns) {
        const peaks = [];

        if (patterns.weekly.hasPattern) {
            peaks.push({
                type: 'weekly',
                period: patterns.weekly.bestDay,
                lift: patterns.weekly.averages.find(d => d.day === patterns.weekly.bestDay).percentage
            });
        }

        if (patterns.monthly.hasPattern) {
            peaks.push({
                type: 'monthly',
                period: patterns.monthly.peakMonth,
                lift: patterns.monthly.averages.find(m => m.month === patterns.monthly.peakMonth).percentage
            });
        }

        return peaks;
    }

    /**
     * Identify slow periods
     */
    identifyLowPeriods(patterns) {
        const lows = [];

        if (patterns.weekly.hasPattern) {
            lows.push({
                type: 'weekly',
                period: patterns.weekly.worstDay,
                dropPercentage: patterns.weekly.averages.find(d => d.day === patterns.weekly.worstDay).percentage
            });
        }

        if (patterns.monthly.hasPattern) {
            lows.push({
                type: 'monthly',
                period: patterns.monthly.slowMonth,
                dropPercentage: patterns.monthly.averages.find(m => m.month === patterns.monthly.slowMonth).percentage
            });
        }

        return lows;
    }

    // === MARKET ANALYSIS ===

    /**
     * Analyze market trends across all products
     */
    async analyzeMarketTrends(days = 90) {
        const allProducts = await this.getAllProductSalesData(days);
        
        const analysis = {
            topGrowing: [],
            declining: [],
            emerging: [],
            saturated: [],
            marketSize: 0,
            growthRate: 0,
            insights: []
        };

        for (const product of allProducts) {
            // Simple trend calculation instead of full forecast
            const trend = this.calculateSimpleTrend(
                [{quantity: product.salesFirstHalf || 0}, {quantity: product.salesSecondHalf || 0}]
            );

            analysis.marketSize += product.totalRevenue;

            if (trend > 0.2) {
                analysis.topGrowing.push({
                    product: product.name,
                    growth: Math.round(trend * 100) + '%'
                });
            } else if (trend < -0.2) {
                analysis.declining.push({
                    product: product.name,
                    decline: Math.round(Math.abs(trend) * 100) + '%'
                });
            }

            // Emerging products: new and growing
            if (product.age < 60 && trend > 0.1) {
                analysis.emerging.push(product.name);
            }

            // Saturated: high sales but flat growth
            if (product.totalSales > 100 && Math.abs(trend) < 0.05) {
                analysis.saturated.push(product.name);
            }
        }

        // Calculate overall market growth
        const oldPeriod = allProducts.map(p => p.salesFirstHalf || 0).reduce((a, b) => a + b, 0);
        const newPeriod = allProducts.map(p => p.salesSecondHalf || 0).reduce((a, b) => a + b, 0);
        analysis.growthRate = oldPeriod > 0 ? ((newPeriod - oldPeriod) / oldPeriod) * 100 : 0;

        // Generate insights
        analysis.insights = this.generateMarketInsights(analysis);

        return analysis;
    }

    /**
     * Profitability analysis across products
     */
    async analyzeProfitability(days = 90) {
        const products = await this.getAllProductSalesData(days);
        
        const analysis = {
            highProfit: [],
            lowProfit: [],
            highMargin: [],
            lowMargin: [],
            volumeLeaders: [],
            recommendations: []
        };

        products.forEach(product => {
            const marginPercent = product.profit / product.totalRevenue * 100;
            
            // High profit products (total profit)
            if (product.profit > 1000) {
                analysis.highProfit.push({
                    name: product.name,
                    profit: product.profit.toFixed(2),
                    margin: marginPercent.toFixed(1) + '%'
                });
            }

            // Low profit products
            if (product.profit < 100 && product.totalSales > 10) {
                analysis.lowProfit.push({
                    name: product.name,
                    profit: product.profit.toFixed(2),
                    sales: product.totalSales
                });
            }

            // High margin products (percentage)
            if (marginPercent > 40) {
                analysis.highMargin.push({
                    name: product.name,
                    margin: marginPercent.toFixed(1) + '%',
                    profit: product.profit.toFixed(2)
                });
            }

            // Low margin products
            if (marginPercent < 20 && product.totalSales > 5) {
                analysis.lowMargin.push({
                    name: product.name,
                    margin: marginPercent.toFixed(1) + '%',
                    recommendation: 'Consider price increase'
                });
            }

            // Volume leaders
            if (product.totalSales > 50) {
                analysis.volumeLeaders.push({
                    name: product.name,
                    units: product.totalSales,
                    revenue: product.totalRevenue.toFixed(2)
                });
            }
        });

        // Sort by values
        analysis.highProfit.sort((a, b) => parseFloat(b.profit) - parseFloat(a.profit));
        analysis.volumeLeaders.sort((a, b) => b.units - a.units);
        analysis.highMargin.sort((a, b) => parseFloat(b.margin) - parseFloat(a.margin));

        analysis.recommendations = this.generateProfitabilityRecommendations(analysis);

        return analysis;
    }

    // === SUPPLIER SCORECARDS ===
    
    async generateSupplierScorecards() {
        const productsRef = this.collection(this.db, 'products');
        const productsSnapshot = await this.getDocs(productsRef);
        
        const suppliers = {};

        // 1. Group products by supplier
        productsSnapshot.forEach(doc => {
            const p = doc.data();
            const supplierName = p.producer || p.supplier || 'Unknown';
            
            if (!suppliers[supplierName]) {
                suppliers[supplierName] = {
                    name: supplierName,
                    totalProducts: 0,
                    totalStockValue: 0,
                    totalRevenue: 0,
                    totalProfit: 0,
                    products: []
                };
            }
            
            const stock = parseInt(p.stock) || 0;
            const cost = parseFloat(p.baseCost) || 0;
            
            suppliers[supplierName].totalProducts++;
            suppliers[supplierName].totalStockValue += stock * cost;
            suppliers[supplierName].products.push(p.name);
        });

        // 2. Calculate Revenue/Profit from Sales History (Last 90 days)
        // This is heavy, so we'll use a simplified approach or cache.
        // For now, let's fetch orders and aggregate.
        const ordersRef = this.collection(this.db, 'onlineOrders'); // And storeSales ideally
        const ordersSnapshot = await this.getDocs(ordersRef);
        
        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    // We need to find the supplier for this item.
                    // This is tricky without a direct link in the order item.
                    // We have to look it up in our suppliers map.
                    
                    // Reverse lookup: Find supplier for product name
                    let foundSupplier = 'Unknown';
                    for (const [sName, sData] of Object.entries(suppliers)) {
                        if (sData.products.includes(item.name)) {
                            foundSupplier = sName;
                            break;
                        }
                    }
                    
                    if (suppliers[foundSupplier]) {
                        const qty = item.quantity || 1;
                        const price = item.price || 0;
                        const cost = item.cost || 0; // Assuming cost is snapshot in order
                        
                        suppliers[foundSupplier].totalRevenue += price * qty;
                        suppliers[foundSupplier].totalProfit += (price - cost) * qty;
                    }
                });
            }
        });

        // 3. Calculate Scores and Add Negotiation Leverage
        const scorecards = Object.values(suppliers).map(s => {
            const margin = s.totalRevenue > 0 ? (s.totalProfit / s.totalRevenue) * 100 : 0;
            
            // NEW: Gamified Negotiation Leverage
            let negotiationLeverage = '⏸️ None';
            let leverageClass = 'text-gray-400';
            
            if (s.totalRevenue > 5000 && margin > 30) {
                negotiationLeverage = '💪 Ask for Bulk Discount';
                leverageClass = 'text-green-400 font-bold';
            } else if (s.totalRevenue > 5000 && margin < 15) {
                negotiationLeverage = '🛑 Demand Lower Costs';
                leverageClass = 'text-red-400 font-bold';
            } else if (s.totalRevenue < 500 && s.totalStockValue > 2000) {
                negotiationLeverage = '↩️ Return Dead Stock';
                leverageClass = 'text-yellow-400 font-bold';
            } else if (s.totalRevenue > 2000 && margin > 20 && margin < 30) {
                negotiationLeverage = '🤝 Maintain Partnership';
                leverageClass = 'text-blue-400';
            }
            
            return {
                ...s,
                margin: margin,
                roi: s.totalStockValue > 0 ? (s.totalProfit / s.totalStockValue) * 100 : 0,
                negotiation: negotiationLeverage,
                leverageClass: leverageClass
            };
        });

        return scorecards.sort((a, b) => b.totalProfit - a.totalProfit);
    }

    // === SMART BUNDLES GENERATOR ===
    
    async generateSmartBundles() {
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const ordersSnapshot = await this.getDocs(ordersRef);
        
        const productPairs = {};
        const productCounts = {};

        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            if (order.items && order.items.length > 1) {
                // Sort items to ensure A+B is same as B+A
                const items = order.items.map(i => i.name).sort();
                
                // Generate pairs
                for (let i = 0; i < items.length; i++) {
                    const p1 = items[i];
                    productCounts[p1] = (productCounts[p1] || 0) + 1;
                    
                    for (let j = i + 1; j < items.length; j++) {
                        const p2 = items[j];
                        const pair = `${p1} + ${p2}`;
                        productPairs[pair] = (productPairs[pair] || 0) + 1;
                    }
                }
            }
        });

        // Filter for significant pairs (e.g., bought together > 2 times)
        const bundles = Object.entries(productPairs)
            .filter(([pair, count]) => count >= 2)
            .map(([pair, count]) => {
                const [p1, p2] = pair.split(' + ');
                // Calculate confidence: P(B|A) = Count(A+B) / Count(A)
                const confidence1 = (count / productCounts[p1]) * 100;
                const confidence2 = (count / productCounts[p2]) * 100;
                const confidence = Math.max(confidence1, confidence2); // Use the stronger direction
                
                return {
                    pair: pair,
                    count: count,
                    confidence: confidence,
                    products: [p1, p2]
                };
            })
            .sort((a, b) => b.count - a.count);

        return bundles;
    }

    // === CHURN PREDICTION (AI) ===
    
    /**
     * Identifies customers who are at risk of churning based on their purchase history.
     * Logic: If time since last order > (Average time between orders * multiplier)
     */
    async generateChurnPrediction() {
        const cacheKey = 'churn_prediction';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        // 1. Fetch all orders
        const ordersSnapshot = await this.getDocs(this.collection(this.db, 'onlineOrders'));
        const orders = ordersSnapshot.docs.map(doc => ({
            ...doc.data(),
            timestamp: this.normalizeTimestamp(doc.data().date || doc.data().createdAt)
        }));

        // 2. Group by Customer
        const customerOrders = {};
        orders.forEach(order => {
            const clientName = order.clientName || 'Unknown';
            if (!customerOrders[clientName]) customerOrders[clientName] = [];
            customerOrders[clientName].push(order);
        });

        const atRiskCustomers = [];
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;

        // 3. Analyze each customer
        for (const [clientName, clientOrders] of Object.entries(customerOrders)) {
            // Need at least 2 orders to calculate an interval
            if (clientOrders.length < 2) continue;

            // Sort by date ascending
            clientOrders.sort((a, b) => a.timestamp - b.timestamp);

            // Calculate average interval
            let totalInterval = 0;
            for (let i = 1; i < clientOrders.length; i++) {
                totalInterval += (clientOrders[i].timestamp - clientOrders[i-1].timestamp);
            }
            const avgInterval = totalInterval / (clientOrders.length - 1);
            
            // Calculate time since last order
            const lastOrderTime = clientOrders[clientOrders.length - 1].timestamp;
            const daysSinceLastOrder = (now - lastOrderTime) / DAY_MS;
            const avgIntervalDays = avgInterval / DAY_MS;

            // Threshold: If they haven't ordered in 2.5x their normal frequency
            // And their last order was more than 30 days ago (to avoid flagging very frequent buyers who just missed a day)
            if (daysSinceLastOrder > (avgIntervalDays * 2.5) && daysSinceLastOrder > 30) {
                atRiskCustomers.push({
                    name: clientName,
                    lastOrderDate: new Date(lastOrderTime).toLocaleDateString(),
                    daysSinceLast: Math.round(daysSinceLastOrder),
                    avgInterval: Math.round(avgIntervalDays),
                    totalOrders: clientOrders.length,
                    riskLevel: daysSinceLastOrder > (avgIntervalDays * 4) ? 'High' : 'Medium'
                });
            }
        }

        // Sort by risk (High first, then by days since last)
        atRiskCustomers.sort((a, b) => {
            if (a.riskLevel === 'High' && b.riskLevel !== 'High') return -1;
            if (a.riskLevel !== 'High' && b.riskLevel === 'High') return 1;
            return b.daysSinceLast - a.daysSinceLast;
        });

        this.setCache(cacheKey, atRiskCustomers);
        return atRiskCustomers;
    }

    // === SEASONAL TREND ALERTS ===

    /**
     * Predicts next month's sales based on last year's data and checks against current stock.
     */
    async generateSeasonalTrendAlerts() {
        const cacheKey = 'seasonal_trend_alerts';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        // 1. Determine "Next Month"
        const today = new Date();
        let targetMonth = today.getMonth() + 1; // 0-11, so +1 is next month
        let targetYear = today.getFullYear();
        
        if (targetMonth > 11) {
            targetMonth = 0;
            targetYear++;
        }
        
        // We want to look at LAST YEAR's data for this target month
        const lastYear = targetYear - 1;
        
        // 2. Fetch Orders
        const ordersSnapshot = await this.getDocs(this.collection(this.db, 'onlineOrders'));
        const orders = ordersSnapshot.docs.map(doc => ({
            ...doc.data(),
            timestamp: this.normalizeTimestamp(doc.data().date || doc.data().createdAt)
        }));

        // 3. Filter for Last Year's Target Month
        const seasonalOrders = orders.filter(order => {
            const date = new Date(order.timestamp);
            return date.getMonth() === targetMonth && date.getFullYear() === lastYear;
        });

        // 4. Aggregate Sales by Product
        const predictedDemand = {};
        seasonalOrders.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const productName = item.name;
                    predictedDemand[productName] = (predictedDemand[productName] || 0) + (item.quantity || 1);
                });
            }
        });

        // 5. Fetch Current Inventory
        const inventorySnapshot = await this.getDocs(this.collection(this.db, 'inventory'));
        const currentStock = {};
        inventorySnapshot.docs.forEach(doc => {
            const data = doc.data();
            currentStock[data.name] = data.quantity || 0;
        });

        // 6. Generate Alerts
        const alerts = [];
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const targetMonthName = monthNames[targetMonth];

        for (const [product, predictedQty] of Object.entries(predictedDemand)) {
            const stock = currentStock[product] || 0;
            
            // Alert if predicted demand is higher than current stock
            // Or if stock is dangerously low compared to demand (e.g. < 50% of demand)
            if (stock < predictedQty) {
                alerts.push({
                    product: product,
                    predictedSales: predictedQty,
                    currentStock: stock,
                    shortfall: predictedQty - stock,
                    month: targetMonthName,
                    year: lastYear,
                    urgency: stock === 0 ? 'Critical' : 'High'
                });
            }
        }

        // Sort by urgency and shortfall
        alerts.sort((a, b) => {
            if (a.urgency === 'Critical' && b.urgency !== 'Critical') return -1;
            if (a.urgency !== 'Critical' && b.urgency === 'Critical') return 1;
            return b.shortfall - a.shortfall;
        });

        this.setCache(cacheKey, alerts);
        return alerts;
    }

    // === DYNAMIC PRICING & DEAD STOCK ===

    /**
     * Analyzes inventory and sales to suggest price changes.
     * - Identifies Dead Stock (no sales > 60 days) -> Suggest Discount
     * - Identifies High Demand (high velocity) -> Suggest Premium
     */
    async generateDynamicPricing() {
        const cacheKey = 'dynamic_pricing';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        // 1. Fetch Data
        const [productsSnap, ordersSnap] = await Promise.all([
            this.getDocs(this.collection(this.db, 'products')),
            this.getDocs(this.collection(this.db, 'onlineOrders'))
        ]);

        const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const orders = ordersSnap.docs.map(doc => ({
            ...doc.data(),
            timestamp: this.normalizeTimestamp(doc.data().date || doc.data().createdAt)
        }));

        // 2. Calculate Last Sale Date & Velocity
        const productStats = {};
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;

        products.forEach(p => {
            productStats[p.name] = {
                lastSale: 0,
                sales30Days: 0,
                stock: p.stock || 0,
                price: p.price || 0,
                cost: p.baseCost || 0,
                id: p.id
            };
        });

        orders.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
                const daysSince = (now - order.timestamp) / DAY_MS;
                
                order.items.forEach(item => {
                    if (productStats[item.name]) {
                        // Update last sale
                        if (order.timestamp > productStats[item.name].lastSale) {
                            productStats[item.name].lastSale = order.timestamp;
                        }
                        // Update velocity
                        if (daysSince <= 30) {
                            productStats[item.name].sales30Days += (item.quantity || 1);
                        }
                    }
                });
            }
        });

        // 3. Generate Recommendations
        const recommendations = [];

        for (const [name, stats] of Object.entries(productStats)) {
            if (stats.stock <= 0) continue; // Ignore out of stock

            const daysSinceLastSale = stats.lastSale === 0 ? 999 : (now - stats.lastSale) / DAY_MS;

            // A. Dead Stock (No sales > 60 days)
            if (daysSinceLastSale > 60) {
                const discount = 0.15; // Start with 15%
                const newPrice = stats.price * (1 - discount);
                // Ensure we don't go below cost + margin unless critical
                const minPrice = stats.cost * 1.10; 

                recommendations.push({
                    product: name,
                    type: 'Dead Stock',
                    reason: `No sales for ${Math.floor(daysSinceLastSale)} days`,
                    action: 'Discount',
                    currentPrice: stats.price,
                    suggestedPrice: Math.max(newPrice, minPrice),
                    impact: 'Clear Inventory'
                });
            }
            // B. High Demand (High velocity, low stock relative to sales)
            else if (stats.sales30Days > 10 && stats.stock < (stats.sales30Days * 0.5)) {
                // Selling fast, running low -> Opportunity to increase margin
                recommendations.push({
                    product: name,
                    type: 'High Demand',
                    reason: `High sales velocity (${stats.sales30Days}/mo)`,
                    action: 'Increase Price',
                    currentPrice: stats.price,
                    suggestedPrice: stats.price * 1.05, // +5%
                    impact: 'Maximize Profit'
                });
            }
        }

        this.setCache(cacheKey, recommendations);
        return recommendations;
    }

    // === CASH FLOW FORECASTING ===

    /**
     * Predicts cash flow for the next 30 days based on Debtors (Inflow) and Creditors (Outflow).
     */
    async generateCashFlowForecast(days = 30) {
        const cacheKey = 'cash_flow_forecast';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const forecast = [];
        
        // Helper function to safely parse dates
        const safeDate = (dateValue) => {
            if (!dateValue) return null;
            const date = new Date(dateValue);
            return isNaN(date.getTime()) ? null : date.getTime();
        };
        
        // 1. Fetch Receivables (Money Coming In from Debtors)
        const debtorsSnap = await this.getDocs(this.collection(this.db, 'debtors'));
        const receivables = [];
        
        for (const doc of debtorsSnap.docs) {
            // Fetch subcollection 'invoices' for each debtor
            const invoicesSnap = await this.getDocs(this.collection(this.db, 'debtors', doc.id, 'invoices'));
            invoicesSnap.forEach(inv => {
                const data = inv.data();
                if (data.remainingBalance > 0) {
                    // Estimate payment date: Due date or Date + 30 days
                    let payDate = safeDate(data.dueDate) || (safeDate(data.date) ? safeDate(data.date) + (30 * DAY_MS) : now + (7 * DAY_MS));
                    if (payDate < now) payDate = now + (2 * DAY_MS); // Overdue? Assume paying soon
                    
                    receivables.push({
                        type: 'in',
                        amount: data.remainingBalance,
                        date: payDate,
                        entity: doc.data().name || 'Unknown Debtor',
                        ref: data.invoiceNumber || 'Invoice'
                    });
                }
            });
        }

        // 2. Fetch Payables (Money Going Out to Creditors)
        const creditorsSnap = await this.getDocs(this.collection(this.db, 'creditors'));
        const payables = [];

        for (const doc of creditorsSnap.docs) {
            // Fetch subcollection 'invoices' for each creditor
            const invoicesSnap = await this.getDocs(this.collection(this.db, 'creditors', doc.id, 'invoices'));
            invoicesSnap.forEach(inv => {
                const data = inv.data();
                if (data.remainingBalance > 0) {
                    let payDate = safeDate(data.dueDate) || (safeDate(data.date) ? safeDate(data.date) + (30 * DAY_MS) : now + (7 * DAY_MS));
                    if (payDate < now) payDate = now + (1 * DAY_MS); // Overdue? Pay ASAP
                    
                    payables.push({
                        type: 'out',
                        amount: data.remainingBalance,
                        date: payDate,
                        entity: doc.data().name || 'Unknown Creditor',
                        ref: data.invoiceNumber || 'Bill'
                    });
                }
            });
        }

        // 3. Build Daily Forecast
        const transactions = [...receivables, ...payables].sort((a, b) => a.date - b.date);
        
        let runningBalance = 0; // Represents Net Change, not absolute bank balance
        
        // Group by day
        const dailyMap = new Map();
        for (let i = 0; i < days; i++) {
            const date = new Date(now + (i * DAY_MS));
            const dateStr = date.toISOString().split('T')[0];
            dailyMap.set(dateStr, {
                date: dateStr,
                in: 0,
                out: 0,
                balance: 0,
                events: []
            });
        }

        transactions.forEach(t => {
            if (!t.date || isNaN(t.date)) return; // Skip invalid dates
            const dateStr = new Date(t.date).toISOString().split('T')[0];
            if (dailyMap.has(dateStr)) {
                const day = dailyMap.get(dateStr);
                if (t.type === 'in') day.in += t.amount;
                else day.out += t.amount;
                day.events.push(t);
            }
        });

        let minBalance = 0;
        let minBalanceDate = '';

        Array.from(dailyMap.values()).forEach(day => {
            runningBalance += day.in - day.out;
            day.balance = runningBalance;
            forecast.push(day);

            if (runningBalance < minBalance) {
                minBalance = runningBalance;
                minBalanceDate = day.date;
            }
        });

        const result = {
            forecast,
            summary: {
                totalIn: receivables.reduce((sum, r) => sum + r.amount, 0),
                totalOut: payables.reduce((sum, p) => sum + p.amount, 0),
                netChange: runningBalance,
                minBalance,
                minBalanceDate,
                riskLevel: minBalance < -1000 ? 'Critical' : (minBalance < 0 ? 'Warning' : 'Healthy'),
                upcomingEvents: transactions.slice(0, 5) // Next 5 transactions
            }
        };

        this.setCache(cacheKey, result);
        return result;
    }

    // === INVENTORY SHRINKAGE & DATA ASSISTANT ===

    /**
     * Detects potential inventory shrinkage by comparing expected stock vs actual stock.
     * Since we don't have a full transaction log in this version, we'll simulate it
     * by looking for products where stock was manually adjusted downwards or is negative.
     */
    async detectInventoryShrinkage() {
        const cacheKey = 'inventory_shrinkage';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        const productsSnap = await this.getDocs(this.collection(this.db, 'products'));
        const shrinkageAlerts = [];

        productsSnap.forEach(doc => {
            const p = doc.data();
            const stock = parseInt(p.stock) || 0;
            
            // 1. Negative Stock (Impossible, implies unrecorded sales or theft)
            if (stock < 0) {
                shrinkageAlerts.push({
                    product: p.name,
                    issue: 'Negative Stock',
                    details: `Current stock is ${stock}. This implies ${Math.abs(stock)} units were sold but not recorded properly.`,
                    severity: 'High'
                });
            }

            // 2. High Value, Low Movement (Risk of theft)
            // If price > €50 and no sales in 90 days, but stock > 0
            // This is a "Risk" alert, not confirmed shrinkage
            if (p.price > 50 && stock > 0) {
                // We would check sales history here, but for efficiency we'll flag it as "Audit Needed"
                shrinkageAlerts.push({
                    product: p.name,
                    issue: 'High Value Audit',
                    details: `High value item (€${p.price}) with stock ${stock}. Verify physical count.`,
                    severity: 'Medium'
                });
            }
        });

        this.setCache(cacheKey, shrinkageAlerts);
        return shrinkageAlerts;
    }

    /**
     * Natural Language Data Assistant
     * Parses simple English queries and returns relevant data.
     */
    async askAssistant(queryText) {
        const q = queryText.toLowerCase();
        
        // 1. "Who owes me..." (Debtors)
        if (q.includes('owe') || q.includes('debt')) {
            const debtorsSnap = await this.getDocs(this.collection(this.db, 'debtors'));
            const debtors = [];
            
            for (const doc of debtorsSnap.docs) {
                const invoicesSnap = await this.getDocs(this.collection(this.db, 'debtors', doc.id, 'invoices'));
                let total = 0;
                invoicesSnap.forEach(inv => total += (inv.data().remainingBalance || 0));
                if (total > 0) debtors.push({ name: doc.data().name, amount: total });
            }
            
            debtors.sort((a, b) => b.amount - a.amount);
            
            if (debtors.length === 0) return "No one owes you money right now! 🎉";
            
            const topDebtor = debtors[0];
            return `You have ${debtors.length} debtors. The biggest one is **${topDebtor.name}** who owes **€${topDebtor.amount.toFixed(2)}**. Total outstanding: **€${debtors.reduce((s, d) => s + d.amount, 0).toFixed(2)}**.`;
        }

        // 2. "Profit" or "Revenue"
        if (q.includes('profit') || q.includes('revenue') || q.includes('money')) {
            const analysis = await this.analyzeProfitability(30);
            const totalProfit = analysis.highProfit.reduce((sum, p) => sum + parseFloat(p.profit), 0) + 
                                analysis.lowProfit.reduce((sum, p) => sum + parseFloat(p.profit), 0);
            
            return `In the last 30 days, your estimated profit is **€${totalProfit.toFixed(2)}**. Your most profitable product is **${analysis.highProfit[0]?.name || 'N/A'}** (€${analysis.highProfit[0]?.profit || 0}).`;
        }

        // 3. "Stock" or "Low"
        if (q.includes('stock') || q.includes('low')) {
            const productsSnap = await this.getDocs(this.collection(this.db, 'products'));
            let lowStockCount = 0;
            let outOfStockCount = 0;
            
            productsSnap.forEach(doc => {
                const s = parseInt(doc.data().stock) || 0;
                if (s === 0) outOfStockCount++;
                else if (s < 5) lowStockCount++;
            });
            
            return `Inventory Status: **${outOfStockCount}** products are out of stock ❌. **${lowStockCount}** are running low (less than 5 units) ⚠️.`;
        }

        // 4. "Best selling" or "Popular"
        if (q.includes('best') || q.includes('selling') || q.includes('popular')) {
            const analysis = await this.analyzeProfitability(30);
            const top = analysis.volumeLeaders[0];
            if (!top) return "Not enough sales data yet.";
            return `Your best-selling product is **${top.name}** with **${top.units}** units sold recently.`;
        }

        return "I'm not sure about that yet. Try asking about 'debts', 'profit', 'stock', or 'best selling products'.";
    }

    async getProductSalesHistory(productName, days) {
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const storeSalesRef = this.collection(this.db, 'storeSales');
        const [ordersSnapshot, storeSalesSnapshot] = await Promise.all([
            this.getDocs(ordersRef),
            this.getDocs(storeSalesRef)
        ]);
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffTimestamp = cutoffDate.getTime();

        const salesByDate = {};

        const processSales = (snapshot) => {
            snapshot.forEach(doc => {
                const order = doc.data();
                let orderTime = this.normalizeTimestamp(order.timestamp);
                
                if (orderTime < cutoffTimestamp) return;

                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        // Match by name
                        const itemName = item.name || item.product || item.productName || '';
                        if (productName && itemName !== productName) return;
                        if (!productName && (itemName === '00' || itemName === '')) return;

                        const dateKey = new Date(orderTime).toISOString().split('T')[0];
                        
                        if (!salesByDate[dateKey]) {
                            salesByDate[dateKey] = {
                                date: orderTime,
                                quantity: 0,
                                revenue: 0
                            };
                        }
                        
                        salesByDate[dateKey].quantity += item.quantity || 1;
                        salesByDate[dateKey].revenue += (item.price || 0) * (item.quantity || 1);
                    });
                }
                
                // Also check if this is a direct sale record (not in items array)
                if (productName && !order.items && order.productName === productName) {
                    const dateKey = new Date(orderTime).toISOString().split('T')[0];
                    
                    if (!salesByDate[dateKey]) {
                        salesByDate[dateKey] = {
                            date: orderTime,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    
                    salesByDate[dateKey].quantity += order.quantity || 1;
                    salesByDate[dateKey].revenue += (order.total || order.price || 0);
                }
            });
        };

        processSales(ordersSnapshot);
        processSales(storeSalesSnapshot);

        return Object.values(salesByDate).sort((a, b) => a.date - b.date);
    }

    async getAllProductSalesData(days) {
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const storeSalesRef = this.collection(this.db, 'storeSales');
        const productsRef = this.collection(this.db, 'products');
        
        const [ordersSnapshot, storeSalesSnapshot, productsSnapshot] = await Promise.all([
            this.getDocs(ordersRef),
            this.getDocs(storeSalesRef),
            this.getDocs(productsRef)
        ]);

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffTimestamp = cutoffDate.getTime();
        const midpoint = cutoffTimestamp + (Date.now() - cutoffTimestamp) / 2;

        const productData = {};

        // Initialize with catalog
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            productData[product.name] = {
                name: product.name,
                totalSales: 0,
                totalRevenue: 0,
                profit: 0,
                salesFirstHalf: 0,
                salesSecondHalf: 0,
                age: 365 // Default age
            };
        });

        // Process sales data
        const processSales = (snapshot) => {
            snapshot.forEach(doc => {
                const order = doc.data();
                const orderTime = this.normalizeTimestamp(order.timestamp);
                
                if (orderTime < cutoffTimestamp) return;

                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        const name = item.name || item.product || item.productName || '';
                        if (!name || name === '00' || name === '') return;

                        if (!productData[name]) {
                            productData[name] = {
                                name: name,
                                totalSales: 0,
                                totalRevenue: 0,
                                profit: 0,
                                salesFirstHalf: 0,
                                salesSecondHalf: 0,
                                age: Math.floor((Date.now() - orderTime) / (1000 * 60 * 60 * 24))
                            };
                        }

                        const quantity = item.quantity || 1;
                        const revenue = (item.price || 0) * quantity;
                        const cost = (item.cost || 0) * quantity;
                        const profit = revenue - cost;

                        productData[name].totalSales += quantity;
                        productData[name].totalRevenue += revenue;
                        productData[name].profit += profit;

                        if (orderTime < midpoint) {
                            productData[name].salesFirstHalf += quantity;
                        } else {
                            productData[name].salesSecondHalf += quantity;
                        }
                    });
                }
                
                // Handle direct sales records (not in items array)
                if (!order.items && order.productName) {
                    const name = order.productName;
                    if (name && name !== '00' && name !== '') {
                        if (!productData[name]) {
                            productData[name] = {
                                name: name,
                                totalSales: 0,
                                totalRevenue: 0,
                                profit: 0,
                                salesFirstHalf: 0,
                                salesSecondHalf: 0,
                                age: Math.floor((Date.now() - orderTime) / (1000 * 60 * 60 * 24))
                            };
                        }

                        const quantity = order.quantity || 1;
                        const revenue = order.total || order.price || 0;
                        const cost = (order.cost || 0) * quantity;
                        const profit = revenue - cost;

                        productData[name].totalSales += quantity;
                        productData[name].totalRevenue += revenue;
                        productData[name].profit += profit;

                        if (orderTime < midpoint) {
                            productData[name].salesFirstHalf += quantity;
                        } else {
                            productData[name].salesSecondHalf += quantity;
                        }
                    }
                }
            });
        };

        // Aggregate both online and store sales
        processSales(ordersSnapshot);
        processSales(storeSalesSnapshot);

        return Object.values(productData);
    }

    generateMarketInsights(analysis) {
        const insights = [];

        if (analysis.growthRate > 10) {
            insights.push(`🚀 Market growing at ${analysis.growthRate.toFixed(1)}% - excellent growth!`);
        } else if (analysis.growthRate < -5) {
            insights.push(`⚠️ Market declining at ${Math.abs(analysis.growthRate).toFixed(1)}% - take action`);
        }

        if (analysis.topGrowing.length > 0) {
            insights.push(`📈 ${analysis.topGrowing.length} products showing strong growth`);
        }

        if (analysis.emerging.length > 0) {
            insights.push(`🌟 ${analysis.emerging.length} emerging products - watch these closely`);
        }

        if (analysis.declining.length > 5) {
            insights.push(`⚠️ ${analysis.declining.length} products declining - review pricing/marketing`);
        }

        return insights;
    }

    generateInsights(analysis) {
        const insights = [];

        if (analysis.growthRate > 10) {
            insights.push(`🚀 Market growing at ${analysis.growthRate.toFixed(1)}% - excellent growth!`);
        } else if (analysis.growthRate < -5) {
            insights.push(`⚠️ Market declining at ${Math.abs(analysis.growthRate).toFixed(1)}% - take action`);
        }

        if (analysis.topGrowing.length > 0) {
            insights.push(`📈 ${analysis.topGrowing.length} products showing strong growth`);
        }

        if (analysis.emerging.length > 0) {
            insights.push(`🌟 ${analysis.emerging.length} emerging products - watch these closely`);
        }

        if (analysis.declining.length > 5) {
            insights.push(`⚠️ ${analysis.declining.length} products declining - review pricing/marketing`);
        }

        return insights;
    }

    generateSeasonalRecommendations(patterns) {
        const recommendations = [];

        if (patterns.weekly.hasPattern) {
            recommendations.push(`Stock up before ${patterns.weekly.bestDay}s - your best day`);
            recommendations.push(`Use ${patterns.weekly.worstDay}s for restocking and admin tasks`);
        }

        if (patterns.monthly.hasPattern) {
            recommendations.push(`Prepare extra inventory for ${patterns.monthly.peakMonth}`);
            recommendations.push(`Run promotions during ${patterns.monthly.slowMonth} to boost sales`);
        }

        return recommendations;
    }

    calculateVariance(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }

    calculateSimpleTrend(data) {
        if (data.length < 2) return 0;
        const first = data.slice(0, Math.floor(data.length / 2));
        const second = data.slice(Math.floor(data.length / 2));
        
        const firstAvg = first.reduce((sum, p) => sum + p.quantity, 0) / first.length;
        const secondAvg = second.reduce((sum, p) => sum + p.quantity, 0) / second.length;
        
        return firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
    }

    determineConfidence(variance, dataPoints) {
        if (dataPoints < 7) return 'very-low';
        if (dataPoints < 14) return 'low';
        
        if (variance < 1) return 'very-high';
        if (variance < 5) return 'high';
        if (variance < 20) return 'medium';
        return 'low';
    }

    generateRecommendation(forecast, historicalData) {
        const avgSales = historicalData.reduce((sum, p) => sum + p.quantity, 0) / historicalData.length;
        const ratio = forecast / avgSales;

        if (ratio > 1.5) return 'Strong growth expected - increase inventory significantly';
        if (ratio > 1.2) return 'Growth expected - stock up moderately';
        if (ratio < 0.7) return 'Decline expected - reduce stock orders';
        if (ratio < 0.8) return 'Slight decline - maintain current stock levels';
        return 'Stable demand - continue as usual';
    }

    generateProfitabilityRecommendations(analysis) {
        const recommendations = [];

        if (analysis.lowMargin.length > 0) {
            recommendations.push(`Consider increasing prices on ${analysis.lowMargin.length} low-margin products`);
        }

        if (analysis.volumeLeaders.length > 0) {
            recommendations.push(`Focus marketing on volume leaders - they drive revenue`);
        }

        if (analysis.lowProfit.length > 0) {
            recommendations.push(`Review costs or discontinue ${analysis.lowProfit.length} low-profit items`);
        }

        return recommendations;
    }

    async generateChurnPrediction() {
        const debtorsRef = this.collection(this.db, 'debtors');
        const debtorsSnapshot = await this.getDocs(debtorsRef);
        
        const customers = [];
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;

        for (const doc of debtorsSnapshot.docs) {
            const customer = doc.data();
            const invoicesRef = this.collection(this.db, 'debtors', doc.id, 'invoices');
            const invoicesSnapshot = await this.getDocs(invoicesRef);
            
            const orders = [];
            invoicesSnapshot.forEach(inv => {
                const invData = inv.data();
                if (invData.date) {
                    orders.push(this.normalizeTimestamp(invData.date));
                }
            });

            if (orders.length >= 2) {
                orders.sort((a, b) => a - b);
                const lastOrder = orders[orders.length - 1];
                const daysSinceLast = (now - lastOrder) / DAY_MS;
                
                // Calculate average interval
                let totalInterval = 0;
                for (let i = 1; i < orders.length; i++) {
                    totalInterval += (orders[i] - orders[i - 1]) / DAY_MS;
                }
                const avgInterval = Math.round(totalInterval / (orders.length - 1));
                
                // Flag as at-risk if silent for 2x their normal interval
                if (daysSinceLast > avgInterval * 2) {
                    customers.push({
                        name: customer.name || 'Unknown Customer',
                        lastOrderDate: new Date(lastOrder).toLocaleDateString(),
                        daysSinceLast: Math.round(daysSinceLast),
                        avgInterval: avgInterval,
                        riskLevel: daysSinceLast > avgInterval * 3 ? 'High' : 'Medium'
                    });
                }
            }
        }

        return customers.sort((a, b) => b.daysSinceLast - a.daysSinceLast);
    }

    async detectInventoryShrinkage() {
        return [];
    }

    async generateSeasonalTrendAlerts() {
        const seasonal = await this.detectSeasonalTrends(null, 3);
        
        if (!seasonal.hasSeasonality) {
            return [];
        }

        const alerts = [];
        
        if (seasonal.patterns.weekly.hasPattern) {
            alerts.push({
                type: 'Weekly Pattern',
                message: `${seasonal.patterns.weekly.bestDay} is your best sales day`,
                action: 'Stock up before weekend'
            });
        }

        if (seasonal.patterns.monthly.hasPattern) {
            alerts.push({
                type: 'Monthly Pattern',
                message: `${seasonal.patterns.monthly.peakMonth} typically sees peak sales`,
                action: 'Prepare inventory in advance'
            });
        }

        return alerts;
    }

    normalizeTimestamp(timestamp) {
        if (typeof timestamp === 'object' && timestamp.toMillis) {
            return timestamp.toMillis();
        } else if (typeof timestamp === 'object' && timestamp.seconds) {
            return timestamp.seconds * 1000;
        }
        return timestamp;
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }
}

// ES6 module - use 'import BusinessIntelligence from ...' instead
