const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyFilter() {
    console.log('🔍 Verifying "Returned" filter...\n');
    
    try {
        // Test the exact query that the filter uses
        const returnedOrders = await db.collection('onlineOrders')
            .where('status', '==', 'Returned')
            .get();
        
        console.log(`📊 Query: onlineOrders.where('status', '==', 'Returned')`);
        console.log(`📈 Results: ${returnedOrders.size} order(s) found\n`);
        
        if (returnedOrders.empty) {
            console.log('⚠️  No returned orders found');
        } else {
            returnedOrders.forEach(doc => {
                const order = doc.data();
                console.log(`✅ Order ID: ${doc.id}`);
                console.log(`   Customer: ${order.clientName || 'N/A'}`);
                console.log(`   Status: ${order.status}`);
                console.log(`   Total: €${order.total || order.price || 0}`);
                console.log(`   Returned At: ${order.returnedAt || 'N/A'}`);
                console.log(`   Reason: ${order.returnReason || 'N/A'}`);
                console.log('');
            });
        }
        
        console.log('🎯 Filter verification complete!\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    process.exit(0);
}

verifyFilter();
