// Anomaly Detection AI
class AnomalyDetection {
    constructor(db, firebaseImports = {}) {
        this.db = db;
        this.collection = firebaseImports.collection;
        this.getDocs = firebaseImports.getDocs;
        this.query = firebaseImports.query;
        this.where = firebaseImports.where;
        this.orderBy = firebaseImports.orderBy;
        this.limit = firebaseImports.limit;
        
        this.alertThresholds = {
            salesDrop: 0.30, // 30% drop triggers alert
            salesSpike: 2.0,  // 200% increase triggers alert
            returnsIncrease: 0.50, // 50% more returns
            stockDepletion: 0.70, // 70% faster stock usage
            orderValueDrop: 0.40, // 40% drop in order values
            lowStockItems: 5 // Number of items before alert
        };
    }

    // === MAIN ANOMALY DETECTION ===
    
    async detectAllAnomalies() {
        const anomalies = {
            critical: [],
            warning: [],
            info: [],
            timestamp: Date.now()
        };

        // Run all detection methods in parallel
        const [
            salesAnomalies,
            returnsAnomalies,
            stockAnomalies,
            orderAnomalies,
            fraudAnomalies
        ] = await Promise.all([
            this.detectSalesAnomalies(),
            this.detectReturnsAnomalies(),
            this.detectStockAnomalies(),
            this.detectOrderAnomalies(),
            this.detectFraudPatterns()
        ]);

        // Categorize by severity
        this.categorizeAnomalies(salesAnomalies, anomalies);
        this.categorizeAnomalies(returnsAnomalies, anomalies);
        this.categorizeAnomalies(stockAnomalies, anomalies);
        this.categorizeAnomalies(orderAnomalies, anomalies);
        this.categorizeAnomalies(fraudAnomalies, anomalies);

        return anomalies;
    }

    // === SALES ANOMALY DETECTION ===
    
    async detectSalesAnomalies() {
        const anomalies = [];
        
        // Get sales for today, same day last week, and last 7 days average
        const today = await this.getSalesForPeriod(0, 1);
        const sameDayLastWeek = await this.getSalesForPeriod(7, 8); // Compare Monday to Monday
        const last7Days = await this.getSalesForPeriod(1, 8);
        const avgLast7Days = last7Days / 7;

        // Check for significant drop from same day last week (avoids weekend false alarms)
        if (sameDayLastWeek > 0) {
            const dropPercentage = ((sameDayLastWeek - today) / sameDayLastWeek);
            
            if (dropPercentage >= 0.40) {
                anomalies.push({
                    type: 'sales_drop',
                    severity: 'critical',
                    title: `Sales Dropped ${Math.round(dropPercentage * 100)}% vs Last Week`,
                    description: `Today's revenue (€${today.toFixed(2)}) is ${Math.round(dropPercentage * 100)}% lower than this day last week (€${sameDayLastWeek.toFixed(2)})`,
                    recommendation: 'Investigate immediately - check for system issues, payment problems, or market factors',
                    metric: {
                        today: today,
                        lastWeek: sameDayLastWeek,
                        change: -dropPercentage
                    }
                });
            } else if (dropPercentage >= this.alertThresholds.salesDrop) {
                anomalies.push({
                    type: 'sales_drop',
                    severity: 'warning',
                    title: `Sales Down ${Math.round(dropPercentage * 100)}% vs Last Week`,
                    description: `Sales lower than usual for this day of the week`,
                    recommendation: 'Review marketing activities and customer engagement',
                    metric: {
                        today: today,
                        lastWeek: sameDayLastWeek,
                        change: -dropPercentage
                    }
                });
            }
        }

        // Check for spike (could be good or suspicious)
        if (avgLast7Days > 0) {
            const spikeRatio = today / avgLast7Days;
            
            if (spikeRatio >= 3.0) {
                anomalies.push({
                    type: 'sales_spike',
                    severity: 'warning',
                    title: `Unusual Sales Spike - ${Math.round(spikeRatio * 100)}% of Normal`,
                    description: `Today's sales (€${today.toFixed(2)}) are ${Math.round((spikeRatio - 1) * 100)}% higher than average (€${avgLast7Days.toFixed(2)})`,
                    recommendation: 'Verify orders are legitimate - check for bulk orders or potential fraud',
                    metric: {
                        today: today,
                        average: avgLast7Days,
                        ratio: spikeRatio
                    }
                });
            } else if (spikeRatio >= this.alertThresholds.salesSpike) {
                anomalies.push({
                    type: 'sales_spike',
                    severity: 'info',
                    title: `Strong Sales Day - ${Math.round((spikeRatio - 1) * 100)}% Above Average`,
                    description: `Excellent performance today!`,
                    recommendation: 'Analyze what drove the increase - replicate successful strategies',
                    metric: {
                        today: today,
                        average: avgLast7Days,
                        ratio: spikeRatio
                    }
                });
            }
        }

        return anomalies;
    }

