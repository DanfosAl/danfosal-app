// Quick Script to Update Old "Paid" Orders to "Shipped"
// Run this in your browser console on the web app

async function updateOldPaidOrders() {
    const ordersRef = collection(db, 'onlineOrders');
    const ordersSnapshot = await getDocs(ordersRef);
    
    const now = Date.now();
    const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
    
    let updatedCount = 0;
    
    for (const doc of ordersSnapshot.docs) {
        const order = doc.data();
        const orderTime = order.timestamp?.toMillis() || order.timestamp;
        
        // Find old paid orders
        if (order.status === 'Paid' && orderTime < threeDaysAgo) {
            console.log(`Found old paid order: ${doc.id} - ${order.customerName}`);
            
            // Update to Shipped
            await updateDoc(doc.ref, {
                status: 'Shipped',
                shippedDate: new Date().toISOString(),
                updatedBy: 'Bulk Update Script'
            });
            
            updatedCount++;
        }
    }
    
    console.log(`✅ Updated ${updatedCount} orders from "Paid" to "Shipped"`);
    alert(`Updated ${updatedCount} orders!`);
}

// Run it
updateOldPaidOrders();
