export function getCrmUrl() {
  const configured = window.__CRM_URL__;
  if (typeof configured === "string" && configured.trim() && !configured.includes("__CRM_URL__")) {
    return configured.trim().replace(/\/+$/, "");
  }
  return "/crm";
}

export function getCrmLoginUrl() {
  return `${getCrmUrl()}/#/login`;
}

export function isAuthenticated() {
  return document.cookie.split(/;\s*/).some((entry) => entry === "cf_auth=1");
}
