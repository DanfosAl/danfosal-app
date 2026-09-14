/**
 * Smart Brain Firebase Permissions Test
 * 
 * Tests that all required collections and indexes are properly configured.
 * Run this after completing Firebase setup.
 */

const { initializeFirebase, getFirestore } = require('./firebase-admin-config');

async function testPermissions() {
  console.log('========================================');
  console.log('  Smart Brain Setup Verification');
  console.log('========================================\n');
  
  try {
    initializeFirebase();
    const db = getFirestore();
    console.log('✓ Firebase initialized\n');
    
    let passCount = 0;
    let failCount = 0;
    
    // Test 1: Write to invoiceHistory
    console.log('Test 1: invoiceHistory collection...');
    try {
      const ref = await db.collection('invoiceHistory').add({
        invoiceNumber: 'TEST-PERM-001',
        action: 'test',
        processedAt: new Date().toISOString(),
        total: 0,
        currency: 'EUR'
      });
      console.log('  ✓ Write permission: OK');
      
      // Test query
      await db.collection('invoiceHistory')
        .where('invoiceNumber', '==', 'TEST-PERM-001')
        .limit(1)
        .get();
      console.log('  ✓ Query by invoiceNumber: OK');
      
      // Clean up
      await ref.delete();
      console.log('  ✓ Delete permission: OK\n');
      passCount++;
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}\n`);
      failCount++;
    }
    
    // Test 2: Write to returns
    console.log('Test 2: returns collection...');
    try {
      const ref = await db.collection('returns').add({
        type: 'return',
        timestamp: new Date(),
        total: 0,
        currency: 'EUR'
      });
      console.log('  ✓ Write permission: OK');
      
      // Test query
      await db.collection('returns')
        .where('type', '==', 'return')
        .limit(1)
        .get();
      console.log('  ✓ Query by type: OK');
      
      await ref.delete();
      console.log('  ✓ Delete permission: OK\n');
      passCount++;
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}\n`);
      failCount++;
    }
    
    // Test 3: Write to stock
    console.log('Test 3: stock collection...');
    try {
      const ref = await db.collection('stock').add({
        productId: 'test-product-123',
        productName: 'Test Product',
        quantity: 10,
        lastUpdated: new Date(),
        lastUpdateReason: 'test'
      });
      console.log('  ✓ Write permission: OK');
      
      // Test update
      await ref.update({
        quantity: 15,
        lastUpdated: new Date()
      });
      console.log('  ✓ Update permission: OK');
      
      await ref.delete();
      console.log('  ✓ Delete permission: OK\n');
      passCount++;
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}\n`);
      failCount++;
    }
    
    // Test 4: Query customers by NIPT (index test)
    console.log('Test 4: customers collection (NIPT index)...');
    try {
      const snapshot = await db.collection('customers')
        .where('nipt', '==', 'TEST123456')
        .limit(1)
        .get();
      console.log('  ✓ Query by NIPT: OK');
      
      // Test query by name
      const nameSnapshot = await db.collection('customers')
        .where('name', '==', 'Test Customer')
        .limit(1)
        .get();
      console.log('  ✓ Query by name: OK\n');
      passCount++;
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      if (error.message.includes('index')) {
        console.log('  → Index not found. Create indexes using Firebase CLI or Console.\n');
      }
      failCount++;
    }
    
    // Test 5: Query onlineOrders (multi-field index test)
    console.log('Test 5: onlineOrders collection (multi-field index)...');
    try {
      const snapshot = await db.collection('onlineOrders')
        .where('customerName', '==', 'Test Customer')
        .where('status', 'in', ['pending', 'confirmed'])
        .limit(1)
        .get();
      console.log('  ✓ Query by customerName + status: OK\n');
      passCount++;
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      if (error.message.includes('index')) {
        console.log('  → Composite index not found. Create indexes using Firebase CLI or Console.\n');
      }
      failCount++;
    }
    
    // Summary
    console.log('========================================');
    console.log('  Test Results');
    console.log('========================================');
    console.log(`Passed: ${passCount}/5`);
    console.log(`Failed: ${failCount}/5`);
    
    if (failCount === 0) {
      console.log('\n✅ All tests passed! Smart Brain is ready to use.\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Review the errors above and:');
      console.log('   1. Check Firebase security rules');
      console.log('   2. Create missing indexes (see FIREBASE_SMART_BRAIN_SETUP.md)');
      console.log('   3. Wait for indexes to finish building\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error('\nCheck that:');
    console.error('  1. serviceAccountKey.json exists and is valid');
    console.error('  2. Firebase project is accessible');
    console.error('  3. npm dependencies are installed (npm install)\n');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testPermissions().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} else {
  module.exports = { testPermissions };
}
