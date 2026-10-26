// Jab Admin Telegram se reply kare
socket.on('admin_reply', (msg) => {
  appendMessage(`👨‍💼 <b>Support:</b> ${msg}`, 'bot');
  beep();
});

let isTicketRaised = false;

// Random replies generator function
function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sendMessage(customText = null) {
  const input = document.getElementById('chatInput');
  const msgText = customText || input.value.trim();
  if (!msgText) return;
  
  appendMessage(msgText, 'user');
  if(!customText) input.value = '';

  const lower = msgText.toLowerCase().trim();

  // 1. AGENT TRANSFER
  if (lower === 'agent' || lower === 'human' || lower.includes('talk to agent')) {
    socket.emit('user_message', { email: currentUser.email, message: msgText });
    appendMessage("⏳ <i>Connecting to Live Support Agent... Please wait.</i>", 'bot');
    return;
  }

  showTyping();
  
  setTimeout(() => {
    hideTyping();
    let reply = "";
    let showTicketBtn = false;

    // --- WITHDRAWAL ISSUES ---
    if (lower.includes('withdraw') || lower.includes('payout') || lower.includes('cashout') || lower.includes('paisa nahi aaya')) {
      if (lower.includes('nahi') || lower.includes('pending') || lower.includes('kab') || lower.includes('tak') || lower.includes('time') || lower.includes('der')) {
        reply = getRandom([
            `<b>Withdrawal Pending? ⏳</b><br>Don't worry, your money is 100% safe.<br>1️⃣ Standard time is <b>1 to 24 hours</b>.<br>2️⃣ On Sundays, it might take up to 48 hours due to bank holidays.<br>3️⃣ If it takes longer, please share a screenshot.`,
            `<b>Withdraw nahi aaya?</b><br>Usually, UPI transfers take <b>1 to 24 hours</b>. Please check your bank statement. If the status is 'Pending' in history, Admin is verifying it. Wait a bit more!`,
            `Aapka withdrawal process ho raha hai. ⏳<br>Server down hone ki wajah se thoda time lag sakta hai (max 24h). Aap ticket raise kar sakte hain niche.`
        ]);
        showTicketBtn = true;
      } else {
        reply = `Withdrawal Rules:<br>• Minimum: ₹500<br>• Process: 1-24 hours.<br>Go to Wallet -> Withdraw to request.`;
      }
    }
    // --- DEPOSIT ISSUES ---
    else if (lower.includes('deposit') || lower.includes('add money') || lower.includes('recharge') || lower.includes('paisa add')) {
      if (lower.includes('nahi') || lower.includes('pending') || lower.includes('kab') || lower.includes('tak') || lower.includes('hua') || lower.includes('failed')) {
        reply = getRandom([
            `<b>Deposit Not Added? 💸</b><br>1️⃣ Sometimes UPI takes 5-10 mins to sync.<br>2️⃣ If money was deducted but not added, it will <b>auto-refund to your bank in 3-5 days</b>.<br>3️⃣ Check Wallet -> History.`,
            `<b>Money add nahi hua?</b><br>Agar bank se paisa cut gaya hai aur wallet me nahi aaya, toh ghabrayein nahi. Failed transactions ka paisa <b>3-5 working days</b> me wapas bank me aa jata hai.`,
            `Deposit delay ho sakta hai. 🏦<br>Please check your UPI app history. Agar wahan 'Success' hai, toh thodi der me wallet me aa jayega.`
        ]);
        showTicketBtn = true;
      } else {
        reply = `To add money:<br>1. Go to Wallet -> Deposit.<br>2. Min ₹100.<br>3. Use UPI/Card.`;
      }
    }
    // --- BALANCE CHECK ---
    else if (lower.includes('balance') || lower.includes('wallet') || lower.includes('kitna paisa')) {
      reply = `Your current balance is <b>₹${currentUser.balance}</b>. 💰<br>Would you like to play a game or add money?`;
    }
    // --- HOW TO PLAY / GAMES ---
    else if (lower.includes('game') || lower.includes('play') || lower.includes('khel') || lower.includes('kaise khelu')) {
      reply = getRandom([
          `🎮 We have 10+ games (Aviator, 7 Up Down, Roulette, etc). Go to the <b>Home</b> tab and select any game to start playing!`,
          `Khelna bahut aasan hai! Bas <b>Home</b> pe jao, apna favourite game choose karo, aur chips laga kar bet start karo. 🎰`,
          `Aapko kaunsa game pasand hai? Aviator, Roulette ya Dragon Tiger? Home page par sab available hain!`
      ]);
    }
    // --- GREETINGS ---
    else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey') || lower.includes('namaste')) {
      reply = getRandom([
          `Hello <b>${currentUser.name}</b>! 👋 Welcome to CroreBet. How can I help you today?`,
          `Hi <b>${currentUser.name}</b>! Kaise hain aap? Koi help chahiye?`,
          `Namaste <b>${currentUser.name}</b>! 🙏 Main aapki kya madad kar sakta hoon?`
      ]);
    }
    // --- BONUS / PROMO ---
    else if (lower.includes('bonus') || lower.includes('offer') || lower.includes('promo')) {
      reply = `🎁 We have a <b>100% Welcome Bonus</b> up to ₹10,000 for new users on their first deposit! Check the Home page banner.`;
    } 
    // --- REFER & EARN ---
    else if (lower.includes('refer') || lower.includes('friend') || lower.includes('dost')) {
      reply = `Invite friends and earn ₹100 per referral! Go to Wallet -> Refer & Earn to copy your unique code.`;
    } 
    // --- THANKS ---
    else if (lower.includes('thank') || lower.includes('ok') || lower.includes('shukriya')) {
      reply = getRandom([
          `You're welcome! 😊 Is there anything else I can help you with?`,
          `Anytime! Agar koi aur doubt ho toh batao.`,
          `Happy to help! 🎰 Khelte raho aur jeeto!`
      ]);
    } 
    // --- RANDOM FALLBACK (When bot doesn't understand) ---
    else {
      reply = getRandom([
          `Mujhe ye samajh nahi aaya 🤔. Kya aap <b>Deposit</b>, <b>Withdraw</b> ya <b>Games</b> ke baare me puchna chahte hain?`,
          `Sorry, main is baat ko nahi samajh paya. Aap niche diye gaye <b>"Live Agent"</b> button par click karke human support se baat kar sakte hain.`,
          `Main ek AI bot hoon aur abhi seekh raha hoon. 🤖 Aap 'Balance' ya 'Withdraw' type karke check kar sakte hain, ya 'Agent' likhein.`,
          `Hmm, ye mere paas nahi hai. Agar aapko koi problem hai (jaise deposit ya withdraw), toh 'Raise Ticket' kar lein ya 'Agent' likhein.`
      ]);
    }

    // Agar issue type ka message hai toh Ticket button add karo
    if (showTicketBtn && !isTicketRaised) {
      reply += `<br><br><button class="bot-card-btn" style="background:#e53935;margin-top:8px;" onclick="raiseTicket()">🎫 Raise Support Ticket</button>`;
    } else if (showTicketBtn && isTicketRaised) {
      reply += `<br><br><i>✅ Your ticket is already active. Admin is looking into it.</i>`;
    }

    appendMessage(reply, 'bot');
  }, 1000); 
}

