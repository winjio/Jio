// Backend Server se connect karna
const socket = io();

// Page Switch karne ka function
function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.getElementById('nav-' + pageId).classList.add('active');
  if (pageId === 'wallet' && typeof generateReferCode === 'function') generateReferCode();
}

// Wallet ke andar Tabs switch karne ka function
function switchWalletTab(tabId) {
  document.querySelectorAll('.wallet-tabs button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.wallet-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.add('active');
  document.getElementById('content-' + tabId).classList.add('active');
  if (tabId === 'history') renderHistory();
}
