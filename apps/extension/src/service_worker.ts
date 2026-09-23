// Browser extension service worker for Tari Ootle protocol
// Note: Full wallet implementation requires secure key storage,
// encrypted seed derivation, and message passing to dApp pages.
// This scaffold defines the boundary only.

console.log('Tari Ootle Extension Service Worker started');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING') {
    sendResponse({ status: 'ok' });
    return true;
  }
  if (request.type === 'GET_VERSION') {
    sendResponse({ version: '0.1.0', adapterName: 'BrowserExtensionSigner' });
    return true;
  }
  // Transaction approval/rejection would be handled here in full implementation.
  sendResponse({ error: 'Not implemented in scaffold' });
  return true;
});
