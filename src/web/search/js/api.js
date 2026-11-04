export class SearchApiClient {
  constructor(baseUrl = "https://api.collabrama.ru") {
    this.baseUrl = (baseUrl || "https://api.collabrama.ru").replace(/\/+$/, "");
    this.controller = null;
  }

  async search(payload, signal) {
    return this._post("/api/v1/search/", payload, signal);
  }

  async getLanguages(signal) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1/search/languages`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw err;
      }
      throw new Error(`Сетевая ошибка: ${err.message}`);
    }
    if (!response.ok) {
      throw new Error(`Ошибка сервера (${response.status})`);
    }
    return response.json();
  }

  async getCountries(signal) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1/search/countries`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw err;
      }
      throw new Error(`Сетевая ошибка: ${err.message}`);
    }
    if (!response.ok) {
      throw new Error(`Ошибка сервера (${response.status})`);
    }
    return response.json();
  }

  async analyzeBrand(payload, signal) {
    return this._post("/api/v1/search/analyze-brand", payload, signal);
  }

  async searchSimilar(accountIds, signal) {
    const headers = { Accept: "application/json" };
    try {
      const token = localStorage.getItem("creatorflow_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
    }
    return this._post("/api/v1/search/similar", { account_ids: accountIds, limit: 40 }, signal, headers);
  }

  async exportToCrmShortlist(accountIds, userEmail) {
    const headers = { "Content-Type": "application/json" };
    const token = localStorage.getItem("creatorflow_token") || localStorage.getItem("cf_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return this._post("/api/v1/crm/shortlist", { account_ids: accountIds, user_email: userEmail }, null, headers, false);
  }

  async addCreatorManual(author) {
    const headers = { "Content-Type": "application/json" };
    const token = localStorage.getItem("creatorflow_token") || localStorage.getItem("cf_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return this._post("/api/v1/crm/creators/manual", {
      platform: author.platform,
      username: author.username || author.handle,
      title: author.title || author.username || author.handle,
      subscribers_count: author.subscribers_count ?? null,
    }, null, headers, false);
  }

  async _post(path, payload, signal, extraHeaders, abortPrevious = true) {
    if (abortPrevious && this.controller && !signal) {
      this.controller.abort();
    }
    const controller = signal || !abortPrevious ? null : new AbortController();
    if (controller) {
      this.controller = controller;
    }
    const effectiveSignal = signal || (controller ? controller.signal : undefined);

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
        body: JSON.stringify(payload),
        signal: effectiveSignal,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw err;
      }
      throw new Error(`Сетевая ошибка: ${err.message}`);
    }

    if (!response.ok) {
      let message = `Ошибка сервера (${response.status})`;
      try {
        const data = await response.json();
        if (data && data.detail) {
          message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
        } else if (data && data.message) {
          message = data.message;
        }
      } catch {
        message = `Ошибка сервера (${response.status})`;
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }
}
