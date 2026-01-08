// DELETE TEST ORDERS - Run this in browser console on https://danfosal-app.web.app
// This will delete all the old test orders showing in AI recommendations

async function deleteTestOrders() {
    // Import Firestore functions
    const { collection, getDocs, deleteDoc, doc } = window.firebaseImports || window;
    
    // List of test order IDs to delete (from your screenshots)
    const testOrderIds = [
        '0IQRLg3f',  // 96 days old
        'Z5hIXb79',  // 58 days old
        'Z7Txu6TH',  // 48 days old
        '4Bn41n5Z',  // 3 days old
        '4IqRh5F9',  // 62 days old
        '5c0AvaL8',  // 6 days old
        '5dLhZAMK',  // 27 days old
        '7pIdWNwB',  // 8 days old
        'AeHzUBF3',  // 98 days old
        'C0WO72SW'   // 27 days old
    ];
    
    console.log('🗑️ Starting cleanup of test orders...');
    console.log(`Found ${testOrderIds.length} orders to delete`);
    
    const ordersRef = collection(db, 'onlineOrders');
    const snapshot = await getDocs(ordersRef);
    
    let deletedCount = 0;
    let notFoundCount = 0;
    
    for (const docSnapshot of snapshot.docs) {
        const orderId = docSnapshot.id;
        
        // Check if this order ID starts with any of our test IDs
        const shouldDelete = testOrderIds.some(testId => orderId.startsWith(testId));
        
        if (shouldDelete) {
            const orderData = docSnapshot.data();
            console.log(`Deleting: ${orderId} - ${orderData.customerName || 'No name'} - €${orderData.totalPrice || 0}`);
            
            try {
                await deleteDoc(docSnapshot.ref);
                deletedCount++;
            } catch (error) {
                console.error(`Failed to delete ${orderId}:`, error);
            }
        }
    }
    
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Deleted: ${deletedCount} orders`);
    console.log(`   Not found: ${testOrderIds.length - deletedCount} orders`);
    
    alert(`✅ Deleted ${deletedCount} test orders!\n\nRefresh the AI Dashboard to see updated recommendations.`);
}

// Run the cleanup
deleteTestOrders();
