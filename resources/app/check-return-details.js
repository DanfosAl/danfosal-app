/**
 * Check Return Details
 * View full return document to see item data
 */

const { getFirestore, getAdmin } = require('./firebase-admin-config');
const { initializeFirebase } = require('./firebase-admin-config');

async function checkReturnDetails() {
    try {
        console.log('\n🔍 Checking Return Details...\n');
        
        initializeFirebase();
        const db = getFirestore();
        
        const returnDoc = await db.collection('returns').doc('IekzywTWKhvwp00tUWVt').get();
        
        if (returnDoc.exists) {
            const data = returnDoc.data();
            
            console.log('📄 Return Document:');
            console.log(JSON.stringify(data, null, 2));
            
            console.log('\n📦 Items Array:');
            if (data.items && data.items.length > 0) {
                data.items.forEach((item, index) => {
                    console.log(`\n  Item ${index + 1}:`);
                    console.log(`    itemName: "${item.itemName || item.name || 'MISSING'}"`);
                    console.log(`    quantity: ${item.quantity || 'MISSING'}`);
                    console.log(`    pricePerUnit: ${item.pricePerUnit || item.price || 'N/A'}`);
                    console.log(`    lineTotal: ${item.lineTotal || 'N/A'}`);
                });
            } else {
                console.log('  ⚠️  Items array is empty or missing');
            }
        } else {
            console.log('❌ Return document not found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    process.exit(0);
}

checkReturnDetails();
