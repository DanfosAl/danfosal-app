// Auto Dark Mode & Advanced Theme Features
class AutoThemeManager {
    constructor() {
        this.init();
    }

    init() {
        // Check if auto dark mode is enabled
        const autoDarkMode = localStorage.getItem('autoDarkMode') === 'true';
        
        if (autoDarkMode) {
            this.enableAutoDarkMode();
        }
        
        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                if (localStorage.getItem('followSystem') === 'true') {
                    this.applySystemTheme();
                }
            });
        }
        
        // Check time-based auto theme
        this.checkTimeBasedTheme();
        
        // Set up periodic check (every minute)
        setInterval(() => this.checkTimeBasedTheme(), 60000);
    }

    enableAutoDarkMode() {
        const hour = new Date().getHours();
        
        // Dark mode from 8 PM to 6 AM
        if (hour >= 20 || hour < 6) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    }

    checkTimeBasedTheme() {
        if (localStorage.getItem('autoDarkMode') === 'true') {
            this.enableAutoDarkMode();
        }
    }

    applySystemTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (prefersDark) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    }

    toggleAutoDarkMode(enabled) {
        localStorage.setItem('autoDarkMode', enabled);
        
        if (enabled) {
            this.enableAutoDarkMode();
        }
    }

    toggleFollowSystem(enabled) {
        localStorage.setItem('followSystem', enabled);
        
        if (enabled) {
            this.applySystemTheme();
        }
    }
}

// Pull to Refresh functionality
class PullToRefresh {
    constructor() {
        this.startY = 0;
        this.currentY = 0;
        this.pullThreshold = 80;
        this.isPulling = false;
        
        this.init();
    }

    init() {
        let touchStartY = 0;
        let refreshDiv = null;

        document.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0) {
                touchStartY = e.touches[0].pageY;
                this.isPulling = true;
                
                // Create refresh indicator
                if (!refreshDiv) {
                    refreshDiv = document.createElement('div');
                    refreshDiv.id = 'pull-refresh-indicator';
                    refreshDiv.style.cssText = `
                        position: fixed;
                        top: -80px;
                        left: 0;
                        right: 0;
                        height: 80px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: linear-gradient(135deg, #10b981, #059669);
                        color: white;
                        font-weight: 600;
                        transition: top 0.3s ease;
                        z-index: 9999;
                        font-size: 1.1rem;
                    `;
                    refreshDiv.innerHTML = '⬇️ Pull to refresh';
                    document.body.appendChild(refreshDiv);
                }
            }
        });

        document.addEventListener('touchmove', (e) => {
            if (!this.isPulling) return;
            
            const touchY = e.touches[0].pageY;
            const pullDistance = touchY - touchStartY;
            
            if (pullDistance > 0 && refreshDiv) {
                e.preventDefault();
                const progress = Math.min(pullDistance / this.pullThreshold, 1);
                refreshDiv.style.top = Math.min(pullDistance - 80, 0) + 'px';
                
                if (pullDistance > this.pullThreshold) {
                    refreshDiv.innerHTML = '🔄 Release to refresh';
                } else {
                    refreshDiv.innerHTML = '⬇️ Pull to refresh';
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (!this.isPulling) return;
            
            const touchY = e.changedTouches[0].pageY;
            const pullDistance = touchY - touchStartY;
            
            if (pullDistance > this.pullThreshold && refreshDiv) {
                refreshDiv.innerHTML = '⏳ Refreshing...';
                refreshDiv.style.top = '0px';
                
                // Trigger refresh
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } else if (refreshDiv) {
                refreshDiv.style.top = '-80px';
            }
            
            this.isPulling = false;
        });
    }
}

// Long Press Menu System
class LongPressMenu {
    constructor() {
        this.longPressTimer = null;
        this.longPressDuration = 500; // ms
        this.init();
    }

    init() {
        // Add long press to cards and items
        document.addEventListener('DOMContentLoaded', () => {
            this.attachLongPressListeners();
        });
    }

