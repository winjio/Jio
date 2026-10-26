// Shared browser wallet bridge for Jiowin pages. The authenticated wallet is stored
// under the existing user record so game pages and the home/wallet page use one balance.
(function () {
  function readUser() {
    try { return JSON.parse(localStorage.getItem('crorebet_user') || 'null'); } catch (_) { return null; }
  }
  window.loadGameWalletBalance = function (fallback) {
    const user = readUser();
    return user && Number.isFinite(Number(user.balance)) ? Math.max(0, Number(user.balance)) : fallback;
  };
  window.syncGameWalletBalance = function (balance) {
    const user = readUser();
    if (!user) return;
    const next = Math.max(0, Number(balance) || 0);
    if (Number(user.balance) === next) return;
    user.balance = next;
    localStorage.setItem('crorebet_user', JSON.stringify(user));
    localStorage.setItem('jiowin_wallet_update', JSON.stringify({ balance: next, at: Date.now() }));
  };
  window.recordGameRound = function (net) {
    const user = readUser();
    if (!user) return;
    net = Number(net) || 0;
    user.totalWin = (Number(user.totalWin) || 0) + Math.max(0, net);
    user.totalLoss = (Number(user.totalLoss) || 0) + Math.max(0, -net);
    user.gameRounds = (Number(user.gameRounds) || 0) + 1;
    user.lastGameResult = { net, at: new Date().toISOString() };
    localStorage.setItem('crorebet_user', JSON.stringify(user));
    localStorage.setItem('jiowin_wallet_update', JSON.stringify({ balance: user.balance, totalWin: user.totalWin, totalLoss: user.totalLoss, at: Date.now() }));
  };
})();
