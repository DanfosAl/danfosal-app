// Receipt Watcher IPC Listener
// Listens for events from the Electron main process via the preload bridge

(function () {
  if (!window.api) {
    console.warn('Receipt listener: window.api not available (not running in Electron)');
    return;
  }

  window.api.onNewSale(function (data) {
    console.log('📄 New sale detected:', data);
    window.dispatchEvent(new CustomEvent('new-sale', { detail: data }));
  });

  window.api.onNewSaleOffline(function (data) {
    console.log('📄 New offline sale detected:', data);
    window.dispatchEvent(new CustomEvent('new-sale-offline', { detail: data }));
  });

  window.api.onOrderFulfilled(function (data) {
    console.log('✅ Order fulfilled:', data);
    window.dispatchEvent(new CustomEvent('order-fulfilled', { detail: data }));
  });

  window.api.onSyncCompleted(function (data) {
    console.log('🔄 Sync completed:', data);
    window.dispatchEvent(new CustomEvent('sync-completed', { detail: data }));
  });

  window.api.onParseFailed(function (data) {
    console.warn('⚠️ Receipt parse failed:', data);
    window.dispatchEvent(new CustomEvent('parse-failed', { detail: data }));
  });

  window.api.onSaleDetectedGraphics(function (data) {
    console.log('🖼️ Sale detected (graphics):', data);
    window.dispatchEvent(new CustomEvent('sale-detected-graphics', { detail: data }));
  });

  console.log('✅ Receipt listener initialized');
})();
