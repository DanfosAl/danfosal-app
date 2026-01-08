// Next Best Action AI - Smart Task Prioritization
class NextActionAI {
    constructor(db, firebaseImports = {}) {
        this.db = db;
        this.collection = firebaseImports.collection;
        this.getDocs = firebaseImports.getDocs;
        this.query = firebaseImports.query;
        this.where = firebaseImports.where;
        this.orderBy = firebaseImports.orderBy;
        
        // Scoring weights (total = 100)
        this.weights = {
            urgency: 40,      // Time sensitivity
            impact: 35,       // Business value
            effort: 15,       // Ease of completion
            opportunity: 10   // Strategic value
        };
    }

    // === MAIN ACTION GENERATION ===
    
    async generateDailyActions() {
        console.log('🤖 Next Action AI: Analyzing business data...');
        
        const actions = [];
        
        // Gather all data in parallel
        const [
            customerActions,
            inventoryActions,
            orderActions,
            financialActions,
            opportunityActions
        ] = await Promise.all([
            this.analyzeCustomerActions(),
            this.analyzeInventoryActions(),
            this.analyzeOrderActions(),
            this.analyzeFinancialActions(),
            this.analyzeOpportunityActions()
        ]);

        // Combine all actions
        actions.push(...customerActions);
        actions.push(...inventoryActions);
        actions.push(...orderActions);
        actions.push(...financialActions);
        actions.push(...opportunityActions);

        // Score and prioritize
        const scoredActions = actions.map(action => {
            const score = this.calculateActionScore(action);
            return { ...action, score, priority: this.getPriorityLevel(score) };
        });

        // Sort by score (highest first)
        scoredActions.sort((a, b) => b.score - a.score);

        console.log(`✅ Generated ${scoredActions.length} recommended actions`);
        
        return {
            actions: scoredActions,
            summary: this.generateSummary(scoredActions),
            generated: Date.now()
        };
    }

    // === CUSTOMER ACTIONS ===
    
    async analyzeCustomerActions() {
        const actions = [];
        
        try {
            const ordersRef = this.collection(this.db, 'onlineOrders');
            const ordersSnapshot = await this.getDocs(ordersRef);
            
            const customerData = new Map();
            const now = Date.now();
            
            // Analyze customer behavior
            ordersSnapshot.forEach(doc => {
                const order = doc.data();
                const customer = order.customerName || order.customerId;
                
                if (!customer || customer === 'Unknown') return;
                
                if (!customerData.has(customer)) {
                    customerData.set(customer, {
                        name: customer,
                        phone: order.customerPhone,
                        totalOrders: 0,
                        totalValue: 0,
                        lastOrderDate: 0,
                        orders: []
                    });
                }
                
                const data = customerData.get(customer);
                data.totalOrders++;
                data.totalValue += order.totalPrice || 0;
                
                const orderTime = this.normalizeTimestamp(order.timestamp);
                if (orderTime > data.lastOrderDate) {
                    data.lastOrderDate = orderTime;
                }
                
                data.orders.push(order);
            });
            
            // Generate customer actions
            customerData.forEach((data, customer) => {
                const daysSinceLastOrder = Math.floor((now - data.lastOrderDate) / (1000 * 60 * 60 * 24));
                const avgOrderValue = data.totalValue / data.totalOrders;
                
                // High-value customer hasn't ordered recently
                if (avgOrderValue > 500 && daysSinceLastOrder > 30 && daysSinceLastOrder < 180) {
                    actions.push({
                        type: 'customer_follow_up',
                        category: 'Customer Retention',
                        title: `Call ${customer} - High-Value Customer Inactive`,
                        description: `Last order ${daysSinceLastOrder} days ago. Average order: €${avgOrderValue.toFixed(2)}`,
                        actionRequired: `Call ${data.phone || customer} to check in and offer special promotion`,
                        actionType: 'whatsapp_message',
                        actionData: { phone: data.phone, message: `Hi ${customer}, we noticed it's been a while! We have a special offer for you.` },
                        metrics: {
                            urgency: 80,
                            impact: 95,
                            effort: 40,
                            opportunity: 85
                        },
                        context: {
                            customer: customer,
                            phone: data.phone,
                            lastOrder: daysSinceLastOrder,
                            avgValue: avgOrderValue,
                            totalValue: data.totalValue,
                            orderCount: data.totalOrders
                        }
                    });
                }
                
                // Frequent customer at risk (hasn't ordered in expected timeframe)
                else if (data.totalOrders >= 5 && daysSinceLastOrder > 60) {
                    const avgDaysBetweenOrders = this.calculateAvgDaysBetween(data.orders);
                    
                    if (daysSinceLastOrder > avgDaysBetweenOrders * 2) {
                        actions.push({
                            type: 'customer_at_risk',
                            category: 'Customer Retention',
                            title: `Reach Out to ${customer} - Unusual Gap in Orders`,
                            description: `Usually orders every ${Math.round(avgDaysBetweenOrders)} days, but it's been ${daysSinceLastOrder} days`,
                            actionRequired: `Send WhatsApp message or call to re-engage customer`,
                            actionType: 'whatsapp_message',
                            actionData: { phone: data.phone, message: `Hi ${customer}, checking in! Do you need to restock anything?` },
                            metrics: {
                                urgency: 70,
                                impact: 75,
                                effort: 30,
                                opportunity: 70
                            },
                            context: {
                                customer: customer,
                                phone: data.phone,
                                lastOrder: daysSinceLastOrder,
                                normalGap: avgDaysBetweenOrders,
                                totalValue: data.totalValue
                            }
                        });
                    }
                }
                
                // New customer follow-up (first order was recent)
                else if (data.totalOrders === 1 && daysSinceLastOrder >= 7 && daysSinceLastOrder <= 14) {
                    actions.push({
                        type: 'new_customer_follow_up',
                        category: 'Customer Growth',
                        title: `Follow Up with New Customer ${customer}`,
                        description: `First order was ${daysSinceLastOrder} days ago (€${data.totalValue.toFixed(2)})`,
                        actionRequired: `Call to ensure satisfaction and encourage repeat purchase`,
                        metrics: {
                            urgency: 60,
                            impact: 65,
                            effort: 35,
                            opportunity: 75
                        },
                        context: {
                            customer: customer,
                            phone: data.phone,
                            firstOrderValue: data.totalValue,
                            daysSinceFirst: daysSinceLastOrder
                        }
                    });
                }
            });
            
        } catch (error) {
            console.error('Error analyzing customer actions:', error);
        }
        
        return actions;
    }

