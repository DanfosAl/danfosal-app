/**
 * EasyPOS OCR Bridge
 * Watches for captured receipt PNGs from the Print Capture Service
 * and feeds them into the existing OCR subsystem.
 * 
 * Flow: Print Capture Service → PNG/JSON → This Bridge → OCR → Danfosal Firebase Database
 */

const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const Tesseract = require('tesseract.js');
const { getFirestore, getAdmin } = require('./firebase-admin-config');

// Configuration
const CONFIG = {
    watchDir: 'C:\\Danfosal\\Inbox\\EasyPOS',
    processedDir: 'C:\\Danfosal\\Inbox\\EasyPOS\\Processed',
    failedDir: 'C:\\Danfosal\\Inbox\\EasyPOS\\Failed',
    logFile: 'C:\\Danfosal\\Logs\\easypos-ocr-bridge.log',
};

// Ensure directories exist
async function initializeDirectories() {
    try {
        await fs.ensureDir(CONFIG.processedDir);
        await fs.ensureDir(CONFIG.failedDir);
        await fs.ensureDir(path.dirname(CONFIG.logFile));
        log('✓ Directories initialized');
    } catch (error) {
        console.error('Failed to initialize directories:', error);
        throw error;
    }
}

// Logging
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    console.log(logMessage.trim());
    fs.appendFileSync(CONFIG.logFile, logMessage);
}

// OCR Processing
class EasyPOSOCRProcessor {
    constructor() {
        this.isProcessing = new Set(); // Track files being processed
    }

    async processReceipt(jsonPath) {
        const baseName = path.basename(jsonPath, '.json');
        
        // Prevent duplicate processing
        if (this.isProcessing.has(baseName)) {
            log(`Skipping ${baseName} - already processing`, 'DEBUG');
            return;
        }

        this.isProcessing.add(baseName);
        
        try {
            log(`Processing: ${baseName}`);
            
            // Read metadata
            const metadata = await fs.readJson(jsonPath);
            const pngPath = path.join(CONFIG.watchDir, `${baseName}.png`);
            
            // Verify PNG exists
            if (!await fs.pathExists(pngPath)) {
                throw new Error(`PNG file not found: ${pngPath}`);
            }

            // Wait a bit to ensure file is fully written
            await this.waitForFileStability(pngPath);

            // Perform OCR
            log(`Running OCR on ${baseName}...`);
            const ocrResult = await this.performOCR(pngPath);
            
            // Check if this is a "Veprim Arke" daily start marker (not a real invoice)
            if (ocrResult.text.includes('Veprim Arke') || ocrResult.text.includes('VEPRIM ARKE')) {
                log(`⏭️  Skipping "Veprim Arke" daily start marker (not a real invoice)`, 'INFO');
                await this.moveToProcessed(jsonPath, pngPath, baseName);
                return;
            }
            
            // Extract invoice data
            const invoiceData = this.extractInvoiceData(ocrResult.text, metadata);
            
            // Save to database (integrate with existing system)
            await this.saveToDatabase(invoiceData);
            
            // Move to processed
            await this.moveToProcessed(jsonPath, pngPath, baseName);
            
            log(`✓ Successfully processed: ${baseName}`, 'SUCCESS');
            
        } catch (error) {
            log(`✗ Failed to process ${baseName}: ${error.message}`, 'ERROR');
            await this.moveToFailed(jsonPath, baseName, error.message);
        } finally {
            this.isProcessing.delete(baseName);
        }
    }

    async waitForFileStability(filePath, maxAttempts = 10, delayMs = 200) {
        let lastSize = -1;
        for (let i = 0; i < maxAttempts; i++) {
            const stats = await fs.stat(filePath);
            if (stats.size > 0 && stats.size === lastSize) {
                return;
            }
            lastSize = stats.size;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    async performOCR(imagePath) {
        try {
            const worker = await Tesseract.createWorker('eng');
            const result = await worker.recognize(imagePath);
            await worker.terminate();
            return result.data;
        } catch (error) {
            throw new Error(`OCR failed: ${error.message}`);
        }
    }

    extractInvoiceData(ocrText, metadata) {
        // Danfosal-specific extraction for customer analytics and inventory tracking
        const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l);
        
        // Extract customer information
        const customerInfo = this.extractCustomerInfo(lines);
        
        // Extract invoice details
        const invoiceData = {
            source: 'EasyPOS_PrintCapture',
            captureJobId: metadata.jobId,
            captureTimestamp: metadata.timestamp,
            rawText: ocrText,
            
            // Customer analytics fields
            customerName: customerInfo.name,
            customerAddress: customerInfo.address,
            customerNIPT: customerInfo.nipt,
            
            // Invoice details
            invoiceNumber: this.findInvoiceNumber(lines),
            invoiceDate: this.findDate(lines),
            
            // Financial data
            grandTotal: this.findGrandTotal(lines),
            currency: this.findCurrency(lines),
            
            // Inventory tracking
            items: this.extractItems(lines),

            // Hand-written serial numbers from the SHENIME box (feeds warranty records)
            serialNumbers: this.extractSerialNumbers(lines),
            
            // Raw data for debugging
            _debug: {
                rawText: ocrText,
                lineCount: lines.length
            }
        };
        
        return invoiceData;
    }

    extractCustomerInfo(lines) {
        let customerName = 'Walk-in Customer';
        let customerAddress = '';
        let customerNIPT = '';
        
        // Find "DETAJET E BLERESIT" section
        const customerSectionIndex = lines.findIndex(line => 
            line.includes('DETAJET E BLERESIT') || line.includes('DETAJET E BLERES')
        );
        
        if (customerSectionIndex !== -1) {
            // Extract customer name (usually right after "Emri" label)
            for (let i = customerSectionIndex + 1; i < Math.min(customerSectionIndex + 10, lines.length); i++) {
                const line = lines[i];
                
                // The label and the value share one OCR line, e.g. "Emri Fusionfit Solutions".
                // OCR regularly mangles the label itself ("Emr", "Emri:", "Emri."), and the old
                // code only accepted an exact "Emri" prefix - anything else fell through to the
                // raw-line branch below and stored the label as part of the name, which is how
                // "Emr Aldi Gegolli" ended up in the database as a customer.
                const labelledName = line.match(/^E\s*m\s*r?\s*[i1l]?\s*[:.]?\s+(.+)$/i);
                if (labelledName && labelledName[1].trim()) {
                    customerName = labelledName[1].trim();
                } else if (i === customerSectionIndex + 1 && !line.startsWith('NIPT') && !line.startsWith('Adresa')) {
                    // If no "Emri" label, assume first line after section header is the name
                    if (line.length > 2 && !line.match(/^\d/)) {
                        customerName = line;
                    }
                }
                
                // Extract NIPT
                if (line.startsWith('NIPT')) {
                    const niptMatch = line.match(/NIPT[:\s]+([A-Z0-9]+)/);
                    if (niptMatch) {
                        customerNIPT = niptMatch[1];
                    }
                }
                
                // Extract Address (starts with "Adresa" or follows NIPT)
                if (line.startsWith('Adresa') || (customerAddress === '' && i > customerSectionIndex + 2 && line.includes('Rruga'))) {
                    // Collect address lines until we hit an empty line or next section
                    // The address is followed on the receipt by the country code and then the item
                    // lines, and collecting a fixed five lines ran straight into them: 106 customer
                    // profiles ended up with addresses like "...Korce, ALB, Qese per T11/1,
                    // 10 cope X 2.00 20.00" (cleaned 21 Sep 2026). Stop at the country code, at any
                    // quantity/price line, or at a section heading.
                    const endOfAddress = /^(ALB|ALBANIA|SHQIP[EË]RI)\b|cop[eë]\s*x\s*\d|\d+[.,]\d{2}\s+\d+[.,]\d{2}\s*$|^(TOTAL|ARTIKU|EM[EË]RTIM|P[EË]RSHKRIM|SASIA|SH[EË]NIME)/i;
                    let addressLines = [];
                    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
                        const addrLine = lines[j];
                        if (addrLine.startsWith('Adresa')) continue;
                        if (addrLine.length < 3 || addrLine.match(/^[A-Z]\s*\d/)) break; // Stop at item lines
                        if (endOfAddress.test(addrLine.trim())) break;
                        addressLines.push(addrLine);
                    }
                    // Safety net for a country code OCR'd onto the same line as the address.
                    customerAddress = addressLines.join(', ').replace(/,\s*ALB\b[\s\S]*$/i, '').trim();
                    break;
                }
            }
        }
        
        // If OCR gave us the bare label with no value after it, that is not a customer name -
        // fall back rather than creating a customer record literally called "Emri".
        if (/^E\s*m\s*r?\s*[i1l]?\s*[:.]?$/i.test(customerName.trim())) {
            customerName = 'Walk-in Customer';
        }

        return {
            name: customerName,
            address: customerAddress,
            nipt: customerNIPT
        };
    }
    