    // === RETURNS ANOMALY DETECTION ===
    
    async detectReturnsAnomalies() {
        const anomalies = [];
        
        // Get returns for last 7 days vs previous 7 days
        const recentReturns = await this.getReturnsForPeriod(0, 7);
        const previousReturns = await this.getReturnsForPeriod(7, 14);

        if (previousReturns.count > 0) {
            const increaseRatio = recentReturns.count / previousReturns.count - 1;
            
            if (increaseRatio >= 1.0) {
                anomalies.push({
                    type: 'returns_spike',
                    severity: 'critical',
                    title: `Returns Doubled - Quality Issue Suspected`,
                    description: `${recentReturns.count} returns in last 7 days vs ${previousReturns.count} in previous week`,
                    recommendation: 'Urgent: Check product quality, inspect recent shipments, contact customers for feedback',
                    metric: {
                        recent: recentReturns.count,
                        previous: previousReturns.count,
                        increase: increaseRatio,
                        topProducts: recentReturns.topProducts
                    }
                });
            } else if (increaseRatio >= this.alertThresholds.returnsIncrease) {
                anomalies.push({
                    type: 'returns_spike',
                    severity: 'warning',
                    title: `Returns Increased ${Math.round(increaseRatio * 100)}%`,
                    description: `Higher return rate than normal`,
                    recommendation: 'Review returned products - identify common issues',
                    metric: {
                        recent: recentReturns.count,
                        previous: previousReturns.count,
                        increase: increaseRatio,
                        topProducts: recentReturns.topProducts
                    }
                });
            }
        }

        return anomalies;
    }

    // === STOCK ANOMALY DETECTION ===
    
    async detectStockAnomalies() {
        const anomalies = [];
        
        // Get current low stock items
        const lowStockProducts = await this.getLowStockProducts();
        
        if (lowStockProducts.length >= this.alertThresholds.lowStockItems) {
            anomalies.push({
                type: 'low_stock_multiple',
                severity: 'critical',
                title: `${lowStockProducts.length} Products Running Low (Based on Sales)`,
                description: `Products will run out in less than 14 days at current sales rate`,
                recommendation: `Review reorder list immediately - these items are actively selling`,
                metric: {
                    count: lowStockProducts.length,
                    products: lowStockProducts.slice(0, 5).map(p => ({
                        name: p.name,
                        stock: p.stock,
                        daysLeft: Math.round(p.daysLeft),
                        soldLast90Days: p.totalSold90Days || Math.round(p.velocity * 90)
                    }))
                }
            });
        }

        // Check for products with abnormal stock depletion rate
        const fastDepletingProducts = await this.getFastDepletingProducts();
        
        if (fastDepletingProducts.length > 0) {
            fastDepletingProducts.forEach(product => {
                anomalies.push({
                    type: 'fast_depletion',
                    severity: 'warning',
                    title: `${product.name} - Stock Depleting Faster Than Normal`,
                    description: `Current rate: ${product.currentVelocity.toFixed(1)} units/day vs normal ${product.normalVelocity.toFixed(1)} units/day`,
                    recommendation: `Reorder ${product.name} sooner than scheduled - high demand detected`,
                    metric: {
                        product: product.name,
                        currentStock: product.stock,
                        daysUntilStockout: product.daysLeft,
                        velocityIncrease: product.velocityRatio
                    }
                });
            });
        }

        return anomalies;
    }

    // === ORDER ANOMALY DETECTION ===
    