    // === INVENTORY ACTIONS ===
    
    async analyzeInventoryActions() {
        const actions = [];
        
        try {
            // Get products
            const productsRef = this.collection(this.db, 'products');
            const productsSnapshot = await this.getDocs(productsRef);
            
            // Get recent sales to calculate velocity (Online + Store)
            const ordersRef = this.collection(this.db, 'onlineOrders');
            const storeSalesRef = this.collection(this.db, 'storeSales');
            
            const [ordersSnapshot, storeSalesSnapshot] = await Promise.all([
                this.getDocs(ordersRef),
                this.getDocs(storeSalesRef)
            ]);
            
            const salesVelocity = new Map();
            const now = Date.now();
            const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
            
            // Helper to process sales
            const processSales = (snapshot) => {
                snapshot.forEach(doc => {
                    const order = doc.data();
                    const orderTime = this.normalizeTimestamp(order.timestamp);
                    
                    if (orderTime >= thirtyDaysAgo) {
                        // Handle items array (Online Orders & some Store Sales)
                        if (order.items && Array.isArray(order.items)) {
                            order.items.forEach(item => {
                                const productName = item.name || item.product || item.productName;
                                if (productName) {
                                    salesVelocity.set(productName, 
                                        (salesVelocity.get(productName) || 0) + (item.quantity || 1)
                                    );
                                }
                            });
                        }
                        // Handle direct product sales (Store Sales often use this format)
                        else if (order.productName) {
                            const productName = order.productName;
                            salesVelocity.set(productName, 
                                (salesVelocity.get(productName) || 0) + (order.quantity || 1)
                            );
                        }
                    }
                });
            };

            processSales(ordersSnapshot);
            processSales(storeSalesSnapshot);
            
            // Analyze each product
            productsSnapshot.forEach(doc => {
                const product = doc.data();
                const name = product.name;
                const stock = product.stock || 0;
                const sold30Days = salesVelocity.get(name) || 0;
                const dailyVelocity = sold30Days / 30;
                
                // Critical low stock
                if (stock <= 3 && dailyVelocity > 0.5) {
                    const daysUntilOut = stock / dailyVelocity;
                    
                    actions.push({
                        type: 'critical_restock',
                        category: 'Inventory Management',
                        title: `URGENT: Restock ${name} - Only ${stock} Left`,
                        description: `Selling ${dailyVelocity.toFixed(1)} units/day. Will run out in ${Math.ceil(daysUntilOut)} days`,
                        actionRequired: `Order ${name} from supplier immediately`,
                        metrics: {
                            urgency: 95,
                            impact: 90,
                            effort: 50,
                            opportunity: 40
                        },
                        context: {
                            product: name,
                            currentStock: stock,
                            dailySales: dailyVelocity,
                            daysLeft: daysUntilOut,
                            recommendedOrder: Math.ceil(dailyVelocity * 30)
                        }
                    });
                }
                
                // Low stock warning
                else if (stock <= 10 && dailyVelocity > 0.3) {
                    const daysUntilOut = stock / dailyVelocity;
                    
                    if (daysUntilOut <= 14) {
                        actions.push({
                            type: 'low_stock_warning',
                            category: 'Inventory Management',
                            title: `Plan Restock for ${name}`,
                            description: `${stock} units remaining. Selling ${dailyVelocity.toFixed(1)}/day`,
                            actionRequired: `Add ${name} to next supplier order`,
                            metrics: {
                                urgency: 70,
                                impact: 75,
                                effort: 40,
                                opportunity: 30
                            },
                            context: {
                                product: name,
                                currentStock: stock,
                                dailySales: dailyVelocity,
                                daysLeft: daysUntilOut,
                                recommendedOrder: Math.ceil(dailyVelocity * 30)
                            }
                        });
                    }
                }
                
                // Dead stock (high inventory, low sales)
                else if (stock > 50 && dailyVelocity < 0.5) {
                    const monthsOfInventory = stock / (dailyVelocity * 30);
                    
                    if (monthsOfInventory > 6) {
                        actions.push({
                            type: 'dead_stock',
                            category: 'Inventory Optimization',
                            title: `Reduce Stock: ${name} (${stock} Units)`,
                            description: `${monthsOfInventory.toFixed(1)} months of inventory. Slow mover`,
                            actionRequired: `Run promotion or discount to move inventory`,
                            metrics: {
                                urgency: 40,
                                impact: 60,
                                effort: 50,
                                opportunity: 55
                            },
                            context: {
                                product: name,
                                excessStock: stock,
                                monthsOfInventory: monthsOfInventory,
                                dailySales: dailyVelocity
                            }
                        });
                    }
                }
            });
            
        } catch (error) {
            console.error('Error analyzing inventory actions:', error);
        }
        
        return actions;
    }

