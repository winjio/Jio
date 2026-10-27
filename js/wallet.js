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

async function processDeposit() {
  const amount = parseFloat(document.getElementById('depositAmount').value);
  if (!currentUser) { alert('Please log in first.'); return; }
  if (!amount || amount < 100) { alert('Min ₹100'); return; }
  const btn = document.getElementById('depBtn');
  btn.textContent = 'Sending request...'; btn.disabled = true;
  const txId = 'DEP' + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase();
  try {
    const data = await apiRequest('/api/deposit-request', {
      method: 'POST', body: JSON.stringify({ txId, amount })
    });
    currentUser.transactions = Array.isArray(currentUser.transactions) ? currentUser.transactions : [];
    currentUser.transactions.unshift(data.transaction);
    localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
    renderHistory();
    alert('Deposit request Telegram par bhej di gayi hai. Payment verify hone ke baad admin approve karega.');
    document.getElementById('depositAmount').value = '';
    switchWalletTab('history');
  } catch (err) {
    alert(err.message || 'Deposit request failed. Please try again.');
  } finally {
    btn.textContent = 'Proceed to Pay'; btn.disabled = false;
  }
}

async function processWithdraw() {
  if (!currentUser) { alert('Please log in first.'); return; }
  const amount = Number(document.getElementById('withdrawAmount').value);
  const upi = document.getElementById('upiId').value.trim();
  if (!amount || amount < 500) { alert('Min ₹500'); return; }
  if (amount > Number(currentUser.balance || 0)) { alert('Insufficient balance!'); return; }
  if (!upi.includes('@')) { alert('Invalid UPI ID'); return; }
  const txId = 'WDR' + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase();
  const btn = document.getElementById('withdrawBtn') || document.querySelector('[onclick="processWithdraw()"]');
  if (btn) btn.disabled = true;
  try {
    const data = await apiRequest('/api/withdraw-request', {
      method: 'POST', body: JSON.stringify({ txId, amount, upi })
    });
    // The server atomically deducts/reserves the amount in Firestore. Refresh
    // the profile from the authoritative server before updating the UI, so a
    // stale browser/game balance cannot make the wallet appear unchanged.
    const fresh = await apiRequest('/api/me');
    currentUser = fresh.user || data.user;
    localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
    localStorage.setItem('jiowin_wallet_update', JSON.stringify({ balance: Number(currentUser.balance) || 0, at: Date.now() }));
    updateProfileUI(); renderHistory();
    document.getElementById('withdrawAmount').value = '';
    document.getElementById('upiId').value = '';
    alert(`Withdrawal request sent. ₹${amount.toLocaleString()} has been deducted/reserved from your wallet. If admin rejects it, the amount will be refunded.`);
    switchWalletTab('history');
  } catch (err) {
    alert(err.message || 'Withdrawal request failed.');
  } finally { if (btn) btn.disabled = false; }
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