    async detectOrderAnomalies() {
        const anomalies = [];
        
        // Check average order value
        const todayOrders = await this.getOrdersForPeriod(0, 1);
        const last7DaysOrders = await this.getOrdersForPeriod(1, 8);
        
        if (todayOrders.count > 0 && last7DaysOrders.avgValue > 0) {
            const todayAvgValue = todayOrders.totalValue / todayOrders.count;
            const dropRatio = (last7DaysOrders.avgValue - todayAvgValue) / last7DaysOrders.avgValue;
            
            if (dropRatio >= this.alertThresholds.orderValueDrop) {
                anomalies.push({
                    type: 'order_value_drop',
                    severity: 'warning',
                    title: `Average Order Value Down ${Math.round(dropRatio * 100)}%`,
                    description: `Today's avg: €${todayAvgValue.toFixed(2)} vs normal €${last7DaysOrders.avgValue.toFixed(2)}`,
                    recommendation: 'Promote higher-value items or suggest bundles to increase order size',
                    metric: {
                        todayAvg: todayAvgValue,
                        normalAvg: last7DaysOrders.avgValue,
                        drop: dropRatio
                    }
                });
            }
        }

        // Check for unusual order patterns (many small orders)
        if (todayOrders.count > last7DaysOrders.avgCount * 2 && todayOrders.totalValue < last7DaysOrders.avgTotal) {
            anomalies.push({
                type: 'unusual_order_pattern',
                severity: 'info',
                title: `Many Small Orders Today`,
                description: `${todayOrders.count} orders but lower total revenue than usual`,
                recommendation: 'Possible testing or fraud - review individual orders',
                metric: {
                    orderCount: todayOrders.count,
                    normalCount: last7DaysOrders.avgCount,
                    totalValue: todayOrders.totalValue
                }
            });
        }

        return anomalies;
    }

    // === FRAUD DETECTION ===
    
    async detectFraudPatterns() {
        const anomalies = [];
        
        // Get recent orders
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const recentOrders = await this.getDocs(ordersRef);
        
        const suspiciousPatterns = {
            duplicateOrders: [],
            highValueOrders: [],
            rapidOrders: []
        };

        const orders = [];
        const ordersByCustomer = new Map();
        
        recentOrders.forEach(doc => {
            const order = { id: doc.id, ...doc.data() };
            const orderTime = this.normalizeTimestamp(order.timestamp);
            
            // Only check last 24 hours
            if (Date.now() - orderTime < 24 * 60 * 60 * 1000) {
                orders.push(order);
                
                const customer = order.customerName || 'Unknown';
                if (!ordersByCustomer.has(customer)) {
                    ordersByCustomer.set(customer, []);
                }
                ordersByCustomer.get(customer).push(order);
            }
        });

        // Check for duplicate orders (same customer, same items, short time)
        ordersByCustomer.forEach((customerOrders, customer) => {
            if (customerOrders.length >= 3) {
                const times = customerOrders.map(o => this.normalizeTimestamp(o.timestamp));
                const timeSpan = Math.max(...times) - Math.min(...times);
                
                // 3+ orders in less than 1 hour
                if (timeSpan < 60 * 60 * 1000) {
                    suspiciousPatterns.duplicateOrders.push({
                        customer: customer,
                        count: customerOrders.length,
                        timeSpan: Math.round(timeSpan / 60000) + ' minutes'
                    });
                }
            }
        });

        // Check for unusually high-value orders
        orders.forEach(order => {
            if (order.totalPrice > 5000) {
                suspiciousPatterns.highValueOrders.push({
                    orderId: order.id,
                    customer: order.customerName,
                    amount: order.totalPrice,
                    status: order.status
                });
            }
        });

        // Generate anomalies for suspicious patterns
        if (suspiciousPatterns.duplicateOrders.length > 0) {
            anomalies.push({
                type: 'potential_fraud',
                severity: 'warning',
                title: `Suspicious: ${suspiciousPatterns.duplicateOrders.length} Customers with Multiple Orders`,
                description: `Rapid repeated orders detected - possible testing or errors`,
                recommendation: 'Review these orders before fulfillment - contact customers to confirm',
                metric: {
                    patterns: suspiciousPatterns.duplicateOrders
                }
            });
        }

        if (suspiciousPatterns.highValueOrders.length > 0) {
            anomalies.push({
                type: 'high_value_orders',
                severity: 'info',
                title: `${suspiciousPatterns.highValueOrders.length} High-Value Orders (>€5000)`,
                description: `Large orders require verification`,
                recommendation: 'Confirm payment method and delivery details before shipping',
                metric: {
                    orders: suspiciousPatterns.highValueOrders
                }
            });
        }

        return anomalies;
    }

    // === HELPER METHODS ===
    
    async getSalesForPeriod(daysAgo, daysBack) {
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const snapshot = await this.getDocs(ordersRef);
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - daysAgo);
        endDate.setHours(23, 59, 59, 999);
        
        let totalRevenue = 0;
        