    // === ORDER ACTIONS ===
    
    async analyzeOrderActions() {
        const actions = [];
        
        try {
            const ordersRef = this.collection(this.db, 'onlineOrders');
            const ordersSnapshot = await this.getDocs(ordersRef);
            
            const now = Date.now();
            
            ordersSnapshot.forEach(doc => {
                const order = { id: doc.id, ...doc.data() };
                const orderTime = this.normalizeTimestamp(order.timestamp);
                const daysOld = Math.floor((now - orderTime) / (1000 * 60 * 60 * 24));
                
                // Unpaid orders
                if (order.status === 'Pending' || order.status === 'Unpaid') {
                    let urgency = 50;
                    let impact = 70;
                    
                    if (daysOld >= 5) {
                        urgency = 95;
                        impact = 85;
                    } else if (daysOld >= 3) {
                        urgency = 80;
                        impact = 80;
                    }
                    
                    if (order.totalPrice > 1000) {
                        impact += 10;
                    }
                    
                    actions.push({
                        type: 'unpaid_order_follow_up',
                        category: 'Payment Collection',
                        title: `Follow Up on Unpaid Order #${order.id.substring(0, 8)}`,
                        description: `€${order.totalPrice.toFixed(2)} pending for ${daysOld} days from ${order.customerName}`,
                        actionRequired: `Call ${order.customerPhone || order.customerName} to request payment`,
                        metrics: {
                            urgency: urgency,
                            impact: impact,
                            effort: 35,
                            opportunity: 60
                        },
                        context: {
                            orderId: order.id,
                            customer: order.customerName,
                            phone: order.customerPhone,
                            amount: order.totalPrice,
                            daysOverdue: daysOld,
                            orderDate: new Date(orderTime).toLocaleDateString()
                        }
                    });
                }
                
                // Orders paid but not shipped (long time)
                // DISABLED: Uncomment if you want delayed shipment alerts
                /*
                else if (order.status === 'Paid' && daysOld >= 7) {
                    actions.push({
                        type: 'delayed_shipment',
                        category: 'Order Fulfillment',
                        title: `Ship Order #${order.id.substring(0, 8)} - Delayed`,
                        description: `Paid ${daysOld} days ago but not yet shipped`,
                        actionRequired: `Prepare and ship order to ${order.customerName}`,
                        metrics: {
                            urgency: 85,
                            impact: 80,
                            effort: 60,
                            opportunity: 30
                        },
                        context: {
                            orderId: order.id,
                            customer: order.customerName,
                            phone: order.customerPhone,
                            amount: order.totalPrice,
                            daysSincePaid: daysOld
                        }
                    });
                }
                */
            });
            
        } catch (error) {
            console.error('Error analyzing order actions:', error);
        }
        
        return actions;
    }

    // === FINANCIAL ACTIONS ===
    
