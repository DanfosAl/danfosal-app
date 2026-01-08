/**
 * Fiscal Invoice Scanner
 * Handles Albanian e-fiscalization QR code scanning and invoice data extraction
 * 
 * Albanian fiscal invoices contain QR codes linking to the government tax authority portal
 * with all invoice data embedded in URL parameters
 */

class FiscalInvoiceScanner {
    constructor() {
        this.baseURL = 'https://efiskalizimi-app.tatime.gov.al/invoice-check/#/verify';
    }

    /**
     * Check if a text string is a fiscal QR code URL
     * @param {string} text - The text to check
     * @returns {boolean} - True if it's a fiscal QR code URL
     */
    isFiscalQRCode(text) {
        if (!text || typeof text !== 'string') return false;
        
        console.log('🔍 Checking if fiscal QR:', text.substring(0, 100));
        
        // Normalize text (remove spaces, fix common OCR errors)
        const normalized = text.trim().toLowerCase();
        
        // Check if it contains the e-fiscalization domain (with flexible matching)
        const isFiscal = (normalized.includes('efiskalizimi') || normalized.includes('efiscalizimi')) && 
                        (normalized.includes('tatime.gov.al') || normalized.includes('taime.gov.al')) &&
                        (normalized.includes('invoice') || normalized.includes('verify')) &&
                        normalized.includes('iic=');
        
        console.log('🧾 Is fiscal QR?', isFiscal);
        return isFiscal;
    }

    /**
     * Parse QR code URL and extract invoice parameters
     * @param {string} url - The QR code URL
     * @returns {Object} - Parsed invoice parameters
     */
    parseQRCodeURL(url) {
        try {
            // Extract query parameters from URL
            const urlObj = new URL(url);
            const hashParts = urlObj.hash.split('?');
            
            if (hashParts.length < 2) {
                throw new Error('Invalid QR code URL format');
            }

            const params = new URLSearchParams(hashParts[1]);
            
            // Extract all parameters
            const invoiceData = {
                iic: params.get('iic'),           // Invoice Internal Code
                tin: params.get('tin'),           // Tax ID (NIPT)
                crtd: params.get('crtd'),         // Creation date/time
                ord: params.get('ord'),           // Order number
                bu: params.get('bu'),             // Business Unit code
                cr: params.get('cr'),             // Cash Register code
                sw: params.get('sw'),             // Software code
                prc: params.get('prc')            // Price in EUR
            };

            // Validate required fields
            if (!invoiceData.iic || !invoiceData.tin || !invoiceData.prc) {
                throw new Error('Missing required invoice parameters');
            }

            return invoiceData;
        } catch (error) {
            console.error('Error parsing QR code URL:', error);
            throw new Error(`Failed to parse QR code: ${error.message}`);
        }
    }

    /**
     * Fetch basic invoice data from parameters
     * @param {Object} params - Parsed URL parameters
     * @returns {Object} - Basic invoice information
     */
    async fetchInvoiceData(params) {
        try {
            // Parse date - handle Albanian date format (2025-11-15T12:44:21+01:00)
            let invoiceDate = new Date();
            let dateStr = invoiceDate.toISOString().split('T')[0];
            let timeStr = invoiceDate.toTimeString().split(' ')[0];
            
            if (params.crtd) {
                try {
                    // Remove timezone offset and parse
                    // Format: "2025-11-15T12:44:21+01:00" -> "2025-11-15T12:44:21"
                    const cleanDate = params.crtd.split('+')[0].split('-0')[0];
                    invoiceDate = new Date(cleanDate);
                    
                    // Validate the date
                    if (!isNaN(invoiceDate.getTime())) {
                        dateStr = invoiceDate.toISOString().split('T')[0];
                        timeStr = invoiceDate.toTimeString().split(' ')[0];
                    } else {
                        console.warn('Invalid date from QR, using current date');
                    }
                } catch (dateError) {
                    console.warn('Error parsing date from QR:', dateError);
                    // Use current date as fallback
                }
            }

            // IMPORTANT: The 'prc' parameter in Albanian QR codes is in LEK, not EUR!
            const totalLEK = parseFloat(params.prc) || 0;

            // Create basic invoice object
            const invoice = {
                invoiceNumber: params.ord || 'N/A',
                iic: params.iic,
                nipt: params.tin,
                date: dateStr,
                time: timeStr,
                totalLEK: totalLEK,  // This is in LEK!
                total: null,         // EUR amount - will be fetched from portal
                currency: 'EUR',
                businessUnit: params.bu || '',
                cashRegister: params.cr || '',
                software: params.sw || '',
                verificationURL: this.buildVerificationURL(params),
                items: [],
                paymentType: 'unknown',
                exchangeRate: null,
                customer: {
                    name: 'Walk-in Customer',
                    address: '',
                    nipt: ''
                }
            };

            return invoice;
        } catch (error) {
            console.error('Error fetching invoice data:', error);
            throw error;
        }
    }

