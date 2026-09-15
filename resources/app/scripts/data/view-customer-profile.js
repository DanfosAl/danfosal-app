/**
 * Customer 360-Degree Profile Viewer
 * 
 * View complete customer history including:
 * - Customer information
 * - Invoice history (tracked invoices)
 * - All store sales by name
 * - All online orders by name
 */

const { initializeFirebase, getFirestore } = require('../../firebase-admin-config');

async function viewCustomerProfile(searchName) {
  initializeFirebase();
  const db = getFirestore();
  
  console.log('\n========================================');
  console.log('  Customer 360° Profile');
  console.log('========================================\n');
  
  if (!searchName) {
    console.log('Usage: node view-customer-profile.js "Customer Name"\n');
    console.log('Example: node view-customer-profile.js "Valmira"\n');
    process.exit(1);
  }
  
  try {
    // Find customer by name
    console.log(`🔍 Searching for customer: "${searchName}"\n`);
    
    const normalized = searchName.toLowerCase().trim();
    const customersSnapshot = await db.collection('customers').get();
    
    let customerDoc = null;
    let customerData = null;
    
    for (const doc of customersSnapshot.docs) {
      const name = (doc.data().name || '').toLowerCase().trim();
      if (name === normalized) {
        customerDoc = doc;
        customerData = doc.data();
        break;
      }
    }
    
    if (!customerDoc) {
      console.log('❌ Customer not found\n');
      process.exit(0);
    }
    
    // Display customer info
    console.log('========================================');
    console.log('👤 Customer Information');
    console.log('========================================');
    console.log(`ID:              ${customerDoc.id}`);
    console.log(`Name:            ${customerData.name}`);
    console.log(`NIPT:            ${customerData.nipt || '(none)'}`);
    console.log(`Phone:           ${customerData.phone || '(none)'}`);
    console.log(`Email:           ${customerData.email || '(none)'}`);
    console.log(`Address:         ${customerData.address || '(none)'}`);
    console.log(`Status:          ${customerData.status || 'Active'}`);
    console.log(`Source:          ${customerData.source || 'N/A'}`);
    console.log(`Created:         ${customerData.createdAt || 'N/A'}`);
    console.log(`Last Invoice:    ${customerData.lastInvoiceDate || 'Never'}`);
    
    // Display invoice history (tracked invoices)
    console.log('\n========================================');
    console.log('📋 Tracked Invoice History');
    console.log('========================================');
    
    const invoiceHistory = customerData.invoiceHistory || [];
    if (invoiceHistory.length > 0) {
      console.log(`Total: ${invoiceHistory.length} invoice(s)\n`);
      invoiceHistory.forEach((inv, index) => {
        console.log(`  ${index + 1}. ${inv}`);
      });
    } else {
      console.log('No tracked invoices yet\n');
    }
    
    // Find all store sales
    console.log('\n========================================');
    console.log('🏪 Store Sales History');
    console.log('========================================\n');
    
    const storeSalesSnapshot = await db.collection('storeSales')
      .where('customerName', '==', customerData.name)
      .orderBy('timestamp', 'desc')
      .get();
    
    if (!storeSalesSnapshot.empty) {
      console.log(`Total: ${storeSalesSnapshot.size} sale(s)\n`);
      
      let totalRevenue = 0;
      storeSalesSnapshot.forEach((doc, index) => {
        const sale = doc.data();
        const date = sale.date || sale.timestamp?.toDate?.()?.toISOString()?.split('T')[0] || 'N/A';
        const total = sale.total || 0;
        const items = sale.items?.length || 1;
        const isReturn = sale.isReturn ? ' [RETURN]' : '';
        
        totalRevenue += total;
        
        console.log(`  ${index + 1}. ${date} - €${total.toFixed(2)} (${items} item(s))${isReturn}`);
        if (sale.items && sale.items.length > 0) {
          sale.items.forEach(item => {
            console.log(`     • ${item.name} x${item.quantity} @ €${item.price}`);
          });
        }
      });
      
      console.log(`\n  💰 Total Store Revenue: €${totalRevenue.toFixed(2)}`);
    } else {
      console.log('No store sales found\n');
    }
    
    // Find all online orders
    console.log('\n========================================');
    console.log('🛒 Online Orders History');
    console.log('========================================\n');
    
    const onlineOrdersSnapshot = await db.collection('onlineOrders')
      .where('customerName', '==', customerData.name)
      .orderBy('timestamp', 'desc')
      .get();
    
    if (!onlineOrdersSnapshot.empty) {
      console.log(`Total: ${onlineOrdersSnapshot.size} order(s)\n`);
      
      let totalOnlineRevenue = 0;
      onlineOrdersSnapshot.forEach((doc, index) => {
        const order = doc.data();
        const date = order.orderDate || order.timestamp?.toDate?.()?.toISOString()?.split('T')[0] || 'N/A';
        const total = order.total || 0;
        const items = order.items?.length || 1;
        const status = order.status || 'N/A';
        const phone = order.phoneNumber || '';
        
        totalOnlineRevenue += total;
        
        console.log(`  ${index + 1}. ${date} - €${total.toFixed(2)} (${items} item(s)) [${status}]`);
        if (phone) console.log(`     📞 ${phone}`);
        if (order.deliveryAddress) console.log(`     📍 ${order.deliveryAddress}`);
        if (order.items && order.items.length > 0) {
          order.items.forEach(item => {
            console.log(`     • ${item.name} x${item.quantity} @ €${item.price}`);
          });
        }
      });
      
      console.log(`\n  💰 Total Online Revenue: €${totalOnlineRevenue.toFixed(2)}`);
    } else {
      console.log('No online orders found\n');
    }
    
    // Summary
    const totalStoreSales = storeSalesSnapshot.size;
    const totalOnlineOrders = onlineOrdersSnapshot.size;
    const totalTransactions = totalStoreSales + totalOnlineOrders + invoiceHistory.length;
    
    console.log('\n========================================');
    console.log('📊 Customer Summary');
    console.log('========================================');
    console.log(`Total Transactions:     ${totalTransactions}`);
    console.log(`  • Store Sales:         ${totalStoreSales}`);
    console.log(`  • Online Orders:       ${totalOnlineOrders}`);
    console.log(`  • Tracked Invoices:    ${invoiceHistory.length}`);
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

const searchName = process.argv[2];
viewCustomerProfile(searchName);
