// 🤖 Intelligent AI Agent - Core Brain for Danfosal App
// This is the main AI agent that understands context, processes commands, and automates workflows

class DanfosalAIAgent {
    constructor(db, firebaseImports = {}) {
        this.db = db;
        this.collection = firebaseImports.collection;
        this.getDocs = firebaseImports.getDocs;
        this.addDoc = firebaseImports.addDoc;
        this.updateDoc = firebaseImports.updateDoc;
        this.deleteDoc = firebaseImports.deleteDoc;
        this.doc = firebaseImports.doc;
        this.query = firebaseImports.query;
        this.where = firebaseImports.where;
        
        // AI Context and Memory
        this.currentPage = 'dashboard';
        this.conversationHistory = [];
        this.userPreferences = {};
        this.contextData = {};
        
        // Available modules
        this.modules = {
            ocr: null,           // Invoice/image processing
            inventory: null,     // Smart inventory management
            analytics: null,     // Business analytics
            storeSales: null     // Store sales management
        };
        
        // Conversation state
        this.awaitingConfirmation = null;
        this.pendingAction = null;
        this.currentWorkflow = null;
        
        this.isInitialized = false;
    }

    // ═══════════════════════════════════════
    // 🚀 INITIALIZATION
    // ═══════════════════════════════════════

    async initialize() {
        if (this.isInitialized) return;
        
        console.log('🤖 Initializing Danfosal AI Agent...');
        
        try {
            // Load all data into context
            await this.loadContext();
            
            // Initialize available modules
            await this.initializeModules();
            
            // Load conversation history
            this.loadConversationHistory();
            
            this.isInitialized = true;
            console.log('✅ AI Agent initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize AI Agent:', error);
            throw error;
        }
    }

    async loadContext() {
        console.log('📊 Loading app context...');
        
        try {
            // Load products
            const productsSnapshot = await this.getDocs(this.collection(this.db, 'products'));
            this.contextData.products = productsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Load sales data from multiple possible collections
            let allSales = [];
            
            // Try onlineOrders collection
            try {
                const onlineOrdersSnapshot = await this.getDocs(this.collection(this.db, 'onlineOrders'));
                const onlineOrders = onlineOrdersSnapshot.docs.map(doc => ({
                    id: doc.id,
                    source: 'onlineOrders',
                    ...doc.data()
                }));
                allSales = allSales.concat(onlineOrders);
                console.log(`📊 Loaded ${onlineOrders.length} online orders`);
            } catch (error) {
                console.log('No onlineOrders collection found');
            }

            // Try sales collection
            try {
                const salesSnapshot = await this.getDocs(this.collection(this.db, 'sales'));
                const salesData = salesSnapshot.docs.map(doc => ({
                    id: doc.id,
                    source: 'sales',
                    ...doc.data()
                }));
                allSales = allSales.concat(salesData);
                console.log(`📊 Loaded ${salesData.length} sales records`);
            } catch (error) {
                console.log('No sales collection found');
            }

            // Try storeSales collection
            try {
                const storeSalesSnapshot = await this.getDocs(this.collection(this.db, 'storeSales'));
                const storeSalesData = storeSalesSnapshot.docs.map(doc => ({
                    id: doc.id,
                    source: 'storeSales',
                    ...doc.data()
                }));
                allSales = allSales.concat(storeSalesData);
                console.log(`📊 Loaded ${storeSalesData.length} store sales records`);
            } catch (error) {
                console.log('No storeSales collection found');
            }

            this.contextData.sales = allSales;

            // Load suppliers
            try {
                const suppliersSnapshot = await this.getDocs(this.collection(this.db, 'suppliers'));
                this.contextData.suppliers = suppliersSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            } catch (error) {
                this.contextData.suppliers = [];
            }

            // Load debtors
            try {
                const debtorsSnapshot = await this.getDocs(this.collection(this.db, 'debtors'));
                this.contextData.debtors = debtorsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            } catch (error) {
                this.contextData.debtors = [];
            }

            // Load creditors 
            try {
                const creditorsSnapshot = await this.getDocs(this.collection(this.db, 'creditors'));
                this.contextData.creditors = creditorsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            } catch (error) {
                this.contextData.creditors = [];
            }

            console.log('✅ Context loaded:', {
                products: this.contextData.products.length,
                sales: this.contextData.sales.length,
                suppliers: this.contextData.suppliers.length,
                debtors: this.contextData.debtors.length,
                creditors: this.contextData.creditors.length
            });

        } catch (error) {
            console.error('❌ Error loading context:', error);
            this.contextData = { products: [], sales: [], suppliers: [], debtors: [], creditors: [] };
        }
    }