    /**
     * Build verification URL from parameters
     * @param {Object} params - Invoice parameters
     * @returns {string} - Full verification URL
     */
    buildVerificationURL(params) {
        const queryParams = new URLSearchParams({
            iic: params.iic,
            tin: params.tin,
            crtd: params.crtd || '',
            ord: params.ord || '',
            bu: params.bu || '',
            cr: params.cr || '',
            sw: params.sw || '',
            prc: params.prc || ''
        });

        return `${this.baseURL}?${queryParams.toString()}`;
    }

    /**
     * Fetch detailed invoice data from tax portal
     * Uses Electron IPC to bypass CORS restrictions and render SPA content
     * @param {string} verificationURL - The full verification URL
     * @param {Object} basicData - Basic invoice data from URL parameters
     * @returns {Object} - Detailed invoice data
     */
    async fetchDetailedInvoice(verificationURL, basicData) {
        try {
            console.log('🌐 Fetching invoice page from tax portal (SPA rendering)...');
            
            let html = '';
            
            // Use Electron API (bypasses CORS and renders SPA)
            if (window.electronAPI && window.electronAPI.fetchURL) {
                console.log('🔧 Using Electron to render and scrape...');
                try {
                    html = await window.electronAPI.fetchURL(verificationURL);
                    console.log('✅ Fetched via Electron:', html.length, 'bytes');
                } catch (electronError) {
                    console.error('Electron fetch failed:', electronError);
                    throw electronError;
                }
            } else {
                console.warn('Electron API not available, cannot fetch SPA content');
                return this.createDefaultDetailedData(basicData);
            }

            if (!html || html.length < 500) {
                console.warn('Fetched content too short, likely failed to render');
                return this.createDefaultDetailedData(basicData);
            }

            console.log('📄 Invoice page rendered, parsing HTML...');

            // Parse the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Extract all data
            const detailedData = {
                totalEUR: this.extractTotalEUR(doc),
                totalLEK: this.extractTotalLEK(doc) || basicData.totalLEK,
                items: this.extractItems(doc),
                paymentType: this.extractPaymentType(doc),
                exchangeRate: null,
                customerName: this.extractCustomerName(doc) || basicData.customer?.name,
                customerAddress: this.extractCustomerAddress(doc) || '',
                customerNIPT: this.extractCustomerNIPT(doc) || '',
                dateTime: this.extractDate(doc)
            };

            // Fallback: If items extraction failed but we have a total, create a generic item
            // This ensures the sale can still be registered even if the table parsing failed
            if (!detailedData.items || detailedData.items.length === 0) {
                if (detailedData.totalLEK > 0) {
                    console.warn('⚠️ Items not found in HTML, creating generic item from total');
                    detailedData.items = [{
                        name: 'Artikuj sipas fatures', // "Items according to invoice"
                        quantity: 1,
                        pricePerUnit: detailedData.totalLEK,
                        total: detailedData.totalLEK,
                        currency: 'LEK'
                    }];
                }
            }

            // Calculate exchange rate from totals
            if (detailedData.totalLEK && detailedData.totalEUR && detailedData.totalEUR > 0) {
                detailedData.exchangeRate = detailedData.totalLEK / detailedData.totalEUR;
                console.log(`📊 Calculated exchange rate: ${detailedData.exchangeRate.toFixed(2)} LEK/EUR`);
            } else {
                detailedData.exchangeRate = this.extractExchangeRate(doc, detailedData.totalEUR);
            }
            
            // CRITICAL FIX: If totalEUR is still missing/zero but we have totalLEK, calculate it!
            // This prevents "Total: €0.00" error
            if ((!detailedData.totalEUR || detailedData.totalEUR === 0) && detailedData.totalLEK > 0) {
                const rate = detailedData.exchangeRate || 98.0; // Use extracted rate or default
                detailedData.totalEUR = detailedData.totalLEK / rate;
                console.log(`⚠️ Force calculated EUR: ${detailedData.totalLEK} / ${rate} = ${detailedData.totalEUR}`);
            }

            console.log('✅ Detailed data extracted:', detailedData);
            return detailedData;

        } catch (error) {
            console.error('⚠️ Error fetching detailed invoice:', error);
            return this.createDefaultDetailedData(basicData);
        }
    }

