const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  console.log('🔧 FIXING ROMINA KOZI ORDER\n');
  
  const saleId = 'AjOf7SmgwMsVz17laI50';
  const orderId = 'X6AEBy7JVoUfNOxM4SJE';
  const invoiceNumber = '69/2026/mv200vz195';
  
  // Step 1: Delete the incorrect walk-in sale
  console.log('Step 1: Deleting incorrect walk-in sale...');
  await db.collection('storeSales').doc(saleId).delete();
  console.log(`✅ Deleted storeSales/${saleId}\n`);
  
  // Step 2: Update the online order
  console.log('Step 2: Updating online order status...');
  await db.collection('onlineOrders').doc(orderId).update({
    status: 'Processing',
    processedAt: new Date().toISOString(),
    linkedInvoiceNumber: invoiceNumber,
    linkedInvoiceDate: new Date().toISOString()
  });
  console.log(`✅ Updated onlineOrders/${orderId}`);
  console.log('   - Status: Ordered → Processing');
  console.log(`   - Linked Invoice: ${invoiceNumber}\n`);
  
  // Step 3: Verify the fix
  console.log('Step 3: Verifying fix...');
  const order = await db.collection('onlineOrders').doc(orderId).get();
  const orderData = order.data();
  
  console.log('\n✅ ORDER NOW CORRECTLY LINKED:');
  console.log('   Customer:', orderData.clientName);
  console.log('   Status:', orderData.status);
  console.log('   Invoice:', orderData.linkedInvoiceNumber);
  console.log('   Items:', orderData.items.length, 'product(s)');
  console.log('   Total: €' + (orderData.total || orderData.price));
  console.log('\n🎉 Fix complete! The online order is now properly fulfilled.\n');
  
  process.exit(0);
})();
