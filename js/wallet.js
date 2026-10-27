// Restore pending transaction status after reconnecting to the backend.
socket.on('connect', () => {
  if (!currentUser || !Array.isArray(currentUser.transactions)) return;
  const pendingIds = currentUser.transactions
    .filter(tx => tx && tx.status === 'Pending' && tx.id)
    .map(tx => tx.id);
  if (pendingIds.length) socket.emit('sync_transactions', pendingIds);
});

// Telegram approval/rejection events refresh the authoritative Firestore profile.
socket.on('transaction_approved', async (txId) => {
  if (!currentUser) return;
  const tx = (currentUser.transactions || []).find(t => t.id === txId);
  if (!tx || tx.status !== 'Pending') return;
  try {
    const data = await apiRequest('/api/me');
    currentUser = data.user;
    localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
    updateProfileUI(); renderHistory();
    alert(tx.type === 'withdraw' ? '✅ Withdrawal approved. Wallet updated.' : '✅ Deposit approved. Wallet updated.');
  } catch (err) { console.error('Could not refresh approved wallet:', err.message); }
});

socket.on('transaction_rejected', async (txId) => {
  if (!currentUser) return;
  const tx = (currentUser.transactions || []).find(t => t.id === txId);
  if (!tx || tx.status !== 'Pending') return;
  try {
    const data = await apiRequest('/api/me');
    currentUser = data.user;
    localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
    updateProfileUI(); renderHistory();
    alert(tx.type === 'withdraw' ? '❌ Withdrawal rejected. Amount refunded.' : '❌ Deposit rejected.');
  } catch (err) { console.error('Could not refresh rejected transaction:', err.message); }
});

function openPaymentPage(amount) {
  if (!currentUser || !localStorage.getItem(AUTH_TOKEN_KEY)) { alert('Please log in first.'); return; }
  window.location.href = 'payment.html?amount=' + encodeURIComponent(amount);
}
function continueToPayment() {
  const amount = Number(document.getElementById('depositAmount').value);
  if (!Number.isFinite(amount) || amount < 100 || amount > 1000000 || Math.floor(amount) !== amount) {
    alert('Enter a whole amount between ₹100 and ₹10,00,000.'); return;
  }
  openPaymentPage(amount);
}

function toggleWithdrawMethod() {
  const method = document.getElementById('withdrawMethod')?.value || 'upi';
  const upiFields = document.getElementById('withdrawUpiFields');
  const bankFields = document.getElementById('withdrawBankFields');
  if (upiFields) upiFields.style.display = method === 'upi' ? '' : 'none';
  if (bankFields) bankFields.style.display = method === 'bank' ? '' : 'none';
}

async function processWithdraw() {
  if (!currentUser) { alert('Please log in first.'); return; }
  const amount = Number(document.getElementById('withdrawAmount').value);
  const method = document.getElementById('withdrawMethod')?.value || 'upi';
  const payout = { method };
  if (!Number.isFinite(amount) || amount < 500 || Math.round(amount * 100) !== amount * 100) {
    alert('Minimum withdrawal is ₹500. Enter a valid amount.'); return;
  }
  if (amount > Number(currentUser.balance || 0)) { alert('Insufficient balance!'); return; }
  if (method === 'upi') {
    payout.upi = document.getElementById('upiId').value.trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(payout.upi)) { alert('Please enter a valid UPI ID.'); return; }
  } else if (method === 'bank') {
    payout.bankHolder = document.getElementById('bankHolder').value.trim();
    payout.bankName = document.getElementById('bankName').value.trim();
    payout.accountNumber = document.getElementById('accountNumber').value.trim();
    payout.ifscCode = document.getElementById('ifscCode').value.trim().toUpperCase();
    if (!payout.bankHolder || !payout.bankName || !/^[0-9]{6,20}$/.test(payout.accountNumber) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(payout.ifscCode)) {
      alert('Enter valid bank holder name, bank name, account number (6–20 digits), and IFSC code.'); return;
    }
  } else { alert('Please select a withdrawal method.'); return; }

  const txId = 'WDR' + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase();
  const btn = document.getElementById('withdrawBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending request...'; }
  try {
    const data = await apiRequest('/api/withdraw-request', {
      method: 'POST', body: JSON.stringify({ txId, amount, ...payout })
    });
    // The backend reserves the balance in Firestore and only responds success
    // after the Telegram request was delivered. Refresh the authoritative profile.
    const fresh = await apiRequest('/api/me');
    currentUser = fresh.user || data.user;
    localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
    localStorage.setItem('jiowin_wallet_update', JSON.stringify({ balance: Number(currentUser.balance) || 0, at: Date.now() }));
    updateProfileUI(); await renderHistory();
    document.getElementById('withdrawAmount').value = '';
    ['upiId','bankHolder','bankName','accountNumber','ifscCode'].forEach(id => {
      const field = document.getElementById(id); if (field) field.value = '';
    });
    alert(`Withdrawal request sent to admin. ₹${amount.toLocaleString('en-IN')} has been reserved from your wallet. If admin rejects it, the amount will be refunded.`);
    switchWalletTab('history');
  } catch (err) {
    // If the server reports a Telegram delivery failure it has already refunded
    // the reservation; refresh the balance so the UI cannot show a stale amount.
    try {
      const fresh = await apiRequest('/api/me');
      if (fresh && fresh.user) {
        currentUser = fresh.user;
        localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
        updateProfileUI(); await renderHistory();
      }
    } catch (_) {}
    alert(err.message || 'Withdrawal request failed. Check the bot configuration and try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Request Withdrawal'; }
  }
}

async function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  if (!currentUser) {
    list.innerHTML = '<p style="color:#888;text-align:center;">Please log in to view transaction history.</p>';
    return;
  }

  // Reload the server-authoritative history whenever the History tab is opened.
  // This also restores withdrawals created on another device or before a refresh.
  try {
    if (localStorage.getItem(AUTH_TOKEN_KEY)) {
      const fresh = await apiRequest('/api/me');
      if (fresh && fresh.user) {
        currentUser = fresh.user;
        localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
        updateProfileUI();
      }
    }
  } catch (err) {
    console.warn('Could not refresh transaction history; showing cached history:', err.message);
  }

  const transactions = Array.isArray(currentUser.transactions) ? currentUser.transactions : [];
  if (!transactions.length) {
    list.innerHTML = '<p style="color:#888;text-align:center;">No transactions yet.</p>';
    return;
  }
  list.innerHTML = transactions.map(tx => {
    const type = String(tx.type || 'transaction');
    const status = String(tx.status || 'Pending');
    const sign = type === 'deposit' ? '+' : '-';
    const date = tx.date ? new Date(tx.date).toLocaleString() : 'Date unavailable';
    const amount = Number(tx.amount) || 0;
    const safe = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    return `<div class="history-item"><div class="history-left"><span class="type">${safe(type)}</span><span class="date">${safe(date)}</span><span class="txid">ID: ${safe(tx.id || 'N/A')}</span></div><div class="history-right"><span class="amount ${safe(type)}">${sign}₹${amount.toLocaleString('en-IN')}</span><span class="status-badge status-${safe(status.toLowerCase())}">${safe(status)}</span></div></div>`;
  }).join('');
}
function generateReferCode() { document.getElementById('refCodeDisplay').textContent = currentUser.refCode || 'CBET1234'; }
function copyRefCode() { navigator.clipboard.writeText(document.getElementById('refCodeDisplay').textContent); alert("Copied!"); }
