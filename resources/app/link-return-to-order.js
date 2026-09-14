/**
 * Link Return to Order
 */

const { getFirestore, getAdmin } = require('./firebase-admin-config');
const { initializeFirebase } = require('./firebase-admin-config');

async function linkReturnToOrder() {
    try {
        console.log('\n🔗 Linking return to order...\n');
        
        initializeFirebase();
        const db = getFirestore();
        
        await db.collection('returns').doc('IekzywTWKhvwp00tUWVt').update({
            linkedOrderId: 'TcTCyedIPXDZdazyUGXW',
            wasOnlineOrder: true
        });
        
        console.log('✅ Return document updated with order link\n');
        console.log('  Return ID: IekzywTWKhvwp00tUWVt');
        console.log('  Linked Order: TcTCyedIPXDZdazyUGXW');
        console.log('  Was Online Order: true\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    process.exit(0);
}

linkReturnToOrder();
