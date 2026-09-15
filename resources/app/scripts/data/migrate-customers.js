/**
 * Customer Migration Script
 * 
 * Adds the 'nipt' field to all existing customers for Smart Brain compatibility.
 * Run this once after upgrading to Smart Brain.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateCustomers() {
  console.log('========================================');
  console.log('  Customer Migration for Smart Brain');
  console.log('========================================\n');
  
  try {
    const snapshot = await db.collection('customers').get();
    
    console.log(`Found ${snapshot.size} customer(s) to check\n`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const customerId = doc.id;
      const customerName = data.name || 'Unknown';
      
      // Check if nipt and invoiceHistory fields exist
      if (data.nipt !== undefined && data.invoiceHistory !== undefined) {
        console.log(`✓ Skipped ${customerName} (${customerId}) - already has NIPT and invoiceHistory fields`);
        skippedCount++;
        continue;
      }
      
      // Add nipt and invoiceHistory fields
      try {
        // Try to extract NIPT from address field (legacy storage location)
        let niptValue = '';
        if (data.address && data.address.match(/^[A-Z0-9]{10,15}$/)) {
          niptValue = data.address;
          console.log(`→ Updating ${customerName} (${customerId}) - NIPT found in address: ${niptValue}`);
        } else {
          console.log(`→ Updating ${customerName} (${customerId}) - NIPT not found, setting to empty`);
        }
        
        await doc.ref.update({ 
          nipt: niptValue,
          invoiceHistory: [], // Initialize empty invoice history array
          migratedAt: new Date().toISOString()
        });
        
        updatedCount++;
        
      } catch (error) {
        console.error(`✗ Failed to update ${customerName} (${customerId}): ${error.message}`);
      }
    }
    
    console.log('\n========================================');
    console.log('  Migration Complete');
    console.log('========================================');
    console.log(`Updated: ${updatedCount} customer(s)`);
    console.log(`Skipped: ${skippedCount} customer(s) (already had NIPT)`);
    console.log(`Total:   ${snapshot.size} customer(s)\n`);
    
    if (updatedCount > 0) {
      console.log('✅ Migration successful! All customers now have NIPT and invoiceHistory fields.\n');
    } else if (skippedCount === snapshot.size) {
      console.log('✅ No migration needed - all customers already have NIPT and invoiceHistory fields.\n');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nCheck that:');
    console.error('  1. serviceAccountKey.json is valid');
    console.error('  2. Firebase project is accessible');
    console.error('  3. You have permission to write to customers collection\n');
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  console.log('\n⚠️  This will update all customer records in Firebase.');
  console.log('Press Ctrl+C in the next 5 seconds to cancel...\n');
  
  setTimeout(() => {
    migrateCustomers().catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
  }, 5000);
  
} else {
  module.exports = { migrateCustomers };
}
