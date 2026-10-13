(function () {
  "use strict";

  if (window.__collabramaSupportWidgetLoaded) return;
  window.__collabramaSupportWidgetLoaded = true;

  var VARIANTS = {
    search: {
      title: "Поддержка Collabrama",
      greeting: "Здравствуйте! Опишите вопрос — поможем с подбором авторов, шорт-листом или сделками.",
      chips: ["Не нашёл нужных авторов", "Как работает шорт-лист", "Тариф и оплата"],
      buttonSize: 56,
      panelWidth: 380,
    },
    crm: {
      title: "Поддержка",
      greeting: "Здравствуйте! Опишите вопрос — поможем со сделками, маркировкой ERID или тарифом.",
      chips: ["Как получить ERID", "Шорт-лист и сделки", "Тариф и оплата"],
      buttonSize: 44,
      panelWidth: 360,
    },
  };

  function getVariant() {
    return window.__SUPPORT_WIDGET_DOCK__ === "sidebar" ? VARIANTS.crm : VARIANTS.search;
  }

  function getApiBase() {
    var raw = typeof window.__SUPPORT_API_URL__ === "string" ? window.__SUPPORT_API_URL__.trim() : "";
    if (raw && raw.charAt(0) !== "%") return raw.replace(/\/+$/, "");
    return "/api/v1";
  }

  function getButtonBottom() {
    var raw = Number(window.__SUPPORT_WIDGET_BOTTOM__);
    if (isFinite(raw) && raw >= 0) return raw;
    return 24;
  }

  function isDockedToSidebar() {
    return window.__SUPPORT_WIDGET_DOCK__ === "sidebar";
  }

  function getToken() {
    try {
      return localStorage.getItem("creatorflow_token") || "";
    } catch (e) {
      return "";
    }
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  var HEADSET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"></path><rect x="3" y="13" width="4" height="6" rx="2"></rect><rect x="17" y="13" width="4" height="6" rx="2"></rect><path d="M19 19a3 3 0 0 1-3 3h-3"></path></svg>';
  var CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
  var SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"></path></svg>';

  function injectStyles(variant) {
    var size = variant.buttonSize;
    var css =
      ".cf-sup-wrap{position:fixed;right:24px;bottom:" + getButtonBottom() + "px;z-index:9998;display:flex;flex-direction:column;align-items:flex-end;gap:12px;font-family:'Manrope','Inter',system-ui,sans-serif}" +
      ".cf-sup-btn{width:" + size + "px;height:" + size + "px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 12px 26px -12px rgba(30,27,75,.45);border:1px solid #e3e5ec;background:#ffffff;color:#4f46e5;transition:background .18s ease,color .18s ease,transform .12s ease;animation:cf-sup-pop .3s ease}" +
      ".cf-sup-btn:hover{background:#f5f6ff}" +
      ".cf-sup-btn:active{transform:scale(.94)}" +
      ".cf-sup-btn:focus-visible{outline:2px solid #312e81;outline-offset:2px}" +
      ".cf-sup-btn.cf-sup-open{border:0;background:#1e1b4b;color:#ffffff}" +
      ".cf-sup-btn svg{width:" + Math.round(size * 0.4) + "px;height:" + Math.round(size * 0.4) + "px}" +
      ".cf-sup-panel{width:" + variant.panelWidth + "px;max-width:calc(100vw - 48px);background:#ffffff;border:1px solid #e6e8ef;border-radius:24px;box-shadow:0 28px 60px -20px rgba(30,27,75,.45);overflow:hidden;animation:cf-sup-up .22s ease}" +
      ".cf-sup-head{padding:16px 16px 14px;display:flex;align-items:center;gap:12px;background:linear-gradient(180deg,#efedff,#f7f6ff);border-bottom:1px solid #ece9fb}" +
      ".cf-sup-avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#4f46e5);color:#ffffff;display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
      ".cf-sup-avatar svg{width:20px;height:20px}" +
      ".cf-sup-title{font-size:16px;font-weight:800;color:#111827}" +
      ".cf-sup-status{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#4b5563}" +
      ".cf-sup-dot{width:7px;height:7px;border-radius:50%;background:#10b981}" +
      ".cf-sup-close{margin-left:auto;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#6b7280;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s ease}" +
      ".cf-sup-close:hover{background:rgba(255,255,255,.7);color:#111827}" +
      ".cf-sup-close svg{width:16px;height:16px}" +
      ".cf-sup-feed{padding:16px;display:flex;flex-direction:column;gap:12px;background:#fafafe;max-height:320px;overflow-y:auto}" +
      ".cf-sup-msg{max-width:88%;padding:10px 14px;font-size:14px;line-height:1.5;border-radius:16px 16px 16px 6px;background:#ffffff;border:1px solid #eceef3;color:#1f2937;align-self:flex-start;white-space:pre-wrap;word-break:break-word}" +
      ".cf-sup-msg.cf-sup-us{align-self:flex-end;border-radius:16px 16px 6px 16px;background:linear-gradient(135deg,#6d6cf6,#4f46e5);border:0;color:#ffffff}" +
      ".cf-sup-msg.cf-sup-err{background:#fef2f2;border-color:#fecaca;color:#b91c1c}" +
      ".cf-sup-chips{display:flex;flex-wrap:wrap;gap:6px}" +
      ".cf-sup-chip{height:32px;padding:0 12px;border-radius:99px;border:1px solid #ddd6fe;background:#ffffff;color:#6d28d9;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s ease}" +
      ".cf-sup-chip:hover{background:#f5f3ff}" +
      ".cf-sup-foot{padding:12px 12px 14px;border-top:1px solid #f0f1f5;display:flex;align-items:flex-end;gap:8px}" +
      ".cf-sup-input{flex:1;box-sizing:border-box;resize:none;border:1px solid #e3e5ec;border-radius:14px;background:#f7f8fb;padding:10px 12px;font-family:inherit;font-size:14px;line-height:1.4;color:#111827;outline:none;max-height:120px}" +
      ".cf-sup-input:focus{border-color:#c7c9f5;background:#ffffff}" +
      ".cf-sup-send{width:44px;height:44px;flex-shrink:0;border:0;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#4f46e5);color:#ffffff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity .15s ease,transform .12s ease}" +
      ".cf-sup-send:active{transform:scale(.92)}" +
      ".cf-sup-send:disabled{opacity:.55;cursor:not-allowed}" +
      ".cf-sup-send svg{width:17px;height:17px}" +
      ".cf-sup-spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:cf-sup-rot .7s linear infinite}" +
      "@keyframes cf-sup-rot{to{transform:rotate(360deg)}}" +
      "@keyframes cf-sup-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}" +
      "@keyframes cf-sup-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}";
    var style = document.createElement("style");
    style.setAttribute("data-cf-support", "");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof html === "string") node.innerHTML = html;
    return node;
  }

  function createWidget() {
    var variant = getVariant();
    injectStyles(variant);

    var state = { open: false, sending: false, chipUsed: "" };

    var wrap = el("div", "cf-sup-wrap");
    var panel = null;

    var button = el("button", "cf-sup-btn");
    button.type = "button";
    button.setAttribute("aria-label", "Техподдержка");
    button.setAttribute("title", "Техподдержка");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = HEADSET_SVG;
    button.addEventListener("click", function () {
      if (state.open) closeWidget();
      else openWidget();
    });
    wrap.appendChild(button);
    document.body.appendChild(wrap);

    if (isDockedToSidebar() && getToken()) wrap.style.display = "none";

    window.cfSupportOpen = openWidget;
    window.cfSupportFloating = function (show) {
      wrap.style.display = show ? "" : "none";
    };

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.open) closeWidget();
    });

    function addMessage(text, kind) {
      if (!panel) return null;
      var feed = panel.querySelector(".cf-sup-feed");
      if (!feed) return null;
      var chips = feed.querySelector(".cf-sup-chips");
      var msg = el("div", "cf-sup-msg" + (kind ? " " + kind : ""));
      msg.textContent = text;
      if (chips) feed.insertBefore(msg, chips);
      else feed.appendChild(msg);
      feed.scrollTop = feed.scrollHeight;
      return msg;
    }

    function openWidget() {
      if (state.open) return;
      state.open = true;
      button.classList.add("cf-sup-open");
      button.setAttribute("aria-expanded", "true");
      button.innerHTML = CLOSE_SVG;
      renderPanel();
    }

    function closeWidget() {
      if (!state.open) return;
      state.open = false;
      button.classList.remove("cf-sup-open");
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = HEADSET_SVG;
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      button.focus();
    }

    function renderPanel() {
      panel = el("div", "cf-sup-panel");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", variant.title);

      var head = el("div", "cf-sup-head");
      head.appendChild(el("span", "cf-sup-avatar", HEADSET_SVG));
      var titleBox = el("div");
      titleBox.appendChild(el("div", "cf-sup-title", esc(variant.title)));
      titleBox.appendChild(el("div", "cf-sup-status", '<span class="cf-sup-dot"></span>Онлайн · отвечаем в среднем за 5 минут'));
      head.appendChild(titleBox);
      var closeBtn = el("button", "cf-sup-close", CLOSE_SVG);
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Закрыть");
      closeBtn.addEventListener("click", closeWidget);
      head.appendChild(closeBtn);
      panel.appendChild(head);

      var feed = el("div", "cf-sup-feed");
      feed.appendChild(el("div", "cf-sup-msg", esc(variant.greeting)));
      var chips = el("div", "cf-sup-chips");
      variant.chips.forEach(function (label) {
        var chip = el("button", "cf-sup-chip", esc(label));
        chip.type = "button";
        chip.addEventListener("click", function () {
          state.chipUsed = label;
          var input = panel.querySelector(".cf-sup-input");
          if (input) {
            input.value = label + ": ";
            input.focus();
          }
        });
        chips.appendChild(chip);
      });
      feed.appendChild(chips);
      panel.appendChild(feed);

      var foot = el("div", "cf-sup-foot");
      var input = el("textarea", "cf-sup-input");
      input.rows = 2;
      input.placeholder = "Ваш вопрос…";
      input.maxLength = 2000;
      input.setAttribute("aria-label", "Ваш вопрос");
      var sendBtn = el("button", "cf-sup-send", SEND_SVG);
      sendBtn.type = "button";
      sendBtn.setAttribute("aria-label", "Отправить");

      function submit() {
        var text = input.value.trim();
        if (!text || state.sending) return;
        send(sendBtn, input, text);
      }
      sendBtn.addEventListener("click", submit);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });
      foot.appendChild(input);
      foot.appendChild(sendBtn);
      panel.appendChild(foot);

      wrap.insertBefore(panel, button);
      input.focus();
    }

    function send(sendBtn, input, text) {
      state.sending = true;
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="cf-sup-spin"></span>';
      addMessage(text, "cf-sup-us");
      input.value = "";

      var subject = state.chipUsed && text.indexOf(state.chipUsed) === 0
        ? state.chipUsed
        : (text.length > 80 ? text.slice(0, 77) + "…" : text);

      var body = {
        subject: subject,
        category: "question",
        description: text,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
      };

      var headers = { "Content-Type": "application/json", Accept: "application/json" };
      var token = getToken();
      if (token) headers["Authorization"] = "Bearer " + token;

      fetch(getApiBase() + "/support/tickets", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      })
        .then(function (resp) {
          return resp.json().catch(function () { return {}; }).then(function (data) {
            if (!resp.ok) {
              var detail = typeof data.detail === "string" ? data.detail : "Не удалось отправить обращение. Попробуйте позже.";
              if (resp.status === 429) detail = "Слишком много обращений. Попробуйте позже.";
              throw new Error(detail);
            }
            var num = data.ticket_number ? " №" + data.ticket_number : "";
            addMessage("Обращение" + num + " принято. Мы вернёмся с ответом — обычно в течение 5 минут.", "");
          });
        })
        .catch(function (err) {
          addMessage(err && err.message ? err.message : "Не удалось отправить обращение. Попробуйте позже.", "cf-sup-err");
        })
        .finally(function () {
          state.sending = false;
          state.chipUsed = "";
          sendBtn.disabled = false;
          sendBtn.innerHTML = SEND_SVG;
          input.focus();
        });
    }
  }

  function init() {
    createWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
