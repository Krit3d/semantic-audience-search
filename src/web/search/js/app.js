import { SearchApiClient } from "./api.js";
import {
  renderAuthorCards,
  renderMetadataBar,
  renderSearchProgress,
  showToast,
} from "./render.js";
import { AppStore, DEFAULT_COUNTRIES } from "./store.js";

function getCrmBaseUrl() {
  const configured = window.__APP_CONFIG__?.crmUrl || window.__CRM_URL__ || "/crm/";
  const normalized = String(configured).trim().replace(/\/+$/, "");
  return normalized && normalized !== "__CRM_URL__" ? normalized : "/crm";
}

function getCrmLoginUrl() {
  return `${getCrmBaseUrl()}/#/login`;
}

function getCrmAuthParams() {
  const token = localStorage.getItem("creatorflow_token");
  if (!token) return "";
  const params = new URLSearchParams({ session_token: token });
  try {
    const user = JSON.parse(localStorage.getItem("creatorflow_user") || "{}");
    if (user && user.id != null && String(user.id) !== "") params.set("user_id", String(user.id));
    if (user && user.email) params.set("user_email", String(user.email));
  } catch {
  }
  return params.toString();
}

function getCrmEntryUrl() {
  const authParams = getCrmAuthParams();
  return `${getCrmBaseUrl()}/${authParams ? `?${authParams}` : ""}`;
}

function consumeSimilarParam() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("similar");
  if (!raw) return [];
  params.delete("similar");
  params.delete("from");
  const queryStr = params.toString();
  const cleanUrl = `${window.location.pathname}${queryStr ? `?${queryStr}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", cleanUrl);
  return raw.split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean).slice(0, 50);
}

function handleAuthGuard() {
  const params = new URLSearchParams(window.location.search);
  const sessionToken = params.get("session_token");
  if (sessionToken) {
    const userId = params.get("user_id") || "";
    const userEmail = params.get("user_email") || "";
    localStorage.setItem("creatorflow_token", sessionToken);
    localStorage.setItem("creatorflow_user", JSON.stringify({ id: String(userId), email: userEmail }));
    params.delete("session_token");
    params.delete("user_id");
    params.delete("user_email");
    const queryStr = params.toString();
    const cleanUrl = `${window.location.pathname}${queryStr ? `?${queryStr}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", cleanUrl);
    store.syncUserSession();
    return true;
  }
  if (localStorage.getItem("creatorflow_token")) {
    return true;
  }
  window.location.href = `${getCrmLoginUrl()}?redirect=${encodeURIComponent(window.location.href)}`;
  return false;
}

const store = new AppStore();
const api = new SearchApiClient();

window.addEventListener("collabrama:store_updated", () => render());
window.addEventListener("creatorflow:logout", () => {
  store.syncUserSession(true);
  render();
});
window.addEventListener("storage", (e) => {
  if (e.key === "creatorflow_user" || e.key === "creatorflow_token") {
    store.syncUserSession();
    render();
  }
});

let availableLanguages = [];
let languageAliases = {};

const app = document.querySelector(".app");
if (!app) {
  throw new Error("App root not found");
}

const pendingSimilarIds = consumeSimilarParam();
const authAllowed = handleAuthGuard();

let progressTimer = null;
let progressStep = 0;

const TEXTAREA_MIN_HEIGHT = 80;
const TEXTAREA_MAX_HEIGHT = 240;

const QUICK_LANG_CODES = ["RU", "KK", "EN", "UZ", "UK", "KY", "TR"];
const QUICK_COUNTRY_CODES = ["KZ", "RU", "BY", "UZ", "KG", "TJ", "AE", "US"];

function languageName(code) {
  const normalized = String(code || "").trim().toLowerCase();
  const canonical = languageAliases[normalized] || normalized;
  const found = availableLanguages.find((l) => String(l.code || "").trim().toLowerCase() === canonical);
  return found && found.name_ru ? found.name_ru : canonical.toUpperCase();
}

function languageButtonLabel() {
  const selected = store.selectedLanguages;
  if (selected.length === 0) return "Все языки ▾";
  if (selected.length === 1) return `${languageName(selected[0])} ▾`;
  const codes = selected.map((c) => c.toUpperCase()).join(", ");
  return `Языки (${selected.length}): ${codes} ▾`;
}

function buildLanguageItems() {
  return availableLanguages.map((lang) => {
    const code = String(lang.code || "").trim().toLowerCase();
    const name = lang.name_ru || lang.name_en || code.toUpperCase();
    const checked = store.selectedLanguages.includes(code) ? " checked" : "";
    return `<label class="lang-item">
      <input type="checkbox" class="lang-checkbox" data-lang-code="${escapeText(code)}"${checked}>
      <span class="lang-name">${escapeText(name)}</span>
      <span class="lang-code">${escapeText(code.toUpperCase())}</span>
    </label>`;
  }).join("");
}

