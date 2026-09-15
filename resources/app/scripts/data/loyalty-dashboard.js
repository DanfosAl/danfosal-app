/**
 * Customer Loyalty & Top Products Dashboard
 * 
 * Analyzes customer purchase behavior to identify:
 * - Top 10 customers by invoice count and total spend
 * - Top 5 products purchased by those customers
 * 
 * Run: npm run loyalty-dashboard
 */

const { initializeFirebase, getFirestore } = require('../../firebase-admin-config');

class LoyaltyDashboard {
  constructor() {
    this.db = null;
    this.customers = [];
    this.topCustomers = [];
    this.topProducts = new Map();
  }

  async initialize() {
    initializeFirebase();
    this.db = getFirestore();
    console.log('✅ Firebase initialized\n');
  }

  async loadCustomersWithSales() {
    console.log('📊 Loading customer data...\n');
    
    const customersSnapshot = await this.db.collection('customers').get();
    const customerData = [];

    for (const doc of customersSnapshot.docs) {
      const customer = doc.data();
      const customerId = doc.id;
      const customerName = customer.name;
      
      // Count invoices from invoiceHistory array
      const invoiceCount = (customer.invoiceHistory || []).length;
      
      // Get total spend from storeSales
      const storeSalesQuery = await this.db.collection('storeSales')
        .where('customerName', '==', customerName)
        .get();
      
      let storeSalesTotal = 0;
      const storeSalesItems = [];
      
      storeSalesQuery.forEach(saleDoc => {
        const sale = saleDoc.data();
        const total = sale.total || 0;
        storeSalesTotal += total;
        
        // Collect items for product analytics
        if (sale.items && Array.isArray(sale.items)) {
          storeSalesItems.push(...sale.items);
        }
      });
      
      // Get total spend from onlineOrders
      const onlineOrdersQuery = await this.db.collection('onlineOrders')
        .where('customerName', '==', customerName)
        .get();
      
      let onlineOrdersTotal = 0;
      const onlineOrdersItems = [];
      
      onlineOrdersQuery.forEach(orderDoc => {
        const order = orderDoc.data();
        const total = order.total || 0;
        onlineOrdersTotal += total;
        
        // Collect items for product analytics
        if (order.items && Array.isArray(order.items)) {
          onlineOrdersItems.push(...order.items);
        }
      });
      
      const totalSpend = storeSalesTotal + onlineOrdersTotal;
      const totalTransactions = storeSalesQuery.size + onlineOrdersQuery.size;
      
      customerData.push({
        id: customerId,
        name: customerName,
        nipt: customer.nipt || '',
        phone: customer.phone || '',
        email: customer.email || '',
        invoiceCount: invoiceCount,
        totalSpend: totalSpend,
        storeSalesTotal: storeSalesTotal,
        onlineOrdersTotal: onlineOrdersTotal,
        totalTransactions: totalTransactions,
        storeSalesCount: storeSalesQuery.size,
        onlineOrdersCount: onlineOrdersQuery.size,
        allItems: [...storeSalesItems, ...onlineOrdersItems],
        lastInvoiceDate: customer.lastInvoiceDate || null
      });
    }

    this.customers = customerData;
    console.log(`✓ Loaded ${customerData.length} customers\n`);
  }

  identifyTopCustomers() {
    console.log('🏆 Identifying Top 10 Customers...\n');
    
    // Sort by total spend (primary) and invoice count (secondary)
    const sorted = [...this.customers].sort((a, b) => {
      // Primary: Total spend
      if (b.totalSpend !== a.totalSpend) {
        return b.totalSpend - a.totalSpend;
      }
      // Secondary: Invoice count
      return b.invoiceCount - a.invoiceCount;
    });

    this.topCustomers = sorted.slice(0, 10);
    
    console.log('Top 10 Customers by Total Spend:\n');
    console.table(
      this.topCustomers.map((c, index) => ({
        Rank: index + 1,
        Customer: c.name,
        'Total Spend (€)': c.totalSpend.toFixed(2),
        'Invoices': c.invoiceCount,
        'Store Sales (€)': c.storeSalesTotal.toFixed(2),
        'Online (€)': c.onlineOrdersTotal.toFixed(2),
        'Transactions': c.totalTransactions
      }))
    );
  }