    /**
     * Create default detailed data when fetching fails
     * Uses Albanian standard exchange rates and QR code data
     * Makes intelligent estimates based on Albanian fiscal standards
     */
    createDefaultDetailedData(basicData) {
        // Albanian Lek to EUR exchange rate (approximate current rate)
        // Check recent rates: typically 95-105 LEK per EUR
        const standardExchangeRate = 98.0; // Current approximate rate
        
        const totalLEK = basicData.totalLEK || 0;
        const totalEUR = totalLEK > 0 ? totalLEK / standardExchangeRate : null;
        
        console.log(`💡 Using estimated data: ${totalLEK} LEK ÷ ${standardExchangeRate} = €${totalEUR?.toFixed(2)}`);
        
        return {
            totalEUR: totalEUR,
            totalLEK: totalLEK,
            items: [{
                name: `Artikuj nga fatura #${basicData.invoiceNumber}`,
                quantity: 1,
                pricePerUnit: totalLEK,
                total: totalLEK,
                currency: 'LEK'
            }],
            paymentType: 'not specified',
            exchangeRate: standardExchangeRate,
            customerName: basicData.customer?.name || 'Blerës',
            customerAddress: '',
            customerNIPT: '',
            note: `Të dhënat nga QR kodi. Kursi: ${standardExchangeRate.toFixed(2)} LEK/EUR. Verifikoni në portalin e tatimeve për detaje të plota.`
        };
    }