function buildQuickChips() {
  const allOn = store.selectedLanguages.length === 0 ? " on" : "";
  const chips = [`<button type="button" class="lang-chip${allOn}" data-lang-chip="all">Все</button>`];
  for (const code of QUICK_LANG_CODES) {
    const lower = code.toLowerCase();
    const on = store.selectedLanguages.includes(lower) ? " on" : "";
    chips.push(`<button type="button" class="lang-chip${on}" data-lang-chip="${lower}">${code}</button>`);
  }
  return chips.join("");
}

function updateLanguageUI() {
  const main = app.querySelector(".main");
  if (!main) return;
  const toggle = main.querySelector("[data-lang-toggle]");
  if (toggle) toggle.textContent = languageButtonLabel();
  const chips = main.querySelectorAll("[data-lang-chip]");
  chips.forEach((chip) => {
    const code = chip.dataset.langChip;
    const on = code === "all" ? store.selectedLanguages.length === 0 : store.selectedLanguages.includes(code);
    chip.classList.toggle("on", on);
  });
  const checkboxes = main.querySelectorAll(".lang-checkbox");
  checkboxes.forEach((cb) => {
    cb.checked = store.selectedLanguages.includes(cb.dataset.langCode);
  });
}

function refreshLanguageDropdown() {
  const main = app.querySelector(".main");
  if (!main) return;
  const list = main.querySelector("[data-lang-list]");
  if (list) list.innerHTML = buildLanguageItems();
  updateLanguageUI();
}

function countryName(code) {
  const normalized = String(code || "").trim().toUpperCase();
  return store.countries[normalized] || DEFAULT_COUNTRIES[normalized] || normalized;
}

function countryButtonLabel() {
  const selected = store.selectedCountries;
  if (selected.length === 0) return "Все страны ▾";
  if (selected.length === 1) return `${countryName(selected[0])} ▾`;
  const codes = selected.map((c) => c.toUpperCase()).join(", ");
  return `Страны (${selected.length}): ${codes} ▾`;
}

function buildCountryItems() {
  const entries = Object.entries(store.countries);
  entries.sort((a, b) => a[1].localeCompare(b[1], "ru"));
  return entries.map(([code, name]) => {
    const checked = store.selectedCountries.includes(code) ? " checked" : "";
    return `<label class="country-item">
      <input type="checkbox" class="country-checkbox" data-country-code="${escapeText(code)}"${checked}>
      <span class="country-name">${escapeText(name)}</span>
      <span class="country-code">${escapeText(code)}</span>
    </label>`;
  }).join("");
}

function buildQuickCountryChips() {
  const allOn = store.selectedCountries.length === 0 ? " on" : "";
  const chips = [`<button type="button" class="country-chip${allOn}" data-country-chip="all">Все</button>`];
  for (const code of QUICK_COUNTRY_CODES) {
    const on = store.selectedCountries.includes(code) ? " on" : "";
    chips.push(`<button type="button" class="country-chip${on}" data-country-chip="${escapeText(code)}">${escapeText(code)}</button>`);
  }
  return chips.join("");
}

function updateCountryUI() {
  const main = app.querySelector(".main");
  if (!main) return;
  const toggle = main.querySelector("[data-country-toggle]");
  if (toggle) toggle.textContent = countryButtonLabel();
  const chips = main.querySelectorAll("[data-country-chip]");
  chips.forEach((chip) => {
    const code = chip.dataset.countryChip;
    const on = code === "all" ? store.selectedCountries.length === 0 : store.selectedCountries.includes(code);
    chip.classList.toggle("on", on);
  });
  const checkboxes = main.querySelectorAll(".country-checkbox");
  checkboxes.forEach((cb) => {
    cb.checked = store.selectedCountries.includes(cb.dataset.countryCode);
  });
}

function refreshCountryDropdown() {
  const main = app.querySelector(".main");
  if (!main) return;
  const list = main.querySelector("[data-country-list]");
  if (list) list.innerHTML = buildCountryItems();
  updateCountryUI();
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  const next = Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT);
  el.style.height = `${next}px`;
  el.style.overflowY = next >= TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
}

function buildHeader() {
  const header = document.createElement("header");
  header.className = "header";
  header.innerHTML = `
    <div class="header-inner">
      <button class="brand-btn" data-action="go-search">
        <span class="brand-name">Collabrama</span>
      </button>
      <div class="header-actions">
        <button class="header-icon-btn" data-action="go-search" title="Поиск авторов" aria-label="Поиск авторов">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
        </button>
        <a class="header-crm-link" href="${escapeText(getCrmEntryUrl())}" title="Перейти в CreatorFlow" aria-label="Перейти в CreatorFlow">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
        </a>
      </div>
    </div>`;
  return header;
}

