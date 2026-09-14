const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  console.log('🔍 Searching for online orders with clientName = "Romina Kozi"...\n');
  
  const orders = await db.collection('onlineOrders')
    .where('clientName', '==', 'Romina Kozi')
    .get();
  
  if (orders.empty) {
    console.log('❌ No orders found with clientName = "Romina Kozi"');
  } else {
    console.log(`✅ Found ${orders.size} order(s):\n`);
    orders.forEach(doc => {
      const o = doc.data();
      console.log('Order ID:', doc.id);
      console.log('Customer:', o.clientName);
      console.log('Status:', o.status);
      console.log('Items:', o.items ? o.items.length : 0);
      if (o.items) {
        o.items.forEach(i => console.log('  -', i.name, 'x', i.quantity));
      }
      console.log('Total:', o.total || o.price);
      console.log('');
    });
  }
  
  process.exit(0);
})();
