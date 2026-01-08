// WhatsApp Integration Module
class WhatsAppManager {
    constructor() {
        this.apiEndpoint = 'https://api.whatsapp.com/send';
        this.businessNumber = localStorage.getItem('whatsappBusinessNumber') || '';
    }

    setBusinessNumber(number) {
        this.businessNumber = number;
        localStorage.setItem('whatsappBusinessNumber', number);
    }

    formatPhoneNumber(phone) {
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        
        // Add Albania country code if not present
        if (!cleaned.startsWith('355') && cleaned.length === 9) {
            cleaned = '355' + cleaned;
        }
        
        return cleaned;
    }

    createOrderMessage(order) {
        const items = order.items.map(item => 
            `• ${item.name} x${item.quantity} - €${(item.price * item.quantity).toFixed(2)}`
        ).join('\n');

        const message = `
🛒 *Order Confirmation*

📋 *Order Details:*
${items}

💶 *Total:* €${order.price.toFixed(2)}
${order.courierCost ? `🚚 *Delivery:* €${order.courierCost.toFixed(2)}` : ''}

📍 *Delivery Address:*
${order.address || 'Not specified'}

✅ Thank you for your order!

_Your order will be processed shortly._
        `.trim();

        return message;
    }

    sendOrderConfirmation(order) {
        if (!order.telephone) {
            console.warn('No phone number provided for order');
            return null;
        }

        const phone = this.formatPhoneNumber(order.telephone);
        const message = this.createOrderMessage(order);
        const url = `${this.apiEndpoint}?phone=${phone}&text=${encodeURIComponent(message)}`;
        
        // Open WhatsApp in new window
        window.open(url, '_blank');
        
        return url;
    }

    sendCustomMessage(phone, message) {
        const formattedPhone = this.formatPhoneNumber(phone);
        const url = `${this.apiEndpoint}?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
        return url;
    }

    createStatusUpdateMessage(order, newStatus) {
        const statusEmoji = {
            'Ordered': '📋',
            'Shipped': '🚚',
            'Paid': '✅',
            'Returned': '↩️'
        };

        const message = `
${statusEmoji[newStatus]} *Order Status Update*

Hello ${order.clientName}!

Your order status has been updated to: *${newStatus}*

💶 Total: €${order.price.toFixed(2)}

${newStatus === 'Shipped' ? '📦 Your order is on the way!' : ''}
${newStatus === 'Paid' ? '✅ Payment confirmed. Thank you!' : ''}

_For any questions, please contact us._
        `.trim();

        return message;
    }

    sendStatusUpdate(order, newStatus) {
        if (!order.telephone) return null;
        
        const message = this.createStatusUpdateMessage(order, newStatus);
        return this.sendCustomMessage(order.telephone, message);
    }
}

// Initialize WhatsApp manager
if (typeof window !== 'undefined') {
    window.whatsAppManager = new WhatsAppManager();
}