function renderDock() {
  let dock = app.querySelector("[data-dock]");
  const count = store.shortlist.length;
  if (count === 0) {
    if (dock) dock.remove();
    return;
  }
  if (!dock) {
    dock = document.createElement("div");
    dock.className = "short-dock";
    dock.setAttribute("data-dock", "");
    app.appendChild(dock);
  }
  dock.innerHTML = `
    <button type="button" class="short-dock-btn" data-action="export-shortlist" title="Перейти в шорт-лист в CreatorFlow">
      <span class="short-dock-icon">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#6366f1" stroke="#6366f1" stroke-width="1.6" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
      </span>
      <span class="short-dock-label">Шорт-лист</span>
      <span class="short-dock-count">${count}</span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"></path></svg>
    </button>`;
}

function buildFilterBar() {
  return `
    <div class="search-filters">
      <div class="filter-row filter-row-top">
        <div class="country-dropdown">
          <button type="button" class="country-dropdown-btn" data-country-toggle>${escapeText(countryButtonLabel())}</button>
          <div class="country-dropdown-menu" data-country-menu style="display:none">
            <div class="country-search-box">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8c93a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
              <input type="text" class="country-search-input" data-country-search placeholder="Поиск страны...">
            </div>
            <div class="country-quick-chips" data-country-chips>${buildQuickCountryChips()}</div>
            <div class="country-list" data-country-list>${buildCountryItems()}</div>
          </div>
        </div>
        <div class="lang-dropdown">
          <button type="button" class="lang-dropdown-btn" data-lang-toggle>${escapeText(languageButtonLabel())}</button>
          <div class="lang-dropdown-menu" data-lang-menu style="display:none">
            <div class="lang-search-box">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8c93a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
              <input type="text" class="lang-search-input" data-lang-search placeholder="Поиск языка...">
            </div>
            <div class="lang-quick-chips" data-lang-chips>${buildQuickChips()}</div>
            <div class="lang-list" data-lang-list>${buildLanguageItems()}</div>
          </div>
        </div>
        <div class="subscribers-group">
          <span class="subscribers-label">Подписчики:</span>
          <input type="number" class="range-input" data-filter="min-followers" placeholder="от" min="0">
          <span class="range-divider">—</span>
          <input type="number" class="range-input" data-filter="max-followers" placeholder="до" min="0">
        </div>
        <div class="subscribers-group">
          <span class="subscribers-label">ERR от</span>
          <input type="number" class="range-input range-input-err" data-filter="min-err" placeholder="0" min="0" max="100" step="0.5">
          <span class="range-divider">%</span>
        </div>
        <select class="select-pill" data-tone-select>
          <option value="all" selected>Все стили</option>
          <option value="expert">Экспертный</option>
          <option value="educational">Обучающий</option>
          <option value="entertainment">Развлекательный</option>
          <option value="provocative">Провокационный</option>
          <option value="casual">Повседневный</option>
          <option value="analytical">Аналитический</option>
        </select>
        <select class="select-pill" data-gender-select>
          <option value="both">Оба гендера</option>
          <option value="male">Мужской</option>
          <option value="female">Женский</option>
        </select>
        <input type="text" class="stop-topics-input" data-filter="stop-topics" placeholder="Исключить темы...">
      </div>
      <div class="filter-row filter-row-bottom">
        <div class="search-controls">
          <button class="btn-secondary-ai" data-action="reset-audience">↺ Сбросить к бренду</button>
          <button class="btn-primary" data-action="run-search">🔍 Найти авторов</button>
        </div>
      </div>
    </div>`;
}

