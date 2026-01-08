// Android Back Button Handler
(async function() {
    // Wait for Capacitor to be ready
    if (window.Capacitor && window.Capacitor.Plugins) {
        try {
            const { App } = window.Capacitor.Plugins;
            
            if (App) {
                // Register back button listener
                App.addListener('backButton', (event) => {
                    // Get current page
                    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                    
                    console.log('Back button pressed on:', currentPage);
                    
                    // If on index/dashboard
                    if (currentPage === 'index.html' || currentPage === '' || currentPage === '/') {
                        // Check if there's history to go back to
                        if (window.history.length > 1) {
                            window.history.back();
                        } else {
                            // No history, minimize the app
                            App.minimizeApp();
                        }
                    } else {
                        // On other pages, use browser history or go to dashboard
                        if (window.history.length > 1 && document.referrer.includes(window.location.origin)) {
                            window.history.back();
                        } else {
                            window.location.href = 'index.html';
                        }
                    }
                });
                
                console.log('Android back button handler registered successfully');
            }
        } catch (error) {
            console.log('Back button handler error:', error);
        }
    } else {
        // Not on mobile, ignore
        console.log('Not running on Capacitor, back button handler skipped');
    }
})();
