// Payment Reminder Service
// Monitors invoices and sends reminders 10 days before due date and daily after

class PaymentReminderService {
    constructor() {
        this.db = null;
        this.checkInterval = null;
        this.notificationPermission = false;
    }

    async initialize(db) {
        this.db = db;
        await this.requestNotificationPermission();
        this.startMonitoring();
        console.log('✅ Payment Reminder Service initialized');
    }

    async requestNotificationPermission() {
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                this.notificationPermission = true;
            } else if (Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                this.notificationPermission = permission === 'granted';
            }
        }
    }

    startMonitoring() {
        // Check every hour for reminders
        this.checkInterval = setInterval(() => {
            this.checkAllInvoices();
        }, 60 * 60 * 1000); // 1 hour

        // Also check immediately
        this.checkAllInvoices();
    }

    stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }

    async checkAllInvoices() {
        if (!this.db) return;

        console.log('🔔 Checking for payment reminders...');
        
        try {
            const { collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            // Get all creditors
            const creditorsRef = collection(this.db, 'creditors');
            const creditorsSnap = await getDocs(creditorsRef);

            for (const creditorDoc of creditorsSnap.docs) {
                const creditorId = creditorDoc.id;
                const creditorName = creditorDoc.data().name;

                // Get unpaid invoices for this creditor
                const invoicesRef = collection(this.db, `creditors/${creditorId}/invoices`);
                const invoicesQuery = query(invoicesRef, where('paid', '==', false));
                const invoicesSnap = await getDocs(invoicesQuery);

                for (const invoiceDoc of invoicesSnap.docs) {
                    const invoice = { id: invoiceDoc.id, ...invoiceDoc.data() };
                    this.checkInvoiceReminder(invoice, creditorName, creditorId);
                }
            }
        } catch (error) {
            console.error('Error checking invoices:', error);
        }
    }

    checkInvoiceReminder(invoice, creditorName, creditorId) {
        // Skip if no date or already paid
        if (!invoice.date || invoice.paid || (invoice.remainingBalance && invoice.remainingBalance <= 0)) {
            return;
        }

        // Parse invoice date (format: DD-MM-YYYY)
        const dateParts = invoice.date.split('-');
        if (dateParts.length !== 3) return;

        const invoiceDate = new Date(
            parseInt(dateParts[2]),  // Year
            parseInt(dateParts[1]) - 1,  // Month (0-indexed)
            parseInt(dateParts[0])  // Day
        );

        // Calculate due date (45 days from invoice date)
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + 45);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);

        const daysUntilDue = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));

        console.log(`Invoice ${invoice.invoiceNumber}: ${daysUntilDue} days until due`);

        // Check if we should send a reminder
        let shouldNotify = false;
        let urgency = 'normal';

        if (daysUntilDue < 0) {
            // Overdue - notify daily
            shouldNotify = true;
            urgency = 'critical';
        } else if (daysUntilDue <= 10) {
            // 10 days or less - notify daily
            shouldNotify = true;
            urgency = daysUntilDue <= 3 ? 'high' : 'normal';
        }

        if (shouldNotify) {
            // Check if we already sent a notification today
            const lastNotification = this.getLastNotificationDate(invoice.id);
            const todayStr = today.toISOString().split('T')[0];

            if (lastNotification !== todayStr) {
                this.sendReminder(invoice, creditorName, creditorId, daysUntilDue, urgency);
                this.setLastNotificationDate(invoice.id, todayStr);
            }
        }
    }

    sendReminder(invoice, creditorName, creditorId, daysUntilDue, urgency) {
        const remainingAmount = invoice.remainingBalance || invoice.totalAmount;
        
        let title, body, icon;

        if (daysUntilDue < 0) {
            title = `⚠️ OVERDUE: Payment to ${creditorName}`;
            body = `Invoice #${invoice.invoiceNumber} is ${Math.abs(daysUntilDue)} days overdue! Amount: €${remainingAmount.toFixed(2)}`;
            icon = '🔴';
        } else if (daysUntilDue === 0) {
            title = `🔔 Payment DUE TODAY: ${creditorName}`;
            body = `Invoice #${invoice.invoiceNumber} is due today! Amount: €${remainingAmount.toFixed(2)}`;
            icon = '🟠';
        } else {
            title = `⏰ Payment Reminder: ${creditorName}`;
            body = `Invoice #${invoice.invoiceNumber} due in ${daysUntilDue} days. Amount: €${remainingAmount.toFixed(2)}`;
            icon = '🟡';
        }

        // Send browser notification
        if (this.notificationPermission) {
            const notification = new Notification(title, {
                body: body,
                icon: icon,
                tag: `invoice-${invoice.id}`,
                requireInteraction: urgency === 'critical'
            });

            notification.onclick = () => {
                window.focus();
                window.location.href = `creditor_detail.html?id=${creditorId}`;
                notification.close();
            };
        }

        // Also log to console
        console.log(`${icon} ${title}: ${body}`);

        // Show in-app notification banner if on the page
        this.showInAppNotification(title, body, urgency, creditorId);
    }

    showInAppNotification(title, body, urgency, creditorId) {
        // Create notification banner
        const banner = document.createElement('div');
        banner.className = 'payment-reminder-banner';
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            max-width: 400px;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            z-index: 10000;
            cursor: pointer;
            transition: transform 0.3s ease;
            ${urgency === 'critical' ? 'background: linear-gradient(135deg, #dc2626, #991b1b);' : 
              urgency === 'high' ? 'background: linear-gradient(135deg, #ea580c, #c2410c);' :
              'background: linear-gradient(135deg, #f59e0b, #d97706);'}
            border: 2px solid rgba(255,255,255,0.2);
        `;

        banner.innerHTML = `
            <div style="color: white;">
                <div style="font-weight: 700; font-size: 1rem; margin-bottom: 4px;">${title}</div>
                <div style="font-size: 0.875rem; opacity: 0.95;">${body}</div>
                <div style="font-size: 0.75rem; margin-top: 8px; opacity: 0.8;">Click to view details</div>
            </div>
        `;

        banner.addEventListener('click', () => {
            window.location.href = `creditor_detail.html?id=${creditorId}`;
        });

        document.body.appendChild(banner);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            banner.style.transform = 'translateX(500px)';
            setTimeout(() => banner.remove(), 300);
        }, 10000);
    }

    getLastNotificationDate(invoiceId) {
        return localStorage.getItem(`notification_${invoiceId}`);
    }

    setLastNotificationDate(invoiceId, dateStr) {
        localStorage.setItem(`notification_${invoiceId}`, dateStr);
    }

    // Manual check trigger
    async checkNow() {
        await this.checkAllInvoices();
    }
}

// Export for use in other files
window.PaymentReminderService = PaymentReminderService;