function buildSearchTab() {
  const container = document.createElement("div");
  const isStepOne = store.currentStep === 1;
  const brandValue = store.brandDescription || store.searchQuery;
  const audienceValue = store.targetAudienceDescription || store.searchQuery;
  const analyzeLabel = store.isAnalyzingBrand ? "Анализ ЦА..." : "Определить ЦА";

  const cardInner = isStepOne
    ? `
      <div class="search-top">
        <div class="search-label">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#6366f1" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 13.8 9 20 10.8 13.8 12.6 12 19 10.2 12.6 4 10.8 10.2 9z"></path></svg>
          <span class="search-label-text">AI-подбор авторов</span>
        </div>
      </div>
      <textarea class="search-textarea" data-search-input placeholder="Например: натуральная косметика для чувствительной кожи, продаёмся на Wildberries. Нужны авторы, которые реально говорят про уход и составы.">${escapeText(brandValue)}</textarea>
      <div class="step-one-actions">
        <button class="btn-cta" data-action="analyze-brand"${store.isAnalyzingBrand ? " disabled" : ""}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"></path></svg>
          <span>${analyzeLabel}</span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"></path></svg>
        </button>
      </div>`
    : `
      <div class="search-top">
        <div class="search-label">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#6366f1" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 13.8 9 20 10.8 13.8 12.6 12 19 10.2 12.6 4 10.8 10.2 9z"></path></svg>
          <span class="search-label-text">AI-подбор авторов</span>
        </div>
      </div>
      <div class="audience-confirm-card">
        <div class="audience-confirm-head">
          <span class="audience-confirm-badge">🎯</span>
          <span class="audience-confirm-title">Корректно ли определена ваша целевая аудитория?</span>
        </div>
        <textarea class="search-textarea audience-textarea" data-audience-input>${escapeText(audienceValue)}</textarea>
        <div class="brand-summary-badge">
          <span class="brand-summary-label">Исходный бренд:</span>
          <span class="brand-summary-text">${escapeText(store.brandDescription)}</span>
        </div>
      </div>
      ${buildFilterBar()}`;

  container.innerHTML = `
    <div class="search-card">
      ${cardInner}
    </div>
    <div data-progress></div>
    <div data-metadata></div>
    <div class="results" data-results></div>`;
  return container;
}

function bindFilterBar(tab) {
  const countryToggle = tab.querySelector("[data-country-toggle]");
  const countryMenu = tab.querySelector("[data-country-menu]");
  if (countryToggle && countryMenu) {
    countryToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      countryMenu.style.display = countryMenu.style.display === "block" ? "none" : "block";
    });
  }
  const countrySearch = tab.querySelector("[data-country-search]");
  if (countrySearch) {
    countrySearch.addEventListener("input", () => {
      const query = countrySearch.value.trim().toLowerCase();
      const items = tab.querySelectorAll(".country-item");
      items.forEach((item) => {
        const name = (item.querySelector(".country-name")?.textContent || "").toLowerCase();
        const code = (item.querySelector(".country-code")?.textContent || "").toLowerCase();
        const match = !query || name.includes(query) || code.includes(query);
        item.style.display = match ? "flex" : "none";
      });
    });
  }
  const countryChips = tab.querySelectorAll("[data-country-chip]");
  countryChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const code = chip.dataset.countryChip;
      if (code === "all") {
        store.setCountries([]);
      } else {
        store.toggleCountry(code);
      }
      updateCountryUI();
    });
  });
  const countryList = tab.querySelector("[data-country-list]");
  if (countryList) {
    countryList.addEventListener("change", (e) => {
      const checkbox = e.target.closest(".country-checkbox");
      if (!checkbox) return;
      store.toggleCountry(checkbox.dataset.countryCode);
      updateCountryUI();
    });
  }
  const langToggle = tab.querySelector("[data-lang-toggle]");
  const langMenu = tab.querySelector("[data-lang-menu]");
  if (langToggle && langMenu) {
    langToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      langMenu.style.display = langMenu.style.display === "block" ? "none" : "block";
    });
  }
  const langSearch = tab.querySelector("[data-lang-search]");
  if (langSearch) {
    langSearch.addEventListener("input", () => {
      const query = langSearch.value.trim().toLowerCase();
      const items = tab.querySelectorAll(".lang-item");
      items.forEach((item) => {
        const name = (item.querySelector(".lang-name")?.textContent || "").toLowerCase();
        const code = (item.querySelector(".lang-code")?.textContent || "").toLowerCase();
        const match = !query || name.includes(query) || code.includes(query);
        item.style.display = match ? "flex" : "none";
      });
    });
  }
  const langChips = tab.querySelectorAll("[data-lang-chip]");
  langChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const code = chip.dataset.langChip;
      if (code === "all") {
        store.setLanguages([]);
      } else {
        store.toggleLanguage(code);
      }
      updateLanguageUI();
    });
  });
  const langList = tab.querySelector("[data-lang-list]");
  if (langList) {
    langList.addEventListener("change", (e) => {
      const checkbox = e.target.closest(".lang-checkbox");
      if (!checkbox) return;
      store.toggleLanguage(checkbox.dataset.langCode);
      updateLanguageUI();
    });
  }
  const minFollowers = tab.querySelector("[data-filter='min-followers']");
  if (minFollowers) {
    minFollowers.value = store.minFollowers ?? "";
    minFollowers.addEventListener("input", () => {
      store.minFollowers = minFollowers.value === "" ? null : Number(minFollowers.value);
    });
  }
  const maxFollowers = tab.querySelector("[data-filter='max-followers']");
  if (maxFollowers) {
    maxFollowers.value = store.maxFollowers ?? "";
    maxFollowers.addEventListener("input", () => {
      store.maxFollowers = maxFollowers.value === "" ? null : Number(maxFollowers.value);
    });
  }
  const minErrInput = tab.querySelector("[data-filter='min-err']");
  if (minErrInput) {
    minErrInput.value = store.minErr ?? "";
    minErrInput.addEventListener("input", () => {
      store.minErr = minErrInput.value === "" ? null : Number(minErrInput.value);
    });
  }
  const toneSelect = tab.querySelector("[data-tone-select]");
  if (toneSelect) {
    toneSelect.value = store.selectedTone || "all";
    toneSelect.addEventListener("change", () => {
      store.selectedTone = toneSelect.value;
    });
  }
  const genderSelect = tab.querySelector("[data-gender-select]");
  if (genderSelect) {
    genderSelect.value = store.selectedGender || "both";
    genderSelect.addEventListener("change", () => {
      store.setGender(genderSelect.value);
    });
  }
  const stopTopicsInput = tab.querySelector("[data-filter='stop-topics']");
  if (stopTopicsInput) {
    stopTopicsInput.value = store.stopTopicsInput || "";
    stopTopicsInput.addEventListener("input", () => {
      store.stopTopicsInput = stopTopicsInput.value;
    });
  }
}

