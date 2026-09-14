const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixReturnedStatus() {
    console.log('🔧 Fixing returned status capitalization...\n');
    
    try {
        // Find all orders with lowercase 'returned' status
        const ordersSnapshot = await db.collection('onlineOrders')
            .where('status', '==', 'returned')
            .get();
        
        if (ordersSnapshot.empty) {
            console.log('✅ No orders found with lowercase "returned" status');
            console.log('   All orders already using correct capitalization!\n');
            return;
        }
        
        console.log(`📋 Found ${ordersSnapshot.size} order(s) with lowercase "returned" status:\n`);
        
        // Update each order
        const batch = db.batch();
        
        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            console.log(`   • Order ID: ${doc.id}`);
            console.log(`     Customer: ${order.clientName || 'N/A'}`);
            console.log(`     Current status: "returned" → Updating to "Returned"`);
            console.log('');
            
            batch.update(doc.ref, { status: 'Returned' });
        });
        
        // Commit all updates
        await batch.commit();
        
        console.log(`✅ Successfully updated ${ordersSnapshot.size} order(s)`);
        console.log('   Status: "returned" → "Returned"\n');
        console.log('🎯 Orders will now appear in the "Returned" filter!\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    process.exit(0);
}

fixReturnedStatus();
