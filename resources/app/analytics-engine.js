/**
 * Executive Analytics Engine
 * 
 * Provides advanced analytics for executive reporting:
 * - Growth trends (period-over-period)
 * - Product velocity (winners & losers)
 * - Temporal analysis (day/time heatmap)
 * - Sales predictions (next 30 days)
 */

const { initializeFirebase, getFirestore } = require('./firebase-admin-config');

class AnalyticsEngine {
  constructor() {
    this.db = null;
    this.storeSales = [];
    this.onlineOrders = [];
    this.allTransactions = [];
  }

  async initialize() {
    initializeFirebase();
    this.db = getFirestore();
  }

  async loadData() {
    console.log('📊 Loading transaction data...');
    
    // Load store sales
    const storeSalesSnapshot = await this.db.collection('storeSales').get();
    this.storeSales = storeSalesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      type: 'storeSale'
    }));
    
    // Load online orders
    const onlineOrdersSnapshot = await this.db.collection('onlineOrders').get();
    this.onlineOrders = onlineOrdersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      type: 'onlineOrder'
    }));
    
    // Combine all transactions
    this.allTransactions = [...this.storeSales, ...this.onlineOrders];
    
    console.log(`✓ Loaded ${this.storeSales.length} store sales`);
    console.log(`✓ Loaded ${this.onlineOrders.length} online orders`);
    console.log(`✓ Total transactions: ${this.allTransactions.length}\n`);
  }

  /**
   * Parse date from various formats
   */
  parseDate(transaction) {
    // Try timestamp first
    if (transaction.timestamp && transaction.timestamp._seconds) {
      return new Date(transaction.timestamp._seconds * 1000);
    }
    
    // Try date string
    if (transaction.date) {
      return new Date(transaction.date);
    }
    
    // Try orderDate
    if (transaction.orderDate) {
      return new Date(transaction.orderDate);
    }
    
    return null;
  }

  /**
   * Calculate growth trends - current period vs previous period
   */
  calculateGrowthTrends(periodDays = 30) {
    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - (periodDays * 24 * 60 * 60 * 1000));
    const previousPeriodStart = new Date(now.getTime() - (periodDays * 2 * 24 * 60 * 60 * 1000));
    
    let currentPeriodRevenue = 0;
    let currentPeriodTransactions = 0;
    let previousPeriodRevenue = 0;
    let previousPeriodTransactions = 0;
    
    this.allTransactions.forEach(txn => {
      const date = this.parseDate(txn);
      if (!date) return;
      
      const total = txn.total || 0;
      
      if (date >= currentPeriodStart && date <= now) {
        currentPeriodRevenue += total;
        currentPeriodTransactions++;
      } else if (date >= previousPeriodStart && date < currentPeriodStart) {
        previousPeriodRevenue += total;
        previousPeriodTransactions++;
      }
    });
    
    const revenueGrowth = previousPeriodRevenue > 0 
      ? ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue * 100)
      : 0;
      
    const transactionGrowth = previousPeriodTransactions > 0
      ? ((currentPeriodTransactions - previousPeriodTransactions) / previousPeriodTransactions * 100)
      : 0;
    
    return {
      currentPeriod: {
        revenue: currentPeriodRevenue,
        transactions: currentPeriodTransactions,
        averageOrderValue: currentPeriodTransactions > 0 ? currentPeriodRevenue / currentPeriodTransactions : 0
      },
      previousPeriod: {
        revenue: previousPeriodRevenue,
        transactions: previousPeriodTransactions,
        averageOrderValue: previousPeriodTransactions > 0 ? previousPeriodRevenue / previousPeriodTransactions : 0
      },
      growth: {
        revenue: revenueGrowth,
        transactions: transactionGrowth,
        averageOrderValue: previousPeriodTransactions > 0 && currentPeriodTransactions > 0
          ? ((currentPeriodRevenue / currentPeriodTransactions) - (previousPeriodRevenue / previousPeriodTransactions)) / (previousPeriodRevenue / previousPeriodTransactions) * 100
          : 0
      },
      periodDays
    };
  }

  /**
   * Calculate product velocity - winners and losers
   */
  calculateProductVelocity(periodDays = 30) {
    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - (periodDays * 24 * 60 * 60 * 1000));
    const previousPeriodStart = new Date(now.getTime() - (periodDays * 2 * 24 * 60 * 60 * 1000));
    
    const productStats = new Map();
    
    this.allTransactions.forEach(txn => {
      const date = this.parseDate(txn);
      if (!date || !txn.items) return;
      
      const isPreviousPeriod = date >= previousPeriodStart && date < currentPeriodStart;
      const isCurrentPeriod = date >= currentPeriodStart && date <= now;
      
      if (!isPreviousPeriod && !isCurrentPeriod) return;
      
      txn.items.forEach(item => {
        const productName = item.name || item.product || 'Unknown';
        const quantity = item.quantity || 1;
        const revenue = quantity * (item.price || 0);
        
        if (!productStats.has(productName)) {
          productStats.set(productName, {
            name: productName,
            code: item.code || item.productCode || '',
            currentQuantity: 0,
            currentRevenue: 0,
            previousQuantity: 0,
            previousRevenue: 0
          });
        }
        
        const stats = productStats.get(productName);
        
        if (isCurrentPeriod) {
          stats.currentQuantity += quantity;
          stats.currentRevenue += revenue;
        } else if (isPreviousPeriod) {
          stats.previousQuantity += quantity;
          stats.previousRevenue += revenue;
        }
      });
    });
    
    // Calculate growth percentages
    const productsWithGrowth = Array.from(productStats.values()).map(product => {
      const revenueGrowth = product.previousRevenue > 0
        ? ((product.currentRevenue - product.previousRevenue) / product.previousRevenue * 100)
        : (product.currentRevenue > 0 ? 100 : 0);
      
      const quantityGrowth = product.previousQuantity > 0
        ? ((product.currentQuantity - product.previousQuantity) / product.previousQuantity * 100)
        : (product.currentQuantity > 0 ? 100 : 0);
      
      return {
        ...product,
        revenueGrowth,
        quantityGrowth
      };
    });
    
    // Sort by revenue growth
    const sorted = productsWithGrowth.sort((a, b) => b.revenueGrowth - a.revenueGrowth);
    
    return {
      winners: sorted.slice(0, 5), // Top 5 growing
      losers: sorted.slice(-5).reverse(), // Top 5 declining
      all: sorted,
      periodDays
    };
  }

  /**
   * Temporal analysis - sales by day of week and hour
   */
  calculateTemporalAnalysis() {
    const dayOfWeek = Array(7).fill(0); // Sunday = 0, Saturday = 6
    const hourOfDay = Array(24).fill(0);
    const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));
    
    this.allTransactions.forEach(txn => {
      const date = this.parseDate(txn);
      if (!date) return;
      
      const day = date.getDay();
      const hour = date.getHours();
      const revenue = txn.total || 0;
      
      dayOfWeek[day] += revenue;
      hourOfDay[hour] += revenue;
      heatmap[day][hour] += revenue;
    });
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    return {
      dayOfWeek: dayOfWeek.map((revenue, index) => ({
        day: dayNames[index],
        dayIndex: index,
        revenue
      })),
      hourOfDay: hourOfDay.map((revenue, hour) => ({
        hour,
        revenue
      })),
      heatmap: heatmap.map((hours, day) => ({
        day: dayNames[day],
        hours: hours.map((revenue, hour) => ({ hour, revenue }))
      })),
      peakDay: dayNames[dayOfWeek.indexOf(Math.max(...dayOfWeek))],
      peakHour: hourOfDay.indexOf(Math.max(...hourOfDay))
    };
  }

  /**
   * Simple linear regression for sales prediction
   */
  linearRegression(data) {
    const n = data.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    data.forEach((point, index) => {
      sumX += index;
      sumY += point;
      sumXY += index * point;
      sumXX += index * index;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope, intercept };
  }

  /**
   * Predict sales for next 30 days based on last 6 months
   */
  predictSales(monthsBack = 6, daysForward = 30) {
    const now = new Date();
    const startDate = new Date(now.getTime() - (monthsBack * 30 * 24 * 60 * 60 * 1000));
    
    // Group sales by day
    const dailySales = new Map();
    
    this.allTransactions.forEach(txn => {
      const date = this.parseDate(txn);
      if (!date || date < startDate) return;
      
      const dayKey = date.toISOString().split('T')[0];
      const revenue = txn.total || 0;
      
      if (!dailySales.has(dayKey)) {
        dailySales.set(dayKey, 0);
      }
      dailySales.set(dayKey, dailySales.get(dayKey) + revenue);
    });
    
    // Convert to array and sort by date
    const salesArray = Array.from(dailySales.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => revenue);
    
    // Calculate regression
    const { slope, intercept } = this.linearRegression(salesArray);
    
    // Generate predictions
    const predictions = [];
    const baseDay = salesArray.length;
    
    for (let i = 0; i < daysForward; i++) {
      const predictedRevenue = Math.max(0, slope * (baseDay + i) + intercept);
      const date = new Date(now.getTime() + (i * 24 * 60 * 60 * 1000));
      
      predictions.push({
        date: date.toISOString().split('T')[0],
        predictedRevenue: Math.round(predictedRevenue * 100) / 100,
        dayIndex: i
      });
    }
    
    return {
      predictions,
      historicalData: salesArray,
      trendline: { slope, intercept },
      totalPredicted: predictions.reduce((sum, p) => sum + p.predictedRevenue, 0),
      averagePredicted: predictions.reduce((sum, p) => sum + p.predictedRevenue, 0) / predictions.length
    };
  }

  /**
   * Generate complete analytics report
   */
  async generateReport() {
    await this.initialize();
    await this.loadData();
    
    console.log('🔬 Calculating analytics...\n');
    
    const growthTrends = this.calculateGrowthTrends(30);
    const productVelocity = this.calculateProductVelocity(30);
    const temporalAnalysis = this.calculateTemporalAnalysis();
    const salesPrediction = this.predictSales(6, 30);
    
    // Overall KPIs
    const totalRevenue = this.allTransactions.reduce((sum, txn) => sum + (txn.total || 0), 0);
    const totalTransactions = this.allTransactions.length;
    const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalRevenue,
        totalTransactions,
        averageOrderValue,
        storeSalesRevenue: this.storeSales.reduce((sum, s) => sum + (s.total || 0), 0),
        onlineOrdersRevenue: this.onlineOrders.reduce((sum, o) => sum + (o.total || 0), 0),
        storeSalesCount: this.storeSales.length,
        onlineOrdersCount: this.onlineOrders.length
      },
      growthTrends,
      productVelocity,
      temporalAnalysis,
      salesPrediction
    };
  }
}

