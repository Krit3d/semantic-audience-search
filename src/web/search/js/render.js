const STAGES = [
  "Анализируем продукт",
  "Подбираем платформы",
  "Ищем релевантных авторов",
  "Собираем shortlist",
];

const AVATAR_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
];

const AMP = String.fromCharCode(38);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const QUOT = String.fromCharCode(34);
const APOS = String.fromCharCode(39);
const CLAMP_CLASS = "explanation-clamped";

const TONE_LABELS = { expert: "Экспертный", educational: "Обучающий", entertainment: "Развлекательный", provocative: "Провокационный", casual: "Повседневный", analytical: "Аналитический" };
const HORMONE_LABELS = { dopamine: "Дофамин", serotonin: "Серотонин", oxytocin: "Окситоцин", adrenaline: "Адреналин", cortisol: "Кортизол", endorphin: "Эндорфин" };
const GENDER_LABELS = { male: "Мужской", female: "Женский", duo: "Дуэт"};
const TONE_DESCRIPTIONS = {
  expert: "Экспертный: глубокий профессиональный анализ и авторитет",
  educational: "Обучающий: пошаговые инструкции, лайфхаки и советы",
  entertainment: "Развлекательный: шоу, эмоции и вирусный контент",
  provocative: "Провокационный: острые дискуссии, мнения и споры",
  casual: "Повседневный: лайфстайл, личные истории и искренность",
  analytical: "Аналитический: факты, цифры, сравнения и логика",
};
const HORMONE_DESCRIPTIONS = {
  dopamine: "Дофамин: новизна, вдохновение, тренды и вау-эффект",
  serotonin: "Серотонин: статус, уверенность, экспертность и контроль",
  oxytocin: "Окситоцин: забота, дети, семья, безопасность и доверие",
  adrenaline: "Адреналин: вызов, смелость, скорость и спорт",
  cortisol: "Кортизол: решение проблем, страхи, боли и защита",
  endorphin: "Эндорфин: радость, смех, легкость и хорошее настроение",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, AMP + "amp;")
    .replace(/</g, AMP + "lt;")
    .replace(/>/g, AMP + "gt;")
    .replace(/"/g, QUOT + "quot;")
    .replace(/'/g, APOS + "#39;");
}

function initials(name) {
  const cleaned = String(name || "")
    .replace(/[.,/()\[\]{}"'-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return "?";
  if (cleaned.length === 1) return cleaned[0].slice(0, 2).toLocaleUpperCase("ru-RU");
  return (cleaned[0][0] + cleaned[1][0]).toLocaleUpperCase("ru-RU");
}

function colorFor(value) {
  let hash = 0;
  const str = String(value ?? "");
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "—";
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(num);
}

export function renderSearchProgress(stepIndex, container) {
  if (!container) return;
  const rows = STAGES.map((label, i) => {
    let cls = "stage-row";
    let dotCls = "stage-dot";
    let textCls = "stage-text";
    let mark = String(i + 1);
    if (i < stepIndex) {
      cls += " done";
      dotCls += " done";
      mark = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>`;
    } else if (i === stepIndex) {
      cls += " active";
      dotCls += " active";
    } else {
      textCls += " pending";
    }
    return `<div class="${cls}">
      <span class="${dotCls}">${mark}</span>
      <span class="${textCls}">${escapeHtml(label)}</span>
    </div>`;
  }).join("");
  container.innerHTML = `<div class="stages">${rows}</div>`;
}

export function renderAuthorCards(authors, container, store) {
  if (!container) return;
  if (!authors || authors.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-title">Ничего не найдено</div>
      <div class="empty-text">Попробуйте изменить запрос или фильтры</div>
    </div>`;
    return;
  }

  const isSimilarMode = store && store.searchMode === "similar";
  const relCaption = isSimilarMode ? "сходство" : "релевантность";

  const cards = authors.map((item) => {
    const id = item.account_id ?? item.id ?? item.author_id ?? item.username;
    const name = item.title || item.username || "Автор";
    const handle = item.username ? `@${item.username}` : "";
    const url = item.url || "#";
    const platformRaw = item.platform || "";
    const platform = platformRaw ? platformRaw.charAt(0).toUpperCase() + platformRaw.slice(1).toLowerCase() : "";
    const relPct = Math.min(100, Math.max(0, (item.final_score || 0) * 100));
    const rel = `${Math.round(relPct)}%`;
    const er = item.static_avg_er != null ? `${Number(item.static_avg_er).toFixed(1)}%` : "—";
    const subs = formatCount(item.subscribers_count);
    const category = item.category_path || "";
    const inShort = store.isInShortlist(id);
    const shortCls = inShort ? "btn-short in" : "btn-short";
    const shortLabel = inShort ? "В шортлисте" : "В шортлист";
    const color = colorFor(name);
    const explanation = item.explanation || "";
    let matchBadge = "";
    if (isSimilarMode) {
      const reason = item.affinity_reason && String(item.affinity_reason).startsWith("похож")
        ? escapeHtml(item.affinity_reason)
        : "Похожие";
      matchBadge = `<span class="badge-affinity"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path></svg><span>${reason}</span></span>`;
    } else if (item.match_type === "affinity") {
      matchBadge = `<span class="badge-affinity"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="12" r="5"></circle><circle cx="15" cy="12" r="5"></circle></svg><span>${item.affinity_reason ? `Смежная ЦА · ${escapeHtml(item.affinity_reason)}` : "Смежная ЦА"}</span></span>`;
    } else if (item.match_type === "direct") {
      matchBadge = `<span class="badge-direct"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M2 12h3"></path><path d="M19 12h3"></path></svg><span>Прямой поиск</span></span>`;
    }
    const bizBadge = item.is_business
      ? `<span class="badge-biz" title="Аккаунт компании"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path></svg><span>Бизнес</span></span>`
      : "";
    const psychoBadges = [];
    if (item.primary_tone) {
      const toneDesc = TONE_DESCRIPTIONS[item.primary_tone] || "";
      psychoBadges.push(`<span class="badge-psycho" title="${escapeHtml(toneDesc)}">${escapeHtml(TONE_LABELS[item.primary_tone] || item.primary_tone)}</span>`);
    }
    if (item.primary_hormone) {
      const hormoneDesc = HORMONE_DESCRIPTIONS[item.primary_hormone] || "";
      psychoBadges.push(`<span class="badge-psycho" title="${escapeHtml(hormoneDesc)}">${escapeHtml(HORMONE_LABELS[item.primary_hormone] || item.primary_hormone)}</span>`);
    }
    const langBadge = item.primary_language && String(item.primary_language).trim() !== ""
      ? `<span class="badge-lang" title="Язык контента: ${escapeHtml(String(item.primary_language).toUpperCase())}">${escapeHtml(String(item.primary_language).toUpperCase())}</span>`
      : "";
    const genderBadge = item.gender && GENDER_LABELS[item.gender]
      ? `<span class="badge-gender ${item.gender}" title="Пол автора: ${GENDER_LABELS[item.gender]}">${GENDER_LABELS[item.gender]}</span>`
      : "";
    const psychoRow = psychoBadges.length > 0 ? `<div class="badges-psycho">${psychoBadges.join("")}</div>` : "";
    const badgesRow = (matchBadge || langBadge || genderBadge || bizBadge || psychoRow) ? `<div class="author-badges">${matchBadge}${langBadge}${genderBadge}${bizBadge}${psychoRow}</div>` : "";
    let thirdStat = "";
    const geoText = item.city && item.country
      ? `${item.city}, ${item.country}`
      : (item.country || item.city || "");
    if (geoText) {
      const shortGeo = geoText.length > 28 ? geoText.slice(0, 26) + "…" : geoText;
      thirdStat = `<span class="stat-divider"></span><div class="stat-geo" title="${escapeHtml(geoText)}">📍 ${escapeHtml(shortGeo)}</div>`;
    } else if (item.primary_language) {
      thirdStat = `<span class="stat-divider"></span><div class="stat-geo">Язык: ${escapeHtml(String(item.primary_language).toUpperCase())}</div>`;
    } else if (category) {
      const lastLevel = category.split(">").pop().trim();
      const shortCat = lastLevel.length > 25 ? lastLevel.slice(0, 25) : lastLevel;
      thirdStat = `<span class="stat-divider"></span><div class="stat-geo" title="${escapeHtml(category)}">${escapeHtml(shortCat)}</div>`;
    }

    const handleHtml = handle
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(handle)}</a>`
      : "";
    const platformHtml = platform
      ? `${handle ? " · " : ""}${escapeHtml(platform)}`
      : "";

    return `<div class="author-card" data-author-id="${id}">
      <div class="author-top">
        <span class="avatar" style="width:44px;height:44px;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;">${escapeHtml(initials(name))}</span>
        <div class="author-info">
          <div class="author-name-row">
            <span class="author-name">${escapeHtml(name)}</span>
            <svg class="verified-badge" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
          </div>
          <div class="author-handle">
            ${handleHtml}
            ${platformHtml}
          </div>
        </div>
        <div class="rel-block">
          <div class="rel-value">${rel}</div>
          <div class="rel-track"><div class="rel-bar" style="width:${relPct}%"></div></div>
          <div class="rel-caption">${relCaption}</div>
        </div>
      </div>

      ${badgesRow}

      ${explanation ? `<div class="author-bio">
        <div class="explanation-text ${CLAMP_CLASS}" data-explanation>${escapeHtml(explanation)}</div>
        <button type="button" class="btn-link" data-action="toggle-explanation" data-author-id="${id}">
          <span data-explanation-label>подробнее</span>
          <svg class="chevron" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
      </div>` : ""}

      <div class="author-stats">
        <div class="stat">
          <span class="stat-value">${subs}</span>
          <span class="stat-label">подписчиков</span>
        </div>
        <span class="stat-divider"></span>
        <div class="stat pad-left">
          <span class="stat-label">ER</span>
          <span class="stat-value">${er}</span>
        </div>
        ${thirdStat}
      </div>

      <div class="author-actions">
        <button type="button" class="${shortCls}" data-action="toggle-shortlist" data-author-id="${id}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h9l3 3v13l-6-3-6 3z" fill="currentColor" fill-opacity=".14"></path></svg>
          <span data-short-text>${shortLabel}</span>
        </button>
      </div>
    </div>`;
  }).join("");

  container.innerHTML = `<div class="grid">${cards}</div>`;
}

export function renderMetadataBar(metadata, container) {
  if (!container) return;
  if (!metadata) {
    container.innerHTML = "";
    return;
  }
  const time = metadata.execution_time_ms != null ? `${Number(metadata.execution_time_ms).toFixed(0)} мс` : "—";
  const qdrant = metadata.qdrant_candidates_count != null ? metadata.qdrant_candidates_count : "—";
  const graph = metadata.graph_evidences_count != null ? metadata.graph_evidences_count : "—";
  const total = metadata.total_candidates_count != null ? metadata.total_candidates_count : "—";
  const timings = metadata.timings || {};
  const timingRows = Object.entries(timings)
    .map(([key, val]) => `<div class="analytics-row">
      <span class="analytics-key">${escapeHtml(key)}</span>
      <span class="analytics-value">${Number(val).toFixed(0)} мс</span>
    </div>`)
    .join("");

  container.innerHTML = `<details class="analytics-accordion">
    <summary class="analytics-summary">
      <span class="analytics-total">${time}</span>
      <span class="analytics-badge">Аналитика пайплайна</span>
      <svg class="analytics-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
    </summary>
    <div class="analytics-body">
      <div class="analytics-grid">
        <div class="analytics-metric">
          <span class="analytics-metric-label">Кандидаты Qdrant</span>
          <span class="analytics-metric-value">${qdrant}</span>
        </div>
        <div class="analytics-metric">
          <span class="analytics-metric-label">Кандидаты Graph</span>
          <span class="analytics-metric-value">${graph}</span>
        </div>
        <div class="analytics-metric">
          <span class="analytics-metric-label">Всего кандидатов</span>
          <span class="analytics-metric-value">${total}</span>
        </div>
      </div>
      <div class="analytics-section">
        <div class="analytics-section-title">Тайминги</div>
        ${timingRows || `<div class="analytics-row"><span class="analytics-key">нет данных</span></div>`}
      </div>
    </div>
  </details>`;
}

export function showToast(message, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  const color = type === "error" ? "#ef4444" : "#10b981";
  toast.innerHTML = `<span class="toast-dot" style="background:${color}"></span><span class="toast-text">${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
