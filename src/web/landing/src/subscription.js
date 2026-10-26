import { getCrmUrl, isAuthenticated } from "./auth.js";

export function getCrmPricingUrl() {
  return `${getCrmUrl()}/#/pricing`;
}

const PLAN_TITLES = {
  trial: "Триал",
  basic: "Базовый",
  pro: "Pro",
  enterprise: "Enterprise",
};

export function planTitle(name) {
  return PLAN_TITLES[name] || name;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/**
 * Загружает статус подписки для залогиненного пользователя.
 * Токен лежит в localStorage этого же origin (его сохраняет поиск/CRM-редирект).
 * Возвращает { title, expiresLabel } или null (аноним, нет токена, подписка не активна).
 */
export async function fetchActiveSubscription() {
  if (!isAuthenticated()) return null;
  const token = window.localStorage.getItem("creatorflow_token");
  if (!token) return null;
  try {
    const res = await fetch("/api/v1/billing/subscription", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const sub = await res.json();
    if (!sub || !sub.is_active) return null;
    const title = sub.plan ? planTitle(sub.plan.name) : "Активна";
    return { title, expiresLabel: fmtDate(sub.expires_at), raw: sub };
  } catch {
    return null;
  }
}
