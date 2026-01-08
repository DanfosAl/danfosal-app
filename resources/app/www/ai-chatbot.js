// 🤖 AI Chatbot Interface - Floating Assistant for Danfosal App
// This creates the floating chatbot UI that integrates with the AI Agent

class AIChatbotInterface {
    constructor() {
        this.aiAgent = null;
        this.isOpen = false;
        this.isTyping = false;
        this.dragCounter = 0;
        
        this.init();
    }

    async init() {
        this.createChatbotHTML();
        this.bindEvents();
        this.loadChatHistory();
        
        // Initialize Fiscal Scanner globally
        this.initializeFiscalScanner();
        
        // Initialize AI Agent
        try {
            await this.initializeAI();
        } catch (error) {
            console.warn('AI Agent initialization delayed:', error);
            // Will retry when user first interacts
        }

        console.log('🤖 AI Chatbot Interface initialized');
    }

    initializeFiscalScanner() {
        // Initialize fiscal scanner if not already available
        if (!window.fiscalScanner && typeof FiscalInvoiceScanner !== 'undefined') {
            window.fiscalScanner = new FiscalInvoiceScanner();
            console.log('✅ Fiscal Scanner initialized globally');
        } else if (window.fiscalScanner) {
            console.log('✅ Fiscal Scanner already available');
        } else {
            console.warn('⚠️ FiscalInvoiceScanner class not loaded yet');
        }
    }

