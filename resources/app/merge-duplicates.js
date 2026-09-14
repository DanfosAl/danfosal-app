/**
 * Merge Duplicate Customers Script
 * 
 * Finds customers with identical names and merges them into a single record.
 * Combines invoiceHistory arrays and keeps the most complete data.
 */

const { initializeFirebase, getFirestore } = require('./firebase-admin-config');

async function mergeDuplicates() {
  initializeFirebase();
  const db = getFirestore();
  
  console.log('\n========================================');
  console.log('  Merge Duplicate Customers');
  console.log('========================================\n');
  
  console.log('⚠️  This will merge duplicate customer records.');
  console.log('    Press Ctrl+C in the next 5 seconds to cancel...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    // Fetch all customers
    console.log('📊 Scanning customers collection...\n');
    const snapshot = await db.collection('customers').get();
    
    // Group by normalized name
    const nameMap = new Map();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const name = data.name ? data.name.trim() : '';
      
      if (name) {
        const normalized = name.toLowerCase();
        if (!nameMap.has(normalized)) {
          nameMap.set(normalized, []);
        }
        nameMap.get(normalized).push({
          id: doc.id,
          ref: doc.ref,
          data: data
        });
      }
    });
    
    // Find and merge duplicates
    let mergedCount = 0;
    let groupCount = 0;
    
    for (const [normalizedName, customers] of nameMap.entries()) {
      if (customers.length > 1) {
        groupCount++;
        console.log(`\n→ Processing duplicate group: "${customers[0].data.name}"`);
        console.log(`  Found ${customers.length} records to merge\n`);
        
        // Select primary record (most complete data, or first one)
        let primary = customers[0];
        let dupCount = 0;
        
        // Find primary with most invoices or first created
        for (const customer of customers) {
          const historyLength = (customer.data.invoiceHistory || []).length;
          const primaryHistoryLength = (primary.data.invoiceHistory || []).length;
          
          if (historyLength > primaryHistoryLength) {
            primary = customer;
          }
        }
        
        console.log(`  Primary record: ${primary.id}`);
        
        // Merge data from duplicates into primary
        const mergedInvoices = new Set(primary.data.invoiceHistory || []);
        let mostRecentDate = primary.data.lastInvoiceDate || null;
        
        for (const customer of customers) {
          if (customer.id === primary.id) continue;
          
          // Merge invoice history
          const invoices = customer.data.invoiceHistory || [];
          invoices.forEach(inv => mergedInvoices.add(inv));
          
          // Keep most recent date
          if (customer.data.lastInvoiceDate) {
            if (!mostRecentDate || customer.data.lastInvoiceDate > mostRecentDate) {
              mostRecentDate = customer.data.lastInvoiceDate;
            }
          }
          
          console.log(`  Merging: ${customer.id} (${invoices.length} invoices)`);
          dupCount++;
        }
        
        // Update primary record with merged data
        const updateData = {
          invoiceHistory: Array.from(mergedInvoices),
          lastInvoiceDate: mostRecentDate
        };
        
        await primary.ref.update(updateData);
        console.log(`  ✓ Updated primary with ${mergedInvoices.size} total invoices`);
        
        // Delete duplicates
        for (const customer of customers) {
          if (customer.id === primary.id) continue;
          
          await customer.ref.delete();
          console.log(`  ✓ Deleted duplicate: ${customer.id}`);
        }
        
        mergedCount += dupCount;
        console.log(`  ✅ Merged ${dupCount} duplicate(s) into primary record`);
      }
    }
    
    console.log('\n========================================');
    console.log('  Merge Complete');
    console.log('========================================');
    console.log(`Merged: ${mergedCount} duplicate customer(s)`);
    console.log(`Groups: ${groupCount} duplicate group(s)`);
    console.log('\n✅ All duplicate customers have been consolidated!\n');
    
  } catch (error) {
    console.error('❌ Error during merge:', error.message);
  }
  
  process.exit(0);
}

mergeDuplicates();