    /**
     * Serial numbers are typed by hand into the receipt's SHENIME (notes) box, e.g.
     * "S/N:527483". OCR almost always reads the slash as a letter, so the label comes
     * through as "SIN:", "S|N:", "S1N:" etc - match those variants, not just "S/N".
     * Returns every serial found, in receipt order.
     */
    extractSerialNumbers(lines) {
        const serials = [];
        for (const line of lines) {
            // S/N, SIN, S|N, S1N, SN - optional separator - the value itself
            const match = line.match(/\bS\s*[\/|1I lL]?\s*N\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,})/i);
            if (match) {
                const value = match[1].trim().replace(/[.,;]+$/, '');
                if (value && !serials.includes(value)) {
                    serials.push(value);
                }
            }
        }
        return serials;
    }

    findInvoiceNumber(lines) {
        for (const line of lines) {
            // EasyPOS format: "Fatura Nr: 68/2026/mv200vz195"
            const match = line.match(/Fatura\s+Nr[:\s]+([\w\/]+)/i) || 
                          line.match(/(?:invoice|receipt|no|#)\s*:?\s*([\w\/]+)/i);
            if (match) return match[1];
        }
        return null;
    }

    findDate(lines) {
        for (const line of lines) {
            // EasyPOS format: "Data/Ora: 07/02/2026 16:18:08"
            if (line.includes('Data/Ora') || line.includes('Data:')) {
                const match = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
                if (match) return match[1];
            }
        }
        // Fallback: try any date format
        for (const line of lines) {
            const match = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
            if (match) return match[0];
        }
        return null;
    }
    
    findCurrency(lines) {
        // Look for "Valuta EUR" or currency in total line
        for (const line of lines) {
            if (line.includes('Valuta')) {
                const match = line.match(/Valuta\s+(\w+)/);
                if (match) return match[1];
            }
        }
        return 'EUR'; // Default
    }

    findGrandTotal(lines) {
        // Priority 1: Look for "TOTAL EUR" specifically
        for (const line of lines) {
            if (line.includes('TOTAL EUR')) {
                const match = line.match(/TOTAL\s+EUR\s+(-?[0-9,]+\.?\d*)/);  // ✅ Added -? for negative
                if (match) return parseFloat(match[1].replace(/,/g, ''));
            }
        }
        
        // Priority 2: Look for "TOTAL" in any context
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (line.startsWith('TOTAL')) {
                const match = line.match(/(-?[0-9,]+\.?\d*)/);  // ✅ Added -? for negative
                if (match) return parseFloat(match[1].replace(/,/g, ''));
            }
        }
        
        return null;
    }

    extractItems(lines) {
        // Extract line items from EasyPOS receipt format
        const items = [];
        let inItemSection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Start parsing after customer section and before totals
            if (line.includes('DETAJET E BLERESIT')) {
                inItemSection = false; // Skip customer section
                continue;
            }
            if (line.startsWith('TOTAL')) {
                break; // Stop at totals
            }
            
            // Look for item name lines (e.g., "K 5 Basic *EU")
            // Followed by quantity and price line (e.g., "1 cope X 340.00 340.00" or "-1 cope X 99.00 -99.00" for returns)
            if (i < lines.length - 1 && !line.match(/^-?\d+\s+cope/)) {
                const nextLine = lines[i + 1];
                const itemLineMatch = nextLine.match(/^(-?\d+)\s+cope\s+X\s+([0-9.]+)\s+(-?[0-9.]+)/);  // ✅ Added -? for negatives
                
                if (itemLineMatch) {
                    const itemName = line.trim();
                    const quantity = parseInt(itemLineMatch[1]);
                    const pricePerUnit = parseFloat(itemLineMatch[2]);
                    const lineTotal = parseFloat(itemLineMatch[3]);
                    
                    // Only add if we have valid data
                    if (itemName && !itemName.match(/^(NIPT|Data|Fatura|Kodi|Njesia|Menyrat|Valuta|Kursi|DETAJET)/)) {
                        items.push({
                            itemName: itemName,
                            quantity: quantity,
                            pricePerUnit: pricePerUnit,
                            lineTotal: lineTotal
                        });
                        i++; // Skip the next line since we've processed it
                    }
                }
            }
        }
        
        return items;
    }

    async saveToDatabase(invoiceData) {
        try {
            const db = getFirestore();
            const admin = getAdmin();
            
            log(`💾 [SMART BRAIN] Analyzing invoice...`);
            
            // ===== STEP 1: Check Invoice History (Duplicate Detection) =====
            const invoiceNumber = invoiceData.invoiceNumber;
            if (invoiceNumber) {
                const existingSale = await this.findDuplicateSale(db, invoiceData);
                if (existingSale) {
                    log(`   ⚠️  REPRINT: Invoice ${invoiceNumber} already recorded as sale ${existingSale.id}`, 'WARN');
                    log(`   → Same date, total and items - skipping so it is not counted twice`);
                    return { success: true, action: 'duplicate_skipped', invoiceNumber, existingSaleId: existingSale.id };
                }
            }
            
            // ===== STEP 2: Detect Returns/Cancellations =====
            const returnInfo = this.detectReturnOrCancellation(invoiceData);
            if (returnInfo.isReturn) {
                log(`   🔄 RETURN DETECTED: ${returnInfo.reason}`);
                return await this.processReturn(db, admin, invoiceData, returnInfo);
            }
            
            // ===== STEP 3: Smart Customer Deduplication (Name-based) =====
            let customerId = null;
            let customerReference = null;
            
            if (invoiceData.customerName && invoiceData.customerName !== 'Walk-in Customer') {
                customerId = await this.findOrCreateCustomer(db, admin, invoiceData);
                customerReference = invoiceData.customerName;
                log(`   ✓ Customer: ${customerReference} (ID: ${customerId})`);
                
                // Add invoice to customer's history
                if (customerId && invoiceNumber) {
                    await this.addInvoiceToCustomerHistory(db, customerId, invoiceNumber);
                    log(`   ✓ Invoice added to customer history`);
                }
            } else {
                customerReference = 'Walk-in Customer';
                log(`   ✓ Customer: Walk-in (no record created)`);
            }
            
            // ===== STEP 4: Online Order Matching (Smart Mapping) =====
            const matchedOrder = await this.findMatchingOnlineOrder(db, customerReference, invoiceData.items);
            
            if (matchedOrder) {
                log(`   🎯 ONLINE ORDER MATCHED: ${matchedOrder.orderId}`);
                log(`   → Updating order status to 'Processing'`);
                await this.updateOnlineOrderStatus(db, matchedOrder.orderId, 'Processing', invoiceData);
                
                // Create storeSales entry with linked order ID (for cancellation tracking)
                log(`   → Creating storeSales entry with order linkage...`);
                
                const saleItems = await this.buildSaleItems(db, invoiceData);

                const saleData = {
                    items: saleItems.map(({ _matchedProductId, ...rest }) => rest),
                    total: invoiceData.grandTotal || 0,
                    paymentMethod: 'unknown',
                    notes: `EasyPOS Import - Online Order ${matchedOrder.orderId}`,
                    timestamp: admin.firestore.Timestamp.now(),
                    type: 'easypos',
                    clientName: customerReference,
                    linkedOrderId: matchedOrder.orderId,  // ✅ Link to online order for cancellation tracking
                    wasOnlineOrder: true,
                    easypos: {
                        invoiceNumber: invoiceData.invoiceNumber,
                        invoiceDate: invoiceData.invoiceDate,
                        currency: invoiceData.currency,
                        customerNIPT: invoiceData.customerNIPT || null,
                        customerAddress: invoiceData.customerAddress || null,
                        captureJobId: invoiceData.captureJobId,
                        captureTimestamp: invoiceData.captureTimestamp,
                        source: 'print-capture'
                    }
                };
                
                if (customerId) {
                    saleData.customerId = customerId;
                }
                
                const saleRef = await db.collection('storeSales').add(saleData);
                log(`   ✓ Sale entry created: ${saleRef.id} (linked to order ${matchedOrder.orderId})`);

                await this.deductStockForSale(db, admin, saleItems);

                return {
                    success: true,
                    action: 'online_order_matched',
                    orderId: matchedOrder.orderId,
                    saleId: saleRef.id,
                    invoiceNumber
                };
            }
            
            // ===== STEP 5: Register as New Walk-in Sale =====
            log(`   📝 Registering as new walk-in sale...`);
            
            // Prepare sale items for Danfosal format (matched to the product catalogue)
            const saleItems = await this.buildSaleItems(db, invoiceData);

            // Create sale record
            const saleData = {
                items: saleItems.map(({ _matchedProductId, ...rest }) => rest),
                total: invoiceData.grandTotal || 0,
                paymentMethod: 'unknown', // EasyPOS doesn't capture this
                notes: `EasyPOS Import - Invoice: ${invoiceData.invoiceNumber || 'N/A'}`,
                timestamp: admin.firestore.Timestamp.now(),
                type: 'easypos',
                clientName: customerReference,
                
                // EasyPOS-specific metadata
                easypos: {
                    invoiceNumber: invoiceData.invoiceNumber,
                    invoiceDate: invoiceData.invoiceDate,
                    currency: invoiceData.currency,
                    customerNIPT: invoiceData.customerNIPT || null,
                    customerAddress: invoiceData.customerAddress || null,
                    captureJobId: invoiceData.captureJobId,
                    captureTimestamp: invoiceData.captureTimestamp,
                    source: 'print-capture'
                }
            };
            
            // Add customer ID if available
            if (customerId) {
                saleData.customerId = customerId;
            }
            
            const saleRef = await db.collection('storeSales').add(saleData);
            log(`   ✓ Sale created: ${saleRef.id}`);
            log(`   ✓ Total: ${invoiceData.currency} ${invoiceData.grandTotal}`);
            log(`   ✓ Items: ${saleItems.length} products`);

            await this.deductStockForSale(db, admin, saleItems);
            
            // Save debug JSON for manual review
            const dbLogPath = path.join(CONFIG.processedDir, `${invoiceData.captureTimestamp}_data.json`);
            await fs.writeJson(dbLogPath, {
                ...invoiceData,
                _database: {
                    saleId: saleRef.id,
                    customerId: customerId,
                    insertedAt: new Date().toISOString()
                }
            }, { spaces: 2 });
            
            log(`✅ Database save complete!`, 'SUCCESS');
            
            return {
                success: true,
                saleId: saleRef.id,
                customerId: customerId
            };
            
        } catch (error) {
            log(`❌ Database save failed: ${error.message}`, 'ERROR');
            console.error('Full error:', error);
            
            // Still save JSON for manual recovery
            const dbLogPath = path.join(CONFIG.processedDir, `${invoiceData.captureTimestamp}_data.json`);
            await fs.writeJson(dbLogPath, {
                ...invoiceData,
                _error: {
                    message: error.message,
                    failedAt: new Date().toISOString()
                }
            }, { spaces: 2 });
            
            throw error; // Re-throw to trigger failed processing
        }
    }
    
    async findOrCreateCustomer(db, admin, invoiceData) {
        try {
            const customerName = invoiceData.customerName;
            const customerNIPT = invoiceData.customerNIPT || '';
            
            log(`   🔍 Searching for existing customer by name...`);
            
            // ===== PRIMARY STRATEGY: Search by Customer Name (Exact Match) =====
            let customerSnapshot = await db.collection('customers')
                .where('name', '==', customerName)
                .limit(1)
                .get();
            
            if (!customerSnapshot.empty) {
                const customerId = customerSnapshot.docs[0].id;
                log(`   ✓ Found by name: ${customerName} → ${customerId}`);
                return customerId;
            }
            
            // ===== FALLBACK: Fuzzy name match (case-insensitive, trimmed) =====
            const normalizedName = customerName.toLowerCase().trim();
            const allCustomers = await db.collection('customers').get();
            
            for (const doc of allCustomers.docs) {
                const existingName = (doc.data().name || '').toLowerCase().trim();
                if (existingName === normalizedName) {
                    const customerId = doc.id;
                    log(`   ✓ Found by fuzzy name match: ${customerName} → ${customerId}`);
                    return customerId;
                }
            }
            
            // No match found - create new customer
            log(`   → No existing customer found, creating new...`);
            const newCustomerData = {
                name: customerName,
                email: '', // EasyPOS doesn't provide email
                phone: '', // EasyPOS doesn't provide phone
                address: invoiceData.customerAddress || '',
                status: 'Active',
                image: '',
                nipt: customerNIPT, // Optional metadata
                source: 'easypos-import',
                createdAt: new Date().toISOString(),
                invoiceHistory: [] // Initialize empty invoice history array
            };
            
            const customerRef = await db.collection('customers').add(newCustomerData);
            log(`   → New customer created: ${customerRef.id}`);
            
            return customerRef.id;
            
        } catch (error) {
            log(`   ⚠ Customer creation failed: ${error.message}`, 'WARN');
            return null; // Continue without customer linkage
        }
    }

    async moveToProcessed(jsonPath, pngPath, baseName) {
        const destDir = CONFIG.processedDir;
        
        await fs.move(jsonPath, path.join(destDir, `${baseName}.json`), { overwrite: true });
        await fs.move(pngPath, path.join(destDir, `${baseName}.png`), { overwrite: true });
        
        // Also move the raw files if they exist
        const rawDir = path.join(CONFIG.watchDir, 'Raw');
        const rawSpl = path.join(rawDir, `${baseName}.spl`);
        const rawEmf = path.join(rawDir, `${baseName}.emf`);
        
        if (await fs.pathExists(rawSpl)) {
            await fs.move(rawSpl, path.join(destDir, `${baseName}.spl`), { overwrite: true });
        }
        if (await fs.pathExists(rawEmf)) {
            await fs.move(rawEmf, path.join(destDir, `${baseName}.emf`), { overwrite: true });
        }
    }

    async moveToFailed(jsonPath, baseName, errorMessage) {
        const failedDir = CONFIG.failedDir;
        
        try {
            const pngPath = path.join(CONFIG.watchDir, `${baseName}.png`);
            
            if (await fs.pathExists(jsonPath)) {
                await fs.move(jsonPath, path.join(failedDir, `${baseName}.json`), { overwrite: true });
            }
            if (await fs.pathExists(pngPath)) {
                await fs.move(pngPath, path.join(failedDir, `${baseName}.png`), { overwrite: true });
            }
            
            // Write error log
            const errorLogPath = path.join(failedDir, `${baseName}.error.txt`);
            await fs.writeFile(errorLogPath, `Error: ${errorMessage}\nTimestamp: ${new Date().toISOString()}`);
            
        } catch (err) {
            log(`Failed to move files to Failed directory: ${err.message}`, 'ERROR');
        }
    }
    
    // ===== SMART BRAIN METHODS =====
    
    /**
     * Add invoice number to customer's invoice history array
     * Prevents duplicates by checking if invoice already exists
     */
    async addInvoiceToCustomerHistory(db, customerId, invoiceNumber) {
        try {
            const customerRef = db.collection('customers').doc(customerId);
            const customerDoc = await customerRef.get();
            
            if (!customerDoc.exists) {
                log(`   ⚠️  Customer ${customerId} not found`, 'WARN');
                return;
            }
            
            const customerData = customerDoc.data();
            const invoiceHistory = customerData.invoiceHistory || [];
            
            // Check if invoice already exists in history
            if (invoiceHistory.includes(invoiceNumber)) {
                log(`   → Invoice ${invoiceNumber} already in customer history`, 'DEBUG');
                return;
            }
            
            // Add invoice number to array
            await customerRef.update({
                invoiceHistory: [...invoiceHistory, invoiceNumber],
                lastInvoiceDate: new Date().toISOString()
            });
            
            log(`   → Added invoice ${invoiceNumber} to customer history (total: ${invoiceHistory.length + 1})`);
            
        } catch (error) {
            log(`   ⚠️  Failed to update customer invoice history: ${error.message}`, 'WARN');
        }
    }
    
    /**
     * Check if invoice was already processed (duplicate detection)
     * Checks all customers' invoice history arrays
     */
    async checkInvoiceHistory(db, invoiceNumber) {
        try {
            // Search across all customers for this invoice number
            const customersSnapshot = await db.collection('customers')
                .where('invoiceHistory', 'array-contains', invoiceNumber)
                .limit(1)
                .get();

            return !customersSnapshot.empty;
        } catch (error) {
            log(`   ⚠️  Invoice history check failed: ${error.message}`, 'WARN');
            return false; // Proceed with processing if check fails
        }
    }

    /**
     * Reprint detection.
     *
     * The old guard (checkInvoiceHistory) only looked at customers.invoiceHistory, which is
     * never written for walk-in sales - so reprinting a walk-in receipt silently created a
     * second sale every time. Every duplicate found in production was a walk-in.
     *
     * It deliberately does NOT match on invoice number alone: EasyPOS has been observed
     * printing the same "Fatura Nr" for genuinely different sales on different days
     * (189/2026 appeared on 29/04 for EUR 30 and again on 04/05 for EUR 340 - both real,
     * both verified against the stored receipt images). Matching on number alone would
     * silently discard the second real sale, which is far worse than a duplicate.
     *
     * A reprint is therefore: same invoice number AND same invoice date AND same total
     * AND the same set of item name/quantity pairs.
     */
    async findDuplicateSale(db, invoiceData) {
        const invoiceNumber = invoiceData.invoiceNumber;
        if (!invoiceNumber) return null;

        try {
            const snapshot = await db.collection('storeSales')
                .where('easypos.invoiceNumber', '==', invoiceNumber)
                .get();

            if (snapshot.empty) return null;

            const signature = (items) => (items || [])
                .map(i => `${(i.name || i.itemName || '').trim().toLowerCase()}x${i.quantity}`)
                .sort()
                .join('|');

            const incomingSignature = signature(invoiceData.items);
            const incomingTotal = Number(invoiceData.grandTotal) || 0;

            for (const doc of snapshot.docs) {
                const existing = doc.data();
                const sameDate = (existing.easypos && existing.easypos.invoiceDate) === invoiceData.invoiceDate;
                const sameTotal = Math.abs((Number(existing.total) || 0) - incomingTotal) < 0.01;
                const sameItems = signature(existing.items) === incomingSignature;

                if (sameDate && sameTotal && sameItems) {
                    return { id: doc.id, ...existing };
                }
            }

            return null;
        } catch (error) {
            log(`   ⚠️  Reprint check failed: ${error.message}`, 'WARN');
            return null; // Proceed with processing if the check itself fails
        }
    }
    
    /**
     * Detect if this is a return or cancellation based on:
     * - Negative total values
     * - Keywords in invoice text ("RETURN", "CANCEL", "REFUND", "STORNO")
     * - Albanian credit note keywords ("NOTE KREDITI", "KORRIGJUESE")
     * - Invoice number patterns (e.g., starts with "R-" or "RET-")
     */
    detectReturnOrCancellation(invoiceData) {
        const total = invoiceData.grandTotal || 0;
        const invoiceNumber = invoiceData.invoiceNumber || '';
        const rawText = invoiceData.rawText || '';
        
        // Check 1: Negative total
        if (total < 0) {
            return { isReturn: true, reason: 'Negative total amount', returnType: 'return' };
        }
        
        // Check 2: Albanian credit note keywords (most common in EasyPOS)
        const creditNoteKeywords = ['NOTE KREDITI', 'NOTA KREDITI', 'KORRIGJUESE', 'KREDITORE'];
        for (const keyword of creditNoteKeywords) {
            if (rawText.toUpperCase().includes(keyword)) {
                return { isReturn: true, reason: `Albanian credit note detected: ${keyword}`, returnType: 'return' };
            }
        }
        
        // Check 3: Return keywords in text
        const returnKeywords = ['RETURN', 'REFUND', 'STORNO', 'ANULIM', 'KTHIM'];
        for (const keyword of returnKeywords) {
            if (rawText.toUpperCase().includes(keyword)) {
                return { isReturn: true, reason: `Keyword detected: ${keyword}`, returnType: 'return' };
            }
        }
        
        // Check 4: Cancellation keywords
        const cancelKeywords = ['CANCEL', 'CANCELLED', 'VOID', 'ANULLO', 'ANULLUAR'];
        for (const keyword of cancelKeywords) {
            if (rawText.toUpperCase().includes(keyword)) {
                return { isReturn: true, reason: `Keyword detected: ${keyword}`, returnType: 'cancellation' };
            }
        }
        
        // Check 5: Invoice number pattern
        if (invoiceNumber.match(/^(R-|RET-|RETURN-|REFUND-)/i)) {
            return { isReturn: true, reason: 'Return invoice number pattern', returnType: 'return' };
        }
        
        return { isReturn: false };
    }
    
    /**
     * Process return/cancellation transaction
     */
    async processReturn(db, admin, invoiceData, returnInfo) {
        log(`   🔄 Processing ${returnInfo.returnType}...`);
        
        // ===== STEP 1: Check if this invoice was linked to an online order OR in-store sale =====
        const originalTransaction = await this.findOriginalTransaction(db, invoiceData);
        
        if (originalTransaction) {
            if (originalTransaction.type === 'onlineOrder') {
                // Handle online order return
                log(`   🔗 Found linked online order: ${originalTransaction.orderId}`);
                log(`   → Marking order as 'Returned'`);
                
                await db.collection('onlineOrders').doc(originalTransaction.orderId).update({
                    status: 'Returned',
                    returnedAt: new Date().toISOString(),
                    returnReason: returnInfo.reason,
                    returnType: returnInfo.returnType,
                    cancelledInvoiceNumber: invoiceData.invoiceNumber
                });
                
                log(`   ✓ Online order ${originalTransaction.orderId} marked as Returned`);
            } else if (originalTransaction.type === 'storeSale') {
                // Handle in-store sale return (walk-in customer)
                log(`   🔗 Found original in-store sale: ${originalTransaction.saleId}`);
                log(`   → Marking sale as 'Returned'`);
                
                await db.collection('storeSales').doc(originalTransaction.saleId).update({
                    status: 'Returned',
                    returnedAt: new Date().toISOString(),
                    returnReason: returnInfo.reason,
                    returnType: returnInfo.returnType,
                    cancelledInvoiceNumber: invoiceData.invoiceNumber
                });
                
                log(`   ✓ In-store sale ${originalTransaction.saleId} marked as Returned`);
            }
        } else {
            log(`   → No linked transaction found for ${invoiceData.customerName || 'customer'}`);
        }
        
        // ===== STEP 2: Record the return transaction =====
        const returnData = {
            type: returnInfo.returnType,
            reason: returnInfo.reason,
            invoiceNumber: invoiceData.invoiceNumber,
            invoiceDate: invoiceData.invoiceDate,
            customerName: invoiceData.customerName,
            total: Math.abs(invoiceData.grandTotal || 0),
            currency: invoiceData.currency,
            items: invoiceData.items,
            timestamp: admin.firestore.Timestamp.now(),
            linkedOrderId: originalTransaction && originalTransaction.type === 'onlineOrder' ? originalTransaction.orderId : null,
            linkedSaleId: originalTransaction && originalTransaction.type === 'storeSale' ? originalTransaction.saleId : null,
            wasOnlineOrder: originalTransaction && originalTransaction.type === 'onlineOrder',
            wasStoreSale: originalTransaction && originalTransaction.type === 'storeSale',
            easypos: {
                captureJobId: invoiceData.captureJobId,
                captureTimestamp: invoiceData.captureTimestamp,
                source: 'print-capture'
            }
        };
        
        const returnRef = await db.collection('returns').add(returnData);
        log(`   ✓ Return recorded: ${returnRef.id}`);
        
        // ===== STEP 3: Update stock (add items back to inventory) =====
        await this.updateStockForReturn(db, admin, invoiceData.items);
        log(`   ✓ Stock updated (items returned to inventory)`);
        
        log(`✅ ${returnInfo.returnType.toUpperCase()} processed successfully!`, 'SUCCESS');
        
        return {
            success: true,
            action: returnInfo.returnType,
            returnId: returnRef.id,
            invoiceNumber: invoiceData.invoiceNumber,
            linkedOrderId: linkedOrder ? linkedOrder.orderId : null
        };
    }
    
    /**
     * Find original transaction (online order OR in-store sale) linked to a return/cancellation
     * Searches using multiple strategies:
     * 1. Search storeSales by invoice number → return sale (even for walk-in) or linkedOrderId
     * 2. Search onlineOrders by linkedInvoiceNumber
     * 3. FALLBACK: Search by customer name + matching amount (for OCR errors)
     */
    async findOriginalTransaction(db, invoiceData) {
        const invoiceNumber = invoiceData.invoiceNumber;
        const customerName = invoiceData.customerName;
        const total = Math.abs(invoiceData.grandTotal || 0);
        
        try {
            log(`   🔍 Searching for original transaction (online order or in-store sale) for invoice ${invoiceNumber}...`);
            
            // Strategy 1: Search storeSales for this invoice
            if (invoiceNumber && invoiceNumber.length > 2) {  // Skip if invoice number is too short (OCR error)
                const salesSnapshot = await db.collection('storeSales')
                    .where('easypos.invoiceNumber', '==', invoiceNumber)
                    .limit(1)
                    .get();
                
                if (!salesSnapshot.empty) {
                    const saleDoc = salesSnapshot.docs[0];
                    const saleData = saleDoc.data();
                    
                    // Check if this was an online order
                    if (saleData.linkedOrderId) {
                        log(`   → Found online order via storeSales: ${saleData.linkedOrderId}`);
                        return { type: 'onlineOrder', orderId: saleData.linkedOrderId };
                    }
                    
                    // Otherwise it's an in-store sale (walk-in customer)
                    log(`   → Found in-store sale: ${saleDoc.id}`);
                    return { type: 'storeSale', saleId: saleDoc.id };
                }
            
                // Strategy 2: Search onlineOrders for this invoice number (directly linked)
                const ordersSnapshot = await db.collection('onlineOrders')
                    .where('linkedInvoiceNumber', '==', invoiceNumber)
                    .limit(1)
                    .get();
                
                if (!ordersSnapshot.empty) {
                    const orderId = ordersSnapshot.docs[0].id;
                    log(`   → Found via onlineOrders: ${orderId}`);
                    return { type: 'onlineOrder', orderId: orderId };
                }
            }
            
            // Strategy 3 (FALLBACK): Search by customer name + amount (handles OCR errors in invoice number)
            if (customerName && customerName !== 'Walk-in Customer' && total > 0) {
                log(`   → Invoice number unreliable, trying customer + amount match...`);
                
                const customerOrdersSnapshot = await db.collection('onlineOrders')
                    .where('clientName', '==', customerName)
                    .get();
                
                for (const orderDoc of customerOrdersSnapshot.docs) {
                    const order = orderDoc.data();
                    const orderTotal = order.total || order.price || 0;
                    const orderStatus = (order.status || '').toLowerCase();
                    
                    // Check if amount matches and status indicates it was fulfilled
                    if (Math.abs(orderTotal - total) < 0.01 && 
                        (orderStatus === 'processing' || orderStatus === 'paid' || orderStatus === 'shipped')) {
                        log(`   → Found via customer+amount match: ${orderDoc.id} (${customerName}, €${orderTotal})`);
                        return { type: 'onlineOrder', orderId: orderDoc.id };
                    }
                }
                
                log(`   → No match found by customer+amount`);
            }
            
            log(`   → No linked order found`);
            return null;
            
        } catch (error) {
            log(`   ⚠️  Error searching for linked order: ${error.message}`, 'WARN');
            return null;
        }
    }
    
    /**
     * Match a receipt line item to a real product in the catalogue.
     *
     * Deliberately conservative, because the result drives a stock deduction: a wrong match
     * silently decrements the wrong product. Tiers, best first; if a tier produces more than
     * one candidate the match is abandoned rather than guessed.
     */
    matchProduct(products, itemName) {
        const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const squash = (s) => norm(s).replace(/[^a-z0-9]/g, '');

        const target = norm(itemName);
        const targetSquashed = squash(itemName);
        if (!targetSquashed) return null;

        // Tier 0: a receipt name the owner has linked to a product (Stock > Link receipt items
        // stores it in product.receiptNames). It is the owner's own decision, so it beats any
        // guess below - that is what makes "link once, matched from then on" true.
        const linked = products.filter(p => Array.isArray(p.receiptNames) && p.receiptNames.some(n => squash(n) === targetSquashed));
        if (linked.length === 1) return linked[0];

        // Tier 1: exact name match
        let candidates = products.filter(p => norm(p.name) === target);
        // Tier 2: exact match ignoring punctuation/spacing ("K'5 Basic *EU" vs "K 5 Basic EU")
        if (candidates.length === 0) {
            candidates = products.filter(p => squash(p.name) === targetSquashed);
        }
        // Tier 3: the receipt often prefixes the manufacturer ("Karcher SC 3") where the
        // catalogue stores the bare model ("SC 3"). Strip a leading producer name and retry
        // an EXACT match - still exact, so no fuzziness is introduced.
        if (candidates.length === 0) {
            const producers = [...new Set(products.map(p => norm(p.producer)).filter(Boolean))];
            for (const producer of producers) {
                if (!target.startsWith(producer + ' ')) continue;
                const stripped = squash(target.slice(producer.length));
                if (!stripped) continue;
                const hit = products.filter(p => squash(p.name) === stripped);
                if (hit.length > 0) { candidates = hit; break; }
            }
        }
        // Tier 4: containment, on the producer-stripped token ("Karcher SC 2" -> "sc2").
        // Short tokens are allowed here - safety comes from requiring a unique winner, not
        // from a length floor. Accessories are named after the machine ("Filter WD3",
        // "Qese per WD3", "Pompe per Puzzi 8/1"), so when several candidates contain the
        // token, prefer the ones that *start* with it: that is the machine itself, not a
        // consumable for it. Only an unambiguous winner is accepted.
        if (candidates.length === 0) {
            const bare = squash(this.stripProducer(products, target)) || targetSquashed;
            const contains = products.filter(p => {
                const ps = squash(p.name);
                return ps && (ps.includes(bare) || bare.includes(ps));
            });
            const startsWith = contains.filter(p => squash(p.name).startsWith(bare));
            candidates = startsWith.length > 0 ? startsWith : contains;
        }

        if (candidates.length === 1) return candidates[0];
        if (candidates.length > 1) return { ambiguous: true, count: candidates.length };

        // Tier 5: OCR typos ("Micrafiber..." for "Microfiber...", "Dareze" for "Doreze").
        // Decided on raw edit distance, not a similarity ratio: on a 30-character name a
        // one-character win over the runner-up is only ~0.03 of ratio, so a ratio margin
        // would reject "Micrafiber...45cm" (1 edit from the 45cm product, 2 from the 35cm
        // one) even though the winner is unambiguous. Requires a strictly unique minimum -
        // a genuine tie between two products is still refused.
        // Model numbers and sizes live in the digits ("SC 2" vs "SC 3", "45cm" vs "35cm"),
        // and a single digit is only one edit apart - so fuzzy matching alone would happily
        // turn an unknown "SC4" into "SC 3" and then decrement the wrong product's stock.
        // Require the digits to be identical; typos in the letters are still forgiven.
        // Built from the spaced name, not the squashed one, so unit suffixes are still visible:
        // OCR reads litres "5L" as "51" and "0.75L" as "0.751", so a digit directly followed by
        // an l/1 that ends the token is treated as the unit and dropped. Both spellings then
        // produce the same signature, while genuine model differences (SC 3 vs SC 4) still differ.
        const digitsOf = (spaced) => ((spaced.replace(/(\d)[l1](?![a-z0-9])/g, '$1').match(/\d+/g)) || []).join('-');
        const targetDigits = digitsOf(target);

        const scored = products
            .map(p => {
                const ps = squash(p.name);
                return { product: p, digits: digitsOf(norm(p.name)), distance: this.editDistance(targetSquashed, ps), longest: Math.max(targetSquashed.length, ps.length) };
            })
            .filter(s => s.longest > 0 && s.digits === targetDigits)
            .sort((a, b) => a.distance - b.distance);

        if (scored.length > 0) {
            const best = scored[0];
            const similarity = 1 - best.distance / best.longest;
            if (similarity >= 0.85) {
                const tied = scored.filter(s => s.distance === best.distance);
                if (tied.length === 1) return best.product;
                return { ambiguous: true, count: tied.length };
            }
        }

        return null;
    }

    /** Remove a leading producer name ("Karcher SC 2" -> "SC 2") if the catalogue knows it. */
    stripProducer(products, normalisedName) {
        const producers = [...new Set(products.map(p => (p.producer || '').toLowerCase().trim()).filter(Boolean))];
        for (const producer of producers) {
            if (normalisedName.startsWith(producer + ' ')) {
                return normalisedName.slice(producer.length).trim();
            }
        }
        return normalisedName;
    }

    /** Levenshtein edit distance. */
    editDistance(a, b) {
        if (!a) return (b || '').length;
        if (!b) return a.length;
        if (a === b) return 0;
        const m = a.length, n = b.length;
        let prev = Array.from({ length: n + 1 }, (_, j) => j);
        for (let i = 1; i <= m; i++) {
            const cur = [i];
            for (let j = 1; j <= n; j++) {
                cur[j] = Math.min(
                    prev[j] + 1,
                    cur[j - 1] + 1,
                    prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
            }
            prev = cur;
        }
        return prev[n];
    }

    /**
     * Build the Danfosal-format sale items, matching each one to the product catalogue so the
     * sale carries the real product id, code and cost (previously every EasyPOS item got a
     * synthetic "easypos-<slug>" id, cost 0, and no code - so these sales never linked to
     * inventory and never affected stock).
     *
     * Any serial numbers read from the SHENIME box are attached to the most expensive items
     * first, since that is the machine rather than the accessories on the same receipt.
     */
    async buildSaleItems(db, invoiceData) {
        let products = [];
        try {
            const snapshot = await db.collection('products').get();
            products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (error) {
            log(`   ⚠️  Could not load product catalogue: ${error.message}`, 'WARN');
        }

        const saleItems = (invoiceData.items || []).map(item => {
            const base = {
                name: item.itemName,
                quantity: item.quantity,
                price: item.pricePerUnit,
                cost: 0,
                productId: `easypos-${(item.itemName || '').replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
                image: null
            };

            const match = products.length ? this.matchProduct(products, item.itemName) : null;

            if (match && match.ambiguous) {
                log(`      ⚠️  "${item.itemName}" matches ${match.count} products - not linked, stock unchanged`);
                return base;
            }
            if (!match) {
                log(`      ⚠️  "${item.itemName}" not found in catalogue - not linked, stock unchanged`);
                return base;
            }

            log(`      ✓ "${item.itemName}" → ${match.name} (${match.code || 'no code'})`);
            return {
                ...base,
                productId: match.id,
                code: match.code || '',
                productCode: match.code || '',
                cost: Number(match.baseCost) || Number(match.cost) || 0,
                image: match.image || null,
                _matchedProductId: match.id
            };
        });

        // Attach serials to the most expensive items first (the machine, not the accessories)
        const serials = invoiceData.serialNumbers || [];
        if (serials.length > 0) {
            const order = saleItems
                .map((item, index) => ({ index, price: Number(item.price) || 0 }))
                .sort((a, b) => b.price - a.price);

            serials.forEach((serial, i) => {
                const slot = order[i];
                if (slot) {
                    saleItems[slot.index].serialNumber = serial;
                    log(`      ✓ Serial ${serial} → ${saleItems[slot.index].name}`);
                }
            });
        }

        return saleItems;
    }

    /**
     * Decrement stock for a completed sale. Only items matched to a real catalogue product
     * are touched; unmatched items are left alone (and were already logged as unlinked).
     */
    async deductStockForSale(db, admin, saleItems) {
        const matched = (saleItems || []).filter(i => i._matchedProductId && (Number(i.quantity) || 0) > 0);
        if (matched.length === 0) return;

        log(`   📦 Deducting stock for ${matched.length} item(s)...`);

        for (const item of matched) {
            try {
                const quantity = Number(item.quantity) || 0;
                const ref = db.collection('products').doc(item._matchedProductId);
                const snap = await ref.get();
                const before = snap.exists ? (Number(snap.data().stock) || 0) : 0;

                await ref.update({ stock: admin.firestore.FieldValue.increment(-quantity) });

                const after = before - quantity;
                log(`      ✓ ${item.name}: ${before} - ${quantity} = ${after}`);
                if (after < 0) {
                    log(`      ⚠️  ${item.name} stock is now negative (${after}) - inventory count may be off`, 'WARN');
                }
            } catch (error) {
                log(`      ⚠️  Failed to deduct stock for ${item.name}: ${error.message}`, 'WARN');
            }
        }
    }

    /**
     * Update stock in products collection when items are returned
     * Searches products by name and increments stock quantity
     */
    async updateStockForReturn(db, admin, items) {
        if (!items || items.length === 0) return;
        
        log(`   📦 Returning ${items.length} item(s) to stock...`);
        
        for (const item of items) {
            try {
                const itemName = item.itemName || item.name;
                const quantity = Math.abs(item.quantity || 0);  // ✅ Use absolute value for returns
                
                if (!itemName || quantity <= 0) {
                    log(`      ⚠️  Skipping invalid item (no name or quantity)`);
                    continue;
                }
                
                // Search products collection by name (case-insensitive)
                const normalizedName = itemName.toLowerCase().trim();
                const productsSnapshot = await db.collection('products').get();
                
                let productFound = false;
                
                for (const productDoc of productsSnapshot.docs) {
                    const product = productDoc.data();
                    const productName = (product.name || '').toLowerCase().trim();
                    
                    // Check for exact match or partial match
                    if (productName === normalizedName || productName.includes(normalizedName) || normalizedName.includes(productName)) {
                        // Found matching product - increment stock
                        const currentStock = product.stock || 0;
                        const newStock = currentStock + quantity;
                        
                        await productDoc.ref.update({
                            stock: admin.firestore.FieldValue.increment(quantity)
                        });
                        
                        log(`      ✓ ${product.name}: ${currentStock} + ${quantity} = ${newStock}`);
                        productFound = true;
                        break; // Stop after first match
                    }
                }
                
                if (!productFound) {
                    log(`      ⚠️  Product not found in inventory: ${itemName} (${quantity} units not returned to stock)`);
                }
                
            } catch (error) {
                log(`      ⚠️  Failed to update stock for ${item.itemName}: ${error.message}`, 'WARN');
            }
        }
        
        log(`   ✓ Stock return processing complete`);
    }
    
    /**
     * Find matching online order by customer name AND item matching
     */
    async findMatchingOnlineOrder(db, customerName, invoiceItems) {
        try {
            log(`   🔍 Searching for matching online orders...`);
            
            // Only check if we have a real customer name (not Walk-in)
            if (!customerName || customerName === 'Walk-in Customer') {
                log(`   → Walk-in customer, skipping online order check`);
                return null;
            }
            
            // Query online orders for this customer that are pending
            const ordersSnapshot = await db.collection('onlineOrders')
                .where('clientName', '==', customerName)
                .where('status', 'in', ['pending', 'confirmed', 'Pending', 'Confirmed', 'Ordered', 'ordered'])
                .get();
            
            if (ordersSnapshot.empty) {
                log(`   → No pending online orders for ${customerName}`);
                return null;
            }
            
            log(`   → Found ${ordersSnapshot.size} pending order(s), checking items...`);
            
            // Check each order for item matching
            for (const orderDoc of ordersSnapshot.docs) {
                const order = orderDoc.data();
                const orderItems = order.items || [];
                
                // Match items by name and quantity
                const isMatch = this.matchOrderItems(invoiceItems, orderItems);
                
                if (isMatch) {
                    log(`   ✓ MATCH FOUND: Order ${orderDoc.id}`);
                    return {
                        orderId: orderDoc.id,
                        orderData: order
                    };
                }
            }
            
            log(`   → No matching items found in online orders`);
            return null;
            
        } catch (error) {
            log(`   ⚠️  Online order search failed: ${error.message}`, 'WARN');
            return null;
        }
    }
    
    /**
     * Check if invoice items match order items (by name and quantity)
     */
    matchOrderItems(invoiceItems, orderItems) {
        if (!invoiceItems || !orderItems || invoiceItems.length !== orderItems.length) {
            return false;
        }
        
        // Create normalized maps of items
        const invoiceMap = {};
        for (const item of invoiceItems) {
            const key = (item.itemName || item.name || '').toLowerCase().trim();
            invoiceMap[key] = (invoiceMap[key] || 0) + (item.quantity || 0);
        }
        
        const orderMap = {};
        for (const item of orderItems) {
            const key = (item.name || item.itemName || '').toLowerCase().trim();
            orderMap[key] = (orderMap[key] || 0) + (item.quantity || 0);
        }
        
        // Compare maps
        const invoiceKeys = Object.keys(invoiceMap).sort();
        const orderKeys = Object.keys(orderMap).sort();
        
        if (invoiceKeys.length !== orderKeys.length) {
            return false;
        }
        
        for (let i = 0; i < invoiceKeys.length; i++) {
            if (invoiceKeys[i] !== orderKeys[i] || invoiceMap[invoiceKeys[i]] !== orderMap[orderKeys[i]]) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Update online order status to 'Processing' and link invoice
     */
    async updateOnlineOrderStatus(db, orderId, status, invoiceData) {
        try {
            await db.collection('onlineOrders').doc(orderId).update({
                status: status,
                processedAt: new Date().toISOString(),
                linkedInvoiceNumber: invoiceData.invoiceNumber,
                linkedCaptureJobId: invoiceData.captureJobId,
                linkedCaptureTimestamp: invoiceData.captureTimestamp
            });
        } catch (error) {
            log(`   ⚠️  Failed to update order status: ${error.message}`, 'WARN');
        }
    }
}

// Main Bridge Service
class EasyPOSBridge {
    constructor() {
        this.processor = new EasyPOSOCRProcessor();
        this.watcher = null;
        this.pollingInterval = null;
    }

    async start() {
        log('========================================');
        log('  EasyPOS OCR Bridge Starting');
        log('========================================');
        
        await initializeDirectories();
        
        // Initialize Firebase connection
        try {
            const { initializeFirebase } = require('./firebase-admin-config');
            initializeFirebase();
            log('✓ Firebase connection established');
        } catch (error) {
            log('⚠ Firebase initialization failed - will save JSON only', 'WARN');
            log(`  Error: ${error.message}`, 'WARN');
        }
        
        log(`Watching: ${CONFIG.watchDir}`);
        log(`Processed: ${CONFIG.processedDir}`);
        log(`Failed: ${CONFIG.failedDir}`);
        
        // Process any existing JSON files that weren't processed yet
        await this.processExistingFiles();
        
        // Watch for new JSON files (created after PNG is complete)
        this.watcher = chokidar.watch(path.join(CONFIG.watchDir, '*.json'), {
            ignored: /(Processed|Failed|Raw)/,
            persistent: true,
            ignoreInitial: true, // Don't re-process at startup (we handle it manually above)
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            }
        });

        this.watcher
            .on('add', (filePath) => {
                log(`📄 New file detected: ${path.basename(filePath)}`);
                this.processor.processReceipt(filePath);
            })
            .on('change', (filePath) => {
                log(`📝 File changed: ${path.basename(filePath)}`, 'DEBUG');
            })
            .on('error', (error) => {
                log(`❌ Watcher error: ${error.message}`, 'ERROR');
                console.error('Watcher error details:', error);
            })
            .on('ready', () => {
                log('👀 File watcher is ready and monitoring...');
            });

        log('✓ Bridge is running and watching for receipts...');
        
        // Failsafe: Poll for unprocessed files every 30 seconds
        // This catches any files the watcher might miss
        this.pollingInterval = setInterval(async () => {
            await this.checkForUnprocessedFiles();
        }, 30000); // 30 seconds
        
        log('✓ Failsafe polling enabled (every 30s)');
    }
    
    async checkForUnprocessedFiles() {
        try {
            const files = await fs.readdir(CONFIG.watchDir);
            const jsonFiles = files.filter(f => 
                f.endsWith('.json') && 
                f.startsWith('Receipt_') &&
                !f.includes('Processed') && 
                !f.includes('Failed')
            );
            
            if (jsonFiles.length > 0) {
                log(`⚠ Failsafe found ${jsonFiles.length} unprocessed file(s)`, 'WARN');
                for (const file of jsonFiles) {
                    const filePath = path.join(CONFIG.watchDir, file);
                    log(`→ Processing missed file: ${file}`);
                    await this.processor.processReceipt(filePath);
                }
            }
        } catch (error) {
            // Silently ignore errors in failsafe check
        }
    }

    async processExistingFiles() {
        try {
            const files = await fs.readdir(CONFIG.watchDir);
            const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('Processed') && !f.includes('Failed'));
            
            if (jsonFiles.length > 0) {
                log(`Found ${jsonFiles.length} existing file(s) to process`);
                for (const file of jsonFiles) {
                    const filePath = path.join(CONFIG.watchDir, file);
                    log(`Processing existing: ${file}`);
                    await this.processor.processReceipt(filePath);
                }
            }
        } catch (error) {
            log(`Error processing existing files: ${error.message}`, 'ERROR');
        }
    }

    async stop() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        if (this.watcher) {
            await this.watcher.close();
            log('Bridge stopped');
        }
    }
}

// Export for use as a module or standalone
if (require.main === module) {
    // Run as standalone script
    const bridge = new EasyPOSBridge();
    
    bridge.start().catch(error => {
        console.error('Failed to start bridge:', error);
        process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await bridge.stop();
        process.exit(0);
    });
    
} else {
    // Export as module
    module.exports = { EasyPOSBridge, EasyPOSOCRProcessor };
}
