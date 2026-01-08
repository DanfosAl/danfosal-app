// Global Keyboard Navigation Handler
// Makes all "back" buttons work with browser back button and keyboard shortcuts

(function() {
    'use strict';
    
    console.log('🎹 Keyboard Navigation initialized');
    
    // Track if we're on the index page
    const isIndexPage = () => {
        return window.location.pathname.endsWith('index.html') || 
               window.location.pathname.endsWith('/') ||
               window.location.pathname === '/index.html';
    };
    
    // Safe navigation back - stops at index
    const safeGoBack = (fallbackUrl = 'index.html') => {
        // If we're already on index, don't go back
        if (isIndexPage()) {
            console.log('🏠 Already on index page, not going back');
            return false;
        }
        
        // Check if we have meaningful history
        if (window.history.length > 1) {
            // Get the referrer to see where we came from
            const referrer = document.referrer;
            
            // If referrer is empty or external, go to fallback
            if (!referrer || !referrer.includes(window.location.host)) {
                console.log('📍 No internal referrer, going to:', fallbackUrl);
                window.location.href = fallbackUrl;
                return true;
            }
            
            // If referrer is index and we're not on index, we can go back
            console.log('⬅️ Going back in history');
            window.history.back();
            return true;
        } else {
            // No history, navigate to fallback
            console.log('📍 No history, going to:', fallbackUrl);
            window.location.href = fallbackUrl;
            return true;
        }
    };
    
    // Handle all link clicks to use proper navigation
    document.addEventListener('DOMContentLoaded', function() {
        // Convert all href links to use history API
        document.addEventListener('click', function(e) {
            const link = e.target.closest('a[href], button[onclick*="window.location"], button[onclick*="href"]');
            
            if (link) {
                const href = link.getAttribute('href');
                const onclick = link.getAttribute('onclick');
                
                // Check if it's a back-type navigation
                const isBackButton = 
                    link.textContent.toLowerCase().includes('back') ||
                    link.innerHTML.toLowerCase().includes('arrow-left') ||
                    link.innerHTML.toLowerCase().includes('fa-arrow-left') ||
                    (onclick && onclick.includes('history.back'));
                
                if (isBackButton) {
                    e.preventDefault();
                    
                    // Extract fallback URL from href or onclick
                    let fallbackUrl = 'index.html';
                    if (href && !href.startsWith('#')) {
                        fallbackUrl = href;
                    } else if (onclick) {
                        const hrefMatch = onclick.match(/['"](.*?\.html.*?)['"]/);
                        if (hrefMatch) {
                            fallbackUrl = hrefMatch[1];
                        }
                    }
                    
                    safeGoBack(fallbackUrl);
                }
            }
        });
        
        // Handle keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // Backspace key (when not in input field)
            if (e.key === 'Backspace' && 
                !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) &&
                !e.target.isContentEditable) {
                
                e.preventDefault();
                safeGoBack();
            }
            
            // Alt + Left Arrow (browser back shortcut)
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                safeGoBack();
            }
            
            // Alt + Right Arrow (browser forward shortcut)
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                // Only allow forward if not on index
                if (!isIndexPage() && window.history.length > 0) {
                    window.history.forward();
                }
            }
        });
        
        // Prevent navigation loops by tracking visited pages
        const visitedPages = JSON.parse(sessionStorage.getItem('visitedPages') || '[]');
        const currentPage = window.location.pathname;
        
        // Add current page to history
        if (!visitedPages.includes(currentPage)) {
            visitedPages.push(currentPage);
            sessionStorage.setItem('visitedPages', JSON.stringify(visitedPages));
        }
        
        // Make browser back/forward buttons work properly
        window.addEventListener('popstate', function(e) {
            console.log('🔙 Navigation: back button pressed');
            
            // If trying to go back past index, stop at index
            if (isIndexPage()) {
                console.log('🏠 Stopping at index page');
                // Replace state to prevent further back navigation
                history.pushState(null, '', 'index.html');
            }
        });
        
        // Prevent going back past index on initial load
        if (isIndexPage()) {
            // Replace the current state so back button is disabled on index
            history.replaceState(null, '', 'index.html');
        }
    });
    
    // Helper function to make any button act as a back button
    window.makeBackButton = function(buttonElement, fallbackUrl = 'index.html') {
        if (!buttonElement) return;
        
        buttonElement.addEventListener('click', function(e) {
            e.preventDefault();
            safeGoBack(fallbackUrl);
        });
    };
    
    // Auto-detect and fix all back buttons on page load
    window.addEventListener('load', function() {
        // Find all buttons/links that look like back buttons
        const backButtons = document.querySelectorAll(
            'a[href*="back"], ' +
            'button[onclick*="back"], ' +
            'a:has(.fa-arrow-left), ' +
            'button:has(.fa-arrow-left), ' +
            '[class*="back-btn"]'
        );
        
        backButtons.forEach(button => {
            const href = button.getAttribute('href');
            const fallback = href && !href.startsWith('#') ? href : 'index.html';
            console.log('🔙 Auto-fixed back button:', button.textContent.trim().substring(0, 30));
            window.makeBackButton(button, fallback);
        });
    });
    
})();