// CLI execution
if (require.main === module) {
  const engine = new AnalyticsEngine();
  
  engine.generateReport().then(report => {
    console.log('========================================');
    console.log('   EXECUTIVE ANALYTICS REPORT');
    console.log('========================================\n');
    
    console.log('📊 Summary KPIs:');
    console.log(`   Total Revenue: €${report.summary.totalRevenue.toFixed(2)}`);
    console.log(`   Total Transactions: ${report.summary.totalTransactions}`);
    console.log(`   Average Order Value: €${report.summary.averageOrderValue.toFixed(2)}`);
    console.log(`   Store Sales: €${report.summary.storeSalesRevenue.toFixed(2)} (${report.summary.storeSalesCount})`);
    console.log(`   Online Orders: €${report.summary.onlineOrdersRevenue.toFixed(2)} (${report.summary.onlineOrdersCount})\n`);
    
    console.log('📈 Growth Trends (Last 30 Days):');
    console.log(`   Revenue Growth: ${report.growthTrends.growth.revenue > 0 ? '+' : ''}${report.growthTrends.growth.revenue.toFixed(1)}%`);
    console.log(`   Transaction Growth: ${report.growthTrends.growth.transactions > 0 ? '+' : ''}${report.growthTrends.growth.transactions.toFixed(1)}%`);
    console.log(`   AOV Growth: ${report.growthTrends.growth.averageOrderValue > 0 ? '+' : ''}${report.growthTrends.growth.averageOrderValue.toFixed(1)}%\n`);
    
    console.log('🚀 Top 5 Product Winners (Revenue Growth):');
    report.productVelocity.winners.slice(0, 5).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} (+${p.revenueGrowth.toFixed(1)}%)`);
    });
    
    console.log('\n📉 Top 5 Product Losers (Revenue Decline):');
    report.productVelocity.losers.slice(0, 5).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} (${p.revenueGrowth.toFixed(1)}%)`);
    });
    
    console.log(`\n⏰ Peak Activity:`);
    console.log(`   Best Day: ${report.temporalAnalysis.peakDay}`);
    console.log(`   Best Hour: ${report.temporalAnalysis.peakHour}:00`);
    
    console.log(`\n🔮 30-Day Forecast:`);
    console.log(`   Predicted Revenue: €${report.salesPrediction.totalPredicted.toFixed(2)}`);
    console.log(`   Average Per Day: €${report.salesPrediction.averagePredicted.toFixed(2)}`);
    
    console.log('\n========================================\n');
    
    process.exit(0);
  }).catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = AnalyticsEngine;
