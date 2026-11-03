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

export function getCrmTrialUrl() {
  return `${getCrmUrl()}/?intent=trial#/login`;
}

export async function verifyAuthentication() {
  const token = window.localStorage.getItem("creatorflow_token");
  if (!token) return false;
  try {
    const response = await fetch("/api/v1/crm/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
