// Единая модель согласия на cookie для всех приложений Collabrama.
// Хранение: cookie cf_cookie_consent (JSON, 1 год, домен верхнего уровня) + зеркало в localStorage.
// Категории: technical — всегда включены (авторизация, безопасность);
// functional / analytics / marketing — только по активному согласию пользователя.

export const CONSENT_COOKIE = "cf_cookie_consent";
export const CONSENT_STORAGE_KEY = "cf_cookie_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365; // 1 год
export const CONSENT_SETTINGS_EVENT = "cf:cookie-settings";
export const CONSENT_CHANGED_EVENT = "cf:consent-changed";

const LEGACY_ACCEPT_KEY = "cf_cookie_accepted";

export const DEFAULT_CONSENT = Object.freeze({
  technical: true,
  functional: false,
  analytics: false,
  marketing: false,
});

function cookieDomain() {
  const host = window.location.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || !host.includes(".")) return "";
  const parts = host.split(".");
  return "; Domain=." + parts.slice(-2).join(".");
}

function readConsentCookie() {
  const entry = document.cookie
    .split(/;\s*/)
    .find((row) => row.startsWith(CONSENT_COOKIE + "="));
  if (!entry) return null;
  try {
    return JSON.parse(decodeURIComponent(entry.slice(CONSENT_COOKIE.length + 1)));
  } catch {
    return null;
  }
}

function readConsentStorage() {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalize(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    v: CONSENT_VERSION,
    ts: typeof payload.ts === "number" ? payload.ts : Math.floor(Date.now() / 1000),
    technical: true,
    functional: payload.functional === true,
    analytics: payload.analytics === true,
    marketing: payload.marketing === true,
  };
}

/** Текущее согласие или null, если пользователь ещё не делал выбор. */
export function getConsent() {
  const consent = normalize(readConsentCookie() || readConsentStorage());
  if (consent) return consent;
  // Миграция: старый баннер «принять всё» считаем полным согласием.
  try {
    if (window.localStorage.getItem(LEGACY_ACCEPT_KEY)) {
      return saveConsent({ functional: true, analytics: true, marketing: true });
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Сохраняет выбор пользователя (год, домен верхнего уровня) и оповещает приложение. */
export function saveConsent(partial) {
  const consent = normalize({ ...partial, ts: Math.floor(Date.now() / 1000) });
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(consent))}` +
    `; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${cookieDomain()}${secure}`;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
    window.localStorage.removeItem(LEGACY_ACCEPT_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: consent }));
  return consent;
}

export function acceptAllConsent() {
  return saveConsent({ functional: true, analytics: true, marketing: true });
}

export function rejectAllConsent() {
  return saveConsent({ functional: false, analytics: false, marketing: false });
}

/** Проверка категории — для гейта будущих скриптов аналитики/маркетинга. */
export function hasConsent(category) {
  if (category === "technical") return true;
  const consent = getConsent();
  return consent ? consent[category] === true : false;
}

/** Открыть панель настроек cookie из любого места (футер, настройки и т.д.). */
export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(CONSENT_SETTINGS_EVENT));
}