  analyzeTopProducts() {
    console.log('\n📦 Analyzing Top Products from Top 10 Customers...\n');
    
    const productMap = new Map();
    
    // Aggregate all items from top 10 customers
    this.topCustomers.forEach(customer => {
      customer.allItems.forEach(item => {
        const productName = item.name || item.product || 'Unknown Product';
        const productCode = item.code || item.productCode || '';
        const quantity = item.quantity || 1;
        const price = item.price || 0;
        const revenue = quantity * price;
        
        if (!productMap.has(productName)) {
          productMap.set(productName, {
            name: productName,
            code: productCode,
            totalQuantity: 0,
            totalRevenue: 0,
            orderCount: 0
          });
        }
        
        const product = productMap.get(productName);
        product.totalQuantity += quantity;
        product.totalRevenue += revenue;
        product.orderCount += 1;
      });
    });
    
    // Convert to array and sort by revenue
    const productsArray = Array.from(productMap.values()).sort((a, b) => {
      return b.totalRevenue - a.totalRevenue;
    });
    
    // Get top 5
    const top5Products = productsArray.slice(0, 5);
    this.topProducts = top5Products;
    
    console.log('Top 5 Products (from Top 10 Customers):\n');
    console.table(
      top5Products.map((p, index) => ({
        Rank: index + 1,
        Product: p.name,
        Code: p.code || '(none)',
        'Total Qty': p.totalQuantity,
        'Revenue (€)': p.totalRevenue.toFixed(2),
        'Orders': p.orderCount
      }))
    );
  }

  displaySummary() {
    console.log('\n========================================');
    console.log('   LOYALTY & PRODUCTS SUMMARY');
    console.log('========================================\n');
    
    const totalCustomers = this.customers.length;
    const totalRevenue = this.customers.reduce((sum, c) => sum + c.totalSpend, 0);
    const top10Revenue = this.topCustomers.reduce((sum, c) => sum + c.totalSpend, 0);
    const top10Percentage = totalRevenue > 0 ? (top10Revenue / totalRevenue * 100) : 0;
    
    console.log(`📊 Business Insights:`);
    console.log(`   • Total Customers: ${totalCustomers}`);
    console.log(`   • Total Revenue: €${totalRevenue.toFixed(2)}`);
    console.log(`   • Top 10 Revenue: €${top10Revenue.toFixed(2)} (${top10Percentage.toFixed(1)}%)`);
    console.log(`   • Average per Customer: €${(totalRevenue / totalCustomers).toFixed(2)}`);
    
    if (this.topCustomers.length > 0) {
      const topCustomer = this.topCustomers[0];
      console.log(`\n🏆 #1 Best Customer:`);
      console.log(`   • Name: ${topCustomer.name}`);
      console.log(`   • Total Spend: €${topCustomer.totalSpend.toFixed(2)}`);
      console.log(`   • Transactions: ${topCustomer.totalTransactions}`);
      console.log(`   • Invoices Tracked: ${topCustomer.invoiceCount}`);
    }
    
    if (this.topProducts.length > 0) {
      const topProduct = this.topProducts[0];
      console.log(`\n🎯 #1 Top Product (Top 10 Customers):`);
      console.log(`   • Product: ${topProduct.name}`);
      console.log(`   • Code: ${topProduct.code || '(none)'}`);
      console.log(`   • Quantity Sold: ${topProduct.totalQuantity}`);
      console.log(`   • Revenue: €${topProduct.totalRevenue.toFixed(2)}`);
    }
    
    console.log('\n========================================\n');
  }

  async generateReport() {
    try {
      console.log('\n========================================');
      console.log('  CUSTOMER LOYALTY & TOP PRODUCTS');
      console.log('  Dashboard Report');
      console.log('========================================\n');
      
      await this.initialize();
      await this.loadCustomersWithSales();
      this.identifyTopCustomers();
      this.analyzeTopProducts();
      this.displaySummary();
      
      console.log('✅ Report generation complete!\n');
      
    } catch (error) {
      console.error('❌ Error generating report:', error.message);
      console.error(error.stack);
    }
    
    process.exit(0);
  }

  /**
   * Get data for web/API consumption
   */
  async getData() {
    await this.initialize();
    await this.loadCustomersWithSales();
    this.identifyTopCustomers();
    this.analyzeTopProducts();
    
    return {
      topCustomers: this.topCustomers.map((c, index) => ({
        rank: index + 1,
        id: c.id,
        name: c.name,
        totalSpend: c.totalSpend,
        invoiceCount: c.invoiceCount,
        totalTransactions: c.totalTransactions,
        storeSalesTotal: c.storeSalesTotal,
        onlineOrdersTotal: c.onlineOrdersTotal,
        lastInvoiceDate: c.lastInvoiceDate
      })),
      topProducts: this.topProducts.map((p, index) => ({
        rank: index + 1,
        name: p.name,
        code: p.code,
        totalQuantity: p.totalQuantity,
        totalRevenue: p.totalRevenue,
        orderCount: p.orderCount
      })),
      summary: {
        totalCustomers: this.customers.length,
        totalRevenue: this.customers.reduce((sum, c) => sum + c.totalSpend, 0),
        top10Revenue: this.topCustomers.reduce((sum, c) => sum + c.totalSpend, 0),
        top10Percentage: this.topCustomers.reduce((sum, c) => sum + c.totalSpend, 0) / 
                        this.customers.reduce((sum, c) => sum + c.totalSpend, 0) * 100
      }
    };
  }
}

// CLI execution
if (require.main === module) {
  const dashboard = new LoyaltyDashboard();
  dashboard.generateReport();
}

// Export for web/API usage
module.exports = LoyaltyDashboard;
