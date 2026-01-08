// Store Invoice Scanner - Extracts customer name and products from store invoices
class StoreInvoiceScanner {
    constructor() {
        this.ocrWorker = null;
    }

    async initOCR() {
        if (!this.ocrWorker) {
            try {
                // Load Tesseract from CDN
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.2/dist/tesseract.min.js';
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });

                console.log('📚 Tesseract.js loaded');
                this.ocrWorker = await Tesseract.createWorker('eng', 1, {
                    logger: m => console.log('OCR:', m)
                });
                console.log('✅ OCR Worker initialized');
            } catch (error) {
                console.error('❌ Failed to initialize OCR:', error);
                throw new Error('Failed to initialize OCR engine');
            }
        }
    }

    async scanInvoice(imageFile) {
        try {
            await this.initOCR();
            
            console.log('📸 Processing image...');
            const { data: { text } } = await this.ocrWorker.recognize(imageFile);
            console.log('📄 OCR Text extracted:', text);
            
            // Detect invoice type
            const isElectronicInvoice = this.isElectronicInvoice(text);
            
            const extractedData = isElectronicInvoice 
                ? this.extractElectronicInvoiceData(text)
                : this.extractStoreInvoiceData(text);
            
            console.log('✅ Extracted Data:', extractedData);
            
            return extractedData;
        } catch (error) {
            console.error('❌ Scan error:', error);
            throw error;
        }
    }

    isElectronicInvoice(text) {
        const lowerText = text.toLowerCase();
        
        // Check for Albanian electronic invoice indicators
        const indicators = [
            'fature elektronike',
            'faturë elektronike',
            'platforma qendrore e faturave',
            'iban:',
            'swift:',
            'pagesa në llogarinë bankarë',
            'pagesa ne llogarine bankare',
            'blerësi / klienti',
            'bleresi / klienti',
            'artikujt e faturës',
            'artikujt e fatures'
        ];
        
        // If 3 or more indicators found, it's an electronic invoice
        const matchCount = indicators.filter(indicator => lowerText.includes(indicator)).length;
        
        if (matchCount >= 3) {
            console.log('📄 Detected: Albanian Electronic Invoice (Faturë Elektronike)');
            return true;
        }
        
        return false;
    }

    extractElectronicInvoiceData(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const data = {
            customerName: '',
            products: [],
            totalEUR: 0,
            paymentMethod: 'bank-transfer',
            invoiceType: 'electronic'
        };

        console.log('📋 Processing Electronic Invoice -', lines.length, 'lines');
        console.log('📝 First 20 lines:', lines.slice(0, 20));

        // Extract customer name from BLERËSI / KLIENTI section (NOT from SHITËSI section)
        let inSellerSection = false;
        let inBuyerSection = false;
        let buyerSectionStartLine = -1;
        
        // First pass: identify section boundaries
        for (let i = 0; i < lines.length; i++) {
            const lowerLine = lines[i].toLowerCase();
            
            // Detect seller section (SHITËSI) - skip this!
            if (lowerLine.includes('shitësi') || lowerLine.includes('shitesi')) {
                inSellerSection = true;
                inBuyerSection = false;
                console.log('🏢 Found SELLER section at line', i, '- SKIPPING');
            }
            
            // Detect buyer/client section (BLERËSI/KLIENTI) - this is the customer!
            if (lowerLine.includes('blerësi') || lowerLine.includes('bleresi') || lowerLine.includes('klienti')) {
                inSellerSection = false;
                inBuyerSection = true;
                buyerSectionStartLine = i;
                console.log('👤 Found BUYER section at line', i, '- EXTRACTING CUSTOMER');
            }
            
            // Exit buyer section when we hit products or other sections
            if (inBuyerSection && (lowerLine.includes('artikujt') || lowerLine.includes('informacione te fatures'))) {
                console.log('📦 Buyer section ended at line', i);
                break;
            }
            
            // Look for customer name ONLY in buyer section
            if (inBuyerSection && !inSellerSection && i > buyerSectionStartLine) {
                const line = lines[i];
                const lowerLine = line.toLowerCase();
                
                // Pattern 1: "Emi tregtar:" or "Emri tregtar:" (trade name)
                if ((lowerLine.includes('emi tregtar') || lowerLine.includes('emri tregtar')) && 
                    !lowerLine.includes('danfos')) {  // Skip if it's your company
                    const nameMatch = line.match(/em[ri]{1,2}\s*tregtar[:\s-—]+(.+)/i);
                    if (nameMatch && nameMatch[1]) {
                        let name = nameMatch[1].trim().replace(/^[—-]+\s*/, '');
                        // Skip if this is your company name
                        if (name.length > 2 && !name.toLowerCase().includes('danfos')) {
                            data.customerName = name;
                            console.log('✅ Found CUSTOMER (trade name):', name);
                            break;
                        }
                    }
                    // Also try next line
                    if (!data.customerName && i + 1 < lines.length) {
                        const nextName = lines[i + 1].trim();
                        if (nextName.length > 2 && !nextName.toLowerCase().includes('danfos') &&
                            !nextName.toLowerCase().startsWith('nipt') &&
                            !nextName.toLowerCase().startsWith('adres')) {
                            data.customerName = nextName;
                            console.log('✅ Found CUSTOMER (trade name next line):', nextName);
                            break;
                        }
                    }
                }
                
                // Pattern 2: "Emri:" (regular name)
                if ((lowerLine.includes('emri:') || lowerLine.startsWith('emri')) && 
                    !lowerLine.includes('tregtar') && !lowerLine.includes('danfos')) {
                    const nameMatch = line.match(/emri[:\s]+(.+)/i);
                    if (nameMatch && nameMatch[1]) {
                        let name = nameMatch[1].trim();
                        if (name.length > 2 && !name.toLowerCase().includes('danfos')) {
                            data.customerName = name;
                            console.log('✅ Found CUSTOMER (regular name):', name);
                            break;
                        }
                    }
                    
                    // Try next line if name is on separate line
                    if (!data.customerName && i + 1 < lines.length) {
                        const possibleName = lines[i + 1].trim();
                        const possibleLower = possibleName.toLowerCase();
                        if (possibleName.length > 2 && 
                            !possibleLower.startsWith('nipt') &&
                            !possibleLower.startsWith('adres') &&
                            !possibleLower.includes('danfos')) {
                            data.customerName = possibleName;
                            console.log('✅ Found CUSTOMER (next line):', possibleName);
                            break;
                        }
                    }
                }
                
                // Pattern 3: "Emi" at start of line (OCR might read "Emri" as "Emi")
                if (lowerLine.startsWith('emi ') && !lowerLine.includes('tregtar')) {
                    const nameMatch = line.match(/^emi\s+(.+)/i);
                    if (nameMatch && nameMatch[1]) {
                        let name = nameMatch[1].trim();
                        if (name.length > 2 && !name.toLowerCase().includes('danfos')) {
                            data.customerName = name;
                            console.log('✅ Found CUSTOMER (Emi label):', name);
                            break;
                        }
                    }
                }
                
                // Pattern 4: Line after "Emi tregtar:" label if value is on next line
                if (i > 0) {
                    const prevLine = lines[i - 1].toLowerCase();
                    if ((prevLine.includes('emi tregtar') || prevLine.includes('emri tregtar')) &&
                        !lowerLine.includes('nipt') && !lowerLine.includes('adres') &&
                        !lowerLine.includes('danfos') && !lowerLine.includes('shtet') &&
                        line.length > 2 && line.length < 100) {
                        data.customerName = line.trim();
                        console.log('✅ Found CUSTOMER (line after trade name label):', line.trim());
                        break;
                    }
                }
                
                // Pattern 5: Just a name line (no label) - ALL CAPS names like "THE MAID"
                if (!lowerLine.includes('emri') && !lowerLine.includes('emi') &&
                    !lowerLine.includes('nipt') && !lowerLine.includes('adres') &&
                    !lowerLine.includes('shtet') && !lowerLine.includes('danfos') &&
                    !lowerLine.includes('albania') && !lowerLine.includes('tirane') &&
                    line.length > 4 && line.length < 100) {
                    
                    // Check if it looks like a name (has letters, possibly spaces)
                    if (/^[A-ZË][a-zë\s]+$/i.test(line) || /^[A-Z\s]+$/.test(line)) {
                        data.customerName = line.trim();
                        console.log('✅ Found CUSTOMER (standalone name):', line.trim());
                        break;
                    }
                }
            }
        }

        // Extract products from FIRST table only (not detailed specs section)
        let inProductSection = false;
        let productSectionCount = 0;
        let processedProductNumbers = new Set();  // Track which product numbers we've seen
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lowerLine = line.toLowerCase();
            
            // Detect start of product section
            if (lowerLine.includes('artikujt e fatur') && !lowerLine.includes('hollésishém')) {
                productSectionCount++;
                // Only process the FIRST product section
                if (productSectionCount === 1) {
                    inProductSection = true;
                    console.log('📦 Starting product extraction at line', i);
                }
                continue;
            }
            
            // Detect detailed specs section - SKIP this entirely
            if (lowerLine.includes('specifikimi i hollésishém') || lowerLine.includes('specifikimi i hollesishem')) {
                inProductSection = false;
                console.log('⏩ Skipping detailed specs section at line', i);
                break;  // Stop processing, we have everything we need
            }
            
            // End first product section
            if (inProductSection && productSectionCount === 1 && 
                (lowerLine.includes('shpërndarj') || lowerLine.includes('shperndarja') || 
                 lowerLine.includes('total në eur') || lowerLine.includes('total ne eur'))) {
                inProductSection = false;
                console.log('📦 Ending product extraction at line', i);
            }
            
            // Extract products from FIRST table only
            if (inProductSection && productSectionCount === 1) {
                // Albanian invoice format has product info spread across multiple lines:
                // Line 1: Product name with prices (e.g., "SG 4/2 EU 833,33 0,00  S-VAT")
                // Line 2: Number + "Cope" + prices
                // Line 3: Quantity + Total + Price (this is already WITH VAT in "Cmimi bruto per njési")
                
                // Look for the product name line (has product code/name + prices)
                // Example: "SG 4/2 EU 833,33 0,00  S-VAT"
                const productLineMatch = line.match(/^(.+?)\s+(\d+[,.]\d{2})\s+\d+[,.]\d{2}\s+S-?VAT/i);
                
                if (productLineMatch) {
                    const productName = productLineMatch[1].trim();
                    
                    // Skip if this is metadata or non-product
                    if (lowerLine.includes('total') || lowerLine.includes('tvsh') ||
                        lowerLine.includes('shuma') || lowerLine.includes('cmimi bruto') ||
                        lowerLine.includes('vlera') || lowerLine.includes('drejoria') ||
                        lowerLine.includes('informacion') || lowerLine.includes('pert gjtha') ||
                        productName.includes('>') || productName.includes('DPT') ||
                        productName.includes('E-Mail') || productName.length < 3) {
                        continue;
                    }
                    
                    // Look forward 1-3 lines for the line with total price
                    // Example: "1 1 000,00 833,33" - the FIRST big number is total, ignore the last one
                    // But we need price per unit from the table which shows: "1 000,00" for SG, "230,00" for WD
                    let priceWithVAT = 0;
                    for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
                        const nextLine = lines[j].trim();
                        // Look for pattern: quantity + total price + unit price
                        // Format: "1 1 000,00 833,33" - middle number is the total (which equals unit price when qty=1)
                        const priceLineMatch = nextLine.match(/^(\d+)\s+([\d\s,]+[,.]\d{2})/);
                        
                        if (priceLineMatch) {
                            // Second number is the total price (when qty=1, this is the unit price WITH VAT)
                            let priceStr = priceLineMatch[2].replace(/\s/g, '').replace(',', '.');
                            priceWithVAT = parseFloat(priceStr);
                            break;
                        }
                    }
                    
                    if (priceWithVAT > 0) {
                        // Round to 2 decimal places
                        priceWithVAT = Math.round(priceWithVAT * 100) / 100;
                        
                        // Check for duplicates
                        const isDuplicate = data.products.some(p => 
                            p.name === productName && Math.abs(p.price - priceWithVAT) < 0.01
                        );
                        
                        if (!isDuplicate) {
                            data.products.push({
                                name: productName,
                                price: priceWithVAT
                            });
                            console.log(`📦 Product: ${productName} - €${priceWithVAT}`);
                        }
                    }
                }
            }
        }

        // Extract total EUR - look for "Shuma totale me TVSH" (total with VAT)
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
            const line = lines[i];
            const lowerLine = line.toLowerCase();
            
            // Look for "Shuma totale me TVSH: 2 249,00 EUR" - this is total WITH VAT
            if ((lowerLine.includes('shuma totale me tvsh') || lowerLine.includes('shuma totale me tvsh')) && 
                !lowerLine.includes('lek')) {
                
                // Extract number from same line
                const totalMatch = line.match(/(\d[\s,.]?\d{1,3}[,.]\d{2})\s*EUR/i);
                if (totalMatch) {
                    let totalStr = totalMatch[1].replace(/\s/g, '').replace(',', '.');
                    // Handle format like "2 249,00" -> "2249.00"
                    totalStr = totalStr.replace(/[^\d.]/g, '');
                    const totalNum = parseFloat(totalStr);
                    if (totalNum > 0 && totalNum < 1000000) {
                        data.totalEUR = totalNum;
                        console.log('💰 Found total WITH VAT:', data.totalEUR, 'EUR');
                        break;
                    }
                }
                
                // Try next line if not on same line
                if (!data.totalEUR && i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    const nextMatch = nextLine.match(/(\d[\s,.]?\d{1,3}[,.]\d{2})/);
                    if (nextMatch) {
                        let totalStr = nextMatch[1].replace(/\s/g, '').replace(',', '.');
                        totalStr = totalStr.replace(/[^\d.]/g, '');
                        const totalNum = parseFloat(totalStr);
                        if (totalNum > 0 && totalNum < 1000000) {
                            data.totalEUR = totalNum;
                            console.log('💰 Found total WITH VAT (next line):', data.totalEUR, 'EUR');
                            break;
                        }
                    }
                }
            }
        }

        // Fallback: calculate total from products
        if (data.totalEUR === 0 && data.products.length > 0) {
            data.totalEUR = data.products.reduce((sum, p) => sum + p.price, 0);
            console.log('💰 Calculated total from products:', data.totalEUR);
        }

        return data;
    }

    extractStoreInvoiceData(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const data = {
            customerName: '',
            products: [],
            totalEUR: 0,
            paymentMethod: 'cash',
            invoiceType: 'standard'
        };

        console.log('📋 Processing', lines.length, 'lines');

        // Extract customer name (look for "Emri" line or "DETAJET E BLERESIT")
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lowerLine = line.toLowerCase();
            
            // Check for "DETAJET E BLERESIT" (Details of Buyer)
            if (lowerLine.includes('detajet e bleresit')) {
                // The name is usually on the next line
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    if (nextLine.length > 3 && 
                        !nextLine.toLowerCase().includes('nipt') &&
                        !nextLine.toLowerCase().includes('adresa')) {
                        data.customerName = nextLine;
                        console.log('👤 Found customer name (from Detajet):', nextLine);
                        break;
                    }
                }
            }

            // Check if line starts with "Emri" or "emri"
            if (lowerLine.startsWith('emri') || lowerLine.includes('emri ')) {
                // Extract name from same line after "Emri"
                const nameMatch = line.match(/emri\s+(.+)/i);
                if (nameMatch && nameMatch[1]) {
                    const extractedName = nameMatch[1].trim();
                    // Make sure it's not empty and not an ID
                    if (extractedName.length > 3 && 
                        !extractedName.startsWith('ID') &&
                        !extractedName.startsWith('A0')) {
                        data.customerName = extractedName;
                        console.log('👤 Found customer name:', extractedName);
                        break;
                    }
                }
                
                // If not on same line, check next line
                if (!data.customerName && i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    if (nextLine.length > 3 && 
                        !nextLine.startsWith('ID') &&
                        !nextLine.startsWith('A0') &&
                        !nextLine.toLowerCase().includes('tirane') &&
                        !/^\d+/.test(nextLine)) {
                        data.customerName = nextLine;
                        console.log('👤 Found customer name on next line:', nextLine);
                        break;
                    }
                }
            }
            
            // Also check for standalone "ID /AXXXX" pattern and skip it
            if (lowerLine.startsWith('id') && line.includes('/A')) {
                continue;
            }
        }

        // Extract products and prices
        // Format: Product name, then quantity line, then EUR price
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Look for EUR prices (format: number with 2 decimals at end of line)
            const eurMatch = line.match(/(\d+\.\d{2})$/);
            if (eurMatch) {
                const eurPrice = parseFloat(eurMatch[1]);
                
                // Skip if it's a total/tax line
                const lowerLine = line.toLowerCase();
                if (lowerLine.includes('total') || 
                    lowerLine.includes('tvsh') || 
                    lowerLine.includes('para ne dore') ||
                    lowerLine.includes('kursi')) {
                    continue;
                }

                // Look back for product name (should be 1-3 lines before)
                let productName = '';
                for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
                    const prevLine = lines[j];
                    const lowerPrev = prevLine.toLowerCase();
                    
                    // Skip quantity lines (e.g., "1 cope x 25.00")
                    if (lowerPrev.includes('cope') || 
                        lowerPrev.includes(' x ') ||
                        /^\d+\s*x/.test(lowerPrev)) {
                        continue;
                    }
                    
                    // Skip header/system lines
                    if (lowerPrev.includes('emri') ||
                        lowerPrev.includes('kodi') ||
                        lowerPrev.includes('njesia') ||
                        lowerPrev.includes('menyra')) {
                        break;
                    }
                    
                    // Valid product name
                    if (prevLine.length > 3 && !/^\d+\.\d+$/.test(prevLine)) {
                        productName = prevLine;
                        break;
                    }
                }

                if (productName && eurPrice > 0) {
                    // Check if product already added (avoid duplicates)
                    const isDuplicate = data.products.some(p => 
                        p.name === productName && p.price === eurPrice
                    );
                    
                    if (!isDuplicate) {
                        data.products.push({
                            name: productName,
                            price: eurPrice
                        });
                        console.log(`📦 Found product: ${productName} - €${eurPrice}`);
                    }
                }
            }
        }

        // Extract total EUR (look for "TOTAL EUR" line)
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
            const line = lines[i];
            const lowerLine = line.toLowerCase();
            
            if ((lowerLine.includes('total') && lowerLine.includes('eur')) ||
                (lowerLine.includes('para ne dore') && !lowerLine.includes('lek'))) {
                const totalMatch = line.match(/(\d+\.\d{2})/);
                if (totalMatch) {
                    data.totalEUR = parseFloat(totalMatch[1]);
                    console.log('💰 Found total:', data.totalEUR);
                    break;
                }
            }
        }

        // Fallback: sum product prices if total not found
        if (data.totalEUR === 0 && data.products.length > 0) {
            data.totalEUR = data.products.reduce((sum, p) => sum + p.price, 0);
            console.log('💰 Calculated total from products:', data.totalEUR);
        }

        return data;
    }

    async terminate() {
        if (this.ocrWorker) {
            await this.ocrWorker.terminate();
            this.ocrWorker = null;
        }
    }

    /**
     * Process fiscal invoice data from QR code and register sale
     * @param {Object} fiscalData - Fiscal invoice data from QR scanner
     * @returns {Object} - Result with success status and sale ID
     */
    async processFiscalInvoice(fiscalData) {
        console.log('📋 Processing fiscal invoice:', fiscalData);
        
        try {
            // Validate required fields
            if (!fiscalData.invoiceNumber || !fiscalData.total) {
                throw new Error('Missing required invoice fields');
            }

            // Create sale record
            const saleRecord = {
                invoiceNumber: fiscalData.invoiceNumber,
                customerName: fiscalData.customerName || 'Walk-in Customer',
                customerAddress: fiscalData.customerAddress || '',
                customerNIPT: fiscalData.customerNIPT || '',
                nipt: fiscalData.nipt,
                iic: fiscalData.iic,
                items: fiscalData.items || [{
                    name: 'Items from fiscal invoice',
                    quantity: 1,
                    price: fiscalData.total,
                    total: fiscalData.total
                }],
                total: fiscalData.total,
                currency: fiscalData.currency || 'EUR',
                date: fiscalData.date || new Date().toISOString().split('T')[0],
                time: fiscalData.time || new Date().toTimeString().split(' ')[0],
                verificationURL: fiscalData.verificationURL || '',
                businessUnit: fiscalData.businessUnit || '',
                cashRegister: fiscalData.cashRegister || '',
                source: 'fiscal_qr_scan',
                scannedAt: new Date().toISOString(),
                status: 'completed',
                warrantyGenerated: false
            };

            // Add exchange rate if available
            if (fiscalData.exchangeRate) {
                saleRecord.exchangeRate = fiscalData.exchangeRate;
            }
            if (fiscalData.totalLEK) {
                saleRecord.totalLEK = fiscalData.totalLEK;
            }

            console.log('💾 Saving sale to Firebase...');
            
            // Save to Firebase
            const saleRef = await addDoc(collection(db, 'storeSales'), saleRecord);
            const saleId = saleRef.id;
            
            console.log('✅ Sale saved with ID:', saleId);

            // Generate warranty card for items
            try {
                await this.generateWarrantyCard(saleId, saleRecord);
                console.log('✅ Warranty card generated');
            } catch (warrantyError) {
                console.error('⚠️ Warning: Warranty generation failed:', warrantyError);
                // Don't fail the whole process if warranty fails
            }

            return {
                success: true,
                saleId: saleId,
                saleRecord: saleRecord
            };

        } catch (error) {
            console.error('❌ Error processing fiscal invoice:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate warranty cards for items in a sale
     * @param {string} saleId - The sale document ID
     * @param {Object} saleData - The sale data
     */
    async generateWarrantyCard(saleId, saleData) {
        console.log('🎫 Generating warranty cards for sale:', saleId);
        
        try {
            const warranties = [];
            
            // Generate warranty for each item
            for (const item of saleData.items) {
                const warrantyData = {
                    saleId: saleId,
                    invoiceNumber: saleData.invoiceNumber,
                    customerName: saleData.customerName,
                    productName: item.name || 'Product',
                    quantity: item.quantity || 1,
                    price: item.price || item.total || 0,
                    purchaseDate: saleData.date,
                    warrantyPeriod: 24, // Default 24 months
                    expiryDate: this.calculateWarrantyExpiry(saleData.date, 24),
                    status: 'active',
                    createdAt: new Date().toISOString()
                };

                const warrantyRef = await addDoc(collection(db, 'warranties'), warrantyData);
                warranties.push({
                    id: warrantyRef.id,
                    ...warrantyData
                });
                
                console.log('✅ Warranty created for:', item.name);
            }

            // Update sale record to mark warranty as generated
            await updateDoc(doc(db, 'storeSales', saleId), {
                warrantyGenerated: true,
                warrantyIds: warranties.map(w => w.id)
            });

            console.log('✅ All warranties generated and linked to sale');
            
            return warranties;

        } catch (error) {
            console.error('❌ Error generating warranty:', error);
            throw error;
        }
    }

    /**
     * Calculate warranty expiry date
     * @param {string} purchaseDate - Purchase date (YYYY-MM-DD)
     * @param {number} months - Warranty period in months
     * @returns {string} - Expiry date (YYYY-MM-DD)
     */
    calculateWarrantyExpiry(purchaseDate, months) {
        const date = new Date(purchaseDate);
        date.setMonth(date.getMonth() + months);
        return date.toISOString().split('T')[0];
    }
}

// Make it globally available
window.StoreInvoiceScanner = StoreInvoiceScanner;
