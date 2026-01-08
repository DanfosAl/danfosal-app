// Smart Inventory Scanner - Auto-update stock from supplier invoices
class SmartInventoryScanner {
    constructor(db, firebaseImports = {}) {
        this.db = db;
        this.collection = firebaseImports.collection;
        this.addDoc = firebaseImports.addDoc;
        this.updateDoc = firebaseImports.updateDoc;
        this.getDocs = firebaseImports.getDocs;
        this.doc = firebaseImports.doc;
        this.getDoc = firebaseImports.getDoc;
        this.query = firebaseImports.query;
        this.where = firebaseImports.where;
        
        // Tesseract.js worker
        this.ocrWorker = null;
        this.isInitialized = false;
        
        // Current scan data
        this.currentScan = null;
        this.productsCache = [];
    }

    // === INITIALIZATION ===
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            console.log('🔧 Initializing Smart Inventory Scanner...');
            
            // Check if Tesseract is loaded
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract library not loaded');
            }
            
            this.ocrWorker = await Tesseract.createWorker('eng');
            
            // Load products from database
            await this.loadProducts();
            
            this.isInitialized = true;
            console.log('✅ Scanner Ready - Loaded ' + this.productsCache.length + ' products');
            
        } catch (error) {
            console.error('Failed to initialize scanner:', error);
            throw error;
        }
    }

    async loadProducts() {
        try {
            const productsRef = this.collection(this.db, 'products');
            const snapshot = await this.getDocs(productsRef);
            
            this.productsCache = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Extract unique suppliers from existing products
            this.knownSuppliers = [...new Set(
                this.productsCache
                    .map(p => p.producer)
                    .filter(p => p && p.length > 0)
            )];
            
            console.log(`📦 Loaded ${this.productsCache.length} products from database`);
            console.log(`🏢 Known suppliers:`, this.knownSuppliers.join(', '));
        } catch (error) {
            console.error('Error loading products:', error);
            this.productsCache = [];
            this.knownSuppliers = [];
        }
    }

    // === MAIN SCANNING WORKFLOW ===
    
    async scanSupplierInvoice(imageSource, options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        console.log('📸 Scanning supplier invoice...');
        
        try {
            let rawText = '';
            
            // Step 1: Perform OCR on all images/pages
            const images = Array.isArray(imageSource) ? imageSource : [imageSource];
            console.log(`🔍 Scanning ${images.length} page(s)...`);
            
            for (let i = 0; i < images.length; i++) {
                console.log(`  📄 Processing page ${i + 1}/${images.length}...`);
                const { data } = await this.ocrWorker.recognize(images[i]);
                rawText += data.text + '\n\n--- PAGE BREAK ---\n\n';
            }
            
            console.log('📝 Raw text extracted:', rawText.substring(0, 300) + '...');
            console.log(`  Total text length: ${rawText.length} characters`);
            
            if (!rawText || rawText.trim().length < 50) {
                throw new Error('Could not extract enough text from image. Please ensure the invoice is clear.');
            }
            
            // Step 2: Extract structured data
            const invoiceData = this.extractSupplierInvoiceData(rawText);
            
            // Step 3: Match with existing products
            const matchedItems = await this.matchProductsWithInventory(invoiceData.items);
            
            // Step 4: Calculate pricing for new products
            const itemsWithPricing = this.calculatePricingForNewProducts(matchedItems);
            
            this.currentScan = {
                supplier: invoiceData.supplier,
                invoiceNumber: invoiceData.invoiceNumber,
                totalAmount: invoiceData.totalAmount,
                date: invoiceData.date,
                items: itemsWithPricing,
                rawText: rawText,
                timestamp: Date.now(),
                stats: {
                    total: itemsWithPricing.length,
                    matched: itemsWithPricing.filter(i => i.matched).length,
                    new: itemsWithPricing.filter(i => !i.matched).length
                }
            };
            
            console.log('✅ Invoice processed:', this.currentScan.stats);
            
            return {
                success: true,
                data: this.currentScan
            };
            
        } catch (error) {
            console.error('Scanner Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === DATA EXTRACTION ===
    
    extractSupplierInvoiceData(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        console.log('🔍 OCR Text Analysis:');
        console.log('  Total lines:', lines.length);
        console.log('  First 30 lines:');
        lines.slice(0, 30).forEach((line, idx) => console.log(`    ${idx}: ${line}`));
        console.log('  Last 20 lines:');
        lines.slice(-20).forEach((line, idx) => console.log(`    ${lines.length - 20 + idx}: ${line}`));
        
        const invoiceData = {
            supplier: '',
            invoiceNumber: '',
            date: '',
            totalAmount: 0,
            items: []
        };

        // === EXTRACT SUPPLIER ===
        // Look for known suppliers from our product database
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const line = lines[i];
            
            // Check if line matches any of our known suppliers (case-insensitive)
            for (const supplier of this.knownSuppliers) {
                if (line.toLowerCase().includes(supplier.toLowerCase())) {
                    invoiceData.supplier = supplier;  // Use the exact name from our database
                    console.log('  ✅ Supplier found:', supplier);
                    break;
                }
            }
            
            if (invoiceData.supplier) break;
        }
        
        // If no match, try generic patterns
        if (!invoiceData.supplier) {
            for (let i = 0; i < Math.min(10, lines.length); i++) {
                const line = lines[i];
                if (line.length > 3 && line.length < 60) {
                    if (
                        /[A-Z]{2,}|GmbH|Ltd|Inc|S\.A\.|d\.o\.o\.|P\.K\.|SHA|SPA|AG/i.test(line)
                    ) {
                        invoiceData.supplier = line;
                        console.log('  ⚠️ Unknown supplier found:', line);
                        break;
                    }
                }
            }
        }

        // === EXTRACT INVOICE NUMBER ===
        console.log('🔍 Searching for Invoice Number...');
        
        // Look for invoice number in multiple ways
        const invoicePatterns = [
            // Croatian patterns
            /broj\s*ra[cč]una\s*[:\.]?\s*([A-Z0-9\-\/]{3,})/i,  // "Broj računa"
            /ra[cč]un\s*(?:br\.?|broj)?\s*[:\.]?\s*([A-Z0-9\-\/]{3,})/i,  // "Račun br."
            // English patterns
            /invoice\s*(?:no\.?|number|num\.?|nr\.?|#)\s*[:,\.]?\s*([A-Z0-9\-\/]{3,})/i,
            // German patterns
            /rechnung\s*(?:nr\.?)?\s*:?\s*([A-Z0-9\-\/]{3,})/i,
            // Short forms
            /inv\.\s*[:#]?\s*([A-Z0-9\-\/]{3,})/i,
            /bill\s*no\.?\s*[:#]?\s*([A-Z0-9\-\/]{3,})/i,
            // Format like "22901/U1/0003"
            /(\d{5}[\/\\][A-Z0-9]{2,}[\/\\]\d{4})/
        ];
        
        for (const pattern of invoicePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const candidate = match[1].trim();
                // Must contain at least one digit and be at least 3 chars long
                if (/\d/.test(candidate) && candidate.length >= 3) {
                    invoiceData.invoiceNumber = candidate;
                    console.log('  ✅ Invoice Number found (pattern match):', invoiceData.invoiceNumber);
                    break;
                }
            }
        }
        
        // If still not found, search line by line aggressively
        if (!invoiceData.invoiceNumber) {
            console.log('  🔍 Pattern match failed, searching line-by-line...');
            
            for (let i = 0; i < Math.min(40, lines.length); i++) {
                const line = lines[i].toLowerCase();
                
                // Check if current line mentions invoice labels (English or Croatian)
                if (line.includes('invoice no') || 
                    line.includes('invoice nr') ||
                    line.includes('broj ra') ||  // "Broj računa"
                    line.includes('račun') ||
                    line.includes('racun')) {
                    console.log(`  📍 Found invoice label at line ${i}: "${lines[i]}"`);
                    
                    // Check THIS line and next 5 lines for a value
                    for (let j = 0; j <= 5 && (i + j) < lines.length; j++) {
                        const candidateLine = lines[i + j].trim();
                        
                        // Skip the label line itself if it has no numbers
                        if (j === 0 && !/\d/.test(candidateLine)) continue;

                        console.log(`    Checking line ${i + j} (+${j}): "${candidateLine}"`);
                        
                        // Priority 1: Pure number with 8-11 digits (invoice number like 7573108769)
                        const longNumberMatch = candidateLine.match(/^(\d{8,11})$/);
                        if (longNumberMatch) {
                            invoiceData.invoiceNumber = longNumberMatch[1];
                            console.log(`  ✅ Invoice Number found (long number) at line ${i + j}: ${invoiceData.invoiceNumber}`);
                            break;
                        }
                        
                        // Priority 2: Number with 8-11 digits anywhere in line
                        const embeddedLongNumber = candidateLine.match(/\b(\d{8,11})\b/);
                        if (embeddedLongNumber) {
                            invoiceData.invoiceNumber = embeddedLongNumber[1];
                            console.log(`  ✅ Invoice Number found (embedded long number) at line ${i + j}: ${invoiceData.invoiceNumber}`);
                            break;
                        }
                        
                        // Priority 3: Check if this line looks like an invoice number (alphanumeric, has digits)
                        // Avoid dates, prices, phone numbers
                        if (/[A-Z0-9\-\/]{3,}/.test(candidateLine) && 
                            /\d/.test(candidateLine) && 
                            !candidateLine.includes('€') && 
                            !candidateLine.includes('$') &&
                            !candidateLine.toLowerCase().includes('total') &&
                            !candidateLine.toLowerCase().includes('date')) {
                            
                            // Extract the potential number part
                            const parts = candidateLine.split(/[\s:]+/);
                            for (const part of parts) {
                                if (/\d/.test(part) && part.length >= 5 && !part.includes('.')) {
                                    invoiceData.invoiceNumber = part;
                                    break;
                                }
                            }
                            
                            if (invoiceData.invoiceNumber) {
                                console.log(`  ✅ Invoice Number found at line ${i + j}: ${invoiceData.invoiceNumber}`);
                                break;
                            }
                        }
                    }
                    
                    if (invoiceData.invoiceNumber) break;
                }
            }
        }
        
        if (!invoiceData.invoiceNumber) {
            console.log('  ❌ Invoice Number NOT FOUND after all attempts');
        }

        // === EXTRACT DATE ===
        console.log('🔍 Searching for Date...');
        
        // First try to find "Date Time" label and get date from next line
        for (let i = 0; i < Math.min(30, lines.length); i++) {
            const line = lines[i].toLowerCase();
            if (line.includes('date time') || line.includes('date:')) {
                console.log(`  📍 Found date label at line ${i}: "${lines[i]}"`);
                
                // Check next 3 lines for a date
                for (let j = 0; j <= 3 && (i + j) < lines.length; j++) {
                    const candidateLine = lines[i + j].trim();
                    // Match format: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
                    const dateMatch = candidateLine.match(/^(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{4})/);
                    if (dateMatch) {
                        invoiceData.date = this.normalizeDate(dateMatch[1]);
                        console.log(`  ✅ Date found: ${invoiceData.date}`);
                        break;
                    }
                }
                if (invoiceData.date) break;
            }
        }
        
        // Fallback: search entire text with patterns
        if (!invoiceData.date) {
            const datePatterns = [
                /date\s*(?:time)?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
                /(\d{1,2}\.\d{1,2}\.\d{4})/,  // Format: 07.10.2025
                /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
            ];
            
            for (const pattern of datePatterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    invoiceData.date = this.normalizeDate(match[1]);
                    console.log(`  ✅ Date found (pattern): ${invoiceData.date}`);
                    break;
                }
            }
        }

        // === EXTRACT TOTAL AMOUNT ===
        // Look for total amount in multiple ways
        const totalPatterns = [
            // Pattern 1: "Total Amount (EUR)" with colon
            /total\s*amount\s*\(EUR\)\s*[:,\.]?\s*(\d{1,}[,\.]\d{2})/i,
            // Pattern 2: Just "Total Amount"
            /total\s*amount\s*[:,\.]?\s*(\d{1,}[,\.]\d{2})/i,
            // Pattern 3: "Total (EUR)"
            /total\s*\(EUR\)\s*[:,\.]?\s*(\d{1,}[,\.]\d{2})/i,
            // Pattern 4: Just "Total"
            /total\s*[:,\.]?\s*(\d{1,}[,\.]\d{2})/i,
            // Pattern 5: "Sum" or "Amount"
            /(?:sum|amount)\s*\(EUR\)\s*[:,\.]?\s*(\d{1,}[,\.]\d{2})/i,
            // Pattern 6: German "Gesamt"
            /gesamt\s*[:,\.]?\s*(\d{1,}[,\.]\d{2})/i,
            // Pattern 7: Grand Total
            /grand\s*total\s*[:,\.]?\s*(\d{1,}[,\.]\d{2})/i,
        ];
        
        for (const pattern of totalPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                invoiceData.totalAmount = this.parsePrice(match[1]);
                console.log('  💰 Total Amount found:', invoiceData.totalAmount);
                break;
            }
        }
        
        // If not found, search line by line for "Total Amount" label followed by number on next line
        if (invoiceData.totalAmount === 0) {
            for (let i = 0; i < Math.min(50, lines.length - 1); i++) {
                const line = lines[i].toLowerCase();
                const nextLine = lines[i + 1];
                
                // Check if current line mentions "total amount" or just "total"
                if ((line.includes('total amount') || 
                     (line.includes('total') && line.includes('eur'))) &&
                    !line.includes('subtotal')) {
                    
                    // Look for number on same line first
                    const sameLineMatch = lines[i].match(/(\d{1,}[,\.]\d{2})/);
                    if (sameLineMatch) {
                        invoiceData.totalAmount = this.parsePrice(sameLineMatch[1]);
                        console.log('  💰 Total Amount found (same line):', invoiceData.totalAmount);
                        break;
                    }
                    
                    // Check next line for number
                    const nextLineMatch = nextLine.match(/(\d{1,}[,\.]\d{2})/);
                    if (nextLineMatch) {
                        invoiceData.totalAmount = this.parsePrice(nextLineMatch[1]);
                        console.log('  💰 Total Amount found (next line):', invoiceData.totalAmount);
                        break;
                    }
                }
            }
        }
        
        // Last resort: Look for largest amount in last 20 lines (often the total)
        if (invoiceData.totalAmount === 0) {
            let maxAmount = 0;
            for (let i = Math.max(0, lines.length - 20); i < lines.length; i++) {
                const matches = lines[i].match(/(\d{1,}[,\.]\d{2})/g);
                if (matches) {
                    for (const match of matches) {
                        const amount = this.parsePrice(match);
                        if (amount > maxAmount && amount < 100000) {  // Reasonable invoice limit
                            maxAmount = amount;
                        }
                    }
                }
            }
            if (maxAmount > 0) {
                invoiceData.totalAmount = maxAmount;
                console.log('  💰 Total Amount found (largest in footer):', invoiceData.totalAmount);
            }
        }

        // === EXTRACT LINE ITEMS ===
        invoiceData.items = this.extractLineItems(lines, text);

        // === SUMMARY LOG ===
        console.log('📊 Extraction Summary:');
        console.log(`  ✓ Supplier: ${invoiceData.supplier || 'NOT FOUND'}`);
        console.log(`  ✓ Invoice Number: ${invoiceData.invoiceNumber || 'NOT FOUND'}`);
        console.log(`  ✓ Date: ${invoiceData.date || 'NOT FOUND'}`);
        console.log(`  ✓ Total Amount: €${invoiceData.totalAmount.toFixed(2)}`);
        console.log(`  ✓ Items Found: ${invoiceData.items.length}`);

        return invoiceData;
    }

    extractLineItems(lines, fullText) {
        const items = [];
        let inItemSection = false;
        
        console.log('🔍 Looking for product lines...');
        
        // Patterns for product codes (Material No.)
        // Only match codes that look like actual product codes, not long account numbers
        const codePatterns = [
            /(\d{1}\.\d{3}[-\.]?\d{3}[-.]\d)/,  // 0.033-709.0 format (Kärcher style) - most specific
            /(\d{1,4}[-\.]?\d{3}[-\.]?\d{1,3}[-.]\d)/,  // General format
            /([A-Z]{2,4}\d{4,8})\b/,  // ABC1234 format (not too long)
            /(\d+\.\d+\.\d+\.\d)\b/,  // Dotted format like 0.033.709.0
        ];
        
        // Pattern for table-style product lines: "0001  0.033-709.0  Product Name  1 PC  23.50  23.50"
        // Support multiple quantity units: PC, PCS, KOM, kom, KOS, etc.
        // Made more flexible with optional spaces and dots in product codes
        const tableLinePattern = /^(\d{4})\s+(\d\.\d{3}[-\.\s]?\d{3}[-\.\s]?\d)\s+(.*?)\s+(\d+)\s+(?:PC|PCS|KOM|kom|KOS|kos|EA|ea|STK|stk)\s+(\d+[,\.]\d{2})/i;
        
        // Patterns for quantities and prices - support Croatian/European units
        const qtyPricePattern = /(\d+)\s+(?:PC|PCS|KOM|kom|KOS|kos|EA|ea|STK|stk)|Quantity\s*:?\s*(\d+)|(\d+)\s+x|Količina\s*:?\s*(\d+)/i;
        const pricePattern = /(\d+[,\.]\d{2})/;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lowerLine = line.toLowerCase();
            
            // Debug: Log ALL lines that contain numbers to see table structure
            if (i < 100 && /\d/.test(line)) {
                console.log(`  Line ${i}: ${line}`);
            }
            
            // Start extracting after headers
            if (lowerLine.includes('material') || 
                lowerLine.includes('br. materijala') ||
                lowerLine.includes('opis') ||
                lowerLine.includes('description') || 
                lowerLine.includes('quantity') ||
                lowerLine.includes('količina') ||
                lowerLine.includes('pos.') ||
                lowerLine.includes('st.') ||
                lowerLine.includes('article') ||
                /^\d{4}\s+\d\.\d{3}/.test(line)) {  // Or if we see table format
                inItemSection = true;
                console.log('  ✅ Found item section at line', i, ':', line.substring(0, 50));
                
                // Skip header line, start processing next line
                if (lowerLine.includes('material') || lowerLine.includes('pos.') || lowerLine.includes('br.')) {
                    continue;
                }
            }
            
            // Don't stop at words like "total" if we're in a structured table
            // Only stop if we see clear ending markers
            if ((lowerLine.includes('subtotal') || 
                 lowerLine.includes('net amount') ||
                 lowerLine.includes('vat amount') ||
                 lowerLine.startsWith('total:')) && 
                !line.match(/^\d{4}/)) {  // Not a table row
                inItemSection = false;
                console.log('  ⏹️ Stopped at totals line', i);
            }
            
            if (!inItemSection) continue;
            
            // Try table format first (most reliable for structured invoices)
            const tableMatch = line.match(tableLinePattern);
            if (tableMatch) {
                const [, rowNum, code, name, qty, price] = tableMatch;
                const cleanName = name.trim();
                const unitPrice = this.parsePrice(price);
                
                console.log(`  ✅ Table row: [${code}] ${cleanName} x${qty} @ €${unitPrice}`);
                
                // Validate: product name should not contain banking/legal terms
                if (!this.isNonProductLine(cleanName)) {
                    items.push({
                        code: code,
                        name: cleanName.substring(0, 100),
                        quantity: parseInt(qty),
                        unitPrice: unitPrice,
                        totalPrice: parseInt(qty) * unitPrice
                    });
                } else {
                    console.log(`  ❌ Skipped (not a product): ${cleanName}`);
                }
                continue;
            }
            
            // NEW: Try to match lines with product code pattern even if not strict table format
            // Pattern: any line containing "2.644-191.0" or similar Karcher code
            const flexibleCodeMatch = line.match(/(\d\.\d{3}[-\.\s]\d{3}[-\.\s]\d)/);
            if (flexibleCodeMatch && inItemSection) {
                // Normalize code to x.xxx-xxx.x format (with dots)
                let code = flexibleCodeMatch[1];
                code = code.replace(/\s/g, ''); // Remove spaces
                // Ensure format is x.xxx-xxx.x with dots in right places
                const codeDigits = code.replace(/[^\d]/g, ''); // Get just digits
                if (codeDigits.length === 8) {
                    code = `${codeDigits[0]}.${codeDigits.substring(1, 4)}-${codeDigits.substring(4, 7)}.${codeDigits[7]}`;
                }
                console.log(`  🔎 Found flexible code match: ${code} in line: "${line}"`);
                
                // Try to extract quantity (look for number followed by KOM, PC, etc.)
                let quantity = 1;
                const qtyMatch = line.match(/(\d+)\s*(?:KOM|kom|PC|PCS|STK|EA)/i);
                if (qtyMatch) {
                    quantity = parseInt(qtyMatch[1]);
                    console.log(`    Quantity: ${quantity}`);
                }
                
                // Try to extract price - look for price AFTER the quantity unit (KOM, PC, etc.)
                // This avoids picking up numbers from the product code
                let unitPrice = 0;
                if (qtyMatch) {
                    // Get the part of the line AFTER the quantity unit
                    const afterQty = line.substring(line.indexOf(qtyMatch[0]) + qtyMatch[0].length);
                    const priceMatches = afterQty.match(/(\d{1,}[,\.]\d{2})/g);
                    if (priceMatches && priceMatches.length > 0) {
                        // First price after quantity is the unit price
                        unitPrice = this.parsePrice(priceMatches[0]);
                        console.log(`    Price: €${unitPrice} (extracted from: "${afterQty.substring(0, 30)}...")`);
                    }
                } else {
                    // Fallback: if no quantity found, look for prices after product code
                    const afterCode = line.substring(line.indexOf(flexibleCodeMatch[0]) + flexibleCodeMatch[0].length);
                    const priceMatches = afterCode.match(/(\d{1,}[,\.]\d{2})/g);
                    if (priceMatches && priceMatches.length > 0) {
                        unitPrice = this.parsePrice(priceMatches[0]);
                        console.log(`    Price: €${unitPrice} (fallback)`);
                    }
                }
                
                // Extract product name - everything between code and quantity
                // Remove: row number, product code, quantity+unit, prices
                let productName = line;
                productName = productName.replace(/^\d{4}\s+/, ''); // Remove row number like "0001"
                productName = productName.replace(flexibleCodeMatch[0], ''); // Remove product code
                productName = productName.replace(/\d+\s*(?:KOM|kom|PC|PCS|STK|EA).*$/, ''); // Remove qty onwards
                productName = productName.trim();
                productName = productName.substring(0, 100);
                
                if (productName.length > 3 && !this.isNonProductLine(productName)) {
                    console.log(`  ✅ Flexible extract: [${code}] ${productName} x${quantity} @ €${unitPrice}`);
                    items.push({
                        code: code,
                        name: productName,
                        quantity: quantity,
                        unitPrice: unitPrice,
                        totalPrice: quantity * unitPrice
                    });
                }
                continue;
            }
            
            // Try to extract product code with patterns
            let productCode = '';
            let matchedPattern = '';
            for (const pattern of codePatterns) {
                const match = line.match(pattern);
                if (match && match[1]) {
                    productCode = match[1].trim();
                    matchedPattern = pattern.toString();
                    break;
                }
            }
            
            // If code found, extract rest of info
            if (productCode) {
                console.log(`  🔎 Found code ${productCode} in: "${line}"`);
                
                // Product name is usually on same line or next line
                let productName = line.replace(productCode, '').trim();
                
                // Remove common prefixes
                productName = productName.replace(/^Material\s+No\.?\s*:?\s*/i, '');
                productName = productName.replace(/^[0-9\.\-\s]+/, '').trim();
                productName = productName.replace(/^Pos\.\s*\d+\s*/i, '').trim();
                productName = productName.replace(/^\d{4}\s+/, '').trim();  // Remove row number
                
                // Look for quantity
                let quantity = 1;
                const qtyMatch = line.match(qtyPricePattern);
                if (qtyMatch) {
                    quantity = parseInt(qtyMatch[1] || qtyMatch[2] || qtyMatch[3] || qtyMatch[4] || 1);
                }
                
                // Look for unit price (often at end of line)
                let unitPrice = 0;
                const priceMatches = line.match(pricePattern);
                if (priceMatches) {
                    // If multiple prices found, usually the last one is the line total
                    // But we want unit price. This is tricky without column positions.
                    // We'll take the first one found after the name
                    unitPrice = this.parsePrice(priceMatches[0]);
                }
                
                if (!this.isNonProductLine(productName)) {
                    console.log(`  ✅ Extracted: [${productCode}] ${productName} x${quantity} @ €${unitPrice}`);
                    items.push({
                        code: productCode,
                        name: productName.substring(0, 100),
                        quantity: quantity,
                        unitPrice: unitPrice,
                        totalPrice: quantity * unitPrice
                    });
                }
            }
        }
        
        console.log(`  📊 Total items found: ${items.length}`);
        return items;
    }
    
    // === FILTER NON-PRODUCT LINES ===
    
    isNonProductLine(text) {
        const lowerText = text.toLowerCase();
        
        // Banking/payment terms
        if (lowerText.includes('iban') || 
            lowerText.includes('bic') ||
            lowerText.includes('swift') ||
            lowerText.includes('bank') ||
            lowerText.includes('racun') ||
            lowerText.includes('uplat')) {
            return true;
        }
        
        // Legal/company registration
        if (lowerText.includes('oib') ||
            lowerText.includes('trgov') ||
            lowerText.includes('sud:') ||
            lowerText.includes('kapital') ||
            lowerText.includes('eur upla') ||
            lowerText.includes('mbs:') ||
            lowerText.includes('pdv id')) {
            return true;
        }
        
        // Contact info
        if (lowerText.includes('e-mail') ||
            lowerText.includes('@') ||
            lowerText.includes('office-') ||
            lowerText.includes('tel:') ||
            lowerText.includes('fax:')) {
            return true;
        }
        
        // Payment instructions
        if (lowerText.includes('molimo') ||
            lowerText.includes('doznaci') ||
            lowerText.includes('poziv') ||
            lowerText.includes('model:')) {
            return true;
        }
        
        // Codes that are too long (likely not product codes)
        const codeMatch = text.match(/([A-Z]{2}\d{10,})/);
        if (codeMatch) {
            return true;  // HR48236000011025669794 format
        }
        
        return false;
    }

    // === PRODUCT MATCHING ===
    
    async matchProductsWithInventory(items) {
        // Reload products to get latest data
        await this.loadProducts();
        
        console.log('🔍 Matching products with inventory...');
        const matched = [];
        
        for (const item of items) {
            console.log(`  📦 Processing: [${item.code}] ${item.name}`);
            
            // PRIORITY 1: Match by product code (most reliable)
            let existingProduct = null;
            if (item.code) {
                // Normalize codes for comparison (remove dots, hyphens, spaces, make lowercase)
                const normalizedItemCode = this.normalizeCode(item.code);
                
                existingProduct = this.productsCache.find(p => {
                    if (!p.code) return false;
                    const normalizedDbCode = this.normalizeCode(p.code);
                    return normalizedDbCode === normalizedItemCode;
                });
                
                if (existingProduct) {
                    console.log(`    ✅ MATCHED by code: "${existingProduct.name}" (DB: ${existingProduct.code}, Invoice: ${item.code})`);
                    matched.push({
                        ...item,
                        matched: true,
                        existingProduct: existingProduct,
                        action: 'UPDATE',
                        matchType: 'code'
                    });
                    continue;
                }
            }
            
            // If no code match, mark as NEW product
            console.log(`    ➕ NEW PRODUCT (code not found in inventory)`);
            matched.push({
                ...item,
                matched: false,
                existingProduct: null,
                action: 'ADD_NEW',
                matchType: 'none'
            });
        }
        
        console.log(`  📊 Match results: ${matched.filter(m => m.matched).length} matched, ${matched.filter(m => !m.matched).length} new`);
        return matched;
    }
    
    // Normalize product codes for comparison (removes dots, hyphens, spaces)
    normalizeCode(code) {
        if (!code) return '';
        return code.toLowerCase()
                   .replace(/[\.\-\s]/g, '')  // Remove dots, hyphens, spaces
                   .trim();
    }

    // === PRICING CALCULATION ===
    
    calculatePricingForNewProducts(items) {
        return items.map(item => {
            if (!item.matched) {
                // For new products, calculate selling price
                // unitPrice from invoice = baseCost
                const baseCost = item.unitPrice;
                const costWithVAT = baseCost * 1.20;  // +20% tax
                const sellingPrice = costWithVAT * 1.40;  // +40% profit on cost with VAT
                
                return {
                    ...item,
                    baseCost: baseCost,
                    costWithVAT: costWithVAT,
                    suggestedPrice: sellingPrice,
                    profitMargin: 40  // percentage
                };
            }
            
            return item;
        });
    }

    // === SAVE TO DATABASE ===
    
    async confirmAndSaveToInventory(confirmedItems, invoiceData) {
        if (!confirmedItems || confirmedItems.length === 0) {
            throw new Error('No items to save');
        }
        
        const results = {
            updated: 0,
            added: 0,
            errors: [],
            creditorId: null  // Store creditor ID for later use
        };
        
        console.log('💾 Starting inventory update...');
        
        // Log invoice data for debugging
        console.log('📋 Invoice Data received:');
        console.log('  - Supplier:', invoiceData?.supplier);
        console.log('  - Invoice Number:', invoiceData?.invoiceNumber);
        console.log('  - Total Amount:', invoiceData?.totalAmount);
        console.log('  - Date:', invoiceData?.date);
        
        // First, save invoice to creditor
        if (invoiceData && invoiceData.supplier && invoiceData.invoiceNumber && invoiceData.totalAmount > 0) {
            console.log('✅ Invoice data valid, saving to creditor...');
            try {
                const creditorId = await this.saveInvoiceToCreditor(invoiceData);
                results.creditorId = creditorId;  // Store for later
                console.log(`  📄 Invoice saved to creditor: ${invoiceData.supplier} (ID: ${creditorId})`);
            } catch (error) {
                console.error('  ❌ Error saving invoice to creditor:', error);
                results.errors.push({
                    item: 'Invoice Record',
                    error: error.message
                });
            }
        } else {
            console.warn('⚠️ Invoice data incomplete, skipping creditor save:');
            if (!invoiceData) console.warn('  - invoiceData is null/undefined');
            if (!invoiceData?.supplier) console.warn('  - Missing supplier');
            if (!invoiceData?.invoiceNumber) console.warn('  - Missing invoice number');
            if (!(invoiceData?.totalAmount > 0)) console.warn('  - Total amount is 0 or invalid');
        }
        
        // Then update/add products
        for (const item of confirmedItems) {
            try {
                if (item.action === 'UPDATE' && item.existingProduct) {
                    // UPDATE EXISTING PRODUCT
                    await this.updateExistingProduct(item, invoiceData);
                    results.updated++;
                    console.log(`  ✅ Updated: ${item.name}`);
                    
                } else if (item.action === 'ADD_NEW') {
                    // ADD NEW PRODUCT
                    await this.addNewProduct(item, invoiceData);
                    results.added++;
                    console.log(`  ✨ Added: ${item.name}`);
                }
                
            } catch (error) {
                console.error(`  ❌ Error processing ${item.name}:`, error);
                results.errors.push({
                    item: item.name,
                    error: error.message
                });
            }
        }
        
        console.log('✅ Inventory update complete:', results);
        
        // Reload products cache
        await this.loadProducts();
        
        return results;
    }

    async updateExistingProduct(item, invoiceData) {
        const productRef = this.doc(this.db, 'products', item.existingProduct.id);
        
        // === FIFO & BATCH MANAGEMENT ===
        const currentBatches = item.existingProduct.batches || [];
        
        // If legacy product (no batches), create initial batch from current stock
        if (currentBatches.length === 0 && (item.existingProduct.stock || 0) > 0) {
            currentBatches.push({
                quantity: item.existingProduct.stock || 0,
                cost: item.existingProduct.baseCost || 0,
                date: Date.now(),
                supplier: item.existingProduct.producer || 'Unknown',
                invoice: 'LEGACY_STOCK'
            });
        }

        // Create new batch from invoice
        const newBatch = {
            quantity: item.quantity,
            cost: item.unitPrice,
            date: Date.now(),
            supplier: invoiceData?.supplier || 'Unknown',
            invoice: invoiceData?.invoiceNumber || 'Unknown'
        };
        
        const updatedBatches = [...currentBatches, newBatch];

        // === PRICE WATCHDOG ===
        const oldCost = item.existingProduct.baseCost || 0;
        const newCost = item.unitPrice;
        
        if (oldCost > 0 && Math.abs(newCost - oldCost) > 0.01) {
            const changePercent = ((newCost - oldCost) / oldCost) * 100;
            const icon = changePercent > 0 ? '📈' : '📉';
            console.log(`  ${icon} Price Change for ${item.name}: €${oldCost.toFixed(2)} -> €${newCost.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%)`);
        }

        const updates = {
            baseCost: newCost,  // Update to latest cost (Replacement Cost)
            cost: newCost * 1.20,  // Update display cost with VAT
            stock: (item.existingProduct.stock || 0) + item.quantity,
            batches: updatedBatches, // Save FIFO batches
            lastRestockDate: Date.now()
        };
        
        // If product doesn't have a code yet, add it
        if (!item.existingProduct.code && item.code) {
            updates.code = item.code;
        }
        
        await this.updateDoc(productRef, updates);
        
        console.log(`  📦 ${item.name}: Stock ${item.existingProduct.stock || 0} → ${updates.stock} (+${item.quantity}), Cost €${item.unitPrice}`);
    }

    async addNewProduct(item, invoiceData) {
        const supplier = invoiceData?.supplier || 'Unknown';
        const productsRef = this.collection(this.db, 'products');
        
        // Check if supplier exists, add if not
        const suppliersRef = this.collection(this.db, 'suppliers');
        const suppliersSnapshot = await this.getDocs(suppliersRef);
        const supplierExists = suppliersSnapshot.docs.some(doc => 
            doc.data().name && doc.data().name.toLowerCase() === supplier.toLowerCase()
        );
        
        if (!supplierExists && supplier !== 'Unknown') {
            await this.addDoc(suppliersRef, { name: supplier });
            console.log(`  🏢 Added new supplier: ${supplier}`);
        }
        
        // Create initial batch
        const initialBatch = {
            quantity: item.quantity,
            cost: item.baseCost,
            date: Date.now(),
            supplier: supplier,
            invoice: invoiceData?.invoiceNumber || 'Unknown'
        };

        const newProduct = {
            code: item.code,
            name: item.name,
            producer: supplier,
            baseCost: item.baseCost,
            cost: item.costWithVAT,
            price: item.suggestedPrice,
            stock: item.quantity,
            batches: [initialBatch], // Initialize batches
            createdAt: Date.now()
        };
        
        await this.addDoc(productsRef, newProduct);
        
        console.log(`  ✨ New product: ${item.name} [${item.code}] @ €${item.suggestedPrice.toFixed(2)} (${item.quantity} units)`);
    }

    async saveInvoiceToCreditor(invoiceData) {
        const { supplier, invoiceNumber, totalAmount, date } = invoiceData;
        
        console.log('💰 saveInvoiceToCreditor called with:');
        console.log('  - Supplier:', supplier);
        console.log('  - Invoice Number:', invoiceNumber);
        console.log('  - Total Amount:', totalAmount);
        console.log('  - Date:', date);
        
        if (!supplier || !invoiceNumber || !totalAmount) {
            console.warn('⚠️ Missing required invoice data in saveInvoiceToCreditor');
            return null;
        }
        
        // Check if creditor exists
        const creditorsRef = this.collection(this.db, 'creditors');
        console.log('  🔍 Searching for existing creditor...');
        const creditorsSnapshot = await this.getDocs(creditorsRef);
        console.log(`  📊 Found ${creditorsSnapshot.docs.length} total creditors`);
        
        let creditorId = null;
        const existingCreditor = creditorsSnapshot.docs.find(doc => 
            doc.data().name && doc.data().name.toLowerCase() === supplier.toLowerCase()
        );
        
        if (existingCreditor) {
            creditorId = existingCreditor.id;
            console.log(`  🏢 Found existing creditor: ${supplier} (ID: ${creditorId})`);
        } else {
            // Create new creditor
            console.log(`  ➕ Creating new creditor: ${supplier}`);
            const newCreditorRef = await this.addDoc(creditorsRef, { name: supplier });
            creditorId = newCreditorRef.id;
            console.log(`  🏢 Created new creditor: ${supplier} (ID: ${creditorId})`);
        }
        
        // Add invoice to creditor's invoices subcollection
        const invoicesRef = this.collection(this.db, `creditors/${creditorId}/invoices`);
        console.log(`  📝 Adding invoice to: creditors/${creditorId}/invoices`);
        
        const invoiceRecord = {
            invoiceNumber: invoiceNumber,
            totalAmount: totalAmount,
            date: date || new Date().toISOString().split('T')[0],
            timestamp: Date.now(),
            remainingBalance: totalAmount,  // Initially unpaid
            paid: false
        };
        
        console.log('  💾 Invoice record to save:', invoiceRecord);
        await this.addDoc(invoicesRef, invoiceRecord);
        
        console.log(`  ✅ Invoice ${invoiceNumber} saved successfully: €${totalAmount.toFixed(2)}`);
        
        // Return creditor ID so we can link to it
        return creditorId;
    }

    // === UTILITY METHODS ===
    
    parsePrice(priceString) {
        if (!priceString) return 0;
        
        const str = priceString.toString().trim();
        const cleaned = str.replace(/[^\d,\.]/g, '');
        const normalized = cleaned.replace(',', '.');
        
        return parseFloat(normalized) || 0;
    }

    normalizeDate(dateString) {
        if (!dateString) return '';
        
        try {
            // Handle formats: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
            let parts;
            
            if (dateString.includes('.')) {
                parts = dateString.split('.');
                // DD.MM.YYYY -> DD-MM-YYYY
                if (parts[0].length <= 2) {
                    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
                }
            } else if (dateString.includes('/')) {
                parts = dateString.split('/');
                // DD/MM/YYYY -> DD-MM-YYYY
                if (parts[0].length <= 2) {
                    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${year}`;
                }
            } else if (dateString.includes('-')) {
                parts = dateString.split('-');
                // YYYY-MM-DD -> DD-MM-YYYY
                if (parts[0].length === 4) {
                    return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
                }
                // Already DD-MM-YYYY
                return dateString;
            }
            
            return dateString;
        } catch (error) {
            return dateString;
        }
    }

    async terminate() {
        if (this.ocrWorker) {
            await this.ocrWorker.terminate();
            this.ocrWorker = null;
            this.isInitialized = false;
        }
    }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.SmartInventoryScanner = SmartInventoryScanner;
}
