// Shared wallet bridge for Jiowin game pages.
// Local UI updates immediately; every balance delta is then persisted server-side
// and in Firestore so returning to the lobby restores the latest balance.
(function () {
  const TOKEN_KEY = 'jiowin_auth_token';
  let requestQueue = Promise.resolve();
  let changeSequence = 0;

  function readUser() {
    try { return JSON.parse(localStorage.getItem('crorebet_user') || 'null'); }
    catch (_) { return null; }
  }
  function writeUser(user) {
    localStorage.setItem('crorebet_user', JSON.stringify(user));
    localStorage.setItem('jiowin_wallet_update', JSON.stringify({ balance: Number(user.balance) || 0, at: Date.now() }));
  }
  async function sendDelta(delta, requestId, sequence) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !delta) return;
    const response = await fetch('/api/game-wallet/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ delta, requestId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409 && Number.isFinite(Number(data.balance))) {
        const user = readUser();
        if (user && sequence === changeSequence) { user.balance = Number(data.balance); writeUser(user); }
      }
      throw new Error(data.error || 'Wallet update failed');
    }
    // Do not replace a newer optimistic balance with an older response.
    const user = readUser();
    if (user && sequence === changeSequence && Number.isFinite(Number(data.balance))) {
      user.balance = Number(data.balance);
      writeUser(user);
    }
  }

  window.loadGameWalletBalance = function (fallback) {
    const user = readUser();
    return user && Number.isFinite(Number(user.balance)) ? Math.max(0, Number(user.balance)) : fallback;
  };

  window.syncGameWalletBalance = function (balance) {
    const user = readUser();
    if (!user) return;
    const next = Math.round(Math.max(0, Number(balance) || 0) * 100) / 100;
    const previous = Math.round(Math.max(0, Number(user.balance) || 0) * 100) / 100;
    const delta = Math.round((next - previous) * 100) / 100;
    if (Math.abs(delta) < 0.001) return;

    user.balance = next;
    writeUser(user);
    const sequence = ++changeSequence;
    const requestId = 'gw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    requestQueue = requestQueue.then(() => sendDelta(delta, requestId, sequence)).catch(async (err) => {
      console.error('Could not persist game wallet:', err.message);
      // Refresh from server after a failed write to avoid keeping a stale balance.
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token || sequence !== changeSequence) return;
      try {
        const response = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });
        const data = await response.json();
        if (response.ok && data.user) writeUser(data.user);
      } catch (_) {}
    });
  };

  window.recordGameRound = function (net) {
    const user = readUser();
    if (!user) return;
    net = Number(net) || 0;
    user.totalWin = (Number(user.totalWin) || 0) + Math.max(0, net);
    user.totalLoss = (Number(user.totalLoss) || 0) + Math.max(0, -net);
    user.gameRounds = (Number(user.gameRounds) || 0) + 1;
    user.lastGameResult = { net, at: new Date().toISOString() };
    writeUser(user);
  };
})();