        snapshot.forEach(doc => {
            const order = doc.data();
            const orderTime = this.normalizeTimestamp(order.timestamp);
            
            if (orderTime >= startDate.getTime() && orderTime <= endDate.getTime()) {
                if (order.status === 'Paid' || order.status === 'Shipped') {
                    totalRevenue += order.totalPrice || 0;
                }
            }
        });
        
        return totalRevenue;
    }

    async getReturnsForPeriod(daysAgo, daysBack) {
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const snapshot = await this.getDocs(ordersRef);
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - daysAgo);
        
        let returnCount = 0;
        const productReturns = new Map();
        
        snapshot.forEach(doc => {
            const order = doc.data();
            const orderTime = this.normalizeTimestamp(order.timestamp);
            
            if (orderTime >= startDate.getTime() && orderTime <= endDate.getTime()) {
                if (order.status === 'Returned') {
                    returnCount++;
                    
                    if (order.items && Array.isArray(order.items)) {
                        order.items.forEach(item => {
                            const name = item.name || item.product;
                            if (name) {
                                productReturns.set(name, (productReturns.get(name) || 0) + 1);
                            }
                        });
                    }
                }
            }
        });
        
        const topProducts = Array.from(productReturns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => ({ name, count }));
        
        return { count: returnCount, topProducts };
    }

    async getLowStockProducts() {
        const productsRef = this.collection(this.db, 'products');
        const productsSnapshot = await this.getDocs(productsRef);
        
        // Get sales data from last 90 days to calculate velocity
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const ordersSnapshot = await this.getDocs(ordersRef);
        
        const salesVelocity = new Map(); // units sold per day
        const now = Date.now();
        const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
        
        // Calculate sales velocity for each product
        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            const orderTime = this.normalizeTimestamp(order.timestamp);
            
            // Only count completed orders from last 90 days
            if (orderTime >= ninetyDaysAgo && (order.status === 'Paid' || order.status === 'Shipped')) {
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        const productName = item.name || item.product;
                        if (productName) {
                            const currentSales = salesVelocity.get(productName) || 0;
                            salesVelocity.set(productName, currentSales + (item.quantity || 1));
                        }
                    });
                }
            }
        });
        
        const lowStock = [];
        
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            const stock = product.stock || 0;
            const productName = product.name;
            
            // Calculate daily velocity
            const totalSold = salesVelocity.get(productName) || 0;
            const dailyVelocity = totalSold / 90; // Average per day over 90 days
            
            // Only alert if:
            // 1. Product has actual sales (velocity > 0)
            // 2. Stock will run out in less than 14 days at current sales rate
            if (dailyVelocity > 0 && stock > 0) {
                const daysUntilStockout = stock / dailyVelocity;
                
                // Alert if less than 14 days of stock remaining
                if (daysUntilStockout < 14) {
                    lowStock.push({
                        name: productName,
                        stock: stock,
                        velocity: dailyVelocity,
                        daysLeft: daysUntilStockout,
                        totalSold90Days: totalSold
                    });
                }
            }
            // Products with zero sales in 90 days are ignored (slow movers)
        });
        
        return lowStock;
    }

    async getFastDepletingProducts() {
        // This would require tracking historical stock levels
        // For now, return empty - can be enhanced later
        return [];
    }

    async getOrdersForPeriod(daysAgo, daysBack) {
        const ordersRef = this.collection(this.db, 'onlineOrders');
        const snapshot = await this.getDocs(ordersRef);
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - daysAgo);
        
        let totalValue = 0;
        let count = 0;
        
        snapshot.forEach(doc => {
            const order = doc.data();
            const orderTime = this.normalizeTimestamp(order.timestamp);
            
            if (orderTime >= startDate.getTime() && orderTime <= endDate.getTime()) {
                totalValue += order.totalPrice || 0;
                count++;
            }
        });
        
        return {
            totalValue,
            count,
            avgValue: count > 0 ? totalValue / count : 0,
            avgTotal: totalValue,
            avgCount: count
        };
    }

    categorizeAnomalies(anomalyList, result) {
        anomalyList.forEach(anomaly => {
            if (anomaly.severity === 'critical') {
                result.critical.push(anomaly);
            } else if (anomaly.severity === 'warning') {
                result.warning.push(anomaly);
            } else {
                result.info.push(anomaly);
            }
        });
    }

    normalizeTimestamp(timestamp) {
        if (typeof timestamp === 'object' && timestamp.toMillis) {
            return timestamp.toMillis();
        } else if (typeof timestamp === 'object' && timestamp.seconds) {
            return timestamp.seconds * 1000;
        }
        return timestamp;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnomalyDetection;
}
