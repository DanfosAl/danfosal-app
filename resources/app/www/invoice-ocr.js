// Smart Invoice OCR - Scan and Extract Invoice Data
class InvoiceOCR {
    constructor(db, firebaseImports = {}) {
        this.db = db;
        this.collection = firebaseImports.collection;
        this.addDoc = firebaseImports.addDoc;
        this.getDocs = firebaseImports.getDocs;
        
        // Tesseract.js worker (will be initialized when needed)
        this.ocrWorker = null;
        this.isInitialized = false;
    }

    // === INITIALIZATION ===
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            console.log('🔧 Initializing Tesseract OCR...');
            
            // Check if Tesseract is loaded
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract library not loaded');
            }
            
            this.ocrWorker = await Tesseract.createWorker('eng');
            this.isInitialized = true;
            
            console.log('✅ OCR Engine Ready');
        } catch (error) {
            console.error('Failed to initialize OCR:', error);
            throw error;
        }
    }

    // === MAIN SCANNING METHOD ===
    
    async scanInvoice(imageSource, options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        console.log('📷 Scanning invoice...');
        
        try {
            // Perform OCR
            const { data } = await this.ocrWorker.recognize(imageSource);
            const rawText = data.text;
            
            console.log('📝 Raw text extracted:', rawText.substring(0, 200) + '...');
            
            // Check if we got any text
            if (!rawText || rawText.trim().length < 20) {
                throw new Error('Could not extract text from image. Please ensure the image is clear and try again.');
            }
            
            // Extract structured data
            const invoiceData = this.extractInvoiceData(rawText);
            
            // Validate and clean
            const validatedData = this.validateInvoiceData(invoiceData);
            
            // Calculate confidence score
            const confidence = this.calculateConfidence(validatedData);
            
            console.log('✅ Invoice processed:', {
                invoiceNo: validatedData.invoiceNumber,
                supplier: validatedData.supplier,
                total: validatedData.total,
                itemCount: validatedData.items.length,
                confidence: confidence + '%'
            });
            
            return {
                success: true,
                confidence: confidence,
                data: validatedData,
                rawText: rawText,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error('OCR Error:', error);
            
            // Provide helpful error message
            let userMessage = 'Failed to process invoice. ';
            if (error.message.includes('text from image')) {
                userMessage = 'Could not read the invoice image. Please ensure it is clear and well-lit.';
            } else if (error.message.includes('Tesseract')) {
                userMessage = 'OCR engine failed to load. Please refresh the page and try again.';
            } else {
                userMessage += 'You can enter the data manually instead.';
            }
            
            return {
                success: false,
                error: userMessage,
                rawText: '',
                data: null
            };
        }
    }

    // === DATA EXTRACTION ===
    
    extractInvoiceData(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        const invoiceData = {
            invoiceNumber: '',
            date: '',
            supplier: '',
            items: [],
            subtotal: 0,
            tax: 0,
            total: 0,
            currency: '€',
            extractedFields: {}
        };

        // === EXTRACT INVOICE NUMBER ===
        const invoicePatterns = [
            /invoice\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9\-\/\\]+)/i,
            /facture\s*(?:no\.?|n[°º])?\s*:?\s*([A-Z0-9\-\/\\]+)/i,
            /bill\s*(?:no\.?|#)?\s*:?\s*([A-Z0-9\-\/\\]+)/i,
            /rechnung\s*(?:nr\.?)?\s*:?\s*([A-Z0-9\-\/\\]+)/i,
            /N[°º]?\s*:?\s*([A-Z0-9\-\/\\]+)/i,
            /#\s*([A-Z0-9\-\/\\]{4,})/,
            /(\d{5}[\/\\][A-Z0-9]{2,}[\/\\]\d{4})/,  // Format: 22901/U1/0003
            /(\d{4,}[\/\-][A-Z]{1,}[\/\-]\d+)/  // General format with letters
        ];
        
        for (const pattern of invoicePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                invoiceData.invoiceNumber = match[1].trim();
                invoiceData.extractedFields.invoiceNumber = true;
                break;
            }
        }

        // === EXTRACT DATE ===
        const datePatterns = [
            /date\s*(?:time)?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
            /datum\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
            /(\d{1,2}\.\d{1,2}\.\d{4})/,  // Format: 07.10.2025
            /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
            /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/
        ];
        
        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                invoiceData.date = this.normalizeDate(match[1]);
                invoiceData.extractedFields.date = true;
                break;
            }
        }

        // === EXTRACT SUPPLIER ===
        // Usually at the top of the invoice
        const supplierPatterns = [
            /from\s*:?\s*(.+)/i,
            /supplier\s*:?\s*(.+)/i,
            /vendor\s*:?\s*(.+)/i,
            /fournisseur\s*:?\s*(.+)/i,
            /lieferant\s*:?\s*(.+)/i
        ];
        
        for (const pattern of supplierPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                invoiceData.supplier = match[1].trim().substring(0, 50);
                invoiceData.extractedFields.supplier = true;
                break;
            }
        }
        
        // If no supplier found, look for company name in first few lines
        if (!invoiceData.supplier && lines.length > 0) {
            // Look for lines with all caps (often company names)
            for (let i = 0; i < Math.min(5, lines.length); i++) {
                const line = lines[i];
                // Skip lines with just numbers or addresses
                if (/^[\d\s\/\-]+$/.test(line)) continue;
                if (/^\d+\s+\w+\s+\w+/.test(line)) continue; // Address format
                
                // Company names often have caps, special chars, or specific keywords
                if (line.length > 3 && line.length < 50) {
                    if (/[A-Z]{2,}|GmbH|Ltd|Inc|S\.A\.|d\.o\.o\.|P\.K\./i.test(line)) {
                        invoiceData.supplier = line;
                        invoiceData.extractedFields.supplier = true;
                        break;
                    }
                }
            }
            
            // Last resort: use first non-empty line
            if (!invoiceData.supplier) {
                invoiceData.supplier = lines[0].substring(0, 50);
            }
        }

        // === EXTRACT ITEMS ===
        invoiceData.items = this.extractItems(lines);

        // === EXTRACT TOTALS ===
        const totals = this.extractTotals(text);
        invoiceData.subtotal = totals.subtotal;
        invoiceData.tax = totals.tax;
        invoiceData.total = totals.total;

        return invoiceData;
    }

    extractItems(lines) {
        const items = [];
        
        // Patterns for line items
        const itemPatterns = [
            // Quantity | Product | Unit Price | Total
            /(\d+)\s+(.+?)\s+(\d+[,\.]?\d*)\s+(\d+[,\.]?\d*)/,
            // Product | Quantity | Price
            /(.+?)\s+x?\s*(\d+)\s+€?\s*(\d+[,\.]?\d*)/,
            // Simple: quantity product price
            /^(\d+)\s+(.+?)\s+(\d+[,\.]\d{2})$/
        ];
        
        for (const line of lines) {
            // Skip header lines
            if (/description|product|quantity|price|article|designation|qty/i.test(line)) {
                continue;
            }
            
            // Skip total lines
            if (/total|subtotal|tax|tva|amount|montant/i.test(line)) {
                continue;
            }
            
            // Try to match item patterns
            for (const pattern of itemPatterns) {
                const match = line.match(pattern);
                
                if (match) {
                    let quantity, product, price;
                    
                    // Determine which pattern matched
                    if (match.length === 5) {
                        // Pattern: Qty Product UnitPrice Total
                        quantity = parseInt(match[1]);
                        product = match[2].trim();
                        price = this.parsePrice(match[3]);
                    } else if (match.length === 4) {
                        // Pattern: Product Qty Price or Qty Product Price
                        if (isNaN(match[1])) {
                            // Product Qty Price
                            product = match[1].trim();
                            quantity = parseInt(match[2]);
                            price = this.parsePrice(match[3]);
                        } else {
                            // Qty Product Price
                            quantity = parseInt(match[1]);
                            product = match[2].trim();
                            price = this.parsePrice(match[3]);
                        }
                    }
                    
                    if (quantity && product && price) {
                        items.push({
                            product: product,
                            quantity: quantity,
                            unitPrice: price,
                            total: quantity * price
                        });
                    }
                    
                    break;
                }
            }
        }
        
        return items;
    }

    extractTotals(text) {
        const totals = {
            subtotal: 0,
            tax: 0,
            total: 0
        };

        // Extract total (most important)
        const totalPatterns = [
            /total\s*(?:price)?\s*(?:\(EUR\))?\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /gesamt(?:betrag)?\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /montant\s+total\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /amount\s+due\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /grand\s+total\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /total\s*€?\s*(\d+[,\.]\d{2})\s*$/im  // Total at end of line
        ];
        
        for (const pattern of totalPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                totals.total = this.parsePrice(match[1]);
                break;
            }
        }

        // Extract subtotal
        const subtotalPatterns = [
            /subtotal\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /sous-total\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /sub\s+total\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /zwischensumme\s*:?\s*€?\s*(\d+[,\.]?\d*)/i
        ];
        
        for (const pattern of subtotalPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                totals.subtotal = this.parsePrice(match[1]);
                break;
            }
        }

        // Extract tax/VAT
        const taxPatterns = [
            /tax\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /tva\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /vat\s*:?\s*€?\s*(\d+[,\.]?\d*)/i,
            /(\d+[,\.]\d{2})\s*€?\s*tva/i
        ];
        
        for (const pattern of taxPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                totals.tax = this.parsePrice(match[1]);
                break;
            }
        }

        // Calculate missing values
        if (totals.total > 0 && totals.subtotal === 0 && totals.tax > 0) {
            totals.subtotal = totals.total - totals.tax;
        } else if (totals.total > 0 && totals.subtotal > 0 && totals.tax === 0) {
            totals.tax = totals.total - totals.subtotal;
        } else if (totals.subtotal > 0 && totals.tax > 0 && totals.total === 0) {
            totals.total = totals.subtotal + totals.tax;
        }

        return totals;
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
        
        // Validate items
        if (validated.items.length === 0) {
            validated.warnings = validated.warnings || [];
            validated.warnings.push('No items detected - manual entry required');
        }
        
        // Validate total
        if (validated.total === 0) {
            // Calculate from items
            const calculatedTotal = validated.items.reduce((sum, item) => sum + item.total, 0);
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
        
        // Invoice number (20 points)
        maxScore += 20;
        if (data.invoiceNumber && !data.invoiceNumber.startsWith('INV-')) {
            score += 20;
        } else if (data.invoiceNumber) {
            score += 10;
        }
        
        // Date (15 points)
        maxScore += 15;
        if (data.date && !data.warnings?.includes('Date not found - using today')) {
            score += 15;
        } else if (data.date) {
            score += 8;
        }
        
        // Supplier (15 points)
        maxScore += 15;
        if (data.supplier && data.supplier.length > 5) {
            score += 15;
        } else if (data.supplier) {
            score += 8;
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

    // === SAVE TO DATABASE ===
    
    async saveInvoiceToDatabase(invoiceData) {
        try {
            const purchaseOrdersRef = this.collection(this.db, 'purchaseOrders');
            
            const orderData = {
                invoiceNumber: invoiceData.invoiceNumber,
                supplier: invoiceData.supplier,
                date: invoiceData.date,
                items: invoiceData.items,
                subtotal: invoiceData.subtotal,
                tax: invoiceData.tax,
                total: invoiceData.total,
                status: 'Pending Review',
                createdBy: 'Invoice OCR',
                createdAt: new Date().toISOString(),
                ocrConfidence: invoiceData.confidence,
                needsReview: invoiceData.confidence.percentage < 80
            };
            
            const docRef = await this.addDoc(purchaseOrdersRef, orderData);
            
            console.log('✅ Invoice saved to database:', docRef.id);
            
            return {
                success: true,
                orderId: docRef.id,
                message: 'Invoice saved successfully'
            };
            
        } catch (error) {
            console.error('Error saving invoice:', error);
            return {
                success: false,
                error: error.message
            };
        }
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
            console.log('🔧 OCR Engine terminated');
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InvoiceOCR;
}
