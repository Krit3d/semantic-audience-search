// Cookie consent для поиска Collabrama (vanilla JS, без зависимостей).
// Модель та же, что на лендинге и в CRM: cookie cf_cookie_consent (1 год) + localStorage.
(function () {
  "use strict";

  var CONSENT_COOKIE = "cf_cookie_consent";
  var CONSENT_STORAGE_KEY = "cf_cookie_consent";
  var CONSENT_MAX_AGE = 60 * 60 * 24 * 365; // 1 год
  var LEGACY_ACCEPT_KEY = "cf_cookie_accepted";

  var CATEGORIES = [
    {
      id: "technical",
      title: "Технические (обязательные)",
      locked: true,
      description:
        "Без них сайт не заработает: авторизация и безопасность. Не используются для маркетинга и отслеживания.",
      details: [
        ["cf_auth", "признак авторизованной сессии для маршрутизации", "30 дней"],
        ["cf_cookie_consent", "ваш выбор настроек cookie", "1 год"],
        ["creatorflow_token (localStorage)", "токен сессии CRM и поиска", "до выхода из аккаунта"],
      ],
    },
    {
      id: "functional",
      title: "Функциональные",
      description:
        "Запоминают ваши настройки и предпочтения в интерфейсе. Хранятся только на наших серверах и в вашем браузере, не передаются третьим лицам.",
      details: [],
      offNote: "Без функциональных cookie сайт не запомнит ваши настройки между визитами.",
    },
    {
      id: "analytics",
      title: "Аналитические",
      description:
        "Помогают понять, какими разделами пользуются чаще, чтобы делать сервис удобнее. Сейчас аналитические cookie не используются — мы честно сообщим здесь, если подключим аналитику.",
      details: [],
      offNote: "Отказ от аналитических cookie никак не ограничивает работу сайта.",
    },
    {
      id: "marketing",
      title: "Рекламные",
      description:
        "Делают рекламу сервиса релевантнее. Сейчас рекламные cookie не используются — мы не передаём данные рекламным сетям.",
      details: [],
      offNote: "Отказ от рекламных cookie никак не ограничивает работу сайта.",
    },
  ];

  function cookieDomain() {
    var host = window.location.hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(".") === -1) return "";
    var parts = host.split(".");
    return "; Domain=." + parts.slice(-2).join(".");
  }

  function normalize(payload) {
    if (!payload || typeof payload !== "object") return null;
    return {
      v: 1,
      ts: typeof payload.ts === "number" ? payload.ts : Math.floor(Date.now() / 1000),
      technical: true,
      functional: payload.functional === true,
      analytics: payload.analytics === true,
      marketing: payload.marketing === true,
    };
  }

  function readCookie() {
    var rows = document.cookie.split(/;\s*/);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].indexOf(CONSENT_COOKIE + "=") === 0) {
        try {
          return JSON.parse(decodeURIComponent(rows[i].slice(CONSENT_COOKIE.length + 1)));
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  function readStorage() {
    try {
      var raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save(partial) {
    var consent = normalize({ functional: partial.functional, analytics: partial.analytics, marketing: partial.marketing });
    consent.ts = Math.floor(Date.now() / 1000);
    var secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      CONSENT_COOKIE + "=" + encodeURIComponent(JSON.stringify(consent)) +
      "; Path=/; Max-Age=" + CONSENT_MAX_AGE + "; SameSite=Lax" + cookieDomain() + secure;
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
      window.localStorage.removeItem(LEGACY_ACCEPT_KEY);
    } catch (e) { /* ignore */ }
    window.dispatchEvent(new CustomEvent("cf:consent-changed", { detail: consent }));
    return consent;
  }

  function getConsent() {
    var consent = normalize(readCookie() || readStorage());
    if (consent) return consent;
    try {
      if (window.localStorage.getItem(LEGACY_ACCEPT_KEY)) {
        return save({ functional: true, analytics: true, marketing: true });
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // Публичный API для будущих скриптов аналитики/маркетинга.
  window.cfConsent = {
    get: getConsent,
    has: function (category) {
      if (category === "technical") return true;
      var c = getConsent();
      return c ? c[category] === true : false;
    },
  };

  function esc(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var bannerEl = null;
  var modalEl = null;

  function removeBanner() {
    if (bannerEl) { bannerEl.remove(); bannerEl = null; }
  }

  function closeModal() {
    if (modalEl) { modalEl.remove(); modalEl = null; }
    document.body.style.overflow = "";
    // Если пользователь закрыл настройки без выбора — баннер должен вернуться.
    if (!getConsent()) showBanner();
  }

  function openSettings() {
    if (modalEl) return;
    removeBanner();
    var consent = getConsent() || { functional: false, analytics: false, marketing: false };

    var body = CATEGORIES.map(function (cat) {
      var on = cat.locked || consent[cat.id] === true;
      var details = cat.details.length
        ? '<div class="cc-details">' + cat.details.map(function (d) {
            return '<div class="cc-detail-row"><span class="cc-detail-name">' + esc(d[0]) + "</span> — " + esc(d[1]) +
              ' · <span class="cc-detail-ttl">' + esc(d[2]) + "</span></div>";
          }).join("") + "</div>"
        : "";
      var note = cat.offNote
        ? '<div class="cc-off-note" data-off-note="' + cat.id + '"' + (on ? ' style="display:none"' : "") + ">" + esc(cat.offNote) + "</div>"
        : "";
      return (
        '<div class="cc-category">' +
          '<label class="cc-category-head">' +
            '<input type="checkbox" data-cat="' + cat.id + '"' + (on ? " checked" : "") + (cat.locked ? " disabled" : "") + ">" +
            '<span class="cc-category-title">' + esc(cat.title) + "</span>" +
          "</label>" +
          '<p class="cc-category-desc">' + esc(cat.description) + "</p>" +
          details + note +
        "</div>"
      );
    }).join("");

    modalEl = document.createElement("div");
    modalEl.className = "cc-overlay";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.innerHTML =
      '<div class="cc-backdrop" data-cc-close></div>' +
      '<div class="cc-modal">' +
        '<div class="cc-modal-head">' +
          "<div>" +
            '<div class="cc-modal-title">Настройка cookie</div>' +
            '<p class="cc-modal-sub">Выберите, какие cookie мы можем использовать. Технические обязательны — без них сайт не работает. ' +
            "Мы запомним ваш выбор на год, изменить его можно в любой момент: ссылка «Настройки cookie» есть в подвале страницы.</p>" +
          "</div>" +
          '<button type="button" class="cc-close" data-cc-close aria-label="Закрыть">&times;</button>' +
        "</div>" +
        '<div class="cc-body">' + body + "</div>" +
        '<div class="cc-actions">' +
          '<button type="button" class="cc-btn cc-btn-primary" data-cc-save>Сохранить выбор</button>' +
          '<button type="button" class="cc-btn cc-btn-ghost" data-cc-accept-all>Принять все</button>' +
          '<button type="button" class="cc-btn cc-btn-ghost" data-cc-reject>Отклонить необязательные</button>' +
        "</div>" +
        '<div class="cc-legal">Подробности — в <a href="/legal/cookie.html" target="_blank" rel="noopener">Политике в отношении обработки cookie-файлов</a>.</div>' +
      "</div>";

    document.body.appendChild(modalEl);
    document.body.style.overflow = "hidden";

    modalEl.addEventListener("change", function (e) {
      var input = e.target;
      if (!input.matches("input[data-cat]")) return;
      var note = modalEl.querySelector('[data-off-note="' + input.getAttribute("data-cat") + '"]');
      if (note) note.style.display = input.checked ? "none" : "";
    });
    modalEl.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-cc-close]")) { closeModal(); return; }
      if (t.closest("[data-cc-save]")) {
        save({
          functional: modalEl.querySelector('input[data-cat="functional"]').checked,
          analytics: modalEl.querySelector('input[data-cat="analytics"]').checked,
          marketing: modalEl.querySelector('input[data-cat="marketing"]').checked,
        });
        closeModal();
        return;
      }
      if (t.closest("[data-cc-accept-all]")) {
        save({ functional: true, analytics: true, marketing: true });
        closeModal();
        return;
      }
      if (t.closest("[data-cc-reject]")) {
        save({ functional: false, analytics: false, marketing: false });
        closeModal();
      }
    });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", onKey); }
    });
  }

  window.cfCookieSettings = openSettings;

  function showBanner() {
    if (getConsent() || bannerEl) return;
    bannerEl = document.createElement("div");
    bannerEl.className = "cc-banner";
    bannerEl.innerHTML =
      '<div class="cc-banner-title">Мы используем cookie, чтобы сделать сайт удобнее</div>' +
      '<p class="cc-banner-text">Технические cookie нужны для работы сайта, остальные — только с вашего согласия. ' +
      'Хотите выбрать сами? <button type="button" class="cc-link" data-cc-settings>Настроить cookies</button></p>' +
      '<div class="cc-banner-actions">' +
        '<button type="button" class="cc-btn cc-btn-outline" data-cc-reject>Отклонить</button>' +
        '<button type="button" class="cc-btn cc-btn-dark" data-cc-accept-all>Принять все cookie</button>' +
      "</div>" +
      '<div class="cc-banner-legal"><a href="/legal/cookie.html" target="_blank" rel="noopener">Политика в отношении обработки cookie-файлов</a></div>';
    document.body.appendChild(bannerEl);

    bannerEl.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-cc-settings]")) { openSettings(); return; }
      if (t.closest("[data-cc-accept-all]")) { save({ functional: true, analytics: true, marketing: true }); removeBanner(); return; }
      if (t.closest("[data-cc-reject]")) { save({ functional: false, analytics: false, marketing: false }); removeBanner(); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showBanner);
  } else {
    showBanner();
  }
})();