    /**
     * Helper to get clean text with newlines from HTML
     * This fixes the issue where textContent mashes everything together
     */
    getCleanText(doc) {
        // Replace block endings with newlines to preserve structure
        let html = doc.body.innerHTML;
        
        // Add WIDE spaces (4 spaces) between table cells and spans to represent columns
        // This allows us to split Name and Price by looking for multiple spaces
        html = html.replace(/<\/(td|th|span|b|strong|i|em)>/gi, '    </$1>');
        
        html = html.replace(/<\/(div|p|tr|li|h[1-6])>/gi, '\n');
        html = html.replace(/<br\s*\/?>/gi, '\n');
        
        // Parse again to get text content
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    /**
     * Extract items from invoice HTML
     * Updated based on actual invoice screenshots
     */
    extractItems(doc) {
        const items = [];
        const text = this.getCleanText(doc);
        
        console.log('📄 Extracting items from text...');

        // Strategy: Find lines that end with a price pattern
        // Pattern: Name ... Quantity ... Price ... Total
        // We want to extract the Name
        
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        let inItemsSection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Detect start of items section
            if (line.match(/Artikuj|Përshkrimi|Emërtimi/i)) {
                inItemsSection = true;
                continue;
            }
            
            // Detect end of items section
            if (line.match(/Totali|Shuma|Vlera pa TVSH|Vlera me TVSH|Vlera totale|Kursi/i)) {
                inItemsSection = false;
            }
            
            // Filter out known headers/footers that might look like items
            if (line.match(/Vlera totale|Kursi i këmbimit|Vlera|Totali|Shuma/i)) {
                continue;
            }

            let name = '';
            let quantity = 1;
            let priceVal = 0;
            let priceFound = false;

            // Strategy 1: Split by 2 or more spaces to separate Name from Price column
            // This handles "Name    Price" format which is common in tables
            const parts = line.split(/\s{2,}/);
            
            if (parts.length >= 2) {
                // We have distinct columns
                // The last part is likely the price
                const pricePart = parts[parts.length - 1].trim();
                
                // Check if pricePart looks like a price (digits, comma/dot)
                if (/[\d.,]+/.test(pricePart)) {
                    // Extract number from price part
                    const priceMatch = pricePart.match(/([\d\s.,]+)/);
                    if (priceMatch) {
                        let cleanPrice = priceMatch[1].replace(/[.\s]/g, '').replace(',', '.');
                        priceVal = parseFloat(cleanPrice);
                        priceFound = true;
                        
                        // Name is the first part
                        name = parts[0].trim();
                        
                        // Check for quantity in the name part (e.g. "Name 2 copë")
                        // or in the middle parts if any
                    }
                }
            }

            // Strategy 2: Fallback to token parsing if no wide gaps found
            if (!priceFound) {
                // Tokenize by whitespace to handle price parsing more reliably
                const tokens = line.split(/\s+/);
                
                // Check if last token is currency
                let lastToken = tokens[tokens.length - 1];
                if (lastToken && (lastToken.toUpperCase() === 'LEK' || lastToken.toUpperCase() === 'EUR')) {
                    tokens.pop(); // Remove currency
                }
                
                // Now check for price at the end
                // Price must end with ,XX or .XX (decimal part)
                
                // The last token should be the main price part (e.g. "987,70" or "185,24")
                let currentToken = tokens[tokens.length - 1];
                
                // Regex: Starts with digits/dots/commas, ends with dot/comma and 2 digits
                if (currentToken && /[\d.,]+[.,]\d{2}$/.test(currentToken)) {
                    priceFound = true;
                    let fullPriceStr = currentToken;
                    tokens.pop();
                    
                    // Check if previous tokens are part of the number (thousands separators)
                    // e.g. "1" in "1 185,24"
                    // We look for small groups of digits (1-3)
                    while (tokens.length > 0) {
                        const prevToken = tokens[tokens.length - 1];
                        if (/^\d{1,3}$/.test(prevToken)) {
                            fullPriceStr = prevToken + fullPriceStr;
                            tokens.pop();
                        } else {
                            break;
                        }
                    }
                    
                    // Parse the price
                    // Assume European format: 1.234,56 or 1 234,56
                    // Remove dots and spaces, then replace comma with dot
                    let cleanPrice = fullPriceStr.replace(/[.\s]/g, '').replace(',', '.');
                    priceVal = parseFloat(cleanPrice);
                    
                    // Check for quantity at the end of remaining tokens
                    // e.g. "Item Name 2 copë"
                    if (tokens.length > 0) {
                        const last = tokens[tokens.length - 1];
                        // Check for "copë", "kg", etc.
                        if (/^(copë|kg|m|l|x)$/i.test(last)) {
                            tokens.pop(); // Remove unit
                            // Now check for number
                            const qtyToken = tokens[tokens.length - 1];
                            if (qtyToken && /^\d+([.,]\d+)?$/.test(qtyToken)) {
                                quantity = parseFloat(qtyToken.replace(',', '.'));
                                tokens.pop();
                            }
                        } else if (/^\d+([.,]\d+)?(x|copë)?$/i.test(last)) {
                            // "2x" or "2"
                            const qVal = parseFloat(last.replace(/[^0-9.,]/g, '').replace(',', '.'));
                            if (!isNaN(qVal)) {
                                quantity = qVal;
                                tokens.pop();
                            }
                        }
                    }
                    
                    name = tokens.join(' ').trim();
                }
            }
            
            if (priceFound) {
                // Filter out noise
                // Name MUST contain at least one letter to be valid
                const hasLetters = /[a-zA-Z]/.test(name);
                
                // Check if name starts with "Adresa" or contains it (common mistake)
                const isAddress = /Adresa/i.test(name);

                // Check if name is mostly numbers (e.g. "2205 249,07")
                // Remove spaces, commas, dots. If what remains is mostly digits, skip.
                const cleanName = name.replace(/[\s.,]/g, '');
                const digitCount = (cleanName.match(/\d/g) || []).length;
                const isMostlyNumbers = digitCount > cleanName.length * 0.5;
                
                if (name.length > 2 && !name.match(/TVSH|Totali|Shuma|Vlera/i) && hasLetters && !isAddress && !isMostlyNumbers) {
                    items.push({
                        name: name,
                        quantity: quantity,
                        pricePerUnit: priceVal / quantity,
                        total: priceVal,
                        currency: 'LEK'
                    });
                }
            }
        }
        
        return items.length > 0 ? items : null;
    }

