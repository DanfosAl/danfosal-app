// 🤖 AI Agent Extensions - Additional functionality for specific workflows
// This extends the main DanfosalAIAgent class with more specific methods

// Extend the main AI Agent class with additional methods
if (window.DanfosalAIAgent) {
    Object.assign(DanfosalAIAgent.prototype, {
        
        // ═══════════════════════════════════════
        // 📸 SCANNER DELEGATION (REPLACES DIRECT OCR)
        // ═══════════════════════════════════════

        async extractCustomerInvoiceData(image) {
            // No longer doing direct OCR - delegate to store sales scanner
            return {
                success: false,
                error: 'Use store sales scanner instead',
                shouldDelegate: true,
                targetScanner: 'store-sales'
            };
        },

        async handleGeneralImageProcessing(image, userMessage) {
            console.log('🔍 Handling general image processing...');

            // Instead of doing OCR ourselves, guide user to appropriate scanner
            return this.createResponse(
                `📸 **Image Received!**

I can help you process this image using your existing, reliable scanners:

**🛍️ Customer Invoice/Receipt Scanner**
• Best for sales receipts and customer invoices
• Creates sales records automatically
• Well-tested and reliable

**📦 Supplier Invoice Scanner**
• Best for supplier invoices and PDFs
• Updates inventory and stock levels
• Handles complex invoice formats

**Which scanner would work best for your image?**`,
                'info',
                null,
                [
                    { text: '🛍️ Use Store Sales Scanner', action: () => this.processWithStoreSalesScanner(image) },
                    { text: '📦 Use Inventory Scanner', action: () => this.processWithInventoryScanner(image) },
                    { text: '❓ Not Sure - Show Options', action: () => this.showScannerOptions(image) }
                ]
            );
        },

        // ═══════════════════════════════════════
        // 🛍️ SALES PROCESSING
        // ═══════════════════════════════════════

        async createSaleFromExtraction(extractedData) {
            try {
                console.log('💰 Creating sale from extracted data:', extractedData);

                // Prepare sale data
                const saleData = {
                    customerName: extractedData.customerName || 'Walk-in Customer',
                    customerPhone: extractedData.customerPhone || '',
                    items: extractedData.items || [],
                    totalPrice: extractedData.total || 0,
                    status: 'Paid',
                    timestamp: new Date().toISOString(),
                    paymentMethod: 'Cash',
                    notes: 'Created by AI from scanned receipt'
                };

                // Save to Firebase
                const salesRef = this.collection(this.db, 'onlineOrders');
                await this.addDoc(salesRef, saleData);

                // Update product stock
                for (const item of saleData.items) {
                    await this.updateProductStock(item.name, -item.quantity);
                }

                return this.createResponse(
                    `✅ **Sale Created Successfully!**
                    
**Customer:** ${saleData.customerName}
**Items:** ${saleData.items.length} products
**Total:** €${saleData.totalPrice.toFixed(2)}
**Payment:** ${saleData.paymentMethod}

The sale has been added to your records and product stock has been updated accordingly.`,
                    'success',
                    null,
                    [
                        { text: 'View Sales Records', action: () => this.openPage('store-sales.html') }
                    ]
                );

            } catch (error) {
                console.error('❌ Error creating sale:', error);
                return this.createResponse(
                    "I encountered an error while creating the sale. Please check the data and try again, or create it manually in the store sales section.",
                    'error',
                    () => this.openPage('store-sales.html')
                );
            }
        },

        async updateProductStock(productName, quantityChange) {
            try {
                // Find the product
                const productsRef = this.collection(this.db, 'products');
                const snapshot = await this.getDocs(productsRef);
                
                const productDoc = snapshot.docs.find(doc => 
                    doc.data().name && doc.data().name.toLowerCase() === productName.toLowerCase()
                );

                if (productDoc) {
                    const currentStock = productDoc.data().stock || 0;
                    const newStock = Math.max(0, currentStock + quantityChange);

                    await this.updateDoc(this.doc(this.db, 'products', productDoc.id), {
                        stock: newStock
                    });

                    console.log(`📦 Updated ${productName} stock: ${currentStock} → ${newStock}`);
                } else {
                    console.warn(`⚠️ Product not found for stock update: ${productName}`);
                }

            } catch (error) {
                console.error('❌ Error updating product stock:', error);
            }
        },

        // ═══════════════════════════════════════
        // 📦 SUPPLIER INVOICE PROCESSING
        // ═══════════════════════════════════════

        async processSupplierInvoiceData(scanResult) {
            try {
                console.log('📦 Processing supplier invoice data:', scanResult);

                let updatedProducts = 0;
                let newProducts = 0;
                let totalValue = 0;

                // Process each item
                for (const item of scanResult.items) {
                    // Check if product exists
                    const existingProduct = this.contextData.products.find(p => 
                        p.name && p.name.toLowerCase() === item.name.toLowerCase() ||
                        p.code && p.code.toLowerCase() === item.code.toLowerCase()
                    );

                    if (existingProduct) {
                        // Update existing product
                        const newStock = (existingProduct.stock || 0) + item.quantity;
                        await this.updateDoc(this.doc(this.db, 'products', existingProduct.id), {
                            stock: newStock,
                            cost: item.costWithVAT,
                            baseCost: item.baseCost
                        });
                        updatedProducts++;
                    } else {
                        // Create new product
                        const newProduct = {
                            name: item.name,
                            code: item.code,
                            producer: scanResult.supplier,
                            stock: item.quantity,
                            cost: item.costWithVAT,
                            baseCost: item.baseCost,
                            price: item.suggestedPrice || item.costWithVAT * 1.3 // 30% markup
                        };

                        await this.addDoc(this.collection(this.db, 'products'), newProduct);
                        newProducts++;
                    }

                    totalValue += item.costWithVAT * item.quantity;
                }

                // Add to creditors (money you owe)
                const creditorData = {
                    name: scanResult.supplier,
                    amount: totalValue,
                    description: `Supplier invoice - ${scanResult.items.length} items`,
                    date: new Date().toISOString(),
                    status: 'Pending',
                    type: 'Supplier Invoice'
                };

                await this.addDoc(this.collection(this.db, 'creditors'), creditorData);

                // Refresh context
                await this.refreshContext();

                return this.createResponse(
                    `✅ **Supplier Invoice Processed Successfully!**
                    
**Supplier:** ${scanResult.supplier}
**Total Value:** €${totalValue.toFixed(2)}

**Summary:**
• ${updatedProducts} existing products updated
• ${newProducts} new products created
• Stock quantities increased
• Invoice added to creditors (money owed)

All product information and inventory levels have been updated automatically.`,
                    'success',
                    null,
                    [
                        { text: 'View Products', action: () => this.openPage('products.html') },
                        { text: 'View Creditors', action: () => this.openPage('creditors_list.html') }
                    ]
                );

            } catch (error) {
                console.error('❌ Error processing supplier invoice:', error);
                return this.createResponse(
                    "I encountered an error while processing the supplier invoice. Please check the data and try processing it manually.",
                    'error',
                    () => this.openPage('smart-inventory-scanner.html')
                );
            }
        },

        async showDetailedReview(confirmation) {
            if (confirmation.type === 'process_supplier_invoice') {
                const data = confirmation.data;
                let review = `📦 **Detailed Review - Supplier Invoice**\n\n`;
                review += `**Supplier:** ${data.supplier}\n`;
                review += `**Total Items:** ${data.items.length}\n\n`;
                
                review += `**Items to Process:**\n`;
                data.items.forEach((item, i) => {
                    review += `${i + 1}. **${item.name}**\n`;
                    review += `   • Code: ${item.code || 'N/A'}\n`;
                    review += `   • Quantity: ${item.quantity}\n`;
                    review += `   • Cost: €${item.costWithVAT.toFixed(2)} each\n`;
                    review += `   • Total: €${(item.costWithVAT * item.quantity).toFixed(2)}\n\n`;
                });

                const totalValue = data.items.reduce((sum, item) => sum + (item.costWithVAT * item.quantity), 0);
                review += `**Grand Total: €${totalValue.toFixed(2)}**\n\n`;
                review += `Ready to proceed?`;

                // Re-set confirmation for next response
                this.awaitingConfirmation = confirmation;

                return this.createResponse(review, 'info', null, [
                    { text: 'Yes, Process All', action: 'confirm' },
                    { text: 'Cancel', action: 'cancel' }
                ]);
            }

            return this.createResponse(
                "I don't have detailed review information for this action.",
                'warning'
            );
        },

        // ═══════════════════════════════════════
        // 🔄 CONTEXT MANAGEMENT
        // ═══════════════════════════════════════

        async refreshContextData() {
            console.log('🔄 Refreshing context data...');
            await this.loadContext();
            
            return this.createResponse(
                "✅ I've refreshed my knowledge of your products, sales, and other data. I'm now up to date with your latest information!",
                'success'
            );
        },

        // Get current business summary
        getBusinessSummary() {
            const products = this.contextData.products || [];
            const sales = this.contextData.sales || [];
            const recentSales = sales.filter(sale => this.isRecent(sale.timestamp, 7));
            
            return {
                totalProducts: products.length,
                lowStockProducts: products.filter(p => (p.stock || 0) < 5).length,
                recentSalesCount: recentSales.length,
                recentRevenue: recentSales.reduce((sum, sale) => sum + (sale.totalPrice || 0), 0)
            };
        },

        // ═══════════════════════════════════════
        // 🛡️ WARRANTY WORKFLOW
        // ═══════════════════════════════════════

        async createWarrantyWorkflow(serialNumber, productInfo = null) {
            try {
                // This would integrate with existing warranty system
                const warrantyData = {
                    serialNumber,
                    productInfo,
                    createdAt: new Date().toISOString(),
                    createdBy: 'AI Assistant'
                };

                // For now, just provide guidance
                return this.createResponse(
                    `🛡️ **Warranty Creation Process**
                    
I can help you create a warranty for:
**Serial Number:** ${serialNumber}
${productInfo ? `**Product:** ${productInfo}` : ''}

To complete the warranty creation, I need to integrate with your existing warranty system. For now, please:

1. Open the warranty management section
2. Enter the serial number: ${serialNumber}
3. Fill in customer and product details
4. Submit the warranty registration

Would you like me to help you find the warranty management page?`,
                    'info',
                    null,
                    [
                        { text: 'Find Warranty System', action: () => this.searchForWarrantySystem() }
                    ]
                );

            } catch (error) {
                console.error('❌ Error in warranty workflow:', error);
                return this.createResponse(
                    "I encountered an error while setting up the warranty. Please handle this manually for now.",
                    'error'
                );
            }
        },

        searchForWarrantySystem() {
            // Look for warranty-related pages or features
            const possiblePages = ['warranties.html', 'warranty.html', 'service.html'];
            
            // This would need to be implemented based on your actual warranty system
            return this.createResponse(
                "I'm looking for your warranty management system. If you have a specific warranty page or process, please let me know how to access it!",
                'info'
            );
        },

        // ═══════════════════════════════════════
        // 🔧 SCANNER DELEGATION METHODS
        // ═══════════════════════════════════════

        async processWithStoreSalesScanner(image) {
            console.log('🛍️ Delegating to store sales scanner...');
            
            return this.createResponse(
                `🛍️ **Processing Customer Invoice**

I'm opening the **Store Sales** page where you can use the proven invoice scanner.

**What happens next:**
1. Store Sales page will open
2. Use the existing scanner there (it's well-tested!)
3. It will extract customer and product data
4. Create the sale automatically

This uses your reliable store invoice scanner that you know works well.`,
                'success',
                () => {
                    // Open store sales page
                    this.openPage('store-sales.html');
                    
                    // Store the image data for the store sales page to use
                    if (typeof image === 'string' && image.startsWith('data:')) {
                        localStorage.setItem('ai_pending_invoice_scan', image);
                        localStorage.setItem('ai_pending_scan_type', 'customer');
                    }
                },
                [
                    { text: 'Open Store Sales Now', action: () => this.openPage('store-sales.html') }
                ]
            );
        },

        async processWithInventoryScanner(image) {
            console.log('📦 Delegating to inventory scanner...');
            
            return this.createResponse(
                `📦 **Processing Supplier Invoice**

I'm opening the **Smart Inventory Scanner** page where you can use the proven supplier invoice scanner.

**What happens next:**
1. Inventory scanner page will open
2. Use the existing scanner there (it handles PDFs and images perfectly!)
3. It will extract all products, costs, and quantities
4. Update stock and add to creditors automatically

This uses your reliable smart inventory scanner that you know works well with supplier invoices.`,
                'success',
                () => {
                    // Open smart inventory scanner page
                    this.openPage('smart-inventory-scanner.html');
                    
                    // Store the image data for the scanner page to use
                    if (typeof image === 'string' && image.startsWith('data:')) {
                        localStorage.setItem('ai_pending_invoice_scan', image);
                        localStorage.setItem('ai_pending_scan_type', 'supplier');
                    }
                },
                [
                    { text: 'Open Inventory Scanner Now', action: () => this.openPage('smart-inventory-scanner.html') }
                ]
            );
        },

        async showScannerOptions(image) {
            return this.createResponse(
                `❓ **Not Sure Which Scanner to Use?**

Here's how to tell the difference:

**🛍️ Customer Invoice/Receipt:**
• FROM customers TO you
• Shows what customer bought
• Usually has payment method (cash, card)
• Creates sales records

**📦 Supplier Invoice:**
• FROM suppliers TO you  
• Shows what you purchased for inventory
• Usually has product codes, wholesale prices
• Updates your stock levels

**💡 When in doubt:**
• Try the **Store Sales** scanner first for customer receipts
• Use **Inventory Scanner** for supplier invoices and PDFs

Which would you like to try?`,
                'info',
                null,
                [
                    { text: '🛍️ Try Store Sales Scanner', action: () => this.processWithStoreSalesScanner(image) },
                    { text: '📦 Try Inventory Scanner', action: () => this.processWithInventoryScanner(image) },
                    { text: '📚 Show Me Both Pages', action: () => this.showBothScannerPages() }
                ]
            );
        },

        showBothScannerPages() {
            return this.createResponse(
                `📚 **Invoice Scanner Options**

I can open both scanner pages for you:

**🛍️ Store Sales** - For customer invoices/receipts
**📦 Smart Inventory Scanner** - For supplier invoices

Which one would you like to see first?`,
                'info',
                null,
                [
                    { text: '🛍️ Store Sales', action: () => this.openPage('store-sales.html') },
                    { text: '📦 Inventory Scanner', action: () => this.openPage('smart-inventory-scanner.html') },
                    { text: '🏠 Back to Dashboard', action: () => this.openPage('index.html') }
                ]
            );
        }
    });

    console.log('🔧 AI Agent extensions loaded');
} else {
    console.warn('⚠️ DanfosalAIAgent not found - extensions not loaded');
}