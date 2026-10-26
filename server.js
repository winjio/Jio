const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

// Firebase Admin credentials must be supplied through Render secrets, never committed to the ZIP.
// Set FIREBASE_SERVICE_ACCOUNT_JSON to the complete service-account JSON string.
// Set APP_JWT_SECRET to a long random secret (32+ characters).
let db = null;
let firebaseReady = false;
try {
  if (!admin.apps.length) {
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (rawServiceAccount) {
      const serviceAccount = JSON.parse(rawServiceAccount);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      db = admin.firestore();
      firebaseReady = true;
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      db = admin.firestore();
      firebaseReady = true;
    } else {
      console.warn('Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON in Render Environment.');
    }
  } else {
    db = admin.firestore(); firebaseReady = true;
  }
} catch (err) {
  console.error('Firebase initialization failed:', err.message);
}
const JWT_SECRET = process.env.APP_JWT_SECRET;
const USERS_COLLECTION = 'jiowinUsers';
function emailKey(email) { return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex'); }
function publicProfile(doc) {
  const d = doc || {};
  return { name: d.name || '', email: d.email || '', balance: Number(d.balance) || 0,
    transactions: Array.isArray(d.transactions) ? d.transactions : [],
    refCode: d.refCode || '', totalWin: Number(d.totalWin) || 0, totalLoss: Number(d.totalLoss) || 0,
    gameRounds: Number(d.gameRounds) || 0, lastGameResult: d.lastGameResult || null };
}
function issueToken(key) { return jwt.sign({ sub: key }, JWT_SECRET, { expiresIn: '30d' }); }
function requireAuth(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Please log in again.' });
    req.auth = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch (_) { return res.status(401).json({ error: 'Session expired. Please log in again.' }); }
}
app.get('/api/status', (_req, res) => res.json({ firebaseReady, authReady: Boolean(JWT_SECRET) }));
app.post('/api/auth/register', async (req, res) => {
  try {
    if (!firebaseReady || !db || !JWT_SECRET) return res.status(503).json({ error: 'Account service is not configured. Contact site admin.' });
    const name = String(req.body.name || '').trim().slice(0, 100);
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
    const password = String(req.body.password || '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Enter a valid name/email and password with at least 8 characters.' });
    const key = emailKey(email), ref = db.collection(USERS_COLLECTION).doc(key);
    const existing = await ref.get();
    if (existing.exists) return res.status(409).json({ error: 'An account with this email already exists.' });
    const profile = { name, email, passwordHash: await bcrypt.hash(password, 12), balance: 0, transactions: [],
      refCode: 'JW' + crypto.randomBytes(4).toString('hex').toUpperCase(), totalWin: 0, totalLoss: 0, gameRounds: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    await ref.create(profile);
    return res.json({ token: issueToken(key), user: publicProfile(profile) });
  } catch (err) { console.error('Register failed:', err.message); return res.status(500).json({ error: 'Could not create account. Please try again.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!firebaseReady || !db || !JWT_SECRET) return res.status(503).json({ error: 'Account service is not configured. Contact site admin.' });
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Enter email and password.' });
    const key = emailKey(email), snap = await db.collection(USERS_COLLECTION).doc(key).get();
    if (!snap.exists || !(await bcrypt.compare(password, snap.data().passwordHash || ''))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    return res.json({ token: issueToken(key), user: publicProfile(snap.data()) });
  } catch (err) { console.error('Login failed:', err.message); return res.status(500).json({ error: 'Could not log in. Please try again.' }); }
});
app.get('/api/me', requireAuth, async (req, res) => {
  try { const snap = await db.collection(USERS_COLLECTION).doc(req.auth.sub).get(); if (!snap.exists) return res.status(404).json({ error: 'Account not found.' }); res.json({ user: publicProfile(snap.data()) }); }
  catch (err) { console.error('Profile load failed:', err.message); res.status(500).json({ error: 'Could not load account data.' }); }
});
app.put('/api/me', requireAuth, async (req, res) => {
  try {
    if (!firebaseReady || !db) return res.status(503).json({ error: 'Database is not configured.' });
    const ref = db.collection(USERS_COLLECTION).doc(req.auth.sub), snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Account not found.' });
    // Preserve identity and password hash; persist the current app profile for restart recovery.
    const body = req.body || {}, update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (typeof body.name === 'string') update.name = body.name.slice(0,100);
    // Wallet balance and transaction history are server-authoritative. Never accept
    // them from this general profile endpoint; payment approval updates them atomically.
    if (typeof body.refCode === 'string') update.refCode = body.refCode.slice(0,30);
    if (Number.isFinite(Number(body.totalWin))) update.totalWin = Math.max(0, Number(body.totalWin));
    if (Number.isFinite(Number(body.totalLoss))) update.totalLoss = Math.max(0, Number(body.totalLoss));
    if (Number.isFinite(Number(body.gameRounds))) update.gameRounds = Math.max(0, Number(body.gameRounds));
    if (body.lastGameResult && typeof body.lastGameResult === 'object') update.lastGameResult = { net: Number(body.lastGameResult.net)||0, at: String(body.lastGameResult.at||'').slice(0,50) };
    await ref.set(update, { merge: true });
    const updated = await ref.get(); res.json({ user: publicProfile(updated.data()) });
  } catch (err) { console.error('Profile save failed:', err.message); res.status(500).json({ error: 'Could not save account data.' }); }
});


// Separate Telegram bots: one handles deposit/withdrawal decisions,
// the other handles website live-support messages and replies.
const PAYMENTS_BOT_TOKEN = process.env.PAYMENTS_BOT_TOKEN;
const PAYMENTS_ADMIN_CHAT_ID = process.env.PAYMENTS_ADMIN_CHAT_ID;
const SUPPORT_BOT_TOKEN = process.env.SUPPORT_BOT_TOKEN;
const SUPPORT_ADMIN_CHAT_ID = process.env.SUPPORT_ADMIN_CHAT_ID;

function createBot(token, label) {
  if (!token) {
    console.warn(`${label} Telegram bot disabled: token environment variable is not set.`);
    return null;
  }
  const bot = new TelegramBot(token, { polling: true });
  bot.on('polling_error', (err) => console.error(`${label} Telegram polling error:`, err.message));
  return bot;
}

const paymentsBot = createBot(PAYMENTS_BOT_TOKEN, 'Payments');
const supportBot = createBot(SUPPORT_BOT_TOKEN, 'Support');

// Persistent, authenticated deposit requests. The browser cannot decide that a
// payment is approved or directly increase its own wallet balance.
app.post('/api/deposit-request', requireAuth, async (req, res) => {
  try {
    if (!firebaseReady || !db || !JWT_SECRET) return res.status(503).json({ error: 'Payment database is not configured.' });
    if (!paymentsBot || !PAYMENTS_ADMIN_CHAT_ID) return res.status(503).json({ error: 'Payment approval bot is not configured.' });
    const amount = Number(req.body.amount);
    const txId = String(req.body.txId || '').trim().slice(0, 100);
    if (!txId || !Number.isFinite(amount) || amount < 100 || amount > 1000000) {
      return res.status(400).json({ error: 'Enter a valid deposit amount (minimum ₹100).' });
    }
    const userKey = req.auth.sub;
    const userRef = db.collection(USERS_COLLECTION).doc(userKey);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: 'Account not found.' });
    const user = userSnap.data();
    const txRef = db.collection('jiowinTransactions').doc(txId);
    const tx = { id: txId, userKey, userEmail: user.email || '', userName: user.name || '', type: 'deposit',
      amount, status: 'Pending', date: new Date().toISOString(), createdAt: admin.firestore.FieldValue.serverTimestamp() };
    await db.runTransaction(async (t) => {
      const existing = await t.get(txRef);
      if (existing.exists) throw new Error('DUPLICATE_TX');
      t.create(txRef, tx);
      const oldTransactions = Array.isArray(user.transactions) ? user.transactions : [];
      t.update(userRef, { transactions: [{ id: txId, type: 'deposit', amount, status: 'Pending', date: tx.date }, ...oldTransactions.filter(x => x.id !== txId)].slice(0, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    try {
      await paymentsBot.sendMessage(PAYMENTS_ADMIN_CHAT_ID,
        `🚨 NEW DEPOSIT REQUEST\n\n🆔 Order ID: ${txId}\n👤 User: ${user.email || userKey}\n📛 Name: ${user.name || 'Unknown'}\n💰 Amount: ₹${amount}\n\nVerify the payment before approving:`,
        { reply_markup: { inline_keyboard: [[
          { text: '✅ Approve', callback_data: `approve_${txId}` },
          { text: '❌ Reject', callback_data: `reject_${txId}` }
        ]] } });
    } catch (err) {
      console.error('Could not send deposit request to Telegram:', err.message);
      await db.runTransaction(async (t) => {
        const snap = await t.get(txRef);
        if (snap.exists && snap.data().status === 'Pending') {
          t.update(txRef, { status: 'TelegramError' });
          const us = await t.get(userRef);
          if (us.exists) {
            const d = us.data();
            t.update(userRef, { transactions: (d.transactions || []).map(x => x.id === txId ? { ...x, status: 'Rejected' } : x) });
          }
        }
      });
      return res.status(502).json({ error: 'Could not send request to Telegram. Please try again.' });
    }
    return res.json({ transaction: { id: txId, type: 'deposit', amount, status: 'Pending', date: tx.date } });
  } catch (err) {
    if (err.message === 'DUPLICATE_TX') return res.status(409).json({ error: 'Duplicate transaction ID. Please retry.' });
    console.error('Deposit request failed:', err.message);
    return res.status(500).json({ error: 'Could not create deposit request.' });
  }
});
const transactionMap = new Map(); // txId -> latest socket ID
const transactionStatus = new Map(); // txId -> approved/rejected status (in-memory; resets on server restart))

// Serve existing lobby and game files without changing their game code.
app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Reconnect recovery: clients resend pending transaction IDs so an approval
  // made while they were offline can still update the wallet.
  socket.on('sync_transactions', (txIds = []) => {
    if (!Array.isArray(txIds)) return;
    for (const rawId of txIds.slice(0, 100)) {
      const txId = String(rawId || '').slice(0, 100);
      if (!txId) continue;
      transactionMap.set(txId, socket.id);
      const status = transactionStatus.get(txId);
      if (status === 'approved') socket.emit('transaction_approved', txId);
      else if (status === 'rejected') socket.emit('transaction_rejected', txId);
    }
  });

  // Bot 2: Live chat / customer support only.
  socket.on('user_message', async (data = {}) => {
    const email = String(data.email || 'Unknown user').slice(0, 300);
    const message = String(data.message || '').slice(0, 3000);
    if (!message) return;
    if (!supportBot || !SUPPORT_ADMIN_CHAT_ID) {
      socket.emit('admin_reply', 'Live support is temporarily unavailable. Please try again later.');
      return;
    }
    try {
      const sentMsg = await supportBot.sendMessage(
        SUPPORT_ADMIN_CHAT_ID,
        `👤 User: ${email}\n💬 Message: ${message}\n\nReply directly to this message to answer the user.`,
        { reply_markup: { force_reply: true } }
      );
      supportBot.onReplyToMessage(String(SUPPORT_ADMIN_CHAT_ID), sentMsg.message_id, (replyMsg) => {
        if (replyMsg.text) socket.emit('admin_reply', replyMsg.text);
      });
    } catch (err) {
      console.error('Support Telegram message error:', err.message);
      socket.emit('admin_reply', 'Could not contact support right now. Please try again later.');
    }
  });

  // Bot 1: Deposit / withdrawal approvals only.
  socket.on('new_transaction', async (data = {}) => {
    const txId = String(data.txId || '').slice(0, 100);
    const type = String(data.type || '').toLowerCase();
    const amount = Number(data.amount);
    if (!txId || !['deposit', 'withdraw'].includes(type) || !Number.isFinite(amount) || amount <= 0) return;
    if (!paymentsBot || !PAYMENTS_ADMIN_CHAT_ID) {
      console.error('Payment request received but payment Telegram bot/admin chat is not configured.');
      return;
    }

    transactionMap.set(txId, socket.id);
    if (!transactionStatus.has(txId)) transactionStatus.set(txId, 'pending');
    const userId = String(data.userId || 'Unknown').slice(0, 300);
    const userName = String(data.userName || 'Unknown').slice(0, 300);
    const upi = String(data.upi || '').slice(0, 300);
    const text = `🚨 NEW ${type.toUpperCase()} REQUEST\n\n🆔 Order ID: ${txId}\n👤 User ID: ${userId}\n📛 Name: ${userName}\n💰 Amount: ₹${amount}` +
      (type === 'withdraw' ? `\n📱 UPI: ${upi}` : '') + '\n\nPlease verify and choose an action:';

    try {
      await paymentsBot.sendMessage(PAYMENTS_ADMIN_CHAT_ID, text, {
        reply_markup: { inline_keyboard: [[
          { text: '✅ Approve', callback_data: `approve_${txId}` },
          { text: '❌ Reject', callback_data: `reject_${txId}` }
        ]] }
      });
    } catch (err) {
      console.error('Payments Telegram message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    // Keep transaction mappings so Telegram approvals still resolve after a
    // temporary disconnect; a reconnect will replace the socket ID.
    console.log('User disconnected:', socket.id);
  });
});

if (paymentsBot && PAYMENTS_ADMIN_CHAT_ID) {
  paymentsBot.on('callback_query', async (query) => {
    try {
      const raw = String(query.data || '');
      const separator = raw.indexOf('_');
      const action = raw.slice(0, separator);
      const txId = raw.slice(separator + 1);
      if (!['approve', 'reject'].includes(action) || separator < 0 || !txId) {
        await paymentsBot.answerCallbackQuery(query.id, { text: 'Invalid action.' });
        return;
      }
      if (!query.message || String(query.message.chat.id) !== String(PAYMENTS_ADMIN_CHAT_ID)) {
        await paymentsBot.answerCallbackQuery(query.id, { text: 'Not authorized for this chat.' });
        return;
      }
      const approved = action === 'approve';
      const persistentRef = db ? db.collection('jiowinTransactions').doc(txId) : null;
      const persistentSnap = persistentRef ? await persistentRef.get() : null;
      if (persistentSnap && persistentSnap.exists) {
        let finalStatus = approved ? 'Approved' : 'Rejected';
        await db.runTransaction(async (t) => {
          const txSnap = await t.get(persistentRef);
          if (!txSnap.exists) throw new Error('TRANSACTION_NOT_FOUND');
          const tx = txSnap.data();
          if (tx.status !== 'Pending') { finalStatus = tx.status; return; }
          const userRef = db.collection(USERS_COLLECTION).doc(tx.userKey);
          const userSnap = await t.get(userRef);
          if (!userSnap.exists) throw new Error('USER_NOT_FOUND');
          const user = userSnap.data();
          const history = Array.isArray(user.transactions) ? user.transactions : [];
          const updatedHistory = history.map(x => x.id === txId ? { ...x, status: finalStatus } : x);
          const update = { transactions: updatedHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
          if (approved && tx.type === 'deposit') update.balance = Math.max(0, Number(user.balance) || 0) + Number(tx.amount);
          t.update(userRef, update);
          t.update(persistentRef, { status: finalStatus, decidedAt: admin.firestore.FieldValue.serverTimestamp(), decidedBy: String(query.from && query.from.id || '') });
        });
        const already = finalStatus !== (approved ? 'Approved' : 'Rejected');
        if (!already) io.emit(approved ? 'transaction_approved' : 'transaction_rejected', txId);
        await paymentsBot.editMessageText(
          `${finalStatus === 'Approved' ? '✅ APPROVED' : finalStatus === 'Rejected' ? '❌ REJECTED' : 'ℹ️ ALREADY PROCESSED'}\nOrder ID: ${txId}\n\nStatus: ${finalStatus}${finalStatus === 'Approved' ? '\nWallet credited in Firestore.' : ''}`,
          { chat_id: query.message.chat.id, message_id: query.message.message_id }
        );
        await paymentsBot.answerCallbackQuery(query.id, { text: already ? `Already ${finalStatus}` : finalStatus });
        return;
      }
      // Compatibility path for older pending requests created by the previous frontend.
      const socketId = transactionMap.get(txId);
      transactionStatus.set(txId, approved ? 'approved' : 'rejected');
      await paymentsBot.editMessageText(
        `${approved ? '✅ APPROVED' : '❌ REJECTED'}\nOrder ID: ${txId}\n\nStatus: ${approved ? 'Marked approved (legacy request).' : 'Marked rejected (legacy request).'}`,
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
      if (socketId) io.to(socketId).emit(approved ? 'transaction_approved' : 'transaction_rejected', txId);
      transactionMap.delete(txId);
      await paymentsBot.answerCallbackQuery(query.id, { text: approved ? 'Approved' : 'Rejected' });
    } catch (err) {
      console.error('Payments Telegram callback error:', err.message);
      try { await paymentsBot.answerCallbackQuery(query.id, { text: 'Could not process action.' }); } catch (_) {}
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Payments Telegram integration: ${paymentsBot && PAYMENTS_ADMIN_CHAT_ID ? 'enabled' : 'disabled'}`);
  console.log(`Support Telegram integration: ${supportBot && SUPPORT_ADMIN_CHAT_ID ? 'enabled' : 'disabled'}`);
});
