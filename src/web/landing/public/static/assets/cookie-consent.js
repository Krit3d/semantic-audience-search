// Cookie consent для поиска Collabrama (vanilla JS, без зависимостей).
// Модель та же, что на лендинге и в CRM: cookie cf_cookie_consent (1 год) + localStorage.
(function () {
  "use strict";

  var isEnglish = document.documentElement.lang === "en";
  function t(ru, en) { return isEnglish ? en : ru; }

  var CONSENT_COOKIE = "cf_cookie_consent";
  var CONSENT_STORAGE_KEY = "cf_cookie_consent";
  var CONSENT_MAX_AGE = 60 * 60 * 24 * 365; // 1 год
  var LEGACY_ACCEPT_KEY = "cf_cookie_accepted";

  var CATEGORIES = [
    {
      id: "technical",
      title: t("Технические (обязательные)", "Technical (required)"),
      locked: true,
      description: t("Без них сайт не заработает: авторизация и безопасность. Не используются для маркетинга и отслеживания.", "Required for authentication and security. They are not used for marketing or tracking."),
      details: [
        ["cf_auth", t("признак авторизованной сессии для маршрутизации", "authenticated session routing"), t("30 дней", "30 days")],
        ["cf_cookie_consent", t("ваш выбор настроек cookie", "your cookie preferences"), t("1 год", "1 year")],
        ["creatorflow_token (localStorage)", t("токен сессии CRM и поиска", "CRM and search session token"), t("до выхода из аккаунта", "until sign-out")],
      ],
    },
    {
      id: "functional",
      title: t("Функциональные", "Functional"),
      description: t("Запоминают ваши настройки и предпочтения в интерфейсе. Хранятся только на наших серверах и в вашем браузере, не передаются третьим лицам.", "Remember your interface preferences. Stored only on our servers and in your browser, never shared with third parties."),
      details: [],
      offNote: t("Без функциональных cookie сайт не запомнит ваши настройки между визитами.", "Without functional cookies, the site will not remember your preferences between visits."),
    },
    {
      id: "analytics",
      title: t("Аналитические", "Analytics"),
      description: t("Помогают понять, какими разделами пользуются чаще, чтобы делать сервис удобнее. Сейчас аналитические cookie не используются — мы честно сообщим здесь, если подключим аналитику.", "Help us understand which sections are used most. Analytics cookies are not currently used; we will disclose it here if that changes."),
      details: [],
      offNote: t("Отказ от аналитических cookie никак не ограничивает работу сайта.", "Declining analytics cookies does not limit the site in any way."),
    },
    {
      id: "marketing",
      title: t("Рекламные", "Marketing"),
      description: t("Делают рекламу сервиса релевантнее. Сейчас рекламные cookie не используются — мы не передаём данные рекламным сетям.", "Make service advertising more relevant. Marketing cookies are not currently used, and no data is shared with advertising networks."),
      details: [],
      offNote: t("Отказ от рекламных cookie никак не ограничивает работу сайта.", "Declining marketing cookies does not limit the site in any way."),
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
            '<div class="cc-modal-title">' + t('Настройка cookie', 'Cookie settings') + '</div>' +
            '<p class="cc-modal-sub">' + t('Выберите, какие cookie мы можем использовать. Технические обязательны — без них сайт не работает. Мы запомним ваш выбор на год, изменить его можно в любой момент: ссылка «Настройки cookie» есть в подвале страницы.', 'Choose which cookies we may use. Technical cookies are required. Your choice is stored for one year and can be changed anytime through “Cookie settings” in the footer.') + '</p>' +
          "</div>" +
          '<button type="button" class="cc-close" data-cc-close aria-label="' + t('Закрыть', 'Close') + '">&times;</button>' +
        "</div>" +
        '<div class="cc-body">' + body + "</div>" +
        '<div class="cc-actions">' +
          '<button type="button" class="cc-btn cc-btn-primary" data-cc-save>' + t('Сохранить выбор', 'Save preferences') + '</button>' +
          '<button type="button" class="cc-btn cc-btn-ghost" data-cc-accept-all>' + t('Принять все', 'Accept all') + '</button>' +
          '<button type="button" class="cc-btn cc-btn-ghost" data-cc-reject>' + t('Отклонить необязательные', 'Reject optional') + '</button>' +
        "</div>" +
        '<div class="cc-legal">' + t('Подробности — в <a href="/legal/cookie.html" target="_blank" rel="noopener">Политике в отношении обработки cookie-файлов</a>.', 'Details are available in the <a href="/legal/cookie.html" target="_blank" rel="noopener">Cookie Policy</a>.') + '</div>' +
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
      '<div class="cc-banner-title">' + t('Мы используем cookie, чтобы сделать сайт удобнее', 'We use cookies to improve your experience') + '</div>' +
      '<p class="cc-banner-text">' + t('Технические cookie нужны для работы сайта, остальные — только с вашего согласия.', 'Technical cookies are required; all others are used only with your consent.') + ' ' +
      t('Хотите выбрать сами?', 'Want to choose?') + ' <button type="button" class="cc-link" data-cc-settings>' + t('Настроить cookies', 'Cookie settings') + '</button></p>' +
      '<div class="cc-banner-actions">' +
        '<button type="button" class="cc-btn cc-btn-outline" data-cc-reject>' + t('Отклонить', 'Reject') + '</button>' +
        '<button type="button" class="cc-btn cc-btn-dark" data-cc-accept-all>' + t('Принять все cookie', 'Accept all cookies') + '</button>' +
      "</div>" +
      '<div class="cc-banner-legal"><a href="/legal/cookie.html" target="_blank" rel="noopener">' + t('Политика в отношении обработки cookie-файлов', 'Cookie Policy') + '</a></div>';
    document.body.appendChild(bannerEl);

    bannerEl.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-cc-settings]")) { openSettings(); return; }
      if (t.closest("[data-cc-accept-all]")) { save({ functional: true, analytics: true, marketing: true }); removeBanner(); return; }
      if (t.closest("[data-cc-reject]")) { save({ functional: false, analytics: false, marketing: false }); removeBanner(); }
    });
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest(".cookie-settings")) openSettings();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showBanner);
  } else {
    showBanner();
  }
})();