// Ticket Raise function
function raiseTicket() {
  if(isTicketRaised) {
    appendMessage("⚠️ You already have an active ticket. Please wait for the admin to reply here.", 'bot');
    return;
  }
  
  isTicketRaised = true;
  const ticketId = 'TKT' + Math.floor(100000 + Math.random() * 900000);
  
  socket.emit('user_message', { 
      email: currentUser.email, 
      message: `🚨 RAISED A SUPPORT TICKET (${ticketId}).` 
  });
  
  appendMessage(`⏳ <i>Generating Ticket...</i>`, 'user');
  
  setTimeout(() => {
    appendMessage(`<b>✅ Ticket Created Successfully!</b><br><br>🎫 Ticket ID: <b>${ticketId}</b><br>⏱ Expected Reply: <b>Within 15-30 mins</b><br><br>Our team has been notified. Please stay on this chat.`, 'bot');
    
    showTyping();
    setTimeout(() => {
      hideTyping();
      appendMessage(`👨‍💼 <b>Agent Rahul:</b> Hi ${currentUser.name}, I've received your ticket. I am checking your account details. Please share the Transaction ID or screenshot if you have it. 📎`, 'bot');
    }, 8000); // 8 seconds baad agent reply karega
  }, 1500);
}

function attachFile() { 
  appendMessage("📎 <i>[Screenshot uploaded]</i>", 'user'); 
  socket.emit('user_message', { email: currentUser.email, message: "[User uploaded a screenshot for support]" }); 
  setTimeout(() => appendMessage("✅ Screenshot received. Our team will verify and resolve your issue soon.", 'bot'), 1000);
}

function appendMessage(text, sender) {
  const chatBox = document.getElementById('chatMessages');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  div.innerHTML = `${text} <span class="time">${time}</span>`;
  chatBox.appendChild(div); 
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showTyping() {
  const chatBox = document.getElementById('chatMessages');
  let ind = document.getElementById('typingIndicator');
  if (!ind) { 
      ind = document.createElement('div'); 
      ind.id = 'typingIndicator'; 
      ind.className = 'typing-indicator'; 
      ind.innerHTML = '<span></span><span></span><span></span>'; 
      chatBox.appendChild(ind); 
  }
  ind.classList.add('show'); 
  chatBox.scrollTop = chatBox.scrollHeight;
}

function hideTyping() { 
    const ind = document.getElementById('typingIndicator'); 
    if(ind) ind.classList.remove('show'); 
}

function beep() { 
    try { 
        const ctx = new (window.AudioContext || window.webkitAudioContext)(); 
        const osc = ctx.createOscillator(); 
        osc.frequency.value = 800; 
        osc.connect(ctx.destination); 
        osc.start(); 
        osc.stop(ctx.currentTime + 0.1); 
    } catch(e){} 
}

document.addEventListener('DOMContentLoaded', () => { 
    document.getElementById('chatInput').addEventListener('keypress', (e) => { 
        if (e.key === 'Enter') sendMessage(); 
    }); 
});