function render() {
  const main = app.querySelector(".main");
  if (!main) return;

  const header = app.querySelector(".header");
  if (header) header.remove();
  app.prepend(buildHeader());

  main.innerHTML = "";
  renderDock();

  const tab = buildSearchTab();
  main.appendChild(tab);
  const brandInput = tab.querySelector("[data-search-input]");
  if (brandInput) {
    brandInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        analyzeBrandAction();
      }
    });
    brandInput.addEventListener("input", () => {
      store.brandDescription = brandInput.value;
      if (store.precomputedPlan && brandInput.value.trim() !== store.searchQuery.trim()) {
        store.precomputedPlan = null;
      }
      autoResizeTextarea(brandInput);
    });
    autoResizeTextarea(brandInput);
  }
  const audienceInput = tab.querySelector("[data-audience-input]");
  if (audienceInput) {
    audienceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runSearch();
      }
    });
    audienceInput.addEventListener("input", () => {
      store.targetAudienceDescription = audienceInput.value;
      autoResizeTextarea(audienceInput);
    });
    autoResizeTextarea(audienceInput);
  }
  bindFilterBar(tab);
  renderResults();
}

function renderResults() {
  const main = app.querySelector(".main");
  if (!main) return;
  const resultsEl = main.querySelector("[data-results]");
  const metadataEl = main.querySelector("[data-metadata]");
  if (!resultsEl) return;

  resultsEl.innerHTML = "";

  renderMetadataBar(store.queryMetadata, metadataEl);

  let filtered = store.searchResults.slice();
  if (store.platformFilter !== "all") {
    filtered = filtered.filter((a) => (a.platform || "").toLowerCase() === store.platformFilter);
  }
  if (store.matchTypeFilter !== "all") {
    filtered = filtered.filter((a) => a.match_type === store.matchTypeFilter);
  }
  if (store.reachFilter !== "all") {
    filtered = filtered.filter((a) => {
      const subs = a.subscribers_count || 0;
      switch (store.reachFilter) {
        case "1k-10k":
          return subs >= 1000 && subs < 10000;
        case "10k-50k":
          return subs >= 10000 && subs < 50000;
        case "50k-100k":
          return subs >= 50000 && subs < 100000;
        case "100k+":
          return subs >= 100000;
        default:
          return true;
      }
    });
  }
  if (store.sortFilter === "subscribers") {
    filtered.sort((a, b) => (b.subscribers_count || 0) - (a.subscribers_count || 0));
  } else if (store.sortFilter === "er") {
    filtered.sort((a, b) => (b.static_avg_er || 0) - (a.static_avg_er || 0));
  } else {
    filtered.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
  }

  if (store.searchResults.length === 0) {
    const emptyState = {
      1: {
        title: "AI-подбор авторов",
        text: "Опишите ваш бренд в поле выше и нажмите «Определить ЦА»",
      },
      2: {
        title: "Целевая аудитория определена",
        text: "Проверьте формулировку ЦА и параметры, затем нажмите «Найти авторов»",
      },
      3: {
        title: "Авторы не найдены",
        text: "Попробуйте расширить фильтры по подписчикам, языкам или изменить описание",
      },
    };
    const state = emptyState[store.currentStep] || emptyState[1];
    resultsEl.innerHTML = `<div class="empty-state">
      <div class="empty-title">${state.title}</div>
      <div class="empty-text">${state.text}</div>
    </div>`;
    return;
  }

  const filters = document.createElement("div");
  filters.className = "filters";
  filters.innerHTML = `
    <div class="filter-controls-row">
      <svg class="filter-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#b3b8c8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18"></path><path d="M6 12h12"></path><path d="M10 19h4"></path></svg>
      <select class="filter-select" data-filter="platform">
        <option value="all">Все платформы</option>
        <option value="instagram">Instagram</option>
        <option value="telegram">Telegram</option>
      </select>
      <select class="filter-select" data-filter="reach">
        <option value="all">Любой охват</option>
        <option value="1k-10k">1K – 10K</option>
        <option value="10k-50k">10K – 50K</option>
        <option value="50k-100k">50K – 100K</option>
        <option value="100k+">100K+</option>
      </select>
    </div>
    <div class="sort-controls-row">
      <svg class="sort-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 4v16m-6-6 6 6 6-6"></path>
      </svg>
      <select class="filter-select" data-filter="sort">
        <option value="relevance">По релевантности</option>
        <option value="subscribers">По подписчикам</option>
        <option value="er">По вовлечённости (ER)</option>
      </select>
    </div>`;
  resultsEl.appendChild(filters);

  const platformSel = filters.querySelector("[data-filter='platform']");
  platformSel.value = store.platformFilter;
  platformSel.addEventListener("change", () => {
    store.platformFilter = platformSel.value;
    renderResults();
  });
  const sortSel = filters.querySelector("[data-filter='sort']");
  sortSel.value = store.sortFilter;
  sortSel.addEventListener("change", () => {
    store.sortFilter = sortSel.value;
    renderResults();
  });
  const reachSel = filters.querySelector("[data-filter='reach']");
  reachSel.value = store.reachFilter;
  reachSel.addEventListener("change", () => {
    store.reachFilter = reachSel.value;
    renderResults();
  });

  if (store.searchMode !== "similar") {
    const pills = document.createElement("div");
    pills.className = "match-type-pills";
    const totalCount = store.searchResults.length;
    const directCount = store.searchResults.filter((a) => a.match_type === "direct").length;
    const affinityCount = store.searchResults.filter((a) => a.match_type === "affinity").length;
    const pillOptions = [
      { value: "all", label: `🔀 Все авторы (${totalCount})` },
      { value: "affinity", label: `💡 Целевая аудитория (${affinityCount})` },
      { value: "direct", label: `🎯 Прямой поиск (${directCount})` },
    ];
    pills.innerHTML = pillOptions.map((opt) => `
      <button class="match-type-pill${store.matchTypeFilter === opt.value ? " on" : ""}" data-action="match-type" data-match-type="${opt.value}">
        <span>${opt.label}</span>
      </button>`).join("");
    resultsEl.appendChild(pills);
  }

  const grid = document.createElement("div");
  grid.dataset.grid = "";
  resultsEl.appendChild(grid);
  renderAuthorCards(filtered, grid, store);
}

