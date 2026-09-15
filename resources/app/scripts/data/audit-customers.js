/**
 * Customer Database Audit Script
 * 
 * Scans the customers collection to identify:
 * - Duplicate customers (by name)
 * - Customers missing invoiceHistory arrays
 * - Total customer count and data quality
 */

const { initializeFirebase, getFirestore } = require('../../firebase-admin-config');

async function auditCustomers() {
  initializeFirebase();
  const db = getFirestore();
  
  console.log('\n========================================');
  console.log('  Customer Database Audit');
  console.log('========================================\n');
  
  try {
    // Fetch all customers
    console.log('📊 Scanning customers collection...\n');
    const snapshot = await db.collection('customers').get();
    
    console.log(`✓ Found ${snapshot.size} total customer(s)\n`);
    
    // Track duplicates by name
    const nameMap = new Map();
    const missingHistory = [];
    const stats = {
      total: snapshot.size,
      withHistory: 0,
      withoutHistory: 0,
      duplicates: 0,
      duplicateGroups: []
    };
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const name = data.name ? data.name.trim() : '';
      
      // Check for invoiceHistory
      if (data.invoiceHistory && Array.isArray(data.invoiceHistory)) {
        stats.withHistory++;
      } else {
        stats.withoutHistory++;
        missingHistory.push({
          id: doc.id,
          name: name,
          nipt: data.nipt || '(empty)'
        });
      }
      
      // Track duplicates by name
      if (name) {
        const normalized = name.toLowerCase();
        if (!nameMap.has(normalized)) {
          nameMap.set(normalized, []);
        }
        nameMap.get(normalized).push({
          id: doc.id,
          name: data.name,
          nipt: data.nipt || '(empty)',
          invoiceHistory: data.invoiceHistory || [],
          lastInvoiceDate: data.lastInvoiceDate || null
        });
      }
    });
    
    // Find duplicates
    for (const [name, customers] of nameMap.entries()) {
      if (customers.length > 1) {
        stats.duplicates += customers.length;
        stats.duplicateGroups.push({
          name: name,
          count: customers.length,
          customers: customers
        });
      }
    }
    
    // Display results
    console.log('========================================');
    console.log('  Audit Results');
    console.log('========================================\n');
    
    console.log('📋 Total Statistics:');
    console.log(`   • Total Customers: ${stats.total}`);
    console.log(`   • With invoiceHistory: ${stats.withHistory}`);
    console.log(`   • Without invoiceHistory: ${stats.withoutHistory}`);
    console.log(`   • Duplicate customers: ${stats.duplicates} (in ${stats.duplicateGroups.length} groups)\n`);
    
    if (stats.withoutHistory > 0) {
      console.log('⚠️  Customers Missing invoiceHistory:');
      missingHistory.forEach(c => {
        console.log(`   • ${c.name} (${c.id}) - NIPT: ${c.nipt}`);
      });
      console.log('');
    }
    
    if (stats.duplicateGroups.length > 0) {
      console.log('⚠️  Duplicate Customer Groups:\n');
      stats.duplicateGroups.forEach((group, index) => {
        console.log(`   Group ${index + 1}: "${group.customers[0].name}" (${group.count} records)`);
        group.customers.forEach(c => {
          console.log(`      • ID: ${c.id}`);
          console.log(`        NIPT: ${c.nipt}`);
          console.log(`        Invoices: ${c.invoiceHistory.length}`);
          console.log(`        Last Invoice: ${c.lastInvoiceDate || 'Never'}`);
        });
        console.log('');
      });
    } else {
      console.log('✅ No duplicate customers found!\n');
    }
    
    console.log('========================================');
    console.log('  Audit Complete');
    console.log('========================================\n');
    
    if (stats.withoutHistory > 0) {
      console.log('💡 Run "npm run fix-customer-history" to add missing invoiceHistory arrays\n');
    }
    
    if (stats.duplicateGroups.length > 0) {
      console.log('💡 Run "npm run merge-duplicates" to consolidate duplicate customers\n');
    }
    
  } catch (error) {
    console.error('❌ Error during audit:', error.message);
  }
  
  process.exit(0);
}

auditCustomers();
