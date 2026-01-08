/**
 * Fiscal Invoice Fetcher for Electron
 * Uses Electron IPC to fetch invoice page without CORS restrictions
 */

class FiscalInvoiceFetcher {
    constructor() {
        this.useElectron = typeof window !== 'undefined' && window.electronAPI;
    }

    /**
     * Fetch invoice HTML using Electron's main process (bypasses CORS)
     * @param {string} url - The invoice verification URL
     * @returns {string} - HTML content
     */
    async fetchInvoiceHTML(url) {
        if (this.useElectron && window.electronAPI && window.electronAPI.fetchURL) {
            try {
                console.log('🔧 Using Electron to fetch invoice page...');
                const html = await window.electronAPI.fetchURL(url);
                return html;
            } catch (error) {
                console.error('Electron fetch failed:', error);
                throw error;
            }
        } else {
            // Fallback to regular fetch (will have CORS issues in browser)
            console.log('⚠️ Electron API not available, using regular fetch...');
            const response = await fetch(url);
            return await response.text();
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.FiscalInvoiceFetcher = FiscalInvoiceFetcher;
}
