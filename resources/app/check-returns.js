/**
 * Check Returns and Cancelled Orders
 * Verifies if the cancellation handling is working correctly
 */

const { getFirestore, getAdmin } = require('./firebase-admin-config');
const { initializeFirebase } = require('./firebase-admin-config');

async function checkReturns() {
    try {
        console.log('\n🔍 Checking Returns and Cancellations...\n');
        
        // Initialize Firebase
        initializeFirebase();
        const db = getFirestore();
        
        // Check 1: Returns collection
        console.log('📦 Checking returns collection...');
        const returnsSnapshot = await db.collection('returns').orderBy('timestamp', 'desc').limit(5).get();
        
        if (returnsSnapshot.empty) {
            console.log('  ℹ️  No returns found in database yet');
        } else {
            console.log(`  ✅ Found ${returnsSnapshot.size} return(s):\n`);
            returnsSnapshot.forEach(doc => {
                const data = doc.data();
                console.log(`  Return ID: ${doc.id}`);
                console.log(`    Type: ${data.type}`);
                console.log(`    Reason: ${data.reason}`);
                console.log(`    Invoice: ${data.invoiceNumber}`);
                console.log(`    Customer: ${data.customerName}`);
                console.log(`    Linked Order: ${data.linkedOrderId || 'None'}`);
                console.log(`    Was Online Order: ${data.wasOnlineOrder || false}`);
                console.log(`    Items: ${(data.items || []).length} item(s)`);
                console.log(`    Total: €${data.total}\n`);
            });
        }
        
        // Check 2: Online orders with "returned" status
        console.log('\n📦 Checking for returned online orders...');
        const returnedOrdersSnapshot = await db.collection('onlineOrders')
            .where('status', '==', 'returned')
            .limit(5)
            .get();
        
        if (returnedOrdersSnapshot.empty) {
            console.log('  ℹ️  No online orders with "returned" status');
        } else {
            console.log(`  ✅ Found ${returnedOrdersSnapshot.size} returned order(s):\n`);
            returnedOrdersSnapshot.forEach(doc => {
                const data = doc.data();
                console.log(`  Order ID: ${doc.id}`);
                console.log(`    Customer: ${data.clientName}`);
                console.log(`    Previous Status: ${data.status}`);
                console.log(`    Returned At: ${data.returnedAt || 'N/A'}`);
                console.log(`    Return Reason: ${data.returnReason || 'N/A'}`);
                console.log(`    Cancelled Invoice: ${data.cancelledInvoiceNumber || 'N/A'}`);
                console.log(`    Items: ${(data.items || []).length} item(s)`);
                console.log(`    Total: €${data.total || data.price || 0}\n`);
            });
        }
        
        // Check 3: Recent storeSales with linkedOrderId
        console.log('\n📦 Checking recent storeSales with linkedOrderId...');
        const salesSnapshot = await db.collection('storeSales')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();
        
        let foundLinked = false;
        salesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.linkedOrderId) {
                if (!foundLinked) {
                    console.log('  ✅ Found sales linked to online orders:\n');
                    foundLinked = true;
                }
                console.log(`  Sale ID: ${doc.id}`);
                console.log(`    Linked Order: ${data.linkedOrderId}`);
                console.log(`    Was Online Order: ${data.wasOnlineOrder || false}`);
                console.log(`    Customer: ${data.clientName}`);
                console.log(`    Invoice: ${data.easypos?.invoiceNumber || 'N/A'}`);
                console.log(`    Total: €${data.total}\n`);
            }
        });
        
        if (!foundLinked) {
            console.log('  ℹ️  No recent storeSales with linkedOrderId found');
        }
        
        // Check 4: Check if there are any online orders in Processing status (fulfilled but not returned)
        console.log('\n📦 Checking fulfilled online orders (Processing status)...');
        const processingSnapshot = await db.collection('onlineOrders')
            .where('status', '==', 'Processing')
            .limit(5)
            .get();
        
        if (processingSnapshot.empty) {
            console.log('  ℹ️  No orders in Processing status');
        } else {
            console.log(`  ✅ Found ${processingSnapshot.size} order(s) in Processing:\n`);
            processingSnapshot.forEach(doc => {
                const data = doc.data();
                console.log(`  Order ID: ${doc.id}`);
                console.log(`    Customer: ${data.clientName}`);
                console.log(`    Linked Invoice: ${data.linkedInvoiceNumber || 'None'}`);
                console.log(`    Processed At: ${data.processedAt || 'N/A'}`);
                console.log(`    Items: ${(data.items || []).length} item(s)`);
                console.log(`    Total: €${data.total || data.price || 0}\n`);
            });
        }
        
        console.log('\n✅ Check complete!\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
    
    process.exit(0);
}

checkReturns();
