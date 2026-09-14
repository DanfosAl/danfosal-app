/**
 * Cleanup Lindita Kollcinaku Duplicate Data
 * Removes the incorrectly processed sale and customer record
 */

const { getFirestore, getAdmin } = require('./firebase-admin-config');
const { initializeFirebase } = require('./firebase-admin-config');

async function cleanup() {
    try {
        console.log('\n🧹 Cleaning up duplicate Lindita Kollcinaku data...\n');
        
        initializeFirebase();
        const db = getFirestore();
        
        // Step 1: Delete the incorrect storeSales entry
        console.log('Step 1: Deleting incorrect storeSales entry...');
        const saleId = 'z0IF9Oa906afIoOjZbnD';
        await db.collection('storeSales').doc(saleId).delete();
        console.log(`  ✅ Deleted storeSales/${saleId}`);
        
        // Step 2: Delete the customer (so invoice history doesn't block reprocessing)
        console.log('\nStep 2: Deleting customer record...');
        const customerId = 'LSuuFaIczQsBXCRkv7Z2';
        await db.collection('customers').doc(customerId).delete();
        console.log(`  ✅ Deleted customers/${customerId}`);
        
        console.log('\n✅ Cleanup complete! Invoice can now be reprocessed correctly.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
    
    process.exit(0);
}

cleanup();
