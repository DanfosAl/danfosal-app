/**
 * Manual PDF Processor - Enhanced Invoice OCR for Albanian "Platforma Qendrore e Faturave"
 * Handles currency normalization (ALL to EUR) and dual-currency invoices
 * 
 * @extends InvoiceOCR
 */
class ManualPDFProcessor {
    constructor(db, firebaseImports = {}) {
        this.db = db;
        this.collection = firebaseImports.collection;
        this.addDoc = firebaseImports.addDoc;
        this.getDocs = firebaseImports.getDocs;
        this.getDoc = firebaseImports.getDoc;
        this.updateDoc = firebaseImports.updateDoc;
        this.doc = firebaseImports.doc;
        this.Timestamp = firebaseImports.Timestamp;
        
        // Tesseract.js worker (will be initialized when needed)
        this.ocrWorker = null;
        this.isInitialized = false;
        
        // Conversion rate for ALL to EUR (will be prompted if needed)
        this.conversionRate = null;
    }

    // === INITIALIZATION ===
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            console.log('🔧 Initializing Manual PDF Processor with Tesseract OCR...');
            
            // Check if Tesseract is loaded
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract library not loaded. Please refresh the page.');
            }
            
            this.ocrWorker = await Tesseract.createWorker('eng');
            this.isInitialized = true;
            
            console.log('✅ Manual PDF Processor Ready');
        } catch (error) {
            console.error('Failed to initialize PDF processor:', error);
            throw error;
        }
    }

    // === MAIN SCANNING METHOD ===
    
    async scanInvoice(imageSource, options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        try {
            console.log('📸 Starting invoice scan...');
            
            // Run OCR
            const result = await this.ocrWorker.recognize(imageSource);
            const rawText = result.data.text;
            
            console.log('📄 OCR Complete. Text length:', rawText.length);
            
            return await this.processExtractedText(rawText, options);
            
        } catch (error) {
            console.error('Scan error:', error);
            return {
                success: false,
                error: error.message || 'OCR scanning failed',
                rawText: '',
                data: null
            };
        }
    }

    // === PROCESS TEXT FROM MULTI-PAGE OCR ===
    
    async extractAlbanianInvoiceFromText(combinedText, options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        console.log('📄 Processing combined text from multiple pages...');
        return await this.processExtractedText(combinedText, options);
    }

    // === SHARED TEXT PROCESSING LOGIC ===
    
    async processExtractedText(rawText, options = {}) {
        try {
            if (!rawText || rawText.length < 50) {
                throw new Error('Could not extract enough text from image. Please ensure the image is clear and well-lit.');
            }
            
            console.log('📋 Raw text preview:', rawText.substring(0, 300));
            
            // Extract Albanian invoice data with currency handling
            const invoiceData = await this.extractAlbanianInvoiceData(rawText, options);
            
            // Calculate confidence
            const confidence = this.calculateConfidence(invoiceData);
            
            // Validate extracted data
            const validatedData = this.validateInvoiceData(invoiceData);
            
            console.log('✅ Invoice data extracted:', {
                invoiceNumber: validatedData.invoiceNumber,
                customerName: validatedData.customerName,
                currency: validatedData.originalCurrency,
                normalizedToEUR: validatedData.normalizedToEUR,
                total: validatedData.total,
                itemCount: validatedData.items.length,
                confidence: confidence + '%'
            });
            
            return {
                success: true,
                confidence: confidence,
                data: validatedData,
                rawText: rawText,
                timestamp: Date.now(),
                requiresConversionRate: invoiceData.requiresConversionRate
            };
            
        } catch (error) {
            console.error('PDF Processing Error:', error);
            
            // Provide helpful error message
            let userMessage = 'Failed to process invoice. ';
            
            // Check if error has message property
            const errorMsg = error?.message || error?.toString() || '';
            
            if (errorMsg.includes('conversion rate')) {
                userMessage = errorMsg; // Pass through conversion rate error
            } else if (errorMsg.includes('text from image') || errorMsg.includes('read image')) {
                userMessage = 'Could not read the invoice image. Please ensure it is clear and well-lit.';
            } else if (errorMsg.includes('Tesseract') || errorMsg.includes('OCR')) {
                userMessage = 'OCR engine failed to load. Please refresh the page and try again.';
            } else if (errorMsg.includes('PDF') || errorMsg.includes('pdf')) {
                userMessage = 'PDF files must be converted to images first. Please use a PNG or JPG image.';
            } else {
                userMessage += 'You can enter the data manually instead. Error: ' + errorMsg;
            }
            
            return {
                success: false,
                error: userMessage,
                rawText: '',
                data: null
            };
        }
    }

    // === ALBANIAN INVOICE DATA EXTRACTION ===
    
    async extractAlbanianInvoiceData(text, options = {}) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        const invoiceData = {
            invoiceNumber: '',
            date: '',
            customerName: '',
            customerAddress: '',
            items: [],
            subtotal: 0,
            tax: 0,
            total: 0,
            currency: 'EUR',  // Normalized currency
            originalCurrency: '',
            normalizedToEUR: false,
            conversionRate: null,
            requiresConversionRate: false,
            extractedFields: {}
        };

        // === EXTRACT CURRENCY (Monedha e faturës) ===
        const currencyInfo = this.extractCurrency(text);
        invoiceData.originalCurrency = currencyInfo.currency;
        invoiceData.hasDualCurrency = currencyInfo.hasDualCurrency;

        // === HANDLE CURRENCY NORMALIZATION ===
        if (currencyInfo.currency === 'ALL' && !currencyInfo.hasDualCurrency) {
            // CONDITION A: Only ALL currency - need conversion rate
            if (!options.conversionRate) {
                invoiceData.requiresConversionRate = true;
                throw new Error('This invoice is in LEK (ALL). Please provide a conversion rate to EUR.');
            }
            invoiceData.conversionRate = options.conversionRate;
            invoiceData.normalizedToEUR = true;
            console.log(`🔄 Will convert ALL to EUR using rate: ${options.conversionRate}`);
        } else if (currencyInfo.hasDualCurrency) {
            // CONDITION B: Both EUR and ALL - extract only EUR values
            invoiceData.normalizedToEUR = false;
            console.log('💶 Dual currency detected - extracting EUR values only');
        } else {
            // Already in EUR or other single currency
            invoiceData.normalizedToEUR = false;
        }

        // === EXTRACT INVOICE NUMBER ===
        invoiceData.invoiceNumber = this.extractInvoiceNumber(text);
        if (invoiceData.invoiceNumber) {
            invoiceData.extractedFields.invoiceNumber = true;
        }

        // === EXTRACT DATE ===
        invoiceData.date = this.extractDate(text);
        if (invoiceData.date) {
            invoiceData.extractedFields.date = true;
        }

        // === EXTRACT CUSTOMER INFO (Primary match key) ===
        const customerInfo = this.extractCustomerInfo(text, lines);
        invoiceData.customerName = customerInfo.name;
        invoiceData.customerAddress = customerInfo.address;
        if (invoiceData.customerName) {
            invoiceData.extractedFields.customerName = true;
        }

        // === EXTRACT ITEMS (with EUR normalization) ===
        invoiceData.items = await this.extractItemsWithCurrency(
            lines, 
            text,
            currencyInfo,
            invoiceData.conversionRate
        );

        // === EXTRACT TOTALS (normalized to EUR) ===
        const totals = this.extractTotalsWithCurrency(
            text, 
            currencyInfo,
            invoiceData.conversionRate
        );
        invoiceData.subtotal = totals.subtotal;
        invoiceData.tax = totals.tax;
        invoiceData.total = totals.total;

        return invoiceData;
    }

    // === CURRENCY DETECTION ===
    
    extractCurrency(text) {
        const result = {
            currency: 'EUR',  // Default
            hasDualCurrency: false
        };

        // Look for "Monedha e faturës" field (Albanian invoice currency field)
        const albanianCurrencyPattern = /Monedha\s+e\s+fatur[eë]s\s*:?\s*([A-Z]{3})/i;
        const match = text.match(albanianCurrencyPattern);
        
        if (match) {
            result.currency = match[1].toUpperCase();
            console.log(`💰 Currency field found: ${result.currency}`);
        }

        // Check for dual currency (both EUR and ALL mentioned)
        const hasEUR = /EUR|€/i.test(text);
        const hasALL = /\bALL\b|LEK/i.test(text);
        
        if (hasEUR && hasALL) {
            result.hasDualCurrency = true;
            console.log('💶💵 Dual currency invoice detected (EUR + ALL)');
        }

        // If no explicit currency found, try to detect from amounts
        if (!match) {
            if (text.includes('€') || /\d+[,\.]\d{2}\s*EUR/i.test(text)) {
                result.currency = 'EUR';
            } else if (/\d+[,\.]\d{2}\s*ALL/i.test(text) || /\d+[,\.]\d{2}\s*LEK/i.test(text)) {
                result.currency = 'ALL';
            }
        }

        return result;
    }

    // === CUSTOMER EXTRACTION (Albanian format) ===
    
    extractCustomerInfo(text, lines) {
        const info = {
            name: '',
            address: ''
        };

        // Albanian invoice patterns for customer info
        const namePatterns = [
            /Klient[ië]?\s*:?\s*(.+)/i,
            /Bleres\s*:?\s*(.+)/i,
            /Emri\s+i\s+bleres[iëit]*\s*:?\s*(.+)/i,
            /Emri\s*:?\s*(.+)/i,
            /Client\s*:?\s*(.+)/i,
            /Customer\s*:?\s*(.+)/i
        ];

        // Try to find customer name
        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                info.name = match[1].trim();
                // Clean up - take only the first line if multi-line
                const firstLine = info.name.split(/\n|\\n/)[0].trim();
                if (firstLine.length > 2 && firstLine.length < 100) {
                    info.name = firstLine;
                    break;
                }
            }
        }

        // Albanian address patterns
        const addressPatterns = [
            /Adres[aë]\s*:?\s*(.+?)(?:\n|Nipt|NIPT|Tel|Email|$)/is,
            /Rruga\s+(.+?)(?:\n|Nipt|NIPT|Tel|$)/is,
            /Address\s*:?\s*(.+?)(?:\n|Tel|Email|$)/is
        ];

        for (const pattern of addressPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                info.address = match[1].trim().replace(/\s+/g, ' ');
                break;
            }
        }

        return info;
    }

    // === INVOICE NUMBER EXTRACTION ===
    
    extractInvoiceNumber(text) {
        console.log('🔍 Searching for invoice number in text...');
        console.log('📄 Text sample:', text.substring(0, 500));
        
        const patterns = [
            // Albanian invoice number patterns - MOST SPECIFIC FIRST
            /Num[^:]{0,15}i\s+fatur[^:]{0,15}:\s*([0-9]+\/[0-9]+)/i,  // "Numi i fatures: 18/2026" (flexible with OCR errors)
            /fatur[eë]s?\s*:?\s*([0-9]+\/[0-9]+)/i,  // "fatures: 18/2026" or "faturés: 18/2026"
            /Num[ri]+\s+i\s+fatur[eë]s?\s*:?\s*([A-Z0-9\-\/\\]+)/i,  // "Numri i fatures:"
            /Fatur[eë]\s*(?:Nr\.?|No\.?)?\s*:?\s*([A-Z0-9\-\/\\]+)/i,
            // Standard patterns
            /Invoice\s*(?:No\.?|Number|#)?\s*:?\s*([A-Z0-9\-\/\\]+)/i,
            /(\d{1,4}[\/\-]\d{4})/,  // Format: 18/2026 or 123/2024 (standalone)
            /#\s*([A-Z0-9\-\/\\]{3,})/
        ];
        
        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const match = text.match(pattern);
            if (match && match[1]) {
                console.log(`📋 Invoice number found with pattern ${i+1}:`, match[1]);
                return match[1].trim();
            }
        }
        
        console.log('⚠️ Invoice number not found, generating fallback');
        return 'INV-' + Date.now();
    }

    // === DATE EXTRACTION ===
    
    extractDate(text) {
        const patterns = [
            /Data\s+e\s+fatures\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
            /Data\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
            /Date\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
            /(\d{1,2}\.\d{1,2}\.\d{4})/,
            /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return this.normalizeDate(match[1]);
            }
        }
        
        return new Date().toISOString().split('T')[0];
    }

    // === ITEMS EXTRACTION WITH CURRENCY HANDLING ===
    
    async extractItemsWithCurrency(lines, fullText, currencyInfo, conversionRate = null) {
        const items = [];
        
        console.log('📋 Extracting items from', lines.length, 'lines');
        
        // Find the items table section
        let inItemsSection = false;
        let itemLineCount = 0;
        let currentPage = 1;
        let skipUntilPage2 = true; // Skip page 1 (contains seller/buyer info, not items)
        
        // Multi-line item state for Albanian Platforma Qendrore format
        let currentItemNumber = null;
        let currentItemName = null;
        let currentItemQty = null;
        let currentItemUnit = null;
        let pendingItem = null;
        
        // Table header keywords - require multiple on same line or adjacent lines for better accuracy
        const tableHeaderKeywords = ['pershkrim', 'sasi', 'cmimi', 'çmimi', 'totali', 'vlera'];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Track page numbers from combined text markers
            if (line.startsWith('=== PAGE')) {
                const pageMatch = line.match(/PAGE (\d+)/);
                if (pageMatch) {
                    currentPage = parseInt(pageMatch[1]);
                    console.log(`📄 Now scanning page ${currentPage}`);
                    if (currentPage >= 2) {
                        skipUntilPage2 = false; // Start looking for items from page 2 onwards
                    }
                }
                continue;
            }
            
            // Skip page 1 entirely (it has seller/buyer info, not items)
            if (skipUntilPage2) {
                continue;
            }
            
            // Check if we're entering items section
            if (!inItemsSection) {
                const lowerLine = line.toLowerCase();
                // Check for "ARTIKUJT" or table headers with multiple keywords
                if (lowerLine.includes('artikujt') || lowerLine.includes('article')) {
                    inItemsSection = true;
                    console.log('📍 Found ARTIKUJT section at line', i, '(page', currentPage, '):', line);
                    continue;
                }
                const keywordCount = tableHeaderKeywords.filter(keyword => lowerLine.includes(keyword)).length;
                if (keywordCount >= 2) {
                    inItemsSection = true;
                    console.log('📍 Found items table header at line', i, '(page', currentPage, '):', line);
                    continue;
                }
            }
            
            if (inItemsSection) {
                const lowerLine = line.toLowerCase();
                
                // Stop at totals section
                if (/total\s+n[eë]\s+all|shuma\s+totale|informacioni\s+i\s+pages|shperndarja\s+e\s+tvsh/i.test(line)) {
                    console.log('🛑 Stopping at totals section:', line);
                    break;
                }
                
                // Skip header repetitions
                if (tableHeaderKeywords.some(keyword => lowerLine.includes(keyword))) {
                    continue;
                }
                
                // Pattern: Product name line (has letters and usually ends with "S-VAT")
                // Example: "HD 9/20-4 Classic 116 666,67 0,00 S-VAT"
                if (/[a-zA-Z]{3,}/.test(line) && /s-vat|tvsh/i.test(line)) {
                    // Save previous item if exists
                    if (pendingItem && pendingItem.quantity && pendingItem.netValue) {
                        items.push(pendingItem);
                        console.log('✅ Item saved:', pendingItem.itemName);
                    }
                    
                    // Extract product name and net value from this line
                    // Format: "Product Name NetValue Discount S-VAT"
                    const productMatch = line.match(/^(.+?)\s+(\d{1,3}(?:\s\d{3})*,\d{2})/);
                    if (productMatch) {
                        const productName = productMatch[1].trim();
                        const netValue = this.parsePrice(productMatch[2].replace(/\s/g, ''));
                        
                        pendingItem = {
                            itemNumber: null,
                            itemName: productName,
                            quantity: null,
                            unit: '',
                            netValue: netValue,
                            pricePerUnit: null,
                            lineTotal: null
                        };
                        
                        console.log(`📦 New item: ${productName}, Net=${netValue}`);
                    }
                    continue;
                }
                
                // Pattern: Item number line (starts with digit, has "Cope"/"Copë")
                // Example: "2 Cope 0,00 Lo"
                if (pendingItem && !pendingItem.itemNumber && /^\d+\s+(cop[eë]|cope|pako|liter)/i.test(line)) {
                    const numMatch = line.match(/^(\d+)/);
                    if (numMatch) {
                        pendingItem.itemNumber = numMatch[1];
                        console.log(`  #${pendingItem.itemNumber}`);
                    }
                    continue;
                }
                
                // Pattern: Quantity and prices line
                // Example: "1 140 000,00 116 666,67"
                if (pendingItem && pendingItem.itemNumber && !pendingItem.quantity) {
                    const qtyPriceMatch = line.match(/^(\d{1,4})\s+(\d{1,3}(?:\s\d{3})*,\d{2})\s+(\d{1,3}(?:\s\d{3})*,\d{2})/);
                    if (qtyPriceMatch) {
                        pendingItem.quantity = parseInt(qtyPriceMatch[1]);
                        const grossPrice = this.parsePrice(qtyPriceMatch[2].replace(/\s/g, ''));
                        const netValue = this.parsePrice(qtyPriceMatch[3].replace(/\s/g, ''));
                        
                        // Update net value (use the one from this line as it's more accurate)
                        pendingItem.netValue = netValue;
                        
                        console.log(`  📊 Qty=${pendingItem.quantity}, Gross=${grossPrice}, Net=${netValue}`);
                        continue;
                    }
                }
            }
        }
        
        // Save last pending item
        if (pendingItem && pendingItem.quantity && pendingItem.netValue) {
            items.push(pendingItem);
            console.log('✅ Last item saved:', pendingItem.itemName);
        }
        
        // Convert items to final format
        const finalItems = [];
        for (const item of items) {
            let unitPrice = item.netValue / item.quantity;
            let lineTotal = item.netValue;
            
            // Currency normalization
            if (currencyInfo.hasDualCurrency) {
                // CONDITION B: Extract only EUR values (already EUR, no conversion)
                console.log(`💶 Dual currency - keeping EUR values`);
            } else if (currencyInfo.currency === 'ALL' && conversionRate) {
                // CONDITION A: Convert ALL to EUR
                console.log(`🔄 Converting ${item.itemName}: ${unitPrice} ALL / ${conversionRate} = ${unitPrice/conversionRate} EUR`);
                unitPrice = unitPrice / conversionRate;
                lineTotal = lineTotal / conversionRate;
            }
            
            finalItems.push({
                itemName: item.itemName,
                quantity: item.quantity,
                pricePerUnit: Math.round(unitPrice * 100) / 100,
                lineTotal: Math.round(lineTotal * 100) / 100
            });
        }
        
        console.log(`📊 Extracted ${finalItems.length} items`);
        return finalItems;
    }

    // === TOTALS EXTRACTION WITH CURRENCY HANDLING ===
    
    extractTotalsWithCurrency(text, currencyInfo, conversionRate = null) {
        const totals = {
            subtotal: 0,
            tax: 0,
            total: 0
        };

        console.log('💰 Extracting totals...');

        // Albanian total patterns - MORE FLEXIBLE
        const totalPatterns = [
            // Primary Albanian patterns with space-separated thousands
            /Shuma\s+totale?\s+me\s+TVSH\s*:?\s*(\d{1,3}(?:\s\d{3})*,\d{2})\s*(?:EUR|€|ALL|LEK)/i,
            /Totali\s*(?:i\s+pergjithshem)?\s*:?\s*(\d{1,3}(?:\s\d{3})*,\d{2})\s*(?:EUR|€|ALL|LEK)/i,
            /Totali\s*:?\s*(\d{1,3}(?:\s\d{3})*,\d{2})\s*(?:EUR|€|ALL|LEK)/i,
            /Shuma\s+totale?\s*:?\s*(\d{1,3}(?:\s\d{3})*,\d{2})\s*(?:EUR|€|ALL|LEK)/i,
            /Vler[aë]\s+totale?\s*:?\s*(\d{1,3}(?:\s\d{3})*,\d{2})\s*(?:EUR|€|ALL|LEK)/i,
            // Without spaces (fallback)
            /Totali\s*(?:i\s+pergjithshem)?\s*:?\s*(\d+[,.]\d{1,2})\s*(?:EUR|€|ALL|LEK)/i,
            /Totali\s*:?\s*(\d+[,.]\d{1,2})\s*(?:EUR|€|ALL|LEK)/i,
            /Shuma\s+totale?\s*:?\s*(\d+[,.]\d{1,2})\s*(?:EUR|€|ALL|LEK)/i,
            // English patterns
            /Total\s*(?:amount)?\s*:?\s*€?\s*(\d+[,.]\d{1,2})/i,
            /Grand\s+Total\s*:?\s*€?\s*(\d+[,.]\d{1,2})/i,
            // Generic pattern (look for larger numbers at end)
            /(?:^|\n)(?:Total|Totali|Shuma).*?(\d+[,.]\d{2})(?:\s*(?:EUR|€|ALL|LEK))?$/im
        ];

        // If dual currency, explicitly look for EUR total
        if (currencyInfo.hasDualCurrency) {
            console.log('💶 Looking for EUR total in dual currency invoice');
            for (const pattern of totalPatterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    if (/EUR|€/i.test(match[0])) {
                        totals.total = this.parsePrice(match[1].replace(/\s/g, ''));
                        console.log('✅ EUR total found:', totals.total);
                        break;
                    }
                }
            }
        } else {
            // Single currency - extract and convert if needed
            for (const pattern of totalPatterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    let total = this.parsePrice(match[1].replace(/\s/g, ''));
                    
                    // Convert if needed
                    if (currencyInfo.currency === 'ALL' && conversionRate) {
                        console.log(`🔄 Converting total: ${total} ALL / ${conversionRate} = ${total/conversionRate} EUR`);
                        total = total / conversionRate;
                    }
                    
                    totals.total = Math.round(total * 100) / 100;
                    console.log('✅ Total found:', totals.total);
                    break;
                }
            }
        }

        // Extract tax (TVSH in Albanian) - MORE FLEXIBLE with space-separated thousands
        const taxPatterns = [
            /Shuma\s+totale?\s+e\s+TVSH[^:]*:?\s*(\d{1,3}(?:\s\d{3})*,\d{2})\s*(?:EUR|€|ALL|LEK)/i,
            /TVSH\s*(?:\d+%)?\s*:?\s*(\d{1,3}(?:\s\d{3})*,\d{2})\s*(?:EUR|€|ALL|LEK)/i,
            /TVSH.*?(\d{1,3}(?:\s\d{3})*,\d{2})\s*(?:EUR|€|ALL|LEK)/i,
            // Without spaces (fallback)
            /TVSH\s*(?:\d+%)?\s*:?\s*(\d+[,.]\d{1,2})\s*(?:EUR|€|ALL|LEK)/i,
            /Tatim\s*:?\s*(\d+[,.]\d{1,2})\s*(?:EUR|€|ALL|LEK)/i,
            /VAT\s*(?:\d+%)?\s*:?\s*€?\s*(\d+[,.]\d{1,2})/i,
            /Tax\s*:?\s*€?\s*(\d+[,.]\d{1,2})/i,
            // Generic tax pattern
            /(?:Tax|TVSH|Tatim|VAT)[^\d]*(\d+[,.]\d{2})/i
        ];
        
        for (const pattern of taxPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                let tax = this.parsePrice(match[1].replace(/\s/g, ''));
                
                if (!currencyInfo.hasDualCurrency && currencyInfo.currency === 'ALL' && conversionRate) {
                    console.log(`🔄 Converting tax: ${tax} ALL / ${conversionRate} = ${tax/conversionRate} EUR`);
                    tax = tax / conversionRate;
                }
                
                totals.tax = Math.round(tax * 100) / 100;
                console.log('✅ Tax found:', totals.tax);
                break;
            }
        }

        // Calculate subtotal
        if (totals.total > 0 && totals.tax > 0) {
            totals.subtotal = Math.round((totals.total - totals.tax) * 100) / 100;
        } else if (totals.total > 0) {
            totals.subtotal = totals.total;
        }

        console.log('💰 Final totals:', totals);
        return totals;
    }

    // === SMART BRAIN INTEGRATION - SAVE TO DATABASE ===
    
    async saveToDatabase(invoiceData, options = {}) {
        try {
            console.log('💾 Saving Albanian invoice to database with Smart Brain rules...');
            
            // === STEP 1: Find or Create Customer (Deduplication by name) ===
            let customerId = null;
            if (invoiceData.customerName && invoiceData.customerName !== 'Walk-in Customer') {
                customerId = await this.findOrCreateCustomer(invoiceData.customerName, invoiceData.customerAddress);
            }

            // === STEP 2: Check for Matching Online Order ===
            let matchedOrder = null;
            if (customerId && invoiceData.items.length > 0) {
                matchedOrder = await this.findMatchingOnlineOrder(
                    invoiceData.customerName,
                    invoiceData.items,
                    invoiceData.total
                );
            }

            // === STEP 3: Save Invoice as Store Sale ===
            const storeSalesRef = this.collection(this.db, 'storeSales');
            
            // Transform items to match store-sales format (name, price, cost, quantity, productId, image)
            const transformedItems = invoiceData.items.map(item => ({
                name: item.linkedProductName || item.itemName || item.name || 'Unknown Product',
                price: Number(item.pricePerUnit || item.price || 0),
                cost: Number(item.cost || 0), // Albanian invoices don't have cost, default to 0
                quantity: Number(item.quantity || 1),
                productId: item.productId || 'manual-item',
                image: item.image || null
            }));
            
            const saleData = {
                clientName: invoiceData.customerName || 'Walk-in Customer',
                customerAddress: invoiceData.customerAddress || '',
                customerId: customerId,
                items: transformedItems,
                total: invoiceData.total,
                subtotal: invoiceData.subtotal,
                tax: invoiceData.tax,
                currency: 'EUR',  // Always EUR after normalization
                originalCurrency: invoiceData.originalCurrency,
                normalizedToEUR: invoiceData.normalizedToEUR,
                conversionRate: invoiceData.conversionRate,
                invoiceNumber: invoiceData.invoiceNumber,
                invoiceDate: invoiceData.date,
                timestamp: this.Timestamp ? this.Timestamp.now() : new Date(),
                source: 'Manual PDF - Platforma Qendrore',
                type: 'manual-invoice',
                linkedOrderId: matchedOrder ? matchedOrder.orderId : null,
                wasOnlineOrder: !!matchedOrder,
                ocrConfidence: invoiceData.confidence || 0,
                paymentMethod: 'unknown'
            };
            
            const saleDocRef = await this.addDoc(storeSalesRef, saleData);
            console.log('✅ Sale saved:', saleDocRef.id);

            // === STEP 4: Update Online Order Status (if matched) ===
            if (matchedOrder) {
                await this.updateDoc(this.doc(this.db, 'onlineOrders', matchedOrder.orderId), {
                    status: 'Processing',
                    processedAt: this.Timestamp ? this.Timestamp.now() : new Date(),
                    linkedInvoiceNumber: invoiceData.invoiceNumber,
                    linkedSaleId: saleDocRef.id
                });
                console.log('✅ Matched online order updated:', matchedOrder.orderId);
            }

            // === STEP 5: Update Stock Levels ===
            await this.updateStockLevels(invoiceData.items);

            // === STEP 6: Update Customer Invoice History ===
            if (customerId) {
                await this.updateCustomerHistory(customerId, invoiceData.invoiceNumber);
            }

            console.log('✅✅ Invoice saved to database with Smart Brain processing complete!');
            
            return {
                success: true,
                saleId: saleDocRef.id,
                customerId: customerId,
                matchedOrderId: matchedOrder ? matchedOrder.orderId : null,
                message: 'Invoice processed and saved successfully'
            };
            
        } catch (error) {
            console.error('❌ Error saving invoice:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === SMART BRAIN: FIND OR CREATE CUSTOMER ===
    
    async findOrCreateCustomer(customerName, customerAddress = '') {
        try {
            const customersRef = this.collection(this.db, 'customers');
            const normalizedName = customerName.toLowerCase().trim();
            
            // Search for existing customer
            const snapshot = await this.getDocs(customersRef);
            
            for (const doc of snapshot.docs) {
                const customer = doc.data();
                const existingName = (customer.name || '').toLowerCase().trim();
                
                // Fuzzy match
                if (existingName === normalizedName || 
                    existingName.includes(normalizedName) || 
                    normalizedName.includes(existingName)) {
                    console.log(`✓ Found existing customer: ${customer.name} (${doc.id})`);
                    return doc.id;
                }
            }
            
            // Create new customer
            console.log(`→ Creating new customer: ${customerName}`);
            const newCustomerRef = await this.addDoc(customersRef, {
                name: customerName,
                address: customerAddress,
                email: '',
                phone: '',
                status: 'Active',
                source: 'Manual PDF Invoice',
                createdAt: this.Timestamp ? this.Timestamp.now() : new Date(),
                invoiceHistory: []
            });
            
            console.log(`✓ New customer created: ${newCustomerRef.id}`);
            return newCustomerRef.id;
            
        } catch (error) {
            console.error('Error in customer management:', error);
            return null;
        }
    }

    // === SMART BRAIN: FIND MATCHING ONLINE ORDER ===
    
    async findMatchingOnlineOrder(customerName, invoiceItems, invoiceTotal) {
        try {
            const ordersRef = this.collection(this.db, 'onlineOrders');
            const snapshot = await this.getDocs(ordersRef);
            
            console.log(`🔍 Searching for matching online order for ${customerName}...`);
            
            for (const doc of snapshot.docs) {
                const order = doc.data();
                
                // Check customer name match
                if ((order.clientName || '').toLowerCase().trim() !== customerName.toLowerCase().trim()) {
                    continue;
                }
                
                // Check order status (only pending/confirmed/ordered)
                const status = (order.status || '').toLowerCase();
                if (!['pending', 'confirmed', 'ordered', 'processing'].includes(status)) {
                    continue;
                }
                
                // Check amount match (within €1 tolerance)
                const orderTotal = order.total || order.price || 0;
                if (Math.abs(orderTotal - invoiceTotal) > 1) {
                    continue;
                }
                
                // Check items match (at least 70% of items)
                if (order.items && invoiceItems.length > 0) {
                    const matchScore = this.calculateItemMatchScore(invoiceItems, order.items);
                    if (matchScore >= 0.7) {
                        console.log(`✓ Found matching order: ${doc.id} (match score: ${Math.round(matchScore * 100)}%)`);
                        return { orderId: doc.id };
                    }
                }
            }
            
            console.log('→ No matching online order found');
            return null;
            
        } catch (error) {
            console.error('Error searching for matching order:', error);
            return null;
        }
    }

    calculateItemMatchScore(invoiceItems, orderItems) {
        let matches = 0;
        
        for (const invoiceItem of invoiceItems) {
            const invoiceName = (invoiceItem.itemName || invoiceItem.name || '').toLowerCase().trim();
            
            for (const orderItem of orderItems) {
                const orderName = (orderItem.name || orderItem.itemName || '').toLowerCase().trim();
                
                if (invoiceName === orderName || 
                    invoiceName.includes(orderName) || 
                    orderName.includes(invoiceName)) {
                    matches++;
                    break;
                }
            }
        }
        
        return invoiceItems.length > 0 ? matches / invoiceItems.length : 0;
    }

    // === SMART BRAIN: UPDATE STOCK LEVELS ===
    
    async updateStockLevels(items) {
        try {
            console.log(`📦 Updating stock for ${items.length} item(s)...`);
            
            for (const item of items) {
                // Clean item name: Remove price patterns like "1000,00" at the end
                let rawItemName = (item.itemName || item.name || '').trim();
                let cleanItemName = rawItemName.replace(/\s*\d{1,5}[.,]\d{2}\s*$/g, '').trim();
                
                if (cleanItemName !== rawItemName) {
                    console.log(`🧹 Cleaned item name: "${rawItemName}" → "${cleanItemName}"`);
                }
                
                const itemName = cleanItemName.toLowerCase().trim();
                const quantity = item.quantity || 0;
                
                if (!itemName || quantity <= 0) continue;
                
                // PRIORITY 1: Use productId if available (from autocomplete selection)
                if (item.productId) {
                    try {
                        const productRef = this.doc(this.db, 'products', item.productId);
                        // FIXED: Use getDoc for single document
                        const productSnap = await this.getDoc(productRef);
                        
                        if (productSnap.exists()) {
                            const product = productSnap.data();
                            const currentStock = product.stock || 0;
                            const newStock = Math.max(0, currentStock - quantity);
                            
                            await this.updateDoc(productRef, {
                                stock: newStock,
                                lastUpdated: this.Timestamp ? this.Timestamp.now() : new Date()
                            });
                            
                            console.log(`✓ Stock updated (productId): ${product.name} (${currentStock} → ${newStock})`);
                            continue; // Skip name matching
                        }
                    } catch (error) {
                        console.error(`Error updating stock by productId:`, error);
                        // Fall through to name matching if productId fails
                    }
                }
                
                // FALLBACK: Advanced fuzzy name matching
                const productsRef = this.collection(this.db, 'products');
                const snapshot = await this.getDocs(productsRef);
                
                let bestMatch = null;
                let bestScore = 0;
                
                for (const productDoc of snapshot.docs) {
                    const product = productDoc.data();
                    const productName = (product.name || '').toLowerCase().trim();
                    let score = 0;
                    
                    // Exact match (highest priority)
                    if (productName === itemName) {
                        score = 100;
                    }
                    // Product name starts with item name
                    else if (productName.startsWith(itemName)) {
                        score = 90;
                    }
                    // Item name starts with product name
                    else if (itemName.startsWith(productName)) {
                        score = 85;
                    }
                    // Product name contains item name
                    else if (productName.includes(itemName)) {
                        score = 70;
                    }
                    // Item name contains product name
                    else if (itemName.includes(productName)) {
                        score = 65;
                    }
                    // Word-by-word matching
                    else {
                        const itemWords = itemName.split(/\s+/);
                        const productWords = productName.split(/\s+/);
                        const matchingWords = itemWords.filter(w => productWords.some(pw => pw.includes(w) || w.includes(pw)));
                        if (matchingWords.length > 0) {
                            // Boost score significantly for word matches (85 instead of 50)
                            score = (matchingWords.length / itemWords.length) * 85;
                        }
                    }
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = { doc: productDoc, product };
                    }
                }
                
                // Update stock if good match found (threshold: 50%)
                if (bestMatch && bestScore >= 50) {
                    const product = bestMatch.product;
                    const currentStock = product.stock || 0;
                    const newStock = Math.max(0, currentStock - quantity);
                    
                    await this.updateDoc(bestMatch.doc.ref, {
                        stock: newStock,
                        lastUpdated: this.Timestamp ? this.Timestamp.now() : new Date()
                    });
                    
                    console.log(`✓ Stock updated (fuzzy match, score ${bestScore}%): ${product.name} (${currentStock} → ${newStock})`);
                } else {
                    console.warn(`⚠️ No match found for: ${cleanItemName} (best score: ${bestScore}%)`);
                }
            }
            
        } catch (error) {
            console.error('Error updating stock:', error);
        }
    }

    // === UPDATE CUSTOMER HISTORY ===
    
    async updateCustomerHistory(customerId, invoiceNumber) {
        try {
            const customerRef = this.doc(this.db, 'customers', customerId);
            // FIXED: Use getDoc for single document
            const customerDoc = await this.getDoc(customerRef);
            
            if (customerDoc.exists()) {
                const customer = customerDoc.data();
                const history = customer.invoiceHistory || [];
                
                if (!history.includes(invoiceNumber)) {
                    history.push(invoiceNumber);
                    await this.updateDoc(customerRef, {
                        invoiceHistory: history,
                        lastInvoiceDate: this.Timestamp ? this.Timestamp.now() : new Date()
                    });
                }
            }
        } catch (error) {
            console.error('Error updating customer history:', error);
        }
    }

    // === VALIDATION ===
    
    validateInvoiceData(data) {
        const validated = { ...data };
        
        // Validate invoice number
        if (!validated.invoiceNumber || validated.invoiceNumber.length < 3) {
            validated.invoiceNumber = 'INV-' + Date.now();
            validated.warnings = validated.warnings || [];
            validated.warnings.push('Invoice number not found - generated automatically');
        }
        
        // Validate date
        if (!validated.date) {
            validated.date = new Date().toISOString().split('T')[0];
            validated.warnings = validated.warnings || [];
            validated.warnings.push('Date not found - using today');
        }
        
        // Validate customer name
        if (!validated.customerName) {
            validated.customerName = 'Walk-in Customer';
            validated.warnings = validated.warnings || [];
            validated.warnings.push('Customer name not found - using Walk-in');
        }
        
        // Validate items
        if (validated.items.length === 0) {
            validated.warnings = validated.warnings || [];
            validated.warnings.push('No items detected - manual entry required');
        }
        
        // Validate total
        if (validated.total === 0) {
            // Calculate from items
            const calculatedTotal = validated.items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
            if (calculatedTotal > 0) {
                validated.total = calculatedTotal;
                validated.subtotal = calculatedTotal;
            } else {
                validated.warnings = validated.warnings || [];
                validated.warnings.push('Total amount not found');
            }
        }
        
        return validated;
    }

    calculateConfidence(data) {
        let score = 0;
        let maxScore = 0;
        
        // Invoice number (15 points)
        maxScore += 15;
        if (data.invoiceNumber && !data.invoiceNumber.startsWith('INV-')) {
            score += 15;
        } else if (data.invoiceNumber) {
            score += 8;
        }
        
        // Date (10 points)
        maxScore += 10;
        if (data.date && !data.warnings?.includes('Date not found - using today')) {
            score += 10;
        } else if (data.date) {
            score += 5;
        }
        
        // Customer name (25 points) - PRIMARY MATCH KEY
        maxScore += 25;
        if (data.customerName && data.customerName !== 'Walk-in Customer') {
            score += 25;
        } else if (data.customerName) {
            score += 10;
        }
        
        // Items (30 points)
        maxScore += 30;
        if (data.items.length > 0) {
            const itemScore = Math.min(30, data.items.length * 10);
            score += itemScore;
        }
        
        // Total (20 points)
        maxScore += 20;
        if (data.total > 0) {
            score += 20;
        }
        
        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
        
        return Math.round(percentage);
    }

    // === HELPER METHODS ===
    
    parsePrice(priceString) {
        if (typeof priceString === 'number') return priceString;
        
        // Remove currency symbols and spaces
        const cleaned = priceString.replace(/[€$£\s]/g, '');
        
        // Replace comma with dot for decimal
        const normalized = cleaned.replace(',', '.');
        
        // Parse to float
        const value = parseFloat(normalized);
        
        return isNaN(value) ? 0 : value;
    }

    parseNumber(numString) {
        if (typeof numString === 'number') return numString;
        
        const cleaned = numString.replace(/[^\d,.]/g, '');
        const normalized = cleaned.replace(',', '.');
        const value = parseFloat(normalized);
        
        return isNaN(value) ? 0 : value;
    }

    normalizeDate(dateString) {
        try {
            // Try to parse various date formats
            const formats = [
                /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,  // DD/MM/YYYY
                /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,  // YYYY/MM/DD
                /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})/   // DD/MM/YY
            ];
            
            for (const format of formats) {
                const match = dateString.match(format);
                if (match) {
                    let year, month, day;
                    
                    if (match[1].length === 4) {
                        // YYYY-MM-DD format
                        year = match[1];
                        month = match[2].padStart(2, '0');
                        day = match[3].padStart(2, '0');
                    } else if (match[3].length === 4) {
                        // DD-MM-YYYY format
                        day = match[1].padStart(2, '0');
                        month = match[2].padStart(2, '0');
                        year = match[3];
                    } else {
                        // DD-MM-YY format
                        day = match[1].padStart(2, '0');
                        month = match[2].padStart(2, '0');
                        year = '20' + match[3];
                    }
                    
                    return `${year}-${month}-${day}`;
                }
            }
            
            // If no match, try Date parsing
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
            
        } catch (error) {
            console.error('Date parsing error:', error);
        }
        
        // Default to today
        return new Date().toISOString().split('T')[0];
    }

    // === CLEANUP ===
    
    async terminate() {
        if (this.ocrWorker) {
            await this.ocrWorker.terminate();
            this.ocrWorker = null;
            this.isInitialized = false;
            console.log('🔧 Manual PDF Processor terminated');
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ManualPDFProcessor;
}