    attachLongPressListeners() {
        // Attach to order items, product cards, etc.
        const elements = document.querySelectorAll('.card, .product-item, .order-item, .customer-item');
        
        elements.forEach(element => {
            let pressTimer;
            
            element.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    this.showContextMenu(e, element);
                    navigator.vibrate && navigator.vibrate(50); // Haptic feedback
                }, this.longPressDuration);
            });
            
            element.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
            });
            
            element.addEventListener('touchmove', () => {
                clearTimeout(pressTimer);
            });
            
            // Desktop: right-click
            element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, element);
            });
        });
    }

    showContextMenu(event, element) {
        // Remove existing menu
        const existingMenu = document.getElementById('context-menu');
        if (existingMenu) existingMenu.remove();
        
        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            background: rgba(30, 41, 59, 0.98);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 8px;
            z-index: 10000;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            min-width: 180px;
        `;
        
        // Determine menu options based on element type
        const options = this.getMenuOptions(element);
        
        menu.innerHTML = options.map(opt => `
            <div style="
                padding: 12px 16px;
                cursor: pointer;
                border-radius: 8px;
                transition: all 0.2s;
                color: white;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 10px;
            " 
            onmouseover="this.style.background='rgba(255,255,255,0.1)'"
            onmouseout="this.style.background='transparent'"
            onclick="${opt.action}; document.getElementById('context-menu').remove();">
                ${opt.icon} ${opt.label}
            </div>
        `).join('');
        
        // Position menu
        const touch = event.touches ? event.touches[0] : event;
        menu.style.left = touch.pageX + 'px';
        menu.style.top = touch.pageY + 'px';
        
        document.body.appendChild(menu);
        
        // Close menu on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 100);
    }

    getMenuOptions(element) {
        // Default options
        return [
            { icon: '📋', label: 'Copy', action: 'navigator.clipboard.writeText("' + element.textContent.trim() + '")' },
            { icon: '📤', label: 'Share', action: 'alert("Share functionality")' },
            { icon: '⭐', label: 'Favorite', action: 'alert("Added to favorites")' },
            { icon: '🗑️', label: 'Delete', action: 'confirm("Delete this item?")' }
        ];
    }
}

// Gesture Controls
class GestureControls {
    constructor() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.swipeThreshold = 50;
        this.init();
    }

    init() {
        document.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].pageX;
            this.touchStartY = e.touches[0].pageY;
        });

        document.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].pageX;
            const touchEndY = e.changedTouches[0].pageY;
            
            const diffX = touchEndX - this.touchStartX;
            const diffY = touchEndY - this.touchStartY;
            
            // Horizontal swipe
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.swipeThreshold) {
                if (diffX > 0) {
                    this.onSwipeRight();
                } else {
                    this.onSwipeLeft();
                }
            }
            
            // Vertical swipe
            if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > this.swipeThreshold) {
                if (diffY > 0) {
                    this.onSwipeDown();
                } else {
                    this.onSwipeUp();
                }
            }
        });
    }

    onSwipeRight() {
        // Navigate back or open sidebar
        console.log('Swipe right detected');
    }

    onSwipeLeft() {
        // Navigate forward or close sidebar
        console.log('Swipe left detected');
    }

    onSwipeDown() {
        // Pull to refresh handled separately
        console.log('Swipe down detected');
    }

    onSwipeUp() {
        // Scroll to top or show more options
        console.log('Swipe up detected');
    }
}

// Reading Mode
class ReadingMode {
    constructor() {
        this.isEnabled = false;
    }

    toggle() {
        this.isEnabled = !this.isEnabled;
        
        if (this.isEnabled) {
            document.body.classList.add('reading-mode');
            this.addReadingModeStyles();
        } else {
            document.body.classList.remove('reading-mode');
            this.removeReadingModeStyles();
        }
        
        localStorage.setItem('readingMode', this.isEnabled);
    }

    addReadingModeStyles() {
        const style = document.createElement('style');
        style.id = 'reading-mode-styles';
        style.textContent = `
            body.reading-mode {
                font-size: 1.1rem !important;
                line-height: 1.8 !important;
                max-width: 800px !important;
                margin: 0 auto !important;
                padding: 40px 20px !important;
            }
            
            body.reading-mode .card {
                padding: 30px !important;
                margin-bottom: 30px !important;
            }
            
            body.reading-mode p {
                margin-bottom: 20px !important;
            }
            
            body.reading-mode h1, 
            body.reading-mode h2, 
            body.reading-mode h3 {
                margin-top: 30px !important;
                margin-bottom: 20px !important;
            }
        `;
        document.head.appendChild(style);
    }

    removeReadingModeStyles() {
        const style = document.getElementById('reading-mode-styles');
        if (style) style.remove();
    }
}

// Initialize all features
if (typeof window !== 'undefined') {
    window.autoThemeManager = new AutoThemeManager();
    window.pullToRefresh = new PullToRefresh();
    window.longPressMenu = new LongPressMenu();
    window.gestureControls = new GestureControls();
    window.readingMode = new ReadingMode();
}