const ESC_AMP = String.fromCharCode(38);
const ESC_LT = String.fromCharCode(60);
const ESC_GT = String.fromCharCode(62);
const ESC_QUOT = String.fromCharCode(34);
const ESC_APOS = String.fromCharCode(39);

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, ESC_AMP + "amp;")
    .replace(/</g, ESC_LT + "lt;")
    .replace(/>/g, ESC_GT + "gt;")
    .replace(/"/g, ESC_QUOT + "quot;")
    .replace(/'/g, ESC_APOS + "#39;");
}

function startProgress() {
  stopProgress();
  progressStep = 0;
  const main = app.querySelector(".main");
  const progressEl = main ? main.querySelector("[data-progress]") : null;
  if (progressEl) renderSearchProgress(0, progressEl);
  progressTimer = setInterval(() => {
    progressStep = (progressStep + 1) % 4;
    const el = app.querySelector("[data-progress]");
    if (el) renderSearchProgress(progressStep, el);
  }, 900);
}

function stopProgress() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function clearProgress() {
  stopProgress();
  const progressEl = app.querySelector("[data-progress]");
  if (progressEl) progressEl.innerHTML = "";
}

async function runSearch() {
  const main = app.querySelector(".main");
  const audienceInput = main ? main.querySelector("[data-audience-input]") : null;
  const brandInput = main ? main.querySelector("[data-search-input]") : null;
  const query = audienceInput
    ? audienceInput.value.trim()
    : (brandInput ? brandInput.value.trim() : store.searchQuery.trim());
  if (!query) {
    showToast("Введите описание задачи", "error");
    return;
  }
  store.targetAudienceDescription = query;
  store.searchQuery = query;
  startProgress();

  try {
    const data = await api.search(store.buildSearchRequest(query));
    store.searchResults = data.items || [];
    store.queryMetadata = data.query_metadata || null;
    store.searchMode = "direct";
    if (data.inferred_filters) {
      store.applyInferredFilters(data.inferred_filters);
      syncInferredFilters();
    }
    clearProgress();
    store.currentStep = 3;
    renderResults();
    if (store.searchResults.length === 0) {
      showToast("Ничего не найдено, попробуйте изменить запрос", "error");
    } else {
      showToast(`Найдено авторов: ${store.searchResults.length}`);
    }
  } catch (err) {
    clearProgress();
    if (err.name === "AbortError") {
      return;
    }
    showToast(err.message || "Ошибка поиска", "error");
  }
}

async function runSimilarSearch(ids) {
  const cleaned = Array.from(new Set(ids.map((s) => String(s).trim().replace(/^@/, "")).filter(Boolean))).slice(0, 50);
  if (cleaned.length === 0) return;
  startProgress();
  try {
    const data = await api.searchSimilar(cleaned);
    store.searchResults = data.items || [];
    store.queryMetadata = data.query_metadata || null;
    store.searchMode = "similar";
    store.matchTypeFilter = "all";
    store.currentStep = 3;
    store.isAudienceConfirmed = true;
    if (!store.targetAudienceDescription) {
      store.targetAudienceDescription = "Похожие на " + cleaned.slice(0, 5).map((id) => `@${id}`).join(", ");
    }
    clearProgress();
    render();
    if (store.searchResults.length === 0) {
      showToast("Похожие авторы не найдены, попробуйте других", "error");
    } else {
      showToast(`Найдено похожих авторов: ${store.searchResults.length}`);
    }
  } catch (err) {
    clearProgress();
    if (err.name === "AbortError") {
      return;
    }
    showToast(err.message || "Ошибка поиска похожих авторов", "error");
  }
}

function syncInferredFilters() {
  const main = app.querySelector(".main");
  if (!main) return;
  const countryToggle = main.querySelector("[data-country-toggle]");
  if (countryToggle) {
    updateCountryUI();
    flashInferred(countryToggle);
  }
  const langToggle = main.querySelector("[data-lang-toggle]");
  if (langToggle) {
    updateLanguageUI();
    flashInferred(langToggle);
  }
  const minFollowers = main.querySelector("[data-filter='min-followers']");
  if (minFollowers) {
    minFollowers.value = store.minFollowers ?? "";
    flashInferred(minFollowers);
  }
  const maxFollowers = main.querySelector("[data-filter='max-followers']");
  if (maxFollowers) {
    maxFollowers.value = store.maxFollowers ?? "";
    flashInferred(maxFollowers);
  }
  const minErrInput = main.querySelector("[data-filter='min-err']");
  if (minErrInput) {
    minErrInput.value = store.minErr ?? "";
  }
  const toneSelect = main.querySelector("[data-tone-select]");
  if (toneSelect) {
    toneSelect.value = store.selectedTone || "all";
    flashInferred(toneSelect);
  }
  const genderSelect = main.querySelector("[data-gender-select]");
  if (genderSelect) {
    genderSelect.value = store.selectedGender || "both";
    flashInferred(genderSelect);
  }
  const stopTopicsInput = main.querySelector("[data-filter='stop-topics']");
  if (stopTopicsInput) {
    stopTopicsInput.value = store.stopTopicsInput || "";
    flashInferred(stopTopicsInput);
  }
}

function flashInferred(el) {
  el.classList.remove("ai-inferred");
  void el.offsetWidth;
  el.classList.add("ai-inferred");
  setTimeout(() => el.classList.remove("ai-inferred"), 2000);
}

function findAuthor(id) {
  const strId = String(id || "").toLowerCase().replace(/^@/, "");
  return store.searchResults.find((a) =>
    String(a.account_id || "") === strId ||
    String(a.id || "") === strId ||
    String(a.username || "").toLowerCase().replace(/^@/, "") === strId
  ) || null;
}

async function exportToCrm(accountIds) {
  const ids = Array.isArray(accountIds) ? accountIds.map((id) => String(id)).filter(Boolean) : [];
  if (ids.length === 0) {
    showToast("Нет авторов для экспорта", "error");
    return;
  }
  const authParams = getCrmAuthParams();
  const targetUrl = `${getCrmBaseUrl()}/${authParams ? `?${authParams}` : ""}#/authors?import_ids=${ids.join(",")}`;
  window.open(targetUrl, "_blank");
  showToast("Авторы экспортированы в CRM");
}

async function analyzeBrandAction() {
  const main = app.querySelector(".main");
  const input = main ? main.querySelector("[data-search-input]") : null;
  const text = input ? input.value.trim() : "";
  if (!text) {
    showToast("Опишите бренд для анализа", "error");
    return;
  }
  store.brandDescription = text;
  store.searchResults = [];
  store.queryMetadata = null;
  store.searchMode = "direct";
  store.isAnalyzingBrand = true;
  render();
  try {
    const data = await api.analyzeBrand({
      brand_description: text,
      stop_topics: store.stopTopicsInput ? store.stopTopicsInput.split(",").map((s) => s.trim()).filter(Boolean) : [],
    });
    store.applyBrandAnalysis(data);
    store.isAnalyzingBrand = false;
    store.currentStep = 2;
    render();
    syncInferredFilters();
    showToast("Целевая аудитория определена");
  } catch (err) {
    store.isAnalyzingBrand = false;
    render();
    if (err.name === "AbortError") {
      return;
    }
    showToast(err.message || "Ошибка анализа ЦА", "error");
  }
}

function resetAudience() {
  store.resetAudienceState();
  store.clearSession();
  store.persistSession();
  render();
  refreshLanguageDropdown();
  refreshCountryDropdown();
}

app.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "go-search") {
    render();
  } else if (action === "run-search") {
    runSearch();
  } else if (action === "analyze-brand") {
    analyzeBrandAction();
  } else if (action === "reset-audience") {
    resetAudience();
  } else if (action === "match-type") {
    store.matchTypeFilter = target.dataset.matchType || "all";
    renderResults();
  } else if (action === "toggle-shortlist") {
    e.preventDefault();
    e.stopPropagation();
    const author = findAuthor(target.dataset.authorId);
    if (!author) return;
    const adding = !store.isInShortlist(author.account_id ?? author.id ?? author.author_id ?? author.username);
    store.toggleShortlist(author);
    target.classList.toggle("in", adding);
    const label = target.querySelector("[data-short-text]") || target.querySelector("span:last-child");
    if (label) {
      label.textContent = adding ? "В шортлисте" : "В шортлист";
    }
    renderDock();
    showToast(adding ? "Добавлено в шортлист" : "Убрано из шортлиста");
  } else if (action === "export-shortlist") {
    const ids = store.shortlist
      .map((a) => (a.username || a.handle || a.account_id || a.id || a.platform_id))
      .filter((id) => id != null && String(id).trim() !== "")
      .map((id) => String(id).trim().replace(/^@/, ""));
    exportToCrm(Array.from(new Set(ids)));
  } else if (action === "toggle-explanation") {
    const card = target.closest(".author-card");
    if (!card) return;
    const textEl = card.querySelector("[data-explanation]");
    const labelEl = card.querySelector("[data-explanation-label]");
    if (!textEl || !labelEl) return;
    const collapsed = textEl.classList.contains("explanation-clamped");
    if (collapsed) {
      textEl.classList.remove("explanation-clamped");
      labelEl.textContent = "свернуть";
    } else {
      textEl.classList.add("explanation-clamped");
      labelEl.textContent = "подробнее";
    }
  }
});

