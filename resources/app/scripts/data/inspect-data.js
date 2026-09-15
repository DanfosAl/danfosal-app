/**
 * Sample Data Inspector
 * Check what fields exist in storeSales and onlineOrders
 */

const { initializeFirebase, getFirestore } = require('../../firebase-admin-config');

async function inspectData() {
  initializeFirebase();
  const db = getFirestore();
  
  console.log('\n========================================');
  console.log('  Data Structure Inspector');
  console.log('========================================\n');
  
  try {
    // Check storeSales
    console.log('📦 Sample StoreSale:\n');
    const saleSnapshot = await db.collection('storeSales').limit(1).get();
    
    if (!saleSnapshot.empty) {
      const sale = saleSnapshot.docs[0].data();
      console.log('Fields:', Object.keys(sale).join(', '));
      console.log('\nSample data:');
      console.log(JSON.stringify(sale, null, 2));
    } else {
      console.log('No store sales found');
    }
    
    // Check onlineOrders
    console.log('\n========================================');
    console.log('🛒 Sample OnlineOrder:\n');
    const orderSnapshot = await db.collection('onlineOrders').limit(1).get();
    
    if (!orderSnapshot.empty) {
      const order = orderSnapshot.docs[0].data();
      console.log('Fields:', Object.keys(order).join(', '));
      console.log('\nSample data:');
      console.log(JSON.stringify(order, null, 2));
    } else {
      console.log('No online orders found');
    }
    
    // Check customers
    console.log('\n========================================');
    console.log('👤 Sample Customer:\n');
    const customerSnapshot = await db.collection('customers').limit(1).get();
    
    if (!customerSnapshot.empty) {
      const customer = customerSnapshot.docs[0].data();
      console.log('Fields:', Object.keys(customer).join(', '));
      console.log('\nSample data:');
      console.log(JSON.stringify(customer, null, 2));
    }
    
    console.log('\n========================================\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

inspectData();
