// ============================================
// AI CHATBOT WIDGET - ByteFlow
// Klucz API jest w Cloudflare Worker, nie tutaj!
// ============================================

(function () {
  // ============================================================
  // PRESETY — skopiuj jeden blok i podmień wartości
  // ============================================================

  // --- PRESET: ByteFlow (domyślny) ---
  const PROXY_URL = "https://chatbot.adam-kowalczyk-10.workers.dev/";
  const BOT_NAME = "FryzjersTWO";
  const BOT_SUBTITLE = "Asystent · Online";
  const BOT_INITIAL = "B";
  const WIDGET_COLOR = "#2563eb";
  const WELCOME_MESSAGE = "Cześć! W czym mogę pomóc? 😊";

  // --- PRESET: Przykład innego klienta ---
  // const PROXY_URL       = "https://worker.klient.workers.dev/";
  // const BOT_NAME        = "Pizza Roma";
  // const BOT_SUBTITLE    = "Pomoc · Online";
  // const BOT_INITIAL     = "P";
  // const WIDGET_COLOR    = "#dc2626";
  // const WELCOME_MESSAGE = "Hej! Czym mogę służyć? 🍕";

  // ============================================================
  // SYSTEM PROMPT — podmień dla każdego klienta
  // ============================================================
  const SYSTEM_PROMPT = `Jesteś asystentem salonu FryzjersTWO. Jesteś jak sympatyczny pracownik — rozmawiasz naturalnie, nie odczytujesz danych z kartki.

FIRMA:
Fryzjerstwo męskie (głównie) i krótkie damskie. Broda za dodatkową opłatą. Zgierska 1, dojazd od strony łódzkiej. Tel. 123456789, fryzjerstwo@gmail.com, fryzjerstwo1.com. Pon-pt 9-17, sob 10-14, ndz nieczynne. Rezerwacja na miejscu lub tel.
Cennik: krótkie męskie 40 zł, długie męskie 50 zł, krótkie/średnie damskie 60 zł, broda dopłata.

STYL:
- Maksymalnie 2-3 zdania. Nigdy więcej.
- Odpowiadaj TYLKO na to co pytają. Nic od siebie.
- Nigdy nie powtarzaj tych samych słów i zwrotów — za każdym razem formułuj inaczej.
- Jeśli pytają drugi raz o to samo, odpowiedz krócej i nawiąż do poprzedniej odpowiedzi.
- Zwykły tekst. Zero myślników, gwiazdek, list, dwukropków przed wartościami.
- Emotka maksymalnie raz na odpowiedź, nie zawsze, różne.

ZACHOWANIE:
- Pytania niezwiązane z salonem: odmów jednym zdaniem, przekieruj na temat salonu.
- Wulgaryzmy lub groźby: odpowiedz tylko "Zapraszam do kontaktu w grzeczniejszej formie 😊" — nic więcej.
- Krótkie odpowiedzi jak "nie", "ok", "dzięki" traktuj normalnie w kontekście rozmowy.
- Nie znasz odpowiedzi: powiedz że nie wiesz i podaj tel./mail — za każdym razem innymi słowami.
- Nie wymyślaj informacji których nie ma powyżej.`;

  // ============================================================
  // DANE KONTAKTOWE — podmień dla każdego klienta
  // Zostaw pusty string "" jeśli dana nie dotyczy
  // ============================================================
  const CONTACT_PHONE    = "123456789";
  const CONTACT_EMAIL    = "fryzjerstwo@gmail.com";
  const CONTACT_ADDRESS  = "Zgiersk"; // rdzeń adresu bez końcówki, np. "Zgiersk" złapie "Zgierska", "Zgierskiej" itd.
  const CONTACT_MAPS_URL = "https://maps.google.com/?q=Zgierska+1+Łódź";

  // ============================================================
  // KONFIGURACJA
  // ============================================================
  const STORAGE_KEY    = "bf_chat";
  const TYPED_KEY      = "bf_typed";
  const BADGE_DELAY    = 5;
  const MAX_INPUT_LEN  = 250;
  const MAX_HISTORY    = 20;
  const STREAM_TIMEOUT = 15000;

  const QUICK_REPLIES = [
    { label: "🕐 Godziny otwarcia", msg: "Jakie są godziny otwarcia?" },
    { label: "💰 Cennik",           msg: "Jaki jest cennik?" },
    { label: "📍 Adres",            msg: "Jaki jest adres?" },
    { label: "✂️ Usługi",           msg: "Jakie usługi oferujecie?" },
    { label: "📞 Kontakt",          msg: "Jak mogę się skontaktować?" },
  ];

  const B_ICON = `<span style="font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;font-weight:700;color:#fff;line-height:1;display:flex;align-items:center;justify-content:center;">${BOT_INITIAL}</span>`;

  // ============================================================
  // HELPERS
  // ============================================================

  function hexDarken(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (n >> 16) - Math.round(2.55 * pct));
    const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(2.55 * pct));
    const b = Math.max(0, (n & 0xff) - Math.round(2.55 * pct));
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  const darken = hexDarken(WIDGET_COLOR, 10);

  function getSessionId() {
    let id = sessionStorage.getItem("bf_session");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("bf_session", id);
    }
    return id;
  }

  // ============================================================
  // STYLE
  // ============================================================

  const style = document.createElement("style");
  style.textContent = `
    #bf-widget * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }

    #bf-btn {
      position: fixed; bottom: 28px; right: 28px;
      width: 54px; height: 54px; border-radius: 50%;
      background: ${WIDGET_COLOR}; color: #fff; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(37,99,235,0.4); z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #bf-btn:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(37,99,235,0.5); }
    #bf-btn svg { width: 22px; height: 22px; transition: opacity 0.2s, transform 0.2s; }
    #bf-btn .icon-chat { position: absolute; }
    #bf-btn .icon-close { position: absolute; opacity: 0; transform: rotate(-90deg); }
    #bf-btn.is-open .icon-chat { opacity: 0; transform: rotate(90deg); }
    #bf-btn.is-open .icon-close { opacity: 1; transform: rotate(0deg); }

    #bf-badge-dot {
      position: fixed; bottom: 52px; right: 24px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #ef4444; border: 2.5px solid #fff;
      z-index: 100000;
      opacity: 0; transform: scale(0);
      transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
    }
    #bf-badge-dot.visible {
      opacity: 1; transform: scale(1);
      animation: bf-pulse 2s ease-in-out 0.3s infinite;
    }
    @keyframes bf-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
      50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
    }

    #bf-box {
      position: fixed; bottom: 94px; right: 28px; width: 360px;
      background: #fff; border-radius: 16px; border: 1px solid #e2e8f0;
      box-shadow: 0 12px 40px rgba(15,23,42,0.12);
      display: flex; flex-direction: column; z-index: 99998; overflow: hidden;
      opacity: 0; transform: translateY(16px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.34,1.3,0.64,1);
    }
    #bf-box.open {
      opacity: 1; transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    @media (max-width: 420px) {
      #bf-box { width: calc(100vw - 24px); right: 12px; bottom: 88px; left: 12px; }
      #bf-btn { bottom: 16px; right: 16px; }
      #bf-badge-dot { bottom: 40px; right: 12px; }
    }

    #bf-header {
      background: ${WIDGET_COLOR}; padding: 14px 16px;
      display: flex; align-items: center; gap: 10px;
    }
    #bf-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #bf-header-text { flex: 1; }
    #bf-header-name { color: #fff; font-weight: 700; font-size: 14px; line-height: 1.2; }
    #bf-header-sub {
      color: rgba(255,255,255,0.7); font-size: 11px; margin-top: 2px;
      display: flex; align-items: center; gap: 5px;
    }
    #bf-online-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #4ade80; display: inline-block; flex-shrink: 0;
    }
    .bf-header-btn {
      background: none; border: none; color: rgba(255,255,255,0.4);
      cursor: pointer; padding: 4px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .bf-header-btn:hover { color: #fff; background: rgba(255,255,255,0.15); }
    #bf-clear svg, #bf-close svg { width: 15px; height: 15px; }

    #bf-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
      min-height: 300px; max-height: 360px; background: #f8fafc;
      scrollbar-width: thin; scrollbar-color: #e2e8f0 transparent;
    }

    @keyframes bf-msg-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes bf-fade-out {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(-4px); }
    }
    .bf-ai-wrap, .bf-user-msg, .bf-pills, .bf-contact-btns {
      animation: bf-msg-in 0.18s ease;
    }
    .bf-pills.hiding, .bf-contact-btns.hiding {
      animation: bf-fade-out 0.2s ease forwards;
      pointer-events: none;
    }

    .bf-ai-wrap { display: flex; align-items: flex-end; gap: 8px; }
    .bf-ai-icon {
      width: 26px; height: 26px; border-radius: 50%; background: ${WIDGET_COLOR};
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; color: #fff;
    }
    .bf-ai-msg {
      background: #fff; color: #0f172a; border: 1px solid #e2e8f0;
      padding: 10px 14px; border-radius: 16px 16px 16px 4px;
      font-size: 13.5px; line-height: 1.55; max-width: 82%;
    }
    .bf-user-wrap { display: flex; flex-direction: column; align-items: flex-end; }
    .bf-user-msg {
      background: ${WIDGET_COLOR}; color: #fff; padding: 10px 14px;
      border-radius: 16px 16px 4px 16px;
      font-size: 13.5px; line-height: 1.55; max-width: 82%;
    }

    .bf-contact-btns {
      display: flex; gap: 6px; padding-left: 34px; margin-top: 4px;
    }
    .bf-contact-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 6px 12px; border-radius: 20px; border: 1.5px solid ${WIDGET_COLOR};
      background: #fff; color: ${WIDGET_COLOR};
      font-size: 12px; font-weight: 600; cursor: pointer;
      font-family: 'Segoe UI', system-ui, sans-serif;
      transition: background 0.15s, color 0.15s;
      text-decoration: none;
    }
    .bf-contact-btn:hover { background: ${WIDGET_COLOR}; color: #fff; }

    .bf-typing-wrap { display: flex; align-items: flex-end; gap: 8px; }
    .bf-typing {
      background: #fff; border: 1px solid #e2e8f0;
      padding: 12px 16px; border-radius: 16px 16px 16px 4px;
      display: flex; gap: 5px; align-items: center;
    }
    .bf-dot {
      width: 6px; height: 6px; border-radius: 50%; background: #94a3b8;
      animation: bf-bounce 1.2s infinite ease-in-out;
    }
    .bf-dot:nth-child(2) { animation-delay: 0.2s; }
    .bf-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bf-bounce {
      0%,60%,100% { transform: translateY(0); }
      30% { transform: translateY(-5px); }
    }

    .bf-pills {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding-left: 34px; margin-top: 2px;
    }
    .bf-pill {
      background: #fff; color: ${WIDGET_COLOR};
      border: 1.5px solid ${WIDGET_COLOR}; border-radius: 20px;
      padding: 5px 13px; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: background 0.15s, color 0.15s;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .bf-pill:hover { background: ${WIDGET_COLOR}; color: #fff; }

    #bf-confirm {
      display: none; position: absolute; top: 58px; right: 12px;
      background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 14px 16px; box-shadow: 0 8px 24px rgba(15,23,42,0.12);
      z-index: 10; width: 200px;
    }
    #bf-confirm.visible { display: block; animation: bf-pop 0.15s ease; }
    @keyframes bf-pop {
      from { opacity: 0; transform: translateY(-4px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    #bf-confirm p { font-size: 13px; color: #0f172a; margin: 0 0 12px; line-height: 1.4; }
    #bf-confirm-btns { display: flex; gap: 8px; }
    #bf-confirm-yes {
      flex: 1; padding: 6px 0; font-size: 12px; font-weight: 600;
      background: #ef4444; color: #fff; border: none; border-radius: 8px;
      cursor: pointer; transition: background 0.15s;
    }
    #bf-confirm-yes:hover { background: #dc2626; }
    #bf-confirm-no {
      flex: 1; padding: 6px 0; font-size: 12px; font-weight: 600;
      background: none; color: #64748b; border: 1px solid #e2e8f0;
      border-radius: 8px; cursor: pointer; transition: background 0.15s;
    }
    #bf-confirm-no:hover { background: #f1f5f9; }

    #bf-input-area {
      padding: 10px 12px; border-top: 1px solid #e2e8f0;
      display: flex; gap: 6px; align-items: center;
      background: #fff; position: relative;
    }

    #bf-quick-toggle {
      background: ${WIDGET_COLOR}; color: #fff; border: none; border-radius: 10px;
      width: 36px; height: 36px; flex-shrink: 0; cursor: pointer;
      display: none; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s;
      font-size: 14px; font-weight: 700; letter-spacing: 2px; line-height: 1;
    }
    #bf-quick-toggle:hover { background: ${darken}; }
    #bf-quick-toggle:active { transform: scale(0.95); }
    #bf-quick-toggle.show { display: flex; }

    #bf-quick-menu-wrap {
      position: absolute; bottom: calc(100% + 6px); left: 8px;
      background: #fff; border: 1px solid #e2e8f0;
      border-radius: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.1);
      padding: 6px; width: auto; max-width: 220px;
      display: flex; flex-direction: column; gap: 2px;
      opacity: 0; transform: translateY(8px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.34,1.3,0.64,1);
      z-index: 10;
    }
    #bf-quick-menu-wrap.visible {
      opacity: 1; transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .bf-menu-pill {
      background: none; color: #0f172a;
      border: none; border-radius: 8px;
      padding: 9px 13px; font-size: 13px; font-weight: 500;
      cursor: pointer; white-space: nowrap; text-align: left;
      font-family: 'Segoe UI', system-ui, sans-serif;
      transition: background 0.12s;
    }
    .bf-menu-pill:hover { background: #f1f5f9; }

    #bf-input-wrap {
      flex: 1; position: relative; display: flex; align-items: center;
    }
    #bf-input {
      width: 100%; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 9px 58px 9px 14px; font-size: 13.5px; outline: none;
      background: #f8fafc; color: #0f172a;
      transition: border-color 0.15s, background 0.15s;
    }
    #bf-input:focus { border-color: ${WIDGET_COLOR}; background: #fff; }
    #bf-input::placeholder { color: #94a3b8; }

    #bf-char-counter {
      position: absolute; right: 10px;
      font-size: 10px; color: #94a3b8;
      pointer-events: none; user-select: none;
      transition: color 0.15s;
    }
    #bf-char-counter.warn { color: #ef4444; }

    #bf-send {
      background: ${WIDGET_COLOR}; color: #fff; border: none; border-radius: 10px;
      width: 36px; height: 36px; flex-shrink: 0; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s;
    }
    #bf-send:hover { background: ${darken}; }
    #bf-send:active { transform: scale(0.95); }
    #bf-send:disabled { opacity: 0.45; cursor: not-allowed; }
    #bf-send svg { width: 15px; height: 15px; }
  `;
  document.head.appendChild(style);

  // ============================================================
  // HTML
  // ============================================================

  const widget = document.createElement("div");
  widget.id = "bf-widget";
  widget.innerHTML = `
    <div id="bf-badge-dot"></div>
    <button id="bf-btn" aria-label="Otwórz czat">
      <svg class="icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div id="bf-box" role="dialog" aria-label="Czat z asystentem">
      <div id="bf-header">
        <div id="bf-avatar">${B_ICON}</div>
        <div id="bf-header-text">
          <div id="bf-header-name">${BOT_NAME}</div>
          <div id="bf-header-sub">
            <span id="bf-online-dot"></span>
            ${BOT_SUBTITLE}
          </div>
        </div>
        <button id="bf-clear" class="bf-header-btn" title="Wyczyść rozmowę">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
        <button id="bf-close" class="bf-header-btn" aria-label="Zamknij czat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div id="bf-confirm">
        <p>Wyczyścić całą rozmowę?</p>
        <div id="bf-confirm-btns">
          <button id="bf-confirm-yes">Wyczyść</button>
          <button id="bf-confirm-no">Anuluj</button>
        </div>
      </div>
      <div id="bf-messages"></div>
      <div id="bf-input-area">
        <div id="bf-quick-menu-wrap"></div>
        <button id="bf-quick-toggle">···</button>
        <div id="bf-input-wrap">
          <input id="bf-input" type="text" placeholder="Napisz wiadomość..." autocomplete="off" maxlength="${MAX_INPUT_LEN}"/>
          <span id="bf-char-counter"></span>
        </div>
        <button id="bf-send" aria-label="Wyślij">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // ============================================================
  // REFERENCJE
  // ============================================================

  const btn         = document.getElementById("bf-btn");
  const box         = document.getElementById("bf-box");
  const closeBtn    = document.getElementById("bf-close");
  const clearBtn    = document.getElementById("bf-clear");
  const confirm     = document.getElementById("bf-confirm");
  const confirmYes  = document.getElementById("bf-confirm-yes");
  const confirmNo   = document.getElementById("bf-confirm-no");
  const msgs        = document.getElementById("bf-messages");
  const input       = document.getElementById("bf-input");
  const send        = document.getElementById("bf-send");
  const quickToggle = document.getElementById("bf-quick-toggle");
  const quickMenu   = document.getElementById("bf-quick-menu-wrap");
  const charCounter = document.getElementById("bf-char-counter");

  const history    = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  let userHasTyped = localStorage.getItem(TYPED_KEY) === "1";
  let isBusy       = false;

  // ============================================================
  // HISTORIA I ZAPIS
  // ============================================================

  function saveHistory() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40)));
  }
  function saveTyped() {
    localStorage.setItem(TYPED_KEY, userHasTyped ? "1" : "0");
  }
  function getHistoryForAPI() {
    return history.slice(-MAX_HISTORY);
  }

  // ============================================================
  // QUICK REPLIES
  // ============================================================

  function buildQuickMenu() {
    quickMenu.innerHTML = "";
    QUICK_REPLIES.forEach(({ label, msg }) => {
      const pill = document.createElement("button");
      pill.className = "bf-menu-pill";
      pill.textContent = label;
      pill.onclick = () => { closeQuickMenu(); handleSend(msg); };
      quickMenu.appendChild(pill);
    });
  }

  function openQuickMenu()  { quickMenu.classList.add("visible"); }
  function closeQuickMenu() { quickMenu.classList.remove("visible"); }

  function syncToggleBtn() {
    if (userHasTyped && QUICK_REPLIES.length) {
      quickToggle.classList.add("show");
    } else {
      quickToggle.classList.remove("show");
      closeQuickMenu();
    }
  }

  function renderInlinePills() {
    if (!QUICK_REPLIES.length || userHasTyped) return;
    const wrap = document.createElement("div");
    wrap.className = "bf-pills";
    wrap.id = "bf-inline-pills";
    QUICK_REPLIES.forEach(({ label, msg }) => {
      const pill = document.createElement("button");
      pill.className = "bf-pill";
      pill.textContent = label;
      pill.onclick = () => { removeInlinePills(); handleSend(msg); };
      wrap.appendChild(pill);
    });
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeInlinePills() {
    const el = document.getElementById("bf-inline-pills");
    if (!el) return;
    el.classList.add("hiding");
    setTimeout(() => el.remove(), 220);
  }

  // ============================================================
  // RENDER WIADOMOŚCI
  // ============================================================

  function renderAI(text) {
    const wrap = document.createElement("div");
    wrap.className = "bf-ai-wrap";
    const icon = document.createElement("div");
    icon.className = "bf-ai-icon";
    icon.innerHTML = B_ICON;
    const bubble = document.createElement("div");
    bubble.className = "bf-ai-msg";
    bubble.textContent = text;
    wrap.appendChild(icon);
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeContactBtns() {
    const el = document.getElementById("bf-contact-btns");
    if (!el) return;
    el.classList.add("hiding");
    setTimeout(() => el.remove(), 220);
  }

  function renderContactBtns(text) {
    const existing = document.getElementById("bf-contact-btns");
    if (existing) existing.remove();
    const hasPhone   = CONTACT_PHONE   && text.includes(CONTACT_PHONE);
    const hasEmail   = CONTACT_EMAIL   && text.includes(CONTACT_EMAIL);
    const hasAddress = CONTACT_ADDRESS && CONTACT_MAPS_URL && text.toLowerCase().includes(CONTACT_ADDRESS.toLowerCase());
    if (!hasPhone && !hasEmail && !hasAddress) return;

    const wrap = document.createElement("div");
    wrap.className = "bf-contact-btns";
    wrap.id = "bf-contact-btns";

    if (hasPhone) {
      const btn = document.createElement("a");
      btn.className = "bf-contact-btn";
      btn.href = `tel:${CONTACT_PHONE}`;
      btn.title = CONTACT_PHONE;
      btn.textContent = "📞 Zadzwoń";
      wrap.appendChild(btn);
    }
    if (hasEmail) {
      const btn = document.createElement("a");
      btn.className = "bf-contact-btn";
      btn.href = `mailto:${CONTACT_EMAIL}`;
      btn.title = CONTACT_EMAIL;
      btn.textContent = "✉️ Napisz";
      wrap.appendChild(btn);
    }
    if (hasAddress) {
      const btn = document.createElement("a");
      btn.className = "bf-contact-btn";
      btn.href = CONTACT_MAPS_URL;
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.title = CONTACT_ADDRESS;
      btn.textContent = "📍 Nawiguj";
      wrap.appendChild(btn);
    }

    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function renderUser(text) {
    removeContactBtns();
    const wrap = document.createElement("div");
    wrap.className = "bf-user-wrap";
    const bubble = document.createElement("div");
    bubble.className = "bf-user-msg";
    bubble.textContent = text;
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function restoreChat() {
    if (history.length === 0) {
      renderAI(WELCOME_MESSAGE);
      history.push({ role: "assistant", content: WELCOME_MESSAGE });
      saveHistory();
    } else {
      history.forEach((msg) => {
        if (msg.role === "user") renderUser(msg.content);
        else if (msg.role === "assistant") renderAI(msg.content);
      });
    }
    if (!userHasTyped) renderInlinePills();
    syncToggleBtn();
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ============================================================
  // TYPING INDICATOR
  // ============================================================

  function showTyping() {
    const wrap = document.createElement("div");
    wrap.className = "bf-typing-wrap";
    wrap.id = "bf-typing";
    wrap.innerHTML = `
      <div class="bf-ai-icon">${B_ICON}</div>
      <div class="bf-typing">
        <div class="bf-dot"></div><div class="bf-dot"></div><div class="bf-dot"></div>
      </div>`;
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() {
    const t = document.getElementById("bf-typing");
    if (t) t.remove();
  }

  // ============================================================
  // STREAMING
  // ============================================================

  function createStreamBubble() {
    hideTyping();
    const wrap = document.createElement("div");
    wrap.className = "bf-ai-wrap";
    const icon = document.createElement("div");
    icon.className = "bf-ai-icon";
    icon.innerHTML = B_ICON;
    const bubble = document.createElement("div");
    bubble.className = "bf-ai-msg";
    bubble.id = "bf-stream-bubble";
    wrap.appendChild(icon);
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return bubble;
  }

  async function getResponse(text) {
    history.push({ role: "user", content: text });

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...getHistoryForAPI(),
        ],
        sessionId: getSessionId(),
        site: window.location.hostname,
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const bubble = createStreamBubble();
    let reply           = "";
    let buffer          = "";
    let gotFirstToken   = false;
    let streamTimeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        clearTimeout(streamTimeoutId);
        streamTimeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const json  = JSON.parse(data);
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              gotFirstToken = true;
              reply += token;
              bubble.textContent = reply;
              msgs.scrollTop = msgs.scrollHeight;
            }
          } catch {}
        }
      }
    } finally {
      clearTimeout(streamTimeoutId);
    }

    if (!gotFirstToken || !reply) throw new Error("Empty response");

    history.push({ role: "assistant", content: reply });
    saveHistory();
    bubble.removeAttribute("id");
    renderContactBtns(reply);

    return reply;
  }

  // ============================================================
  // WYSYŁANIE
  // ============================================================

  function setInputLocked(locked) {
    isBusy               = locked;
    send.disabled        = locked;
    input.disabled       = locked;
    quickToggle.disabled = locked;
    document.querySelectorAll(".bf-pill, .bf-menu-pill").forEach((p) => {
      p.style.pointerEvents = locked ? "none" : "";
      p.style.opacity       = locked ? "0.5"  : "";
    });
  }

  async function handleSend(quickText) {
    if (isBusy) return;
    const raw  = quickText || input.value.trim();
    const text = raw.slice(0, MAX_INPUT_LEN);
    if (!text) return;

    input.value = "";
    charCounter.textContent = "";
    setInputLocked(true);

    if (!userHasTyped) {
      userHasTyped = true;
      saveTyped();
      removeInlinePills();
      syncToggleBtn();
    }

    renderUser(text);
    showTyping();

    try {
      await getResponse(text);
    } catch (err) {
      hideTyping();
      const msg = err.name === "AbortError"
        ? `Przekroczono czas oczekiwania. Spróbuj ponownie${CONTACT_PHONE ? " lub zadzwoń: " + CONTACT_PHONE : ""}.`
        : `Przepraszam, coś poszło nie tak.${CONTACT_PHONE ? " Zadzwoń do nas: " + CONTACT_PHONE : ""}`;
      renderAI(msg);
    }

    setInputLocked(false);
    input.focus();
  }

  // ============================================================
  // EVENTY
  // ============================================================

  btn.addEventListener("click", () => {
    const isOpen = box.classList.toggle("open");
    btn.classList.toggle("is-open", isOpen);
    confirm.classList.remove("visible");
    closeQuickMenu();
    if (isOpen) hideBadge();
    if (isOpen && msgs.children.length === 0) restoreChat();
    if (isOpen) setTimeout(() => input.focus(), 150);
  });

  closeBtn.addEventListener("click", () => {
    box.classList.remove("open");
    btn.classList.remove("is-open");
    confirm.classList.remove("visible");
    closeQuickMenu();
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeQuickMenu();
    confirm.classList.toggle("visible");
  });

  confirmYes.addEventListener("click", () => {
    history.length = 0;
    userHasTyped   = false;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TYPED_KEY);
    msgs.innerHTML = "";
    confirm.classList.remove("visible");
    renderAI(WELCOME_MESSAGE);
    history.push({ role: "assistant", content: WELCOME_MESSAGE });
    saveHistory();
    renderInlinePills();
    syncToggleBtn();
    resetBadge();
  });

  confirmNo.addEventListener("click", () => confirm.classList.remove("visible"));

  quickToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    confirm.classList.remove("visible");
    quickMenu.classList.contains("visible") ? closeQuickMenu() : openQuickMenu();
  });

  send.addEventListener("click", () => handleSend());
  input.addEventListener("keypress", (e) => { if (e.key === "Enter") handleSend(); });

  input.addEventListener("input", () => {
    const len = input.value.length;
    if (len > MAX_INPUT_LEN * 0.8) {
      charCounter.textContent = `${len}/${MAX_INPUT_LEN}`;
      charCounter.classList.toggle("warn", len >= MAX_INPUT_LEN);
    } else {
      charCounter.textContent = "";
      charCounter.classList.remove("warn");
    }
  });

  document.addEventListener("click", (e) => {
    if (!clearBtn.contains(e.target) && !confirm.contains(e.target)) {
      confirm.classList.remove("visible");
    }
    if (!quickToggle.contains(e.target) && !quickMenu.contains(e.target)) {
      closeQuickMenu();
    }
  });

  buildQuickMenu();

  // ============================================================
  // BADGE
  // ============================================================

  const badgeDot = document.getElementById("bf-badge-dot");

  function showBadge() { badgeDot.classList.add("visible"); }
  function hideBadge() {
    badgeDot.classList.remove("visible");
    sessionStorage.setItem("bf_seen", "1");
  }
  function resetBadge() {
    sessionStorage.removeItem("bf_seen");
    if (BADGE_DELAY > 0) setTimeout(showBadge, BADGE_DELAY * 1000);
  }

  if (BADGE_DELAY > 0 && !sessionStorage.getItem("bf_seen")) {
    setTimeout(showBadge, BADGE_DELAY * 1000);
  }

})();