    async initializeModules() {
        console.log('🔧 Initializing AI modules...');
        
        try {
            // Note: We're not initializing OCR modules directly anymore
            // Instead, we delegate to existing, proven scanners on their respective pages
            
            // Initialize Smart Inventory reference if available (for context, not OCR)
            if (window.SmartInventory) {
                this.modules.inventory = new SmartInventory(this.db, {
                    collection: this.collection,
                    getDocs: this.getDocs
                });
                console.log('✅ Smart Inventory reference initialized');
            }

            console.log('✅ AI modules initialized - delegating OCR to existing scanners');

        } catch (error) {
            console.warn('⚠️ Some modules failed to initialize:', error);
        }
    }

    // ═══════════════════════════════════════
    // 💬 CONVERSATION MANAGEMENT 
    // ═══════════════════════════════════════

    async processMessage(userMessage, attachments = []) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        console.log('💬 Processing user message:', userMessage);
        console.log('📎 Attachments:', attachments.length);

        // Add to conversation history
        this.addToHistory('user', userMessage, attachments);

        try {
            // Handle pending confirmations first
            if (this.awaitingConfirmation) {
                return await this.handleConfirmation(userMessage);
            }

            // Check for image attachments (invoice scanning)
            if (attachments.length > 0) {
                return await this.handleImageAttachment(attachments[0], userMessage);
            }

            // Process text command/question
            return await this.processTextCommand(userMessage);

        } catch (error) {
            console.error('❌ Error processing message:', error);
            return this.createResponse(
                "I apologize, but I encountered an error processing your request. Please try again or be more specific about what you need.",
                'error'
            );
        }
    }

    async processTextCommand(message) {
        const lowerMessage = message.toLowerCase();
        
        // Product queries - pass original message to preserve context
        if (this.isProductQuery(lowerMessage)) {
            return await this.handleProductQuery(message);
        }

        // Analytics queries - pass original message to preserve context
        if (this.isAnalyticsQuery(lowerMessage)) {
            return await this.handleAnalyticsQuery(message);
        }

        // Navigation requests
        if (this.isNavigationRequest(lowerMessage)) {
            return await this.handleNavigation(lowerMessage);
        }

        // Workflow requests
        if (this.isWorkflowRequest(lowerMessage)) {
            return await this.handleWorkflowRequest(lowerMessage);
        }

        // Handle numeric selections (like "1", "2", etc.) from previous product searches
        if (/^\d+$/.test(message.trim())) {
            return this.createResponse(
                "I see you entered a number, but I need more context. If you were selecting from a product list, please use the buttons above or ask your question again with the full product name.",
                'info'
            );
        }

        // General assistance
        return this.createResponse(
            `I can help you with:
            
📸 **Invoice Processing** - Drop an invoice image and I'll scan it and take the right action
🛍️ **Product Information** - Ask about stock, prices, costs, or codes
📊 **Analytics & Reports** - Get insights about sales, trends, and performance  
🔧 **App Navigation** - I can help you find and open the right features
⚙️ **Automated Workflows** - I can help with warranties, stock updates, and more

What would you like me to help with?`,
            'info'
        );
    }

    // ═══════════════════════════════════════
    // 📸 IMAGE/INVOICE PROCESSING
    // ═══════════════════════════════════════

    async handleImageAttachment(image, userMessage = '') {
        console.log('📸 Processing image attachment...');

        // Instead of trying to analyze the image ourselves, let's ask the user
        // and then delegate to the appropriate existing scanner
        
        return this.createResponse(
            `� **I received your image/PDF!**

I can process this using your existing proven scanners:

**🛍️ Customer Invoice/Receipt** 
• Use for sales to customers
• Creates sales records in store sales
• Uses your store invoice scanner

**📦 Supplier Invoice** 
• Use for invoices from suppliers  
• Updates product stock and inventory
• Adds to creditors (money you owe)
• Uses your smart inventory scanner

**Which type of invoice is this?**`,
            'info',
            null,
            [
                { 
                    text: '🛍️ Customer Invoice', 
                    action: this.createProcessCustomerAction(image)
                },
                { 
                    text: '📦 Supplier Invoice', 
                    action: this.createProcessSupplierAction(image)
                },
                { 
                    text: '❓ Not Sure', 
                    action: this.createShowOptionsAction(image)
                }
            ]
        );
    }

    async analyzeImageContent(image) {
        // Instead of doing OCR ourselves, let's delegate to existing scanners
        // and use simple heuristics or user context to determine the type
        
        console.log('� Analyzing image content using existing tools...');
        
        // For now, we'll ask the user what type of invoice it is
        // This avoids the OCR errors and uses the proven scanners
        return { type: 'ask_user', confidence: 1.0 };
    }

    countTextIndicators(text, indicators) {
        const lowerText = text.toLowerCase();
        return indicators.filter(indicator => lowerText.includes(indicator)).length;
    }

    async handleCustomerInvoice(image, userMessage) {
        console.log('🛍️ Processing customer invoice/receipt...');

        try {
            // Extract customer information and products
            const extractedData = await this.extractCustomerInvoiceData(image);
            
            if (!extractedData.success) {
                return this.createResponse(
                    "I couldn't extract data from this customer invoice. Would you like me to open the store sales page so you can manually enter the sale?",
                    'warning',
                    null,
                    [{
                        text: 'Open Store Sales',
                        action: () => this.openPage('store-sales.html')
                    }]
                );
            }

            // Ask for confirmation before creating the sale
            this.awaitingConfirmation = {
                type: 'create_sale',
                data: extractedData
            };

            return this.createResponse(
                `📸 I found a customer receipt! Here's what I extracted:

**Customer:** ${extractedData.customerName || 'Not found'}
**Items:** ${extractedData.items.length} products
**Total:** €${extractedData.total || 'Unknown'}

**Items found:**
${extractedData.items.map(item => `• ${item.name} x${item.quantity} @ €${item.price}`).join('\n')}

Should I create this sale in the store sales system?`,
                'success',
                null,
                [
                    { text: 'Yes, Create Sale', action: 'confirm' },
                    { text: 'No, Cancel', action: 'cancel' }
                ]
            );

        } catch (error) {
            console.error('❌ Error processing customer invoice:', error);
            return this.createResponse(
                "I had trouble processing this customer invoice. Let me open the store sales page for manual entry.",
                'error',
                () => this.openPage('store-sales.html')
            );
        }
    }

    async handleSupplierInvoice(image, userMessage) {
        console.log('📦 Processing supplier invoice...');

        try {
            // Use existing SmartInventoryScanner if available
            if (window.SmartInventoryScanner) {
                const scanner = new SmartInventoryScanner(this.db, {
                    collection: this.collection,
                    getDocs: this.getDocs,
                    addDoc: this.addDoc,
                    updateDoc: this.updateDoc,
                    doc: this.doc
                });

                await scanner.initialize();
                const result = await scanner.scanSupplierInvoice(image);

                if (result.success) {
                    // Ask for confirmation before updating stock and adding to creditors
                    this.awaitingConfirmation = {
                        type: 'process_supplier_invoice',
                        data: result
                    };

                    const totalValue = result.items.reduce((sum, item) => sum + (item.costWithVAT * item.quantity), 0);

                    return this.createResponse(
                        `📦 I found a supplier invoice! Here's what I extracted:

**Supplier:** ${result.supplier}
**Items:** ${result.items.length} products
**Total Value:** €${totalValue.toFixed(2)}

**Items to add/update:**
${result.items.slice(0, 5).map(item => `• ${item.name} x${item.quantity} @ €${item.costWithVAT.toFixed(2)}`).join('\n')}
${result.items.length > 5 ? `... and ${result.items.length - 5} more items` : ''}

Should I:
1. Update product stock
2. Add invoice to creditors (money you owe)
3. Create any new products that don't exist?`,
                        'success',
                        null,
                        [
                            { text: 'Yes, Process Everything', action: 'confirm' },
                            { text: 'Review First', action: 'review' },
                            { text: 'Cancel', action: 'cancel' }
                        ]
                    );
                }
            }

            // Fallback to basic OCR
            return this.createResponse(
                "I detected this looks like a supplier invoice, but I need the smart inventory scanner to process it properly. Let me open the inventory scanner for you.",
                'info',
                () => this.openPage('smart-inventory-scanner.html')
            );

        } catch (error) {
            console.error('❌ Error processing supplier invoice:', error);
            return this.createResponse(
                "I had trouble processing this supplier invoice. Let me open the inventory scanner for manual processing.",
                'error',
                () => this.openPage('smart-inventory-scanner.html')
            );
        }
    }

    // ═══════════════════════════════════════
    // 🛍️ PRODUCT QUERIES
    // ═══════════════════════════════════════

    isProductQuery(message) {
        const productKeywords = [
            'stock', 'price', 'cost', 'product', 'item', 
            'how much', 'how many', 'what is', 'find',
            'code', 'producer', 'supplier', 'inventory'
        ];
        
        return productKeywords.some(keyword => message.includes(keyword));
    }

    async handleProductQuery(message) {
        const lowerMessage = message.toLowerCase();
        console.log('🔍 Handling product query:', message);
        console.log(`🔍 Looking for product from original query: "${message}"`);

        // Extract product name from query
        let productName = this.extractProductNameFromQuery(message);
        
        // If no specific product name found, check recent conversation context
        if (!productName || productName.toLowerCase() === 'product' || productName.toLowerCase() === 'the product') {
            console.log('🧠 No specific product found, checking conversation context...');
            const recentProduct = this.getRecentProductFromContext();
            if (recentProduct) {
                console.log(`🧠 Found recent product context: ${recentProduct.name}`);
                return this.createProductInfo(recentProduct, message);
            }
        }
        
        if (!productName) {
            return this.createResponse(
                "I'd be happy to help you find product information! Please specify which product you're asking about. For example:\n\n• \"What's the price of iPhone case?\"\n• \"How much stock do we have for Samsung charger?\"\n• \"What's the code for wireless headphones?\"",
                'info'
            );
        }

        console.log(`🔍 Searching for products with term: "${productName}"`);

        // Search for the product
        const products = this.searchProducts(productName);
        console.log(`🔍 Search results: Found ${products.length} products`);
        
        if (products.length === 0) {
            console.log(`❌ No products found for: "${productName}"`);
            return this.createResponse(
                `I couldn't find any products matching "${productName}". Would you like me to show you all available products or help you add a new one?`,
                'warning',
                null,
                [
                    { text: 'Show All Products', action: () => this.openPage('products.html') },
                    { text: 'Add New Product', action: () => this.openPage('products.html') }
                ]
            );
        }

        if (products.length === 1) {
            const product = products[0];
            return this.createProductInfo(product, message);
        } else {
            // Multiple products found - create buttons for easy selection
            const productButtons = products.slice(0, 5).map((product, index) => ({
                text: `${index + 1}. ${product.name}`,
                action: () => this.createProductInfo(product, message)
            }));

            return this.createResponse(
                `📋 I found ${products.length} products matching "${productName}":\n\n` +
                products.map((p, i) => `${i + 1}. **${p.name}** (${p.producer || 'Unknown producer'})`).join('\n') +
                '\n\nWhich one would you like to know about?',
                'info',
                null,
                productButtons
            );
        }
    }

    extractProductNameFromQuery(message) {
        console.log(`🔍 EXTRACTING from message: "${message}"`);
        
        // Simple extraction - look for quoted strings first
        const quotedMatch = message.match(/"([^"]+)"/);
        if (quotedMatch) return quotedMatch[1];

        // Look for patterns after common words
        const patterns = [
            /(?:stock|price|cost|code).*?(?:of|for|about|on)\s+(.+?)(?:\?|$)/i,
            /(?:what(?:'s| is)|how (?:much|many)).*?\s+(.+?)(?:\?|$)/i,
            /(?:what|tell me).*?about\s+(.+?)(?:\?|$)/i,  // Specific pattern for "what about X"
            /find\s+(.+?)(?:\?|$)/i,
            /(.+?)(?:\?|$)/i  // Catch any remaining text as potential product name
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const match = message.match(pattern);
            console.log(`🔍 Pattern ${i + 1}: ${pattern} → Match: ${match ? match[1] : 'no match'}`);
            
            if (match && match[1]) {
                let productName = match[1].trim();
                console.log(`🔍 Raw match from pattern ${i + 1}: "${match[1]}" → cleaned: "${productName}"`);
                
                // Remove common words that might interfere, but preserve context
                // Don't remove "about" when it's the main connector word
                if (!message.toLowerCase().startsWith('what about')) {
                    productName = productName.replace(/\b(stock|do|we|have|much|many|what|about|for|on|the|a|an|is)\b/gi, '').trim();
                } else {
                    // For "what about X" pattern, only remove specific words
                    productName = productName.replace(/\b(stock|do|we|have|much|many|what|for|on|the|a|an|is)\b/gi, '').trim();
                }
                // Remove extra spaces
                productName = productName.replace(/\s+/g, ' ');
                console.log(`🔍 After cleaning: "${productName}"`);
                
                if (productName.length > 0) {
                    console.log(`✅ Final extracted product name: "${productName}"`);
                    return productName;
                }
            }
        }

        return null;
    }

    searchProducts(searchTerm) {
        console.log(`🔍 SEARCH: Looking for products matching: "${searchTerm}"`);
        const term = searchTerm.toLowerCase();
        console.log(`🔍 SEARCH: Lowercase term: "${term}"`);
        
        // First try exact matches
        let results = this.contextData.products.filter(product => 
            (product.name && product.name.toLowerCase() === term) ||
            (product.producer && product.producer.toLowerCase() === term) ||
            (product.code && product.code.toLowerCase() === term)
        );
        console.log(`🔍 SEARCH: Exact matches: ${results.length}`);

        // If no exact matches, try partial matches
        if (results.length === 0) {
            results = this.contextData.products.filter(product => 
                (product.name && product.name.toLowerCase().includes(term)) ||
                (product.producer && product.producer.toLowerCase().includes(term)) ||
                (product.code && product.code.toLowerCase().includes(term))
            );
            console.log(`🔍 SEARCH: Partial matches: ${results.length}`);
        }

        // If still no matches and search term is short (like "sc3"), try more flexible matching
        if (results.length === 0 && term.length <= 5) {
            results = this.contextData.products.filter(product => {
                const productText = `${product.name || ''} ${product.producer || ''} ${product.code || ''}`.toLowerCase();
                return productText.includes(term) || 
                       productText.replace(/\s+/g, '').includes(term) ||
                       (product.name && product.name.toLowerCase().replace(/\s+/g, '').includes(term));
            });
            console.log(`🔍 SEARCH: Flexible matches: ${results.length}`);
        }

        console.log(`🔍 SEARCH: Final results:`, results.map(p => p.name));
        return results;
    }

    getRecentProductFromContext() {
        // Look through recent conversation history for product mentions
        const recentMessages = this.conversationHistory.slice(-5); // Last 5 messages
        
        for (let i = recentMessages.length - 1; i >= 0; i--) {
            const message = recentMessages[i];
            
            // Check if this was an assistant message with product info
            if (message.role === 'assistant' && message.content) {
                // Look for product name patterns in previous responses
                const productMatch = message.content.match(/📦\s*\*\*([^*]+)\*\*/);
                if (productMatch) {
                    const productName = productMatch[1].trim();
                    console.log(`🧠 Found product in recent context: "${productName}"`);
                    
                    // Find this product in our database
                    const product = this.contextData.products.find(p => 
                        p.name && p.name.toLowerCase() === productName.toLowerCase()
                    );
                    
                    if (product) {
                        console.log(`✅ Successfully retrieved context product: ${product.name}`);
                        return product;
                    }
                }
            }
        }
        
        console.log('❌ No recent product context found');
        return null;
    }

    createProductInfo(product, originalQuery) {
        const queryType = this.determineQueryType(originalQuery);
        
        let response = `📦 **${product.name}**\n`;
        if (product.producer) response += `🏢 Producer: ${product.producer}\n`;
        if (product.code) response += `🏷️ Code: ${product.code}\n`;
        
        // Add specific information based on query
        if (queryType.includes('stock')) {
            response += `📊 **Stock: ${product.stock || 0} units**\n`;
        }
        
        if (queryType.includes('price')) {
            response += `💰 **Selling Price: €${product.price || 'Not set'}**\n`;
        }
        
        if (queryType.includes('cost')) {
            response += `💸 **Cost Price: €${product.cost || 'Not set'}**\n`;
        }

        // If no specific query, show everything
        if (!queryType.length) {
            response += `📊 Stock: ${product.stock || 0} units\n`;
            response += `💰 Selling Price: €${product.price || 'Not set'}\n`;
            response += `💸 Cost Price: €${product.cost || 'Not set'}\n`;
        }

        return this.createResponse(response, 'success');
    }

    determineQueryType(query) {
        const types = [];
        const lowerQuery = query.toLowerCase();
        
        if (lowerQuery.includes('stock') || lowerQuery.includes('how many')) types.push('stock');
        if (lowerQuery.includes('price')) types.push('price');
        if (lowerQuery.includes('cost')) types.push('cost');
        if (lowerQuery.includes('code')) types.push('code');
        
        return types;
    }

    // ═══════════════════════════════════════
    // 📊 ANALYTICS QUERIES
    // ═══════════════════════════════════════

    isAnalyticsQuery(message) {
        const analyticsKeywords = [
            'sales', 'revenue', 'performance', 'analytics', 'report',
            'trend', 'best selling', 'top products', 'statistics',
            'how are we doing', 'business', 'profit', 'earnings'
        ];
        
        return analyticsKeywords.some(keyword => message.includes(keyword));
    }

    async handleAnalyticsQuery(message) {
        const lowerMessage = message.toLowerCase();
        console.log('📊 Handling analytics query:', message);

        // Ensure we have fresh data
        await this.refreshContext();

        // Basic sales analytics from available data
        const recentSales = this.contextData.sales
            .filter(sale => sale.timestamp && this.isRecent(sale.timestamp, 30))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        console.log('📊 Recent sales found:', recentSales.length);
        console.log('📊 Sample sales:', recentSales.slice(0, 3));

        const totalRevenue = recentSales
            .filter(sale => sale.status !== 'Returned' && sale.status !== 'Cancelled')
            .reduce((sum, sale) => {
                // Try different possible field names for total
                const total = sale.total || sale.totalPrice || sale.totalEUR || sale.amount || sale.price || 0;
                return sum + (parseFloat(total) || 0);
            }, 0);

        console.log('💰 Revenue calculation details:');
        recentSales.slice(0, 3).forEach(sale => {
            const total = sale.total || sale.totalPrice || sale.totalEUR || sale.amount || sale.price || 0;
            console.log(`  Sale ${sale.id}: total=${sale.total}, totalPrice=${sale.totalPrice}, totalEUR=${sale.totalEUR}, amount=${sale.amount} → Using: ${total}`);
        });

        const topProducts = this.calculateTopProducts(recentSales);
        const salesCount = recentSales.length;

        let response = `📊 **Business Analytics (Last 30 Days)**\n\n`;
        response += `💰 **Total Revenue:** €${totalRevenue.toFixed(2)}\n`;
        response += `🛍️ **Total Orders:** ${salesCount}\n`;
        response += `📈 **Average Order:** €${salesCount > 0 ? (totalRevenue / salesCount).toFixed(2) : '0.00'}\n`;

        // Show data source info for debugging
        response += `\n📋 **Data Summary:**\n`;
        response += `• Total sales records: ${this.contextData.sales.length}\n`;
        response += `• Recent sales (30 days): ${recentSales.length}\n`;
        response += `• Products in database: ${this.contextData.products.length}\n\n`;

        if (topProducts.length > 0) {
            response += `🏆 **Top Products:**\n`;
            topProducts.slice(0, 5).forEach((product, i) => {
                response += `${i + 1}. ${product.name} (${product.sales} sales)\n`;
            });
        } else {
            response += `ℹ️ No recent product sales data found.\n`;
        }

        if (salesCount === 0) {
            response += `\n💡 **Note:** No sales found in the last 30 days. This could mean:\n`;
            response += `• Sales are stored in a different collection\n`;
            response += `• Date format needs adjustment\n`;
            response += `• Sales data hasn't been created yet\n`;
        }

        return this.createResponse(response, 'success', null, [
            { text: 'View Detailed Analytics', action: () => this.openPage('advanced-analytics.html') },
            { text: 'Refresh Data', action: () => this.refreshContextData() }
        ]);
    }

    isRecent(timestamp, days) {
        if (!timestamp) return false;
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= days;
    }

    calculateTopProducts(sales) {
        const productSales = {};
        
        sales.forEach(sale => {
            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    if (!productSales[item.name]) {
                        productSales[item.name] = { name: item.name, sales: 0, revenue: 0 };
                    }
                    productSales[item.name].sales += item.quantity || 1;
                    productSales[item.name].revenue += (item.price || 0) * (item.quantity || 1);
                });
            }
        });

        return Object.values(productSales)
            .sort((a, b) => b.sales - a.sales);
    }

    // ═══════════════════════════════════════
    // 🧭 NAVIGATION & WORKFLOW
    // ═══════════════════════════════════════

    isNavigationRequest(message) {
        const navKeywords = [
            'open', 'go to', 'show me', 'navigate', 'take me',
            'page', 'section', 'menu', 'dashboard'
        ];
        
        return navKeywords.some(keyword => message.includes(keyword));
    }

    async handleNavigation(message) {
        const pageMap = {
            'store sales': 'store-sales.html',
            'products': 'products.html',
            'inventory': 'smart-inventory-scanner.html',
            'analytics': 'advanced-analytics.html',
            'orders': 'orders_online.html',
            'debtors': 'debtors_list.html',
            'creditors': 'creditors_list.html',
            'dashboard': 'index.html'
        };

        for (const [key, page] of Object.entries(pageMap)) {
            if (message.toLowerCase().includes(key)) {
                this.openPage(page);
                return this.createResponse(
                    `✅ Opening ${key} page for you!`,
                    'success'
                );
            }
        }

        return this.createResponse(
            "I can help you navigate to:\n\n" +
            Object.keys(pageMap).map(page => `• ${page.charAt(0).toUpperCase() + page.slice(1)}`).join('\n') +
            "\n\nWhich page would you like to open?",
            'info'
        );
    }

    isWorkflowRequest(message) {
        const workflowKeywords = [
            'create warranty', 'add warranty', 'warranty',
            'process invoice', 'scan invoice',
            'update stock', 'add stock',
            'help me with'
        ];
        
        return workflowKeywords.some(keyword => message.includes(keyword));
    }

    async handleWorkflowRequest(message) {
        if (message.includes('warranty')) {
            return this.createResponse(
                "I can help you create a warranty! To do this, I'll need:\n\n1. The product information\n2. The serial number\n3. Customer details\n\nPlease provide the serial number and I'll guide you through the process.",
                'info'
            );
        }

        if (message.includes('invoice')) {
            return this.createResponse(
                "I can help you process invoices! Simply:\n\n📸 Drop an invoice image in our chat\n\nI'll automatically:\n• Detect if it's from a customer or supplier\n• Extract all the data\n• Take the appropriate action (create sale, update stock, add to creditors)\n• Ask for your confirmation before making changes",
                'info'
            );
        }

        return this.createResponse(
            "I can help you with various workflows:\n\n📸 **Invoice Processing** - Drop invoice images\n🛡️ **Warranty Creation** - Provide serial numbers\n📦 **Stock Management** - Update inventory\n🔄 **Data Entry** - Automate repetitive tasks\n\nWhat specific task do you need help with?",
            'info'
        );
    }

    // ═══════════════════════════════════════
    // ✅ CONFIRMATION HANDLING
    // ═══════════════════════════════════════

    async handleConfirmation(userResponse) {
        const response = userResponse.toLowerCase();
        const confirmation = this.awaitingConfirmation;
        
        this.awaitingConfirmation = null; // Clear pending confirmation

        if (response.includes('yes') || response.includes('confirm') || response.includes('ok')) {
            return await this.executeConfirmedAction(confirmation);
        } else if (response.includes('no') || response.includes('cancel')) {
            return this.createResponse(
                "✅ Action cancelled. Is there anything else I can help you with?",
                'info'
            );
        } else if (response.includes('review')) {
            return await this.showDetailedReview(confirmation);
        } else {
            // Re-ask for confirmation
            this.awaitingConfirmation = confirmation;
            return this.createResponse(
                "Please respond with 'yes' to proceed, 'no' to cancel, or 'review' to see more details.",
                'warning'
            );
        }
    }

    async executeConfirmedAction(confirmation) {
        try {
            switch (confirmation.type) {
                case 'create_sale':
                    return await this.createSaleFromExtraction(confirmation.data);
                
                case 'process_supplier_invoice':
                    return await this.processSupplierInvoiceData(confirmation.data);
                
                default:
                    return this.createResponse(
                        "I'm not sure how to process that confirmation. Please try again.",
                        'error'
                    );
            }
        } catch (error) {
            console.error('❌ Error executing confirmed action:', error);
            return this.createResponse(
                "I encountered an error while processing your request. Please try again.",
                'error'
            );
        }
    }

    // ═══════════════════════════════════════
    // 🛠️ UTILITY METHODS
    // ═══════════════════════════════════════

    openPage(pagePath) {
        console.log('🧭 Navigating to:', pagePath);
        if (window.location) {
            window.location.href = pagePath;
        }
    }

    addToHistory(sender, message, attachments = []) {
        this.conversationHistory.push({
            timestamp: new Date().toISOString(),
            sender,
            message,
            attachments: attachments.length,
            page: this.currentPage
        });

        // Keep only last 50 messages
        if (this.conversationHistory.length > 50) {
            this.conversationHistory = this.conversationHistory.slice(-50);
        }

        this.saveConversationHistory();
    }

    saveConversationHistory() {
        try {
            localStorage.setItem('danfosal_ai_history', JSON.stringify(this.conversationHistory));
        } catch (error) {
            console.warn('Could not save conversation history:', error);
        }
    }

    loadConversationHistory() {
        try {
            const saved = localStorage.getItem('danfosal_ai_history');
            if (saved) {
                this.conversationHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.warn('Could not load conversation history:', error);
            this.conversationHistory = [];
        }
    }

    createResponse(message, type = 'info', action = null, buttons = []) {
        const response = {
            message,
            type, // 'info', 'success', 'warning', 'error'
            timestamp: new Date().toISOString(),
            action,
            buttons
        };

        this.addToHistory('ai', message);
        return response;
    }

    // Update current page context
    setCurrentPage(pageName) {
        this.currentPage = pageName;
        console.log('📍 Current page:', pageName);
    }

    // Create action functions for buttons that work properly
    createProcessCustomerAction(image) {
        const self = this;
        return function() {
            console.log('🛍️ Processing customer invoice action');
            return self.openStoreSalesWithImage(image);
        };
    }

    createProcessSupplierAction(image) {
        const self = this;
        return function() {
            console.log('📦 Processing supplier invoice action');
            return self.openInventoryScannerWithImage(image);
        };
    }

    createShowOptionsAction(image) {
        const self = this;
        return function() {
            console.log('❓ Showing scanner options');
            return self.showScannerOptionsWithImage(image);
        };
    }

    openStoreSalesWithImage(image) {
        // Store the image for the store sales page
        if (typeof image === 'string' && image.startsWith('data:')) {
            localStorage.setItem('ai_pending_invoice_scan', image);
            localStorage.setItem('ai_pending_scan_type', 'customer');
        }
        
        // Open the page
        this.openPage('store-sales.html');
        
        return {
            message: `🛍️ **Opening Store Sales Scanner**

I'm opening the Store Sales page with your customer invoice ready to scan.

**What to do next:**
1. The Store Sales page will open
2. Your image is ready for the scanner
3. Use the proven invoice scanner there
4. It will create the sale automatically

This uses your reliable customer invoice scanner!`,
            type: 'success'
        };
    }

    openInventoryScannerWithImage(image) {
        // Store the image for the inventory scanner page
        if (typeof image === 'string' && image.startsWith('data:')) {
            localStorage.setItem('ai_pending_invoice_scan', image);
            localStorage.setItem('ai_pending_scan_type', 'supplier');
        }
        
        // Open the page
        this.openPage('smart-inventory-scanner.html');
        
        return {
            message: `📦 **Opening Smart Inventory Scanner**

I'm opening the Smart Inventory Scanner with your supplier invoice ready to scan.

**What to do next:**
1. The Inventory Scanner page will open
2. Your PDF/image is ready for processing
3. Use the proven scanner there for supplier invoices
4. It will update stock and add to creditors

This uses your reliable supplier invoice scanner!`,
            type: 'success'
        };
    }

    showScannerOptionsWithImage(image) {
        return {
            message: `❓ **Choose Your Scanner**

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

Which scanner should I open for you?`,
            type: 'info',
            buttons: [
                { text: '🛍️ Store Sales Scanner', action: this.createProcessCustomerAction(image) },
                { text: '📦 Inventory Scanner', action: this.createProcessSupplierAction(image) }
            ]
        };
    }

    // Refresh context data
    async refreshContext() {
        await this.loadContext();
    }

    // Get conversation summary for debugging
    getConversationSummary() {
        return {
            messages: this.conversationHistory.length,
            currentPage: this.currentPage,
            awaitingConfirmation: !!this.awaitingConfirmation,
            contextLoaded: {
                products: this.contextData.products?.length || 0,
                sales: this.contextData.sales?.length || 0,
                suppliers: this.contextData.suppliers?.length || 0
            }
        };
    }
}

// Make available globally
window.DanfosalAIAgent = DanfosalAIAgent;

console.log('🤖 AI Agent class loaded successfully');