/**
 * Historical Invoice Linking Script
 * 
 * Scans storeSales and onlineOrders collections to populate customer invoiceHistory arrays.
 * Links all historical transactions to their respective customers by name.
 */

const { initializeFirebase, getFirestore } = require('./firebase-admin-config');

async function linkHistoricalInvoices() {
  initializeFirebase();
  const db = getFirestore();
  
  console.log('\n========================================');
  console.log('  Historical Invoice Linking');
  console.log('========================================\n');
  
  console.log('⚠️  This will scan all sales and link them to customers.');
  console.log('    Press Ctrl+C in the next 5 seconds to cancel...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    // Build customer name -> ID map
    console.log('📊 Loading customers...\n');
    const customersSnapshot = await db.collection('customers').get();
    const customerMap = new Map(); // normalized name -> customer doc
    
    customersSnapshot.forEach(doc => {
      const data = doc.data();
      const name = data.name ? data.name.trim() : '';
      if (name) {
        const normalized = name.toLowerCase();
        customerMap.set(normalized, {
          id: doc.id,
          ref: doc.ref,
          name: data.name,
          invoiceHistory: new Set(data.invoiceHistory || [])
        });
      }
    });
    
    console.log(`✓ Loaded ${customerMap.size} customers\n`);
    
    let storeSalesCount = 0;
    let onlineOrdersCount = 0;
    let linkedCount = 0;
    let notFoundCount = 0;
    
    // Process storeSales
    console.log('📦 Scanning storeSales collection...\n');
    const storeSalesSnapshot = await db.collection('storeSales').get();
    
    for (const doc of storeSalesSnapshot.docs) {
      const sale = doc.data();
      storeSalesCount++;
      
      if (!sale.customerName || !sale.invoiceNumber) {
        continue;
      }
      
      const normalized = sale.customerName.toLowerCase().trim();
      const customer = customerMap.get(normalized);
      
      if (customer) {
        customer.invoiceHistory.add(sale.invoiceNumber);
        linkedCount++;
        
        if (linkedCount % 10 === 0) {
          process.stdout.write(`\r  Linked ${linkedCount} invoices...`);
        }
      } else {
        notFoundCount++;
      }
    }
    
    if (storeSalesCount > 0) {
      console.log(`\r✓ Processed ${storeSalesCount} store sale(s)\n`);
    }
    
    // Process onlineOrders
    console.log('🛒 Scanning onlineOrders collection...\n');
    const onlineOrdersSnapshot = await db.collection('onlineOrders').get();
    
    for (const doc of onlineOrdersSnapshot.docs) {
      const order = doc.data();
      onlineOrdersCount++;
      
      if (!order.customerName || !order.invoiceNumber) {
        continue;
      }
      
      const normalized = order.customerName.toLowerCase().trim();
      const customer = customerMap.get(normalized);
      
      if (customer) {
        customer.invoiceHistory.add(order.invoiceNumber);
        linkedCount++;
        
        if (linkedCount % 10 === 0) {
          process.stdout.write(`\r  Linked ${linkedCount} invoices...`);
        }
      } else {
        notFoundCount++;
      }
    }
    
    if (onlineOrdersCount > 0) {
      console.log(`\r✓ Processed ${onlineOrdersCount} online order(s)\n`);
    }
    
    // Update customers with linked invoices
    console.log('💾 Updating customer records...\n');
    let updatedCount = 0;
    
    for (const customer of customerMap.values()) {
      const invoiceArray = Array.from(customer.invoiceHistory);
      
      if (invoiceArray.length > 0) {
        await customer.ref.update({
          invoiceHistory: invoiceArray,
          lastInvoiceDate: new Date().toISOString()
        });
        
        updatedCount++;
        
        if (updatedCount % 10 === 0) {
          process.stdout.write(`\r  Updated ${updatedCount} customers...`);
        }
      }
    }
    
    console.log(`\r✓ Updated ${updatedCount} customer(s)\n`);
    
    console.log('========================================');
    console.log('  Linking Complete');
    console.log('========================================');
    console.log(`Store Sales:    ${storeSalesCount}`);
    console.log(`Online Orders:  ${onlineOrdersCount}`);
    console.log(`Linked:         ${linkedCount}`);
    console.log(`Not Found:      ${notFoundCount}`);
    console.log(`Updated:        ${updatedCount} customer(s)`);
    console.log('\n✅ All historical invoices have been linked to customers!\n');
    
    if (notFoundCount > 0) {
      console.log(`⚠️  ${notFoundCount} invoice(s) could not be matched to a customer by name.\n`);
    }
    
  } catch (error) {
    console.error('❌ Error during linking:', error.message);
  }
  
  process.exit(0);
}

linkHistoricalInvoices();