document.addEventListener("click", (e) => {
  const langDropdown = e.target.closest(".lang-dropdown");
  const langMenus = document.querySelectorAll(".lang-dropdown-menu");
  langMenus.forEach((menu) => {
    if (!langDropdown || !langDropdown.contains(menu)) {
      menu.style.display = "none";
    }
  });
  const countryDropdown = e.target.closest(".country-dropdown");
  const countryMenus = document.querySelectorAll(".country-dropdown-menu");
  countryMenus.forEach((menu) => {
    if (!countryDropdown || !countryDropdown.contains(menu)) {
      menu.style.display = "none";
    }
  });
});

async function loadDictionaries() {
  const [languagesResult, countriesResult] = await Promise.allSettled([api.getLanguages(), api.getCountries()]);
  if (languagesResult.status === "fulfilled") {
    const data = languagesResult.value;
    availableLanguages = Array.isArray(data.languages) ? data.languages : [];
    languageAliases = data.aliases && typeof data.aliases === "object" ? data.aliases : {};
    refreshLanguageDropdown();
  }
  if (countriesResult.status === "fulfilled") {
    store.initCountries(countriesResult.value);
    refreshCountryDropdown();
  }
}

if (authAllowed) {
  loadDictionaries();
  render();
  if (pendingSimilarIds.length > 0) {
    runSimilarSearch(pendingSimilarIds);
  }
}
