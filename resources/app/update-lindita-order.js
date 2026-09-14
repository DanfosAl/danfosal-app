/**
 * Find and Update Lindita Kollcinaku Order to Returned
 */

const { getFirestore, getAdmin } = require('./firebase-admin-config');
const { initializeFirebase } = require('./firebase-admin-config');

async function updateLinditaOrderToReturned() {
    try {
        console.log('\n🔍 Finding Lindita Kollcinaku order...\n');
        
        initializeFirebase();
        const db = getFirestore();
        
        // Search for Lindita's order
        const ordersSnapshot = await db.collection('onlineOrders')
            .where('clientName', '==', 'Lindita Kollcinaku')
            .get();
        
        if (ordersSnapshot.empty) {
            console.log('❌ No orders found for Lindita Kollcinaku');
            return;
        }
        
        console.log(`✅ Found ${ordersSnapshot.size} order(s) for Lindita Kollcinaku:\n`);
        
        for (const orderDoc of ordersSnapshot.docs) {
            const order = orderDoc.data();
            
            console.log(`Order ID: ${orderDoc.id}`);
            console.log(`  Status: ${order.status}`);
            console.log(`  Total: €${order.total || order.price || 0}`);
            console.log(`  Date: ${order.createdAt || order.orderDate || 'N/A'}`);
            console.log(`  Items: ${(order.items || []).length}`);
            
            // Check if this is the €99 order from the screenshot
            const orderTotal = order.total || order.price || 0;
            
            if (orderTotal === 99 || orderTotal === 99.00) {
                console.log(`\n  🎯 This matches the returned invoice (€99)`);
                console.log(`  📝 Updating status to 'returned'...\n`);
                
                await orderDoc.ref.update({
                    status: 'returned',
                    returnedAt: new Date().toISOString(),
                    returnReason: 'Albanian credit note detected: NOTE KREDITI',
                    returnType: 'return',
                    cancelledInvoiceNumber: '70/2026/mv200vz195',
                    linkedReturnId: 'IekzywTWKhvwp00tUWVt'  // Link to return document
                });
                
                console.log(`  ✅ Order ${orderDoc.id} updated to 'returned' status`);
                console.log(`  📋 Details:`);
                console.log(`     • Status: ${order.status} → returned`);
                console.log(`     • Return Reason: Albanian credit note`);
                console.log(`     • Cancelled Invoice: 70/2026/mv200vz195`);
                console.log(`     • Returned At: ${new Date().toISOString()}\n`);
            } else {
                console.log(`  ℹ️  Total (€${orderTotal}) doesn't match return (€99), skipping\n`);
            }
        }
        
        console.log('✅ Update complete!\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
    
    process.exit(0);
}

updateLinditaOrderToReturned();
