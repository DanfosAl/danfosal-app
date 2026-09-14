/**
 * Verify Smart Brain Invoice Processing
 * Check customer and sale data in Firebase
 */

const { initializeFirebase, getFirestore } = require('./firebase-admin-config');

async function verifyInvoice() {
  initializeFirebase();
  const db = getFirestore();
  
  console.log('\n========================================');
  console.log('  Smart Brain Data Verification');
  console.log('========================================\n');
  
  try {
    // Find customer "Valmira"
    console.log('🔍 Searching for customer: Valmira\n');
    const customerSnapshot = await db.collection('customers')
      .where('name', '==', 'Valmira')
      .limit(1)
      .get();
    
    if (customerSnapshot.empty) {
      console.log('❌ Customer not found in database\n');
      return;
    }
    
    const customerDoc = customerSnapshot.docs[0];
    const customer = customerDoc.data();
    
    console.log('✅ Customer Found:');
    console.log('   • ID:', customerDoc.id);
    console.log('   • Name:', customer.name);
    console.log('   • NIPT:', customer.nipt || '(empty)');
    console.log('   • Invoice History:', JSON.stringify(customer.invoiceHistory || []));
    console.log('   • Last Invoice Date:', customer.lastInvoiceDate || '(none)');
    console.log('   • Total Invoices:', (customer.invoiceHistory || []).length);
    
    // Find recent sale
    console.log('\n🔍 Searching for recent sales...\n');
    const saleSnapshot = await db.collection('storeSales')
      .where('customerId', '==', customerDoc.id)
      .orderBy('saleDate', 'desc')
      .limit(1)
      .get();
    
    if (!saleSnapshot.empty) {
      const saleDoc = saleSnapshot.docs[0];
      const sale = saleDoc.data();
      
      console.log('✅ Sale Found:');
      console.log('   • Sale ID:', saleDoc.id);
      console.log('   • Invoice Number:', sale.invoiceNumber);
      console.log('   • Total:', sale.total, sale.currency);
      console.log('   • Items:', sale.items?.length || 0);
      console.log('   • Sale Date:', sale.saleDate);
      console.log('   • Customer ID:', sale.customerId);
    }
    
    console.log('\n========================================');
    console.log('✅ NAME-BASED IDENTIFICATION VERIFIED!');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

verifyInvoice();