    /**
     * Extract payment type from invoice HTML
     * pic3 shows "Mënyra e Pagesës" -> "TIPI: Llogari e transaksionit"
     */
    extractPaymentType(doc) {
        const text = doc.body?.textContent || '';
        
        // Look for "Mënyra e Pagesës" section
        const sectionMatch = text.match(/Mënyra e Pagesës[\s\S]{0,200}TIPI[:\s]+([^\n]+)/i);
        
        if (sectionMatch && sectionMatch[1]) {
            const type = sectionMatch[1].toLowerCase();
            if (type.includes('llogari') || type.includes('transaksion') || type.includes('bank')) return 'bank';
            if (type.includes('para') || type.includes('dorë') || type.includes('cash')) return 'cash';
            if (type.includes('kart')) return 'card';
        }
        
        return 'unknown';
    }

    /**
     * Extract total in LEK
     * pic1 shows large total: "292 427,40 LEK"
     */
    extractTotalLEK(doc) {
        const text = doc.body?.textContent || '';
        
        // Look for the large total pattern at the top
        // It often appears as a standalone large number followed by LEK
        // Or "Vlera totale në monedhën: ... LEK" if base currency is LEK
        
        // Try specific "Vlera totale" pattern first
        const totalMatch = text.match(/Vlera totale në monedhën[:\s]*(\d[\d\s]*[.,]\d{2})\s*LEK/i);
        if (totalMatch) {
            return parseFloat(totalMatch[1].replace(/\s/g, '').replace(',', '.'));
        }
        
        // Try finding the largest LEK amount in the header area (first 1000 chars)
        const headerText = text.substring(0, 1000);
        const lekMatches = headerText.matchAll(/(\d[\d\s]*[.,]\d{2})\s*LEK/gi);
        let maxVal = 0;
        
        for (const match of lekMatches) {
            const val = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
            if (val > maxVal) maxVal = val;
        }
        
        return maxVal > 0 ? maxVal : null;
    }

    /**
     * Extract total in EUR
     * pic1 shows "Vlera totale në monedhën: 2 980,00 EUR"
     */
    extractTotalEUR(doc) {
        const text = doc.body?.textContent || '';
        
        // Specific pattern: "Total EUR" or "Vlera totale ... EUR"
        const eurMatch = text.match(/(?:Total|Shuma|Vlera).*?(\d[\d\s]*[.,]\d{2})\s*EUR/i);
        
        if (eurMatch) {
            return parseFloat(eurMatch[1].replace(/\s/g, '').replace(',', '.'));
        }
        
        // Fallback: Look for any EUR amount at the end of the document (usually totals are at the bottom)
        // Get the last 1000 characters
        const footerText = text.substring(Math.max(0, text.length - 1000));
        const anyEur = footerText.match(/(\d[\d\s]*[.,]\d{2})\s*EUR/i);
        if (anyEur) {
            return parseFloat(anyEur[1].replace(/\s/g, '').replace(',', '.'));
        }
        
        return null;
    }

    /**
     * Extract exchange rate (LEK to EUR)
     * pic2 shows "Kursi i këmbimit të valutës: 98,13"
     */
    extractExchangeRate(doc, totalEUR) {
        const text = doc.body?.textContent || '';
        
        // Specific pattern from screenshot
        const rateMatch = text.match(/Kursi i këmbimit të valutës[:\s]*(\d+[.,]\d+)/i);
        
        if (rateMatch) {
            return parseFloat(rateMatch[1].replace(',', '.'));
        }
        
        return null;
    }

    /**
     * Extract customer name
     * pic5 shows customer section with "BLERËSI" (buyer)
     */
    extractCustomerName(doc) {
        // Use clean text
        const text = this.getCleanText(doc);
        
        // Look for "Blerësi" specifically
        const bleresiMatch = text.match(/Blerësi[:\s]*([^\n]+)/i);
        if (bleresiMatch) {
            let name = bleresiMatch[1].trim();
            if (name.length > 2) return name;
        }

        // Look for "Detaje të Blerësit" section
        const sectionMatch = text.match(/(?:Detaje të Blerësit|Klienti)([\s\S]{0,500}?)(?:Numri|Adresa|$)/i);
        
        if (sectionMatch) {
            const section = sectionMatch[1];
            
            // Look for "Emri: NAME"
            const nameMatch = section.match(/Emri[:\s]*([^\n]+)/i);
            if (nameMatch) {
                return nameMatch[1].trim();
            }
            
            // Just take the first line that looks like a name
            const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            for (const line of lines) {
                if (!line.toLowerCase().includes('emri') && !line.includes(':') && line.length > 2) {
                    return line;
                }
            }
        }
        
        return null;
    }

