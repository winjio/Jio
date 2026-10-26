# Crorebet project — Render deployment (two Telegram bots)

## Deploy as a Render Web Service
1. Extract this ZIP and push the contents of `casino-games-eight-files/` to the root of a GitHub repository. Alternatively, if you commit the parent folder as-is, set Render's **Root Directory** to `casino-games-eight-files`.
2. In Render, choose **New → Web Service** and connect the repository.
3. Use **Build Command**: `npm install`
4. Use **Start Command**: `npm start`
5. Add the Environment Variables listed below in Render. Never commit real bot tokens to GitHub.
6. After deploy, open the Render URL. `/health` should return `{"status":"ok"}`.

## Environment Variables

Configure the two bots separately in Render → your service → Environment:

- `PAYMENTS_BOT_TOKEN` — Bot 1 token from BotFather; handles deposit/withdrawal requests and Approve/Reject buttons.
- `PAYMENTS_ADMIN_CHAT_ID` — Telegram chat ID where payment requests should be sent.
- `SUPPORT_BOT_TOKEN` — Bot 2 token from BotFather; handles website live-chat messages and support replies.
- `SUPPORT_ADMIN_CHAT_ID` — Telegram chat ID where customer-support messages should be sent.

Add both bots to their intended Telegram chats and ensure each bot can send messages there. For live support, reply directly to the bot's message in Telegram. Payment requests and customer support use separate bots and separate environment variables.

## Notes and limitations
- Existing game HTML pages, CSS, and frontend JavaScript files are preserved unchanged.
- The server serves the existing files and Socket.IO connects on the same deployed origin.
- Either Telegram integration can be disabled by leaving its variables unset; the web service can still start.
- Transaction-to-browser mapping is stored in memory and is lost on restart/disconnect. This is a demo setup, not a production-ready real-money payment system. Use secure authentication, durable transaction storage, server-side balance management, validation, and appropriate legal/compliance review before handling real funds.
- The current lobby links to `7updown.html` and `andarbahar.html`, but those files are not included in this ZIP.

## ZIP compatibility fixes
- Added `js/live-users.js` and `css/live-users.css` referenced by game pages, preventing 404s for those assets.
- Added `7updown.html` and `andarbahar.html` compatibility aliases while retaining the existing hyphenated game pages.
- Kept the existing homepage and game designs in place.

## Important wallet limitation (read before using real money)
The current frontend wallet still stores the user's balance in browser `localStorage` (`crorebet_user`). The game pages share that browser-side value, but it is not a secure server-authoritative wallet. Telegram approvals currently update the connected browser and the backend's transaction status is in memory; balances and approvals are not durably stored server-side. Do not use this build to handle real deposits or withdrawals until server-side authentication, persistent database-backed wallet/ledger transactions, idempotent Telegram approval handling, and Render persistent storage/database have been implemented and tested. Render deploys the website; it does not by itself make a browser-local balance persistent or secure.


## Firebase persistent account storage (required setup)

This build uses Firebase Admin SDK + Firestore for persistent account profiles and a server-issued login token. The service-account JSON/private key is **not included** in this ZIP.

1. In Firebase Console, open project `comparex-cebd8`, enable/create **Cloud Firestore** in Native mode, and ensure the service account has the minimum required Firestore permissions.
2. In Render → your service → **Environment**, add:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: paste the entire service-account JSON as a single environment variable value (including the private key newlines as valid JSON `\\n` escapes).
   - `APP_JWT_SECRET`: a long random secret (at least 32 random characters). Keep it private.
3. Redeploy. Check `/api/status`; it should report `firebaseReady: true` and `authReady: true`.
4. New accounts require a valid email and a password of at least 8 characters. Login is checked by the server; the password hash is stored in Firestore, never the plain password.

**Important:** The service-account private key that was shared in chat should be revoked/rotated in Google Cloud IAM and replaced before deployment. Do not upload a service-account JSON file to GitHub or include it in the ZIP.

**Wallet caution:** This change persists the app profile and transaction list so the data can survive server restarts, but the existing game and wallet pages still perform some balance changes in the browser. This is not a secure real-money wallet. Before accepting real deposits/withdrawals, move all balance changes, game outcomes, and Telegram approval processing into authenticated, idempotent server-side Firestore transactions and verify them end-to-end. Existing localStorage-only accounts cannot be securely imported because their passwords were never authenticated or stored by the old fake login.


## Deposit approval fix

Deposit requests from the updated wallet page are created through authenticated `POST /api/deposit-request` and stored in Firestore collection `jiowinTransactions`. Telegram approval processes the transaction inside a Firestore transaction: it only credits a still-Pending request, updates the user's saved balance and transaction history atomically, and prevents duplicate approvals from crediting twice. The client can no longer overwrite balance/transaction history via the general `/api/me` profile-save endpoint.

After deploying, confirm `/api/status` returns `firebaseReady: true` and `authReady: true`, configure `PAYMENTS_BOT_TOKEN` and `PAYMENTS_ADMIN_CHAT_ID`, and test with a small non-real-money test request first. The bot admin must verify payment receipt before pressing Approve. Existing pending requests created before this fix still use the old in-memory path and may not be recoverable after a server restart. Existing browser-only history is not automatically migrated.

**Important:** the game pages still contain browser-side balance changes; this deposit fix makes Telegram-approved deposits persistent, but does not by itself make all betting/withdrawal balance changes secure or fully server-authoritative.
