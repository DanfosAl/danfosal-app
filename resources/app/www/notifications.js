// Push Notifications Manager
class NotificationManager {
    constructor(db) {
        this.db = db;
        this.permission = 'default';
        this.soundEnabled = localStorage.getItem('notificationSound') !== 'false';
        this.monitoringInterval = null;
        this.lastOrderCount = 0;
    }

    async requestPermission() {
        if ('Notification' in window) {
            this.permission = await Notification.requestPermission();
            console.log('Notification permission:', this.permission);
            return this.permission === 'granted';
        }
        return false;
    }

    async startMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        // Get initial count
        this.lastOrderCount = parseInt(localStorage.getItem('lastOrderCount') || '0');

        // Monitor using Firebase if available
        if (this.db) {
            const { collection, onSnapshot, query, where } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            const ordersRef = collection(this.db, 'onlineOrders');
            const activeQuery = query(ordersRef, where('status', 'in', ['Ordered', 'Shipped']));
            
            onSnapshot(activeQuery, (snapshot) => {
                const currentCount = snapshot.size;
                
                if (currentCount > this.lastOrderCount && this.lastOrderCount > 0) {
                    const newOrders = currentCount - this.lastOrderCount;
                    this.notify('🛒 New Order Received!', {
                        body: `You have ${newOrders} new order${newOrders > 1 ? 's' : ''}!`,
                        tag: 'new-order',
                        requireInteraction: true
                    });
                }
                
                this.lastOrderCount = currentCount;
                localStorage.setItem('lastOrderCount', currentCount.toString());
                
                // Update badge
                this.updateBadge(currentCount);
            });
        }
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    async notify(title, options = {}) {
        if (this.permission !== 'granted') {
            console.log('Notifications not permitted');
            return;
        }

        const notification = new Notification(title, {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            ...options
        });

        if (this.soundEnabled) {
            this.playNotificationSound();
        }

        notification.onclick = () => {
            window.focus();
            if (options.url) {
                window.location.href = options.url;
            }
            notification.close();
        };

        return notification;
    }

    playNotificationSound() {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Audio play failed:', e));
    }

    updateBadge(count) {
        const badge = document.getElementById('unpaid-orders-badge');
        if (badge && count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }
    }

    toggleSound(enabled) {
        this.soundEnabled = enabled;
        localStorage.setItem('notificationSound', enabled.toString());
    }
}
