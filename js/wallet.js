// Restore pending transaction status after reconnecting to the backend.
socket.on('connect', () => {
  if (!currentUser || !Array.isArray(currentUser.transactions)) return;
  const pendingIds = currentUser.transactions
    .filter(tx => tx && tx.status === 'Pending' && tx.id)
    .map(tx => tx.id);
  if (pendingIds.length) socket.emit('sync_transactions', pendingIds);
});

// Jab Admin Telegram se Approve kare
socket.on('transaction_approved', (txId) => {
  const tx = currentUser.transactions.find(t => t.id === txId);
  if (currentUser && tx && tx.status === 'Pending') {
    tx.status = 'Approved';
    apiRequest('/api/me').then(data => {
      currentUser = data.user;
      localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
      updateProfileUI(); renderHistory();
    }).catch(err => console.error('Could not refresh approved wallet:', err.message));
    renderHistory();
    alert(`✅ Payment approved. Wallet is syncing from server.`);
  }
});

// Jab Admin Telegram se Reject kare
socket.on('transaction_rejected', (txId) => {
  const tx = currentUser.transactions.find(t => t.id === txId);
  if (currentUser && tx && tx.status === 'Pending') {
    tx.status = 'Rejected';
    if (tx.type === 'withdraw') currentUser.balance = (Number(currentUser.balance) || 0) + Number(tx.amount || 0); // Refund
    saveUserData(); updateProfileUI(); renderHistory();
    alert(`❌ Payment Rejected. Amount refunded.`);
  }
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

function processWithdraw() {
  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  const upi = document.getElementById('upiId').value;
  if (!amount || amount < 500) { alert("Min ₹500"); return; }
  if (amount > currentUser.balance) { alert("Insufficient balance!"); return; }
  if (!upi.includes('@')) { alert("Invalid UPI ID"); return; }
  
  currentUser.balance -= amount; saveUserData(); updateProfileUI();
  const txId = 'WDR' + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase();
  currentUser.transactions.unshift({ id: txId, type: 'withdraw', amount: amount, upi: upi, status: 'Pending', date: new Date().toLocaleString() });
  saveUserData();
  
  socket.emit('new_transaction', { txId: txId, type: 'withdraw', amount: amount, userId: currentUser.email, userName: currentUser.name, upi: upi });
  document.getElementById('withdrawAmount').value = ''; document.getElementById('upiId').value = '';
  switchWalletTab('history');
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (!currentUser.transactions || currentUser.transactions.length === 0) { list.innerHTML = '<p style="color:#888;text-align:center;">No transactions.</p>'; return; }
  list.innerHTML = currentUser.transactions.map(tx => {
    const sign = tx.type === 'deposit' ? '+' : '-';
    return `<div class="history-item"><div class="history-left"><span class="type">${tx.type}</span><span class="date">${tx.date}</span><span class="txid">ID: ${tx.id}</span></div><div class="history-right"><span class="amount ${tx.type}">${sign}₹${tx.amount}</span><span class="status-badge status-${tx.status.toLowerCase()}">${tx.status}</span></div></div>`;
  }).join('');
}
function generateReferCode() { document.getElementById('refCodeDisplay').textContent = currentUser.refCode || 'CBET1234'; }
function copyRefCode() { navigator.clipboard.writeText(document.getElementById('refCodeDisplay').textContent); alert("Copied!"); }