    async analyzeFinancialActions() {
        const actions = [];
        
        try {
            // Get debts from debtors collection
            const debtorsRef = this.collection(this.db, 'debtors');
            const debtorsSnapshot = await this.getDocs(debtorsRef);
            
            debtorsSnapshot.forEach(doc => {
                const debtor = doc.data();
                const amount = debtor.amount || 0;
                
                if (amount > 100) {
                    const urgency = amount > 1000 ? 90 : amount > 500 ? 75 : 60;
                    const impact = Math.min(95, 60 + (amount / 100));
                    
                    actions.push({
                        type: 'debt_collection',
                        category: 'Financial Management',
                        title: `Collect €${amount.toFixed(2)} from ${debtor.name}`,
                        description: `Outstanding debt needs collection`,
                        actionRequired: `Contact ${debtor.name} to arrange payment`,
                        metrics: {
                            urgency: urgency,
                            impact: impact,
                            effort: 45,
                            opportunity: 70
                        },
                        context: {
                            debtor: debtor.name,
                            phone: debtor.phone,
                            amount: amount,
                            notes: debtor.notes
                        }
                    });
                }
            });
            
        } catch (error) {
            console.error('Error analyzing financial actions:', error);
        }
        
        return actions;
    }

    // === OPPORTUNITY ACTIONS ===
    
    async analyzeOpportunityActions() {
        const actions = [];
        
        // These would be based on trends from Business Intelligence
        // For now, return basic opportunities
        
        try {
            // Check if there are products with high profit margins that could be promoted
            const productsRef = this.collection(this.db, 'products');
            const productsSnapshot = await this.getDocs(productsRef);
            
            const highMarginProducts = [];
            
            productsSnapshot.forEach(doc => {
                const product = doc.data();
                if (product.costPrice && product.sellingPrice) {
                    const margin = ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100;
                    
                    if (margin > 40 && product.stock > 10) {
                        highMarginProducts.push({
                            name: product.name,
                            margin: margin,
                            stock: product.stock
                        });
                    }
                }
            });
            
            if (highMarginProducts.length > 0) {
                highMarginProducts.sort((a, b) => b.margin - a.margin);
                const top = highMarginProducts[0];
                
                actions.push({
                    type: 'promote_high_margin',
                    category: 'Revenue Optimization',
                    title: `Promote ${top.name} - ${top.margin.toFixed(1)}% Profit Margin`,
                    description: `High-profit product with good stock availability`,
                    actionRequired: `Feature ${top.name} in social media posts and customer calls`,
                    metrics: {
                        urgency: 45,
                        impact: 80,
                        effort: 40,
                        opportunity: 90
                    },
                    context: {
                        product: top.name,
                        profitMargin: top.margin,
                        stock: top.stock
                    }
                });
            }
            
        } catch (error) {
            console.error('Error analyzing opportunity actions:', error);
        }
        
        return actions;
    }

    // === SCORING & PRIORITIZATION ===
    
    calculateActionScore(action) {
        const metrics = action.metrics;
        
        // Normalize all metrics to 0-100 scale
        const normalizedUrgency = Math.min(100, metrics.urgency);
        const normalizedImpact = Math.min(100, metrics.impact);
        const normalizedEffort = Math.min(100, metrics.effort);
        const normalizedOpportunity = Math.min(100, metrics.opportunity);
        
        // Calculate weighted score
        const score = (
            (normalizedUrgency * this.weights.urgency / 100) +
            (normalizedImpact * this.weights.impact / 100) +
            (normalizedEffort * this.weights.effort / 100) +
            (normalizedOpportunity * this.weights.opportunity / 100)
        );
        
        return Math.round(score * 100) / 100;
    }

    getPriorityLevel(score) {
        if (score >= 75) return 'Critical';
        if (score >= 60) return 'High';
        if (score >= 45) return 'Medium';
        return 'Low';
    }

    generateSummary(actions) {
        const byCategory = {};
        const byPriority = {
            Critical: 0,
            High: 0,
            Medium: 0,
            Low: 0
        };
        
        actions.forEach(action => {
            // Count by category
            if (!byCategory[action.category]) {
                byCategory[action.category] = 0;
            }
            byCategory[action.category]++;
            
            // Count by priority
            byPriority[action.priority]++;
        });
        
        return {
            totalActions: actions.length,
            byCategory: byCategory,
            byPriority: byPriority,
            topAction: actions.length > 0 ? actions[0] : null
        };
    }

    // === HELPER METHODS ===
    
    calculateAvgDaysBetween(orders) {
        if (orders.length < 2) return 30; // Default
        
        const times = orders
            .map(o => this.normalizeTimestamp(o.timestamp))
            .sort((a, b) => a - b);
        
        let totalDays = 0;
        for (let i = 1; i < times.length; i++) {
            totalDays += (times[i] - times[i-1]) / (1000 * 60 * 60 * 24);
        }
        
        return totalDays / (times.length - 1);
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
    module.exports = NextActionAI;
}