    /**
     * Extract customer address
     * pic3 shows "Adresa: ..."
     */
    extractCustomerAddress(doc) {
        const text = this.getCleanText(doc);
        
        // Look for "Adresa"
        // It might be "Adresa: Street..." or "Adresa\nStreet..."
        // Capture up to 2 lines of address
        const adresaMatch = text.match(/Adresa[:\s]*\n?([^\n]+(?:\n[^\n]+)?)/i);
        
        if (adresaMatch) {
            let addr = adresaMatch[1].trim();
            // If it picked up "Qyteti" or "Shteti" or "Numri" in the second line, cut it
            addr = addr.split(/Qyteti|Shteti|Numri/i)[0].trim();
            return addr;
        }
        
        return '';
    }

    /**
     * Extract customer NIPT
     * pic3 shows "Numri Tatimor i Blerësit: L91414015N"
     */
    extractCustomerNIPT(doc) {
        const text = doc.body?.textContent || '';
        
        const sectionIndex = text.indexOf("Detaje të Blerësit");
        if (sectionIndex !== -1) {
            const section = text.substring(sectionIndex, sectionIndex + 500);
            
            const niptMatch = section.match(/Numri Tatimor i Blerësit\s*\n\s*([A-Z0-9]+)/i) || 
                              section.match(/Numri Tatimor i Blerësit[:\s]+([A-Z0-9]+)/i);
            if (niptMatch && niptMatch[1]) {
                return niptMatch[1].trim();
            }
        }
        
        return '';
    }

    /**
     * Extract date from invoice HTML
     * Looks for patterns like "15/11/2025 12:44"
     */
    extractDate(doc) {
        const text = doc.body?.textContent || '';
        
        // Look for "Data dhe Ora" label
        const labelMatch = text.match(/Data dhe Ora[:\s]*(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/i);
        if (labelMatch) {
            const datePart = labelMatch[1];
            // Normalize to YYYY-MM-DD
            // Assume DD/MM/YYYY
            const parts = datePart.split(/[\/\.-]/);
            if (parts.length === 3) {
                return {
                    date: `${parts[2]}-${parts[1]}-${parts[0]}`,
                    time: '00:00:00' // Default time if not found
                };
            }
        }

        // Pattern: DD/MM/YYYY HH:MM
        const dateMatch = text.match(/(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})\s+(\d{2}:\d{2})/);
        
        if (dateMatch) {
            const day = dateMatch[1];
            const month = dateMatch[2];
            const year = dateMatch[3];
            const time = dateMatch[4];
            
            return {
                date: `${year}-${month}-${day}`,
                time: time + ':00'
            };
        }
        
        return null;
    }

    /**
     * Process QR code and extract all invoice data
     * @param {string} qrCodeURL - The QR code URL
     * @returns {Object} - Complete invoice data
     */
    async processQRCode(qrCodeURL) {
        try {
            console.log('Processing fiscal QR code...');
            
            // Parse URL parameters
            const params = this.parseQRCodeURL(qrCodeURL);
            console.log('Parsed parameters:', params);

            // Fetch basic invoice data
            const invoice = await this.fetchInvoiceData(params);
            console.log('Basic invoice data:', invoice);

            // Fetch detailed data from tax portal
            try {
                const detailedData = await this.fetchDetailedInvoice(invoice.verificationURL, invoice);
                if (detailedData) {
                    // Merge detailed data with basic invoice
                    if (detailedData.totalEUR) {
                        invoice.total = detailedData.totalEUR; // EUR amount from page
                    } else if (invoice.totalLEK && detailedData.exchangeRate) {
                        invoice.total = invoice.totalLEK / detailedData.exchangeRate; // Calculate EUR
                    }
                    
                    if (detailedData.totalLEK) {
                        invoice.totalLEK = detailedData.totalLEK;
                    }
                    
                    if (detailedData.items) {
                        invoice.items = detailedData.items;
                    }
                    if (detailedData.paymentType && detailedData.paymentType !== 'unknown') {
                        invoice.paymentType = detailedData.paymentType;
                    }
                    if (detailedData.exchangeRate) {
                        invoice.exchangeRate = detailedData.exchangeRate;
                    }
                    if (detailedData.customerName && detailedData.customerName !== 'Walk-in Customer') {
                        invoice.customer.name = detailedData.customerName;
                    }
                    if (detailedData.customerAddress) {
                        invoice.customer.address = detailedData.customerAddress;
                    }
                    if (detailedData.customerNIPT) {
                        invoice.customer.nipt = detailedData.customerNIPT;
                    }
                    if (detailedData.dateTime) {
                        invoice.date = detailedData.dateTime.date;
                        invoice.time = detailedData.dateTime.time;
                        console.log(`📅 Updated date from HTML: ${invoice.date} ${invoice.time}`);
                    }
                    
                    console.log('✅ Detailed data merged into invoice');
                }
            } catch (detailError) {
                console.warn('⚠️ Could not fetch detailed data, using basic data only:', detailError);
                // Use LEK amount from QR and default exchange rate estimate
                if (!invoice.total && invoice.totalLEK) {
                    invoice.total = invoice.totalLEK / 100; // Rough estimate
                }
            }

            return invoice;
        } catch (error) {
            console.error('Error processing QR code:', error);
            throw error;
        }
    }

