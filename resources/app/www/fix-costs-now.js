// RUN THIS IN BROWSER CONSOLE (F12) - Cost Matching Script
// This will match costs from your products catalog to all sales

(async function() {
    const { getFirestore, collection, getDocs, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const db = getFirestore();

    console.log('🔄 Step 1: Loading products from catalog...');
    const productsSnap = await getDocs(collection(db, 'products'));
    const codeMap = new Map();
    const nameMap = new Map();
    
    let productsWithCost = 0;
    let totalProducts = 0;
    
    productsSnap.forEach(d => {
        const p = d.data();
        totalProducts++;
        
        if (p.code) {
            const upperCode = p.code.toUpperCase();
            codeMap.set(upperCode, p);
            if (p.cost && p.cost > 0) productsWithCost++;
        }
        if (p.name) {
            nameMap.set(p.name, p);
        }
    });
    
    console.log(`📦 Found ${totalProducts} products in catalog`);
    console.log(`💰 ${productsWithCost} products have cost data`);
    
    if (productsWithCost === 0) {
        console.error('❌ ERROR: NO PRODUCTS HAVE COSTS!');
        console.error('👉 Go to Products page and add Cost & Price for each product first');
        console.error('   Example: Cost: 8500, Price: 11200');
        return;
    }
    
    // Update store sales
    console.log('\n🏪 Step 2: Updating store sales...');
    const salesSnap = await getDocs(collection(db, 'storeSales'));
    let updatedSales = 0;
    let matchedItems = 0;
    let notFoundItems = 0;
    
    for (const saleDoc of salesSnap.docs) {
        const sale = saleDoc.data();
        if (!sale.items || sale.items.length === 0) continue;
        
        let needsUpdate = false;
        let totalCost = 0;
        
        const updatedItems = sale.items.map(item => {
            const code = (item.code || item.productCode || '').toUpperCase();
            const name = item.name || item.product || '';
            
            // Try to find product by code first, then by name
            const product = codeMap.get(code) || nameMap.get(name);
            
            if (product) {
                matchedItems++;
                
                // Update cost if missing or zero
                if (!item.cost || item.cost === 0) {
                    item.cost = product.cost || 0;
                    needsUpdate = true;
                }
                
                // Update price if missing or zero
                if (!item.price || item.price === 0) {
                    item.price = product.price || 0;
                    needsUpdate = true;
                }
            } else {
                notFoundItems++;
                if (code) {
                    console.warn(`⚠️ Not found: ${name} [${code}]`);
                }
            }
            
            totalCost += (item.cost || 0) * (item.quantity || 1);
            return item;
        });
        
        if (needsUpdate) {
            await updateDoc(doc(db, 'storeSales', saleDoc.id), {
                items: updatedItems,
                cost: totalCost
            });
            updatedSales++;
            
            if (updatedSales % 50 === 0) {
                console.log(`  ✅ Updated ${updatedSales} store sales...`);
            }
        }
    }
    
    console.log(`✅ Updated ${updatedSales} store sales`);
    
    // Update online orders
    console.log('\n📦 Step 3: Updating online orders...');
    const ordersSnap = await getDocs(collection(db, 'onlineOrders'));
    let updatedOrders = 0;
    
    for (const orderDoc of ordersSnap.docs) {
        const order = orderDoc.data();
        if (!order.items || order.items.length === 0) continue;
        
        let needsUpdate = false;
        let totalCost = 0;
        
        const updatedItems = order.items.map(item => {
            const code = (item.code || item.productCode || '').toUpperCase();
            const name = item.name || item.product || '';
            
            const product = codeMap.get(code) || nameMap.get(name);
            
            if (product) {
                matchedItems++;
                
                if (!item.cost || item.cost === 0) {
                    item.cost = product.cost || 0;
                    needsUpdate = true;
                }
                
                if (!item.price || item.price === 0) {
                    item.price = product.price || 0;
                    needsUpdate = true;
                }
            } else {
                notFoundItems++;
            }
            
            totalCost += (item.cost || 0) * (item.quantity || 1);
            return item;
        });
        
        if (needsUpdate) {
            await updateDoc(doc(db, 'onlineOrders', orderDoc.id), {
                items: updatedItems,
                cost: totalCost
            });
            updatedOrders++;
            
            if (updatedOrders % 50 === 0) {
                console.log(`  ✅ Updated ${updatedOrders} online orders...`);
            }
        }
    }
    
    console.log(`✅ Updated ${updatedOrders} online orders`);
    
    // Summary
    console.log('\n🎉 ============ COMPLETED ============');
    console.log(`✅ Total updated: ${updatedSales + updatedOrders} records`);
    console.log(`✅ Items matched: ${matchedItems}`);
    if (notFoundItems > 0) {
        console.warn(`⚠️ Items not found in catalog: ${notFoundItems}`);
        console.warn('   👉 Add these products to your catalog with correct codes');
    }
    console.log('\n🔄 REFRESH your Business Intelligence page now!');
})();
