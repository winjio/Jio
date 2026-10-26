let currentUser = null;
const AUTH_TOKEN_KEY = 'jiowin_auth_token';
let saveTimer = null;

async function apiRequest(url, options = {}) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return;
  try {
    const data = await apiRequest('/api/me');
    currentUser = data.user;
    localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
    loginSuccess();
    if (typeof renderHistory === 'function') renderHistory();
  } catch (err) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('crorebet_user');
    showAuthMessage('Your session expired. Please log in again.');
  }
});

function showAuthMessage(message) { const el = document.getElementById('authMsg'); if (el) el.textContent = message; }
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  if (tab === 'login') { document.getElementById('btn-login').classList.add('active'); document.getElementById('loginForm').classList.add('active'); }
  else { document.getElementById('btn-reg').classList.add('active'); document.getElementById('registerForm').classList.add('active'); }
  showAuthMessage('');
}
async function handleLogin(e) {
  e.preventDefault(); showAuthMessage('Logging in...');
  try {
    const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('loginEmail').value, password: document.getElementById('loginPass').value }) });
    localStorage.setItem(AUTH_TOKEN_KEY, data.token); currentUser = data.user; localStorage.setItem('crorebet_user', JSON.stringify(currentUser)); loginSuccess();
  } catch (err) { showAuthMessage(err.message); }
}
async function handleRegister(e) {
  e.preventDefault(); showAuthMessage('Creating account...');
  try {
    const data = await apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: document.getElementById('regName').value, email: document.getElementById('regEmail').value, password: document.getElementById('regPass').value }) });
    localStorage.setItem(AUTH_TOKEN_KEY, data.token); currentUser = data.user; localStorage.setItem('crorebet_user', JSON.stringify(currentUser)); loginSuccess();
  } catch (err) { showAuthMessage(err.message); }
}
function loginSuccess() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  updateProfileUI();
  if (typeof renderHistory === 'function') renderHistory();
  if (typeof generateReferCode === 'function') generateReferCode();
}
function updateProfileUI() {
  if (!currentUser) return;
  const name = document.getElementById('userNameDisplay'); if (name) name.textContent = currentUser.name;
  const bal = document.getElementById('userBalanceDisplay'); if (bal) bal.textContent = '₹ ' + (Number(currentUser.balance) || 0).toLocaleString();
  const winEl = document.getElementById('homeTotalWin'); if (winEl) winEl.textContent = '₹ ' + (Number(currentUser.totalWin) || 0).toLocaleString();
  const lossEl = document.getElementById('homeTotalLoss'); if (lossEl) lossEl.textContent = '₹ ' + (Number(currentUser.totalLoss) || 0).toLocaleString();
}
function saveUserData() {
  if (!currentUser) return;
  localStorage.setItem('crorebet_user', JSON.stringify(currentUser));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const data = await apiRequest('/api/me', { method: 'PUT', body: JSON.stringify(currentUser) });
      currentUser = data.user; localStorage.setItem('crorebet_user', JSON.stringify(currentUser)); updateProfileUI();
    } catch (err) { console.error('Could not sync profile to database:', err.message); }
  }, 250);
}
function logout() { localStorage.removeItem(AUTH_TOKEN_KEY); localStorage.removeItem('crorebet_user'); currentUser = null; location.reload(); }
window.addEventListener('focus', () => { if (localStorage.getItem(AUTH_TOKEN_KEY)) apiRequest('/api/me').then(data => { currentUser = data.user; localStorage.setItem('crorebet_user', JSON.stringify(currentUser)); updateProfileUI(); }).catch(() => {}); });
window.addEventListener('storage', (event) => { if (event.key === 'crorebet_user' || event.key === 'jiowin_wallet_update') { try { currentUser = JSON.parse(localStorage.getItem('crorebet_user') || 'null'); if (currentUser) updateProfileUI(); } catch (_) {} } });