    /**
     * Format invoice data for store sale registration
     * @param {Object} invoice - Invoice data
     * @returns {Object} - Formatted sale data
     */
    formatForStoreSale(invoice) {
        // Calculate total EUR if not available
        let totalEUR = invoice.total;
        let exchangeRate = invoice.exchangeRate;

        if (!totalEUR && invoice.totalLEK && exchangeRate) {
            totalEUR = invoice.totalLEK / exchangeRate;
            console.log(`💶 Calculated EUR total: ${invoice.totalLEK} ÷ ${exchangeRate} = €${totalEUR.toFixed(2)}`);
        }
        
        // Process items to ensure they are in EUR
        let items = [];
        if (invoice.items && invoice.items.length > 0) {
            items = invoice.items.map(item => {
                // Clone item to avoid mutating original
                let newItem = { ...item };
                
                // Check if we need to convert from LEK to EUR
                // Conditions:
                // 1. Item explicitly says LEK
                // 2. Invoice is LEK (and item has no currency or matches invoice)
                // 3. We calculated totalEUR from totalLEK (implies invoice is LEK)
                
                const isLek = item.currency === 'LEK' || 
                              (!item.currency && invoice.currency === 'LEK') || 
                              (!invoice.total && invoice.totalLEK);
                
                if (isLek && exchangeRate) {
                    // Convert to EUR
                    // Use total as the source of truth as it's usually what we extract directly
                    const totalEur = item.total / exchangeRate;
                    newItem.total = totalEur;
                    newItem.price = totalEur / (item.quantity || 1);
                    newItem.currency = 'EUR';
                    newItem.originalPriceLEK = item.total;
                } else {
                    // If already EUR or no conversion possible
                    if (!newItem.price) {
                         // If pricePerUnit exists, use it, otherwise calculate
                         newItem.price = newItem.pricePerUnit || (newItem.total / (newItem.quantity || 1));
                    }
                }
                
                return newItem;
            });
        } else {
            items = [{
                name: 'Artikuj nga fatura fiskale',
                quantity: 1,
                price: totalEUR || 0,
                total: totalEUR || 0
            }];
        }
        
        return {
            invoiceNumber: invoice.invoiceNumber,
            nipt: invoice.nipt,
            iic: invoice.iic,
            date: invoice.date,
            time: invoice.time,
            total: totalEUR || 0,
            totalLEK: invoice.totalLEK || 0,
            exchangeRate: exchangeRate || null,
            currency: 'EUR',
            paymentType: invoice.paymentType || 'not specified',
            items: items,
            customerName: invoice.customer?.name || 'Blerës',
            customerAddress: invoice.customer?.address || '',
            customerNIPT: invoice.customer?.nipt || '',
            verificationURL: invoice.verificationURL,
            businessUnit: invoice.businessUnit,
            cashRegister: invoice.cashRegister,
            source: 'fiscal_qr_scan',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Validate invoice data
     * @param {Object} invoice - Invoice data to validate
     * @returns {Object} - Validation result
     */
    validateInvoice(invoice) {
        const errors = [];

        if (!invoice.iic || invoice.iic.length < 10) {
            errors.push('Invalid Invoice Internal Code (IIC)');
        }

        if (!invoice.nipt || invoice.nipt.length < 5) {
            errors.push('Invalid Tax ID (NIPT)');
        }

        if (!invoice.total || invoice.total <= 0) {
            errors.push('Invalid invoice total');
        }

        if (!invoice.invoiceNumber) {
            errors.push('Missing invoice number');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.FiscalInvoiceScanner = FiscalInvoiceScanner;
}