    createChatbotHTML() {
        const chatbotHTML = `
            <div class="ai-chatbot-container">
                <!-- Toggle Button -->
                <button class="ai-chatbot-toggle" id="ai-toggle">
                    <i class="fas fa-robot"></i>
                    <div class="ai-status-indicator"></div>
                </button>

                <!-- Chat Window -->
                <div class="ai-chatbot-window" id="ai-window">
                    <div class="ai-chatbot-header">
                        <h3>🤖 AI Assistant</h3>
                        <div class="subtitle">Your intelligent business helper</div>
                        <button class="ai-chatbot-close" id="ai-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="ai-chatbot-messages" id="ai-messages">
                        <!-- Welcome Message -->
                        <div class="ai-message">
                            <div class="message-content">
                                👋 Hi! I'm your intelligent business assistant. 
                                
                                I can help you with:
                                • 🧾 **Fiscal QR codes** - Paste e-fiscalization URL to register sales
                                • 📸 **Invoice routing** - I'll guide you to the right scanner
                                • 🛍️ **Customer receipts** → Store Sales scanner
                                • 📦 **Supplier invoices** → Inventory scanner  
                                • 🛍️ **Product questions** - Ask about stock, prices, codes
                                • 📊 **Analytics** - Get business insights
                                • 🧭 **Navigation** - Find features quickly
                                
                                **Scan fiscal invoices:** Just paste the QR code URL from your receipt and I'll automatically register the sale!
                                
                                Or drop an invoice image/PDF and I'll direct you to the best scanner for the job!
                            </div>
                            <div class="message-time">${this.formatTime(new Date())}</div>
                        </div>
                    </div>

                    <!-- Drop Zone (initially hidden) -->
                    <div class="ai-drop-zone" id="ai-drop-zone" style="display: none;">
                        <div class="drop-icon">📸</div>
                        <div class="drop-text">Drop invoice image or PDF here</div>
                        <div class="drop-subtext">I'll scan and process it automatically</div>
                    </div>

                    <!-- Input Area -->
                    <div class="ai-chatbot-input-area">
                        <div class="ai-input-wrapper">
                            <textarea 
                                class="ai-chatbot-input" 
                                id="ai-input" 
                                placeholder="Paste fiscal QR URL / ask anything / drop invoice image"
                                rows="1"
                            ></textarea>
                            <button class="ai-chatbot-send" id="ai-send">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', chatbotHTML);
    }

    bindEvents() {
        const toggle = document.getElementById('ai-toggle');
        const close = document.getElementById('ai-close');
        const window = document.getElementById('ai-window');
        const input = document.getElementById('ai-input');
        const send = document.getElementById('ai-send');
        const messages = document.getElementById('ai-messages');
        const dropZone = document.getElementById('ai-drop-zone');

        // Toggle chat window
        toggle.addEventListener('click', () => this.toggleChat());
        close.addEventListener('click', () => this.closeChat());

        // Send message
        send.addEventListener('click', () => this.sendMessage());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize input
        input.addEventListener('input', () => this.autoResizeInput());

        // Drag and drop for images
        document.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => this.handleDrop(e));

        // File input for mobile
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*,.pdf';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        document.body.appendChild(fileInput);
        
        this.fileInput = fileInput;

        // Click to upload on drop zone
        dropZone.addEventListener('click', () => {
            if (window.innerWidth <= 768) { // Mobile
                this.fileInput.click();
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!window.contains(e.target) && !toggle.contains(e.target) && this.isOpen) {
                this.closeChat();
            }
        });

        // Handle clipboard paste for images (Ctrl+V)
        document.addEventListener('paste', (e) => this.handleClipboardPaste(e));

        // Detect page changes
        this.detectPageChange();
    }

    async initializeAI() {
        if (!window.DanfosalAIAgent) {
            throw new Error('DanfosalAIAgent not loaded');
        }

        if (!window.db) {
            throw new Error('Firebase database not available');
        }

        this.aiAgent = new DanfosalAIAgent(window.db, window.firebaseImports || {
            collection: window.firebase?.firestore?.collection,
            getDocs: window.firebase?.firestore?.getDocs,
            addDoc: window.firebase?.firestore?.addDoc,
            updateDoc: window.firebase?.firestore?.updateDoc,
            doc: window.firebase?.firestore?.doc,
            deleteDoc: window.firebase?.firestore?.deleteDoc
        });

        await this.aiAgent.initialize();
        console.log('✅ AI Agent connected to chatbot');
    }

    toggleChat() {
        if (this.isOpen) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }

    openChat() {
        const window = document.getElementById('ai-window');
        const toggle = document.getElementById('ai-toggle');
        
        window.classList.add('visible');
        toggle.classList.add('active');
        this.isOpen = true;

        // Focus input after animation
        setTimeout(() => {
            document.getElementById('ai-input').focus();
        }, 200);

        // Mark as read (if needed)
        this.markAsRead();
    }

    closeChat() {
        const window = document.getElementById('ai-window');
        const toggle = document.getElementById('ai-toggle');
        
        window.classList.remove('visible');
        toggle.classList.remove('active');
        this.isOpen = false;

        // Hide drop zone
        document.getElementById('ai-drop-zone').style.display = 'none';
        this.dragCounter = 0;
    }

    async sendMessage() {
        const input = document.getElementById('ai-input');
        const message = input.value.trim();
        
        if (!message) return;

        // Clear input
        input.value = '';
        this.autoResizeInput();

        // Add user message to chat
        this.addUserMessage(message);

        console.log('📨 Chatbot processing message:', message.substring(0, 100));
        console.log('🔧 Fiscal scanner available?', !!window.fiscalScanner);

        // Check if this is a fiscal QR code URL
        if (window.fiscalScanner && window.fiscalScanner.isFiscalQRCode(message)) {
            console.log('✅ Fiscal QR detected! Processing...');
            await this.processFiscalQRCode(message);
            return;
        }

        console.log('➡️ Not a fiscal QR, sending to AI Agent...');

        // Show typing indicator
        this.showTyping();

        try {
            // Ensure AI is initialized
            if (!this.aiAgent) {
                await this.initializeAI();
            }

            // Process message with AI
            const response = await this.aiAgent.processMessage(message);
            
            // Hide typing indicator
            this.hideTyping();

            // Add AI response
            this.addAIMessage(response);

        } catch (error) {
            console.error('❌ Error processing message:', error);
            this.hideTyping();
            this.addAIMessage({
                message: "I'm having trouble connecting to my brain 🧠. Please refresh the page and try again!",
                type: 'error'
            });
        }
    }

    addUserMessage(message) {
        const messagesContainer = document.getElementById('ai-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'user-message';
        
        messageDiv.innerHTML = `
            <div class="message-content">${this.escapeHtml(message)}</div>
            <div class="message-time">${this.formatTime(new Date())}</div>
        `;

        messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addAIMessage(response) {
        const messagesContainer = document.getElementById('ai-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'ai-message';
        
        let typeIcon = this.getTypeIcon(response.type);
        let messageHTML = `
            <div class="message-content">
                ${typeIcon} ${this.formatMessage(response.message)}
            </div>
            <div class="message-time">${this.formatTime(new Date())}</div>
        `;

        // Add buttons if provided
        if (response.buttons && response.buttons.length > 0) {
            messageHTML += '<div class="message-buttons">';
            response.buttons.forEach((button, index) => {
                const buttonId = `btn_${response.timestamp}_${index}`;
                messageHTML += `
                    <button class="message-button" id="${buttonId}" data-timestamp="${response.timestamp}" data-index="${index}">
                        ${button.text}
                    </button>
                `;
            });
            messageHTML += '</div>';
        }

        messageDiv.innerHTML = messageHTML;
        messageDiv.dataset.timestamp = response.timestamp;
        messageDiv.dataset.buttons = JSON.stringify(response.buttons || []);

        messagesContainer.appendChild(messageDiv);
        
        // Bind click events to buttons after adding to DOM
        if (response.buttons && response.buttons.length > 0) {
            response.buttons.forEach((button, index) => {
                const buttonElement = document.getElementById(`btn_${response.timestamp}_${index}`);
                if (buttonElement) {
                    buttonElement.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleButtonAction(button, response.timestamp, index);
                    });
                }
            });
        }
        this.scrollToBottom();

        // Execute any immediate action
        if (response.action && typeof response.action === 'function') {
            setTimeout(() => response.action(), 1000);
        }
    }

    handleButtonAction(button, timestamp, index) {
        console.log('🔘 Button clicked:', button.text, 'at', timestamp);
        
        // Show user feedback
        this.addUserMessage(`Selected: ${button.text}`);
        
        this.showTyping();
        
        try {
            // Handle special action types
            if (button.action === 'focus_input') {
                this.hideTyping();
                const input = document.getElementById('ai-input');
                if (input) {
                    input.focus();
                    this.addAIMessage({
                        message: '📝 Input field focused. Paste your next QR code here!',
                        type: 'success'
                    });
                }
                return;
            }
            
            if (typeof button.action === 'string' && button.action.startsWith('store_and_navigate:')) {
                this.hideTyping();
                const page = button.action.split(':')[1];
                
                // Store data for the next page
                if (button.data) {
                    console.log('💾 Storing pending sale data for navigation:', button.data);
                    sessionStorage.setItem('pendingFiscalSale', JSON.stringify(button.data));
                }
                
                if (page) {
                    window.location.href = page;
                }
                return;
            }

            if (typeof button.action === 'string' && button.action.startsWith('update_order_shipped:')) {
                const orderId = button.action.split(':')[1];
                this.updateOrderStatus(orderId, 'Shipped').then(() => {
                    this.hideTyping();
                    this.addAIMessage({
                        message: '✅ **Order updated to Shipped!**\n\nStock has been deducted.\n\n🛡️ Opening warranty page...',
                        type: 'success'
                    });
                    
                    // Navigate to warranty page
                    setTimeout(() => {
                        if (window.location.href.includes('orders_online.html')) {
                            if (typeof window.openWarrantyModal === 'function') {
                                window.openWarrantyModal(orderId);
                            } else {
                                console.warn('openWarrantyModal not found');
                            }
                        } else {
                            sessionStorage.setItem('pendingWarrantyOrder', orderId);
                            window.location.href = 'orders_online.html';
                        }
                    }, 1500);
                    
                }).catch(err => {
                    this.hideTyping();
                    this.addAIMessage({
                        message: `❌ Failed to update order: ${err.message}`,
                        type: 'error'
                    });
                });
                return;
            }

            if (button.action === 'register_new_sale') {
                this.registerStoreSale(button.data);
                return;
            }

            if (typeof button.action === 'string' && button.action.startsWith('navigate:')) {
                this.hideTyping();
                const page = button.action.split(':')[1];
                if (page) {
                    window.location.href = page;
                }
                return;
            }
            
            if (button.action === 'confirm') {
                this.hideTyping();
                this.processConfirmation('yes');
            } else if (button.action === 'cancel') {
                this.hideTyping();
                this.processConfirmation('no');
            } else if (button.action === 'review') {
                this.hideTyping();
                this.processConfirmation('review');
            } else if (typeof button.action === 'function') {
                // Execute the function and handle its response
                console.log('📞 Executing button action function...');
                
                try {
                    const result = button.action();
                    
                    // If it's a promise, handle it
                    if (result && typeof result.then === 'function') {
                        result.then(response => {
                            this.hideTyping();
                            if (response && response.message) {
                                this.addAIMessage(response);
                            }
                        }).catch(error => {
                            console.error('Error in button action:', error);
                            this.hideTyping();
                            this.addAIMessage({
                                message: `Error: ${error.message || 'Action failed'}`,
                                type: 'error'
                            });
                        });
                    } else {
                        // Synchronous response
                        this.hideTyping();
                        if (result && result.message) {
                            this.addAIMessage(result);
                        }
                    }
                } catch (error) {
                    console.error('Error executing button action:', error);
                    this.hideTyping();
                    this.addAIMessage({
                        message: `Error: ${error.message || 'Action failed'}`,
                        type: 'error'
                    });
                }
            } else {
                this.hideTyping();
                console.warn('Unknown button action:', button.action);
            }
        } catch (error) {
            console.error('Error handling button action:', error);
            this.hideTyping();
            this.addAIMessage({
                message: `Error: ${error.message || 'Action failed'}`,
                type: 'error'
            });
        }
    }

    // Keep the old method for backwards compatibility
    handleButtonClick(timestamp, buttonIndex) {
        console.log('🔘 Legacy button click handler');
        const messageDiv = document.querySelector(`[data-timestamp="${timestamp}"]`);
        if (!messageDiv) return;

        const buttons = JSON.parse(messageDiv.dataset.buttons || '[]');
        const button = buttons[buttonIndex];
        
        if (!button) return;
        
        this.handleButtonAction(button, timestamp, buttonIndex);
    }

    async registerStoreSale(saleData) {
        this.addAIMessage({
            message: '💾 Registering sale in database...',
            type: 'info'
        });

        try {
            // Check if we're on Store Sales page and can save
            if (window.invoiceScanner && typeof window.invoiceScanner.processFiscalInvoice === 'function') {
                // Full processing - save to Firebase
                const result = await window.invoiceScanner.processFiscalInvoice(saleData);
                
                if (result.success) {
                    const displayTotal = saleData.total || (saleData.totalLEK && saleData.exchangeRate ? saleData.totalLEK / saleData.exchangeRate : 0);
                    
                    this.addAIMessage({
                        message: `✅ **Sale registered successfully!**\n\n🏪 Sale ID: ${result.saleId}\n💰 Total: €${displayTotal.toFixed(2)}\n📄 Warranty card generated automatically!`,
                        type: 'success',
                        buttons: [
                            {
                                text: '🛍️ View Store Sales',
                                action: 'navigate:store-sales.html',
                                type: 'primary'
                            },
                            {
                                text: '🧾 Scan Another QR',
                                action: 'focus_input',
                                type: 'secondary'
                            }
                        ]
                    });
                } else {
                    throw new Error(result.error || 'Failed to register sale');
                }
            } else {
                // Preview mode - not on Store Sales page
                const displayTotal = saleData.total || (saleData.totalLEK && saleData.exchangeRate ? saleData.totalLEK / saleData.exchangeRate : 0);
                
                let message = `✅ **Fiscal invoice data extracted!**\n\n`;
                message += `📅 Date: ${saleData.date}\n`;
                message += `👤 Customer: ${saleData.customerName}\n`;
                message += `💰 Total: €${displayTotal.toFixed(2)}\n`;
                
                if (saleData.items && saleData.items.length > 0) {
                    message += `\n📦 **Items:**\n`;
                    saleData.items.forEach(item => {
                        let itemText = `- ${item.name}`;
                        
                        // Calculate EUR price if available
                        let priceEUR = 0;
                        if (item.currency === 'LEK' && saleData.exchangeRate) {
                            priceEUR = item.total / saleData.exchangeRate;
                        } else if (item.currency === 'EUR') {
                            priceEUR = item.total;
                        }
                        
                        // Display price in EUR
                        if (priceEUR > 0) {
                            itemText += ` €${priceEUR.toFixed(2)}`;
                        }
                        
                        if (item.quantity && item.quantity !== 1) {
                            itemText += ` (${item.quantity}x)`;
                        }
                        
                        message += `${itemText}\n`;
                    });
                }

                message += `\n⚠️ To register this sale, please go to Store Sales page.`;
                
                this.addAIMessage({
                    message: message,
                    type: 'info',
                    buttons: [
                        {
                            text: '🛍️ Go to Store Sales & Register',
                            action: 'store_and_navigate:store-sales.html',
                            data: saleData,
                            type: 'primary'
                        },
                        {
                            text: '🧾 Scan Another QR',
                            action: 'focus_input',
                            type: 'secondary'
                        }
                    ]
                });
            }
        } catch (error) {
            console.error('Error registering sale:', error);
            this.addAIMessage({
                message: `❌ Failed to register sale: ${error.message}`,
                type: 'error'
            });
        }
    }

    async processFiscalQRCode(qrURL) {
        if (this.isProcessingQR) {
            console.log('⚠️ Already processing a QR code, skipping...');
            return;
        }

        // Add check for duplicate URL within short time
        const now = Date.now();
        if (this.lastQR === qrURL && (now - (this.lastQRTime || 0)) < 5000) {
             console.log('⚠️ Duplicate QR scan detected, skipping...');
             return;
        }
        this.lastQR = qrURL;
        this.lastQRTime = now;

        this.isProcessingQR = true;
        console.log('🧾 Processing fiscal QR code...');
        
        this.addAIMessage({
            message: '🔍 Detected fiscal invoice QR code!\n\n⏳ Extracting data from QR parameters...\n🌐 Attempting to fetch detailed invoice...\n\nPlease wait...',
            type: 'info'
        });

        try {
            // Process QR code (this tries to fetch portal page, falls back to QR data)
            const fiscalData = await window.fiscalScanner.processQRCode(qrURL);
            
            // Build message with available data
            const totalEUR = fiscalData.total || (fiscalData.totalLEK && fiscalData.exchangeRate ? fiscalData.totalLEK / fiscalData.exchangeRate : null);
            const itemCount = fiscalData.items?.length || 0;
            
            let message = `✅ **Fiscal invoice data extracted!**\n\n`;
            message += `📅 Date: ${fiscalData.date} ${fiscalData.time}\n`;
            message += `👤 Customer: ${fiscalData.customer?.name || 'Walk-in'}\n\n`;
            
            if (totalEUR) {
                message += `💶 **Total EUR:** €${totalEUR.toFixed(2)}\n`;
            }
            
            if (itemCount > 0) {
                message += `\n📦 **Items:**\n`;
                if (fiscalData.items && Array.isArray(fiscalData.items)) {
                    fiscalData.items.forEach(item => {
                        message += `- ${item.name}\n`;
                    });
                } else {
                    message += `${itemCount} product(s)\n`;
                }
            }
            
            this.addAIMessage({
                message: message,
                type: 'success'
            });

            this.addAIMessage({
                message: '💾 Registering sale in database...',
                type: 'info'
            });

            // Format for store sale
            const saleData = window.fiscalScanner.formatForStoreSale(fiscalData);
            
            // Check for matching online order first
            const matchingOrder = await this.checkOnlineOrders(saleData);
            
            if (matchingOrder) {
                this.addAIMessage({
                    message: `📦 **Found matching Online Order!**\n\nCustomer: ${matchingOrder.clientName}\nStatus: ${matchingOrder.status}\n\nDo you want to update this order to **Shipped** instead of creating a new store sale?`,
                    type: 'info',
                    buttons: [
                        {
                            text: '🚚 Update to Shipped',
                            action: `update_order_shipped:${matchingOrder.id}`,
                            type: 'primary'
                        },
                        {
                            text: '🏪 Register as New Sale',
                            action: 'register_new_sale',
                            data: saleData,
                            type: 'secondary'
                        }
                    ]
                });
            } else {
                // Proceed with normal registration
                await this.registerStoreSale(saleData);
            }

        } catch (error) {
            console.error('❌ Error processing fiscal QR:', error);
            this.addAIMessage({
                message: `❌ **Error processing QR code:**\n${error.message}\n\nPlease make sure:\n• You're on the Store Sales page\n• The QR URL is complete\n• The invoice data is valid`,
                type: 'error'
            });
        } finally {
            this.isProcessingQR = false;
        }
    }

    async processConfirmation(response) {
        this.addUserMessage(response);
        this.showTyping();

        try {
            const aiResponse = await this.aiAgent.processMessage(response);
            this.hideTyping();
            this.addAIMessage(aiResponse);
        } catch (error) {
            console.error('❌ Error processing confirmation:', error);
            this.hideTyping();
            this.addAIMessage({
                message: "Sorry, I had trouble processing your response. Please try again.",
                type: 'error'
            });
        }
    }

    showTyping() {
        const messagesContainer = document.getElementById('ai-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-typing-indicator';
        typingDiv.id = 'ai-typing';
        
        typingDiv.innerHTML = `
            <div class="ai-typing-dots">
                <div class="ai-typing-dot"></div>
                <div class="ai-typing-dot"></div>
                <div class="ai-typing-dot"></div>
            </div>
            <span>AI is thinking...</span>
        `;

        messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
        this.isTyping = true;
    }

    hideTyping() {
        const typingIndicator = document.getElementById('ai-typing');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        this.isTyping = false;
    }

    // ═══════════════════════════════════════
    // 📸 DRAG & DROP HANDLING
    // ═══════════════════════════════════════

    handleDragEnter(e) {
        e.preventDefault();
        this.dragCounter++;
        
        if (this.dragCounter === 1) {
            this.showDropZone();
        }
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.dragCounter--;
        
        if (this.dragCounter === 0) {
            this.hideDropZone();
        }
    }

    async handleDrop(e) {
        e.preventDefault();
        this.dragCounter = 0;
        this.hideDropZone();

        const files = Array.from(e.dataTransfer.files);
        const validFiles = files.filter(file => 
            file.type.startsWith('image/') || file.type === 'application/pdf'
        );

        if (validFiles.length === 0) {
            this.addAIMessage({
                message: "Please drop image files (JPG, PNG, etc.) or PDF documents only. I can process invoices, receipts, and other business documents! 📸",
                type: 'warning'
            });
            return;
        }

        // Open chat if not open
        if (!this.isOpen) {
            this.openChat();
        }

        // Process first valid file
        await this.processImageFile(validFiles[0]);
    }

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            this.addAIMessage({
                message: "Please select an image file (JPG, PNG, etc.) or PDF document. I can process invoices, receipts, and other business documents! 📸",
                type: 'warning'
            });
            return;
        }

        await this.processImageFile(file);
        e.target.value = ''; // Reset input
    }

    async handleClipboardPaste(e) {
        // Check if Store Invoice Scanner modal is open - if so, let it handle the paste
        const scannerModal = document.getElementById('invoice-scanner-modal');
        if (scannerModal && scannerModal.style.display !== 'none') {
            return;
        }

        // Only handle paste when chat is open or anywhere on the page
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                
                // Open chat if not open
                if (!this.isOpen) {
                    this.openChat();
                    // Wait for chat to open
                    await new Promise(resolve => setTimeout(resolve, 300));
                }

                // Show notification that image was pasted
                this.addUserMessage("📋 Pasted image from clipboard");
                
                const blob = item.getAsFile();
                await this.processImageFile(blob);
                break;
            }
        }
    }

    async processImageFile(file) {
        // Add user message showing the image or PDF
        this.addUserMessage(`📸 Uploaded: ${file.name}`);
        this.showTyping();

        try {
            // Ensure AI is initialized
            if (!this.aiAgent) {
                await this.initializeAI();
            }

            let dataURL;
            if (file.type === 'application/pdf') {
                console.log('📄 Processing PDF file...');
                
                // Wait for pdf.js to be loaded
                let retries = 0;
                while (typeof window.pdfjsLib === 'undefined' && retries < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    retries++;
                }
                
                if (typeof window.pdfjsLib === 'undefined') {
                    throw new Error('PDF library not loaded. Please refresh the page.');
                }
                
                try {
                    // Read PDF as ArrayBuffer
                    console.log('Reading PDF file...');
                    const arrayBuffer = await file.arrayBuffer();
                    
                    console.log('Loading PDF document...');
                    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
                    const pdf = await loadingTask.promise;
                    
                    console.log(`📄 PDF has ${pdf.numPages} page(s) - processing all pages...`);
                    
                    // Create a large canvas to hold all pages vertically
                    const masterCanvas = document.createElement('canvas');
                    const masterContext = masterCanvas.getContext('2d');
                    
                    // First pass: calculate total height
                    let totalHeight = 0;
                    let maxWidth = 0;
                    const pageViewports = [];
                    
                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 2 });
                        pageViewports.push(viewport);
                        totalHeight += viewport.height;
                        maxWidth = Math.max(maxWidth, viewport.width);
                    }
                    
                    // Set master canvas size
                    masterCanvas.width = maxWidth;
                    masterCanvas.height = totalHeight;
                    
                    // Second pass: render all pages
                    let currentY = 0;
                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                        console.log(`Rendering page ${pageNum}/${pdf.numPages}...`);
                        const page = await pdf.getPage(pageNum);
                        const viewport = pageViewports[pageNum - 1];
                        
                        // Create temporary canvas for this page
                        const tempCanvas = document.createElement('canvas');
                        const tempContext = tempCanvas.getContext('2d');
                        tempCanvas.width = viewport.width;
                        tempCanvas.height = viewport.height;
                        
                        const renderTask = page.render({ canvasContext: tempContext, viewport: viewport });
                        await renderTask.promise;
                        
                        // Copy to master canvas
                        masterContext.drawImage(tempCanvas, 0, currentY);
                        currentY += viewport.height;
                    }
                    
                    dataURL = masterCanvas.toDataURL('image/png');
                    console.log(`✅ PDF converted to single image (${pdf.numPages} pages combined)`);
                    
                } catch (pdfError) {
                    console.error('PDF conversion error:', pdfError);
                    throw new Error(`PDF conversion failed: ${pdfError.message || 'Unknown PDF error'}`);
                }
            } else {
                // Convert image file to data URL
                dataURL = await this.fileToDataURL(file);
            }

            // Process with AI
            console.log('📤 Sending to AI Agent for processing...');
            const response = await this.aiAgent.processMessage('', [dataURL]);
            this.hideTyping();
            this.addAIMessage(response);

        } catch (error) {
            console.error('❌ Error processing file:', error);
            const errorMessage = error.message || error.toString() || 'Unknown error';
            this.hideTyping();
            this.addAIMessage({
                message: `I had trouble processing this file: ${errorMessage}. Please make sure it's a clear photo of an invoice or PDF and try again! 📸`,
                type: 'error'
            });
        }
    }

    fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    showDropZone() {
        const dropZone = document.getElementById('ai-drop-zone');
        dropZone.style.display = 'block';
        dropZone.classList.add('dragover');

        // Auto-open chat if not open
        if (!this.isOpen) {
            this.openChat();
        }
    }

    hideDropZone() {
        const dropZone = document.getElementById('ai-drop-zone');
        dropZone.style.display = 'none';
        dropZone.classList.remove('dragover');
    }

    // ═══════════════════════════════════════
    // 🛠️ UTILITY METHODS
    // ═══════════════════════════════════════

    autoResizeInput() {
        const input = document.getElementById('ai-input');
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('ai-messages');
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatMessage(message) {
        // Convert markdown-style formatting to HTML
        return message
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>')
            .replace(/• /g, '• ');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getTypeIcon(type) {
        const icons = {
            'info': 'ℹ️',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌'
        };
        return icons[type] || 'ℹ️';
    }

    detectPageChange() {
        // Monitor page changes to update AI context
        const currentPage = this.getCurrentPageName();
        
        if (this.aiAgent) {
            this.aiAgent.setCurrentPage(currentPage);
        }

        // Listen for navigation changes
        window.addEventListener('popstate', () => {
            const newPage = this.getCurrentPageName();
            if (this.aiAgent) {
                this.aiAgent.setCurrentPage(newPage);
            }
        });
    }

    getCurrentPageName() {
        const path = window.location.pathname;
        const fileName = path.split('/').pop() || 'index.html';
        return fileName.replace('.html', '');
    }

    loadChatHistory() {
        // Load from localStorage if available
        try {
            const history = localStorage.getItem('danfosal_ai_chat_ui');
            if (history) {
                const messages = JSON.parse(history);
                // Could restore recent messages if needed
            }
        } catch (error) {
            console.warn('Could not load chat history:', error);
        }
    }

    markAsRead() {
        // Mark any notifications as read
        const toggle = document.getElementById('ai-toggle');
        toggle.classList.remove('has-notification');
    }

    async checkOnlineOrders(saleData) {
        if (!window.db || !window.firebaseImports) {
            console.warn('Firebase not initialized, cannot check online orders');
            return null;
        }

        const { collection, getDocs } = window.firebaseImports;
        
        try {
            console.log('🔎 Checking for matching online orders...');
            const ordersRef = collection(window.db, 'onlineOrders');
            const snapshot = await getDocs(ordersRef);
            const orders = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            // Filter for 'Ordered' status
            const pendingOrders = orders.filter(o => o.status === 'Ordered');
            
            if (pendingOrders.length === 0) {
                console.log('No pending online orders found.');
                return null;
            }

            // Normalize sale customer name
            const saleCustomerName = (saleData.customerName || '').toLowerCase().trim();
            if (!saleCustomerName || saleCustomerName === 'blerës' || saleCustomerName === 'walk-in') {
                return null;
            }

            // Find match
            const matchedOrder = pendingOrders.find(order => {
                if (!order.clientName) return false;
                const orderName = order.clientName.toLowerCase().trim();
                
                // Check name similarity (contains)
                // e.g. "Artur Makeshdedaj" vs "Artur"
                const nameMatch = orderName.includes(saleCustomerName) || saleCustomerName.includes(orderName);
                
                if (!nameMatch) return false;
                
                // Check if at least one item matches
                // saleData.items vs order.items
                if (!saleData.items || !order.items) return false;

                const hasItemMatch = saleData.items.some(saleItem => {
                    return order.items.some(orderItem => {
                        const sName = (saleItem.name || '').toLowerCase();
                        const oName = (orderItem.name || '').toLowerCase();
                        
                        // Ignore generic names
                        if (sName.includes('artikuj') || sName.includes('fature')) return false;

                        // Simple containment check
                        // e.g. "Gome per terjen..." vs "Gome"
                        return sName.includes(oName) || oName.includes(sName);
                    });
                });
                
                return hasItemMatch;
            });
            
            if (matchedOrder) {
                console.log('✅ Found matching online order:', matchedOrder);
            }
            
            return matchedOrder || null;
            
        } catch (error) {
            console.error('Error checking online orders:', error);
            return null;
        }
    }

    async updateOrderStatus(orderId, newStatus) {
        if (!window.db || !window.firebaseImports) {
            throw new Error('Firebase not initialized');
        }
        const { doc, updateDoc } = window.firebaseImports;
        
        const orderRef = doc(window.db, 'onlineOrders', orderId);
        await updateDoc(orderRef, {
            status: newStatus,
            lastUpdated: new Date().toISOString(),
            stockDeducted: true // Mark stock as deducted since we are shipping it
        });
    }
}

// Initialize the chatbot when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other scripts to load
    setTimeout(() => {
        window.aiChatbot = new AIChatbotInterface();
    }, 1000);
});

console.log('🤖 AI Chatbot Interface loaded');