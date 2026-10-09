(function () {
  "use strict";

  if (window.__collabramaSupportWidgetLoaded) return;
  window.__collabramaSupportWidgetLoaded = true;

  var CATEGORIES = [
    { value: "bug", label: "Ошибка / баг" },
    { value: "question", label: "Вопрос" },
    { value: "suggestion", label: "Предложение" },
    { value: "other", label: "Другое" },
  ];
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var MEANINGFUL_RE = /[A-Za-zА-Яа-яЁё0-9]/g;

  function meaningfulCount(text) {
    var matches = String(text).match(MEANINGFUL_RE);
    return matches ? matches.length : 0;
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

  function injectStyles() {
    var css =
      ".cf-sup-btn{position:fixed;right:24px;bottom:24px;z-index:9998;width:52px;height:52px;border:none;border-radius:16px;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px rgba(99,102,241,.4);transition:transform .18s ease,box-shadow .18s ease,background .18s ease;animation:cf-sup-pop .3s ease}" +
      ".cf-sup-btn:hover{background:#4f46e5;transform:translateY(-2px);box-shadow:0 12px 28px rgba(99,102,241,.5)}" +
      ".cf-sup-btn:focus-visible{outline:2px solid #312e81;outline-offset:2px}" +
      ".cf-sup-btn svg{width:24px;height:24px}" +
      ".cf-sup-overlay{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.45);display:flex;align-items:flex-end;justify-content:center;animation:cf-sup-fade .18s ease}" +
      "@media(min-width:480px){.cf-sup-overlay{align-items:center;padding:24px}}" +
      ".cf-sup-panel{background:#fff;width:100%;max-width:440px;border-radius:20px 20px 0 0;padding:20px 20px 24px;box-shadow:0 24px 60px rgba(15,23,42,.35);animation:cf-sup-up .22s ease;font-family:'Manrope','Inter',system-ui,sans-serif;color:#111827;max-height:92vh;overflow-y:auto}" +
      "@media(min-width:480px){.cf-sup-panel{border-radius:20px}}" +
      ".cf-sup-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}" +
      ".cf-sup-title{font-size:16px;font-weight:800}" +
      ".cf-sup-close{border:none;background:#f1f5f9;color:#64748b;width:32px;height:32px;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease}" +
      ".cf-sup-close:hover{background:#e2e8f0;color:#0f172a}" +
      ".cf-sup-field{margin-bottom:12px}" +
      ".cf-sup-label{display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:5px}" +
      ".cf-sup-input{width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;font-size:13px;font-family:inherit;color:#111827;background:#fff;transition:border-color .15s ease,box-shadow .15s ease}" +
      ".cf-sup-input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}" +
      ".cf-sup-input.cf-sup-invalid{border-color:#ef4444}" +
      "textarea.cf-sup-input{resize:vertical;min-height:96px}" +
      ".cf-sup-err{font-size:11.5px;font-weight:600;color:#dc2626;margin-top:4px;display:none}" +
      ".cf-sup-err.cf-sup-visible{display:block}" +
      ".cf-sup-alert{border-radius:10px;padding:10px 12px;font-size:12.5px;font-weight:600;margin-bottom:12px;display:none}" +
      ".cf-sup-alert.cf-sup-visible{display:block}" +
      ".cf-sup-alert-err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}" +
      ".cf-sup-submit{width:100%;border:none;border-radius:12px;background:#6366f1;color:#fff;font-size:13.5px;font-weight:700;font-family:inherit;padding:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s ease,opacity .15s ease}" +
      ".cf-sup-submit:hover:not(:disabled){background:#4f46e5}" +
      ".cf-sup-submit:disabled{opacity:.6;cursor:not-allowed}" +
      ".cf-sup-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:cf-sup-spin .7s linear infinite}" +
      ".cf-sup-success{text-align:center;padding:12px 4px}" +
      ".cf-sup-success-icon{width:52px;height:52px;border-radius:50%;background:#ecfdf5;color:#059669;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}" +
      ".cf-sup-success-num{display:inline-block;margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;background:#eef2ff;color:#4f46e5;border-radius:8px;padding:3px 10px}" +
      ".cf-sup-success p{font-size:13.5px;font-weight:600;color:#334155;margin:0 0 4px}" +
      ".cf-sup-again{margin-top:14px}" +
      "@keyframes cf-sup-spin{to{transform:rotate(360deg)}}" +
      "@keyframes cf-sup-fade{from{opacity:0}to{opacity:1}}" +
      "@keyframes cf-sup-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}" +
      "@keyframes cf-sup-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}";
    var style = document.createElement("style");
    style.setAttribute("data-cf-support", "");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function buildButton(onOpen) {
    var btn = el("button", "cf-sup-btn");
    btn.type = "button";
    btn.setAttribute("aria-label", "Поддержка");
    btn.style.bottom = getButtonBottom() + "px";
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    btn.addEventListener("click", onOpen);
    return btn;
  }

  function createWidget() {
    injectStyles();

    var state = {
      open: false,
      sending: false,
      values: { subject: "", category: "bug", description: "", email: "" },
    };

    var overlay = null;
    var button = buildButton(openWidget);
    document.body.appendChild(button);

    if (isDockedToSidebar() && getToken()) button.style.display = "none";

    window.cfSupportOpen = openWidget;
    window.cfSupportFloating = function (show) {
      button.style.display = show ? "" : "none";
    };

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.open) closeWidget();
    });

    function openWidget() {
      if (state.open) return;
      state.open = true;
      renderForm();
    }

    function closeWidget() {
      if (!state.open) return;
      state.open = false;
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      button.focus();
    }

    function fieldError(id, message) {
      var node = document.getElementById(id);
      if (node) {
        node.textContent = message || "";
        node.classList.toggle("cf-sup-visible", Boolean(message));
      }
    }

    function validate(values, isAuthed) {
      var ok = true;
      var subjectInput = document.getElementById("cf-sup-subject");
      var descInput = document.getElementById("cf-sup-description");
      var emailInput = document.getElementById("cf-sup-email");
      if (subjectInput) subjectInput.classList.remove("cf-sup-invalid");
      if (descInput) descInput.classList.remove("cf-sup-invalid");
      if (emailInput) emailInput.classList.remove("cf-sup-invalid");
      fieldError("cf-sup-subject-err", "");
      fieldError("cf-sup-description-err", "");
      fieldError("cf-sup-email-err", "");
      if (!values.subject.trim()) {
        fieldError("cf-sup-subject-err", "Укажите тему обращения");
        if (subjectInput) subjectInput.classList.add("cf-sup-invalid");
        ok = false;
      } else if (values.subject.trim().length > 120) {
        fieldError("cf-sup-subject-err", "Тема не должна превышать 120 символов");
        if (subjectInput) subjectInput.classList.add("cf-sup-invalid");
        ok = false;
      } else if (meaningfulCount(values.subject) < 3) {
        fieldError("cf-sup-subject-err", "Тема должна содержать хотя бы несколько букв или цифр");
        if (subjectInput) subjectInput.classList.add("cf-sup-invalid");
        ok = false;
      }
      if (!values.description.trim()) {
        fieldError("cf-sup-description-err", "Опишите проблему или предложение");
        if (descInput) descInput.classList.add("cf-sup-invalid");
        ok = false;
      } else if (values.description.trim().length > 2000) {
        fieldError("cf-sup-description-err", "Описание не должно превышать 2000 символов");
        if (descInput) descInput.classList.add("cf-sup-invalid");
        ok = false;
      } else if (meaningfulCount(values.description) < 10) {
        fieldError("cf-sup-description-err", "Описание слишком короткое — опишите проблему подробнее");
        if (descInput) descInput.classList.add("cf-sup-invalid");
        ok = false;
      }
      if (!isAuthed) {
        var email = values.email.trim();
        if (!email) {
          fieldError("cf-sup-email-err", "Укажите email для связи");
          if (emailInput) emailInput.classList.add("cf-sup-invalid");
          ok = false;
        } else if (!EMAIL_RE.test(email)) {
          fieldError("cf-sup-email-err", "Некорректный адрес электронной почты");
          if (emailInput) emailInput.classList.add("cf-sup-invalid");
          ok = false;
        }
      }
      return ok;
    }

    function renderForm() {
      var isAuthed = Boolean(getToken());

      overlay = el("div", "cf-sup-overlay");
      overlay.addEventListener("mousedown", function (e) {
        if (e.target === overlay) closeWidget();
      });

      var panel = el("div", "cf-sup-panel");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-label", "Форма обращения в поддержку");

      var head = el("div", "cf-sup-head");
      head.appendChild(el("div", "cf-sup-title", "Поддержка"));
      var closeBtn = el("button", "cf-sup-close");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Закрыть");
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      closeBtn.addEventListener("click", closeWidget);
      head.appendChild(closeBtn);
      panel.appendChild(head);

      var alert = el("div", "cf-sup-alert cf-sup-alert-err");
      panel.appendChild(alert);

      var form = el("form");
      form.noValidate = true;

      var subjectField = el("div", "cf-sup-field");
      var subjectLabel = el("label", "cf-sup-label", "Тема *");
      subjectLabel.setAttribute("for", "cf-sup-subject");
      var subjectInput = el("input", "cf-sup-input");
      subjectInput.id = "cf-sup-subject";
      subjectInput.type = "text";
      subjectInput.maxLength = 120;
      subjectInput.value = state.values.subject;
      subjectField.appendChild(subjectLabel);
      subjectField.appendChild(subjectInput);
      subjectField.appendChild(el("div", "cf-sup-err", "")).id = "cf-sup-subject-err";
      form.appendChild(subjectField);

      var categoryField = el("div", "cf-sup-field");
      var categoryLabel = el("label", "cf-sup-label", "Категория *");
      categoryLabel.setAttribute("for", "cf-sup-category");
      var categorySelect = el("select", "cf-sup-input");
      categorySelect.id = "cf-sup-category";
      CATEGORIES.forEach(function (c) {
        var opt = el("option", "", c.label);
        opt.value = c.value;
        if (c.value === state.values.category) opt.selected = true;
        categorySelect.appendChild(opt);
      });
      categoryField.appendChild(categoryLabel);
      categoryField.appendChild(categorySelect);
      form.appendChild(categoryField);

      var descField = el("div", "cf-sup-field");
      var descLabel = el("label", "cf-sup-label", "Описание *");
      descLabel.setAttribute("for", "cf-sup-description");
      var descInput = el("textarea", "cf-sup-input");
      descInput.id = "cf-sup-description";
      descInput.maxLength = 2000;
      descInput.value = state.values.description;
      descField.appendChild(descLabel);
      descField.appendChild(descInput);
      descField.appendChild(el("div", "cf-sup-err", "")).id = "cf-sup-description-err";
      form.appendChild(descField);

      var emailInput = null;
      if (!isAuthed) {
        var emailField = el("div", "cf-sup-field");
        var emailLabel = el("label", "cf-sup-label", "Email для связи *");
        emailLabel.setAttribute("for", "cf-sup-email");
        emailInput = el("input", "cf-sup-input");
        emailInput.id = "cf-sup-email";
        emailInput.type = "email";
        emailInput.maxLength = 254;
        emailInput.value = state.values.email;
        emailField.appendChild(emailLabel);
        emailField.appendChild(emailInput);
        emailField.appendChild(el("div", "cf-sup-err", "")).id = "cf-sup-email-err";
        form.appendChild(emailField);
      }

      var submit = el("button", "cf-sup-submit", "Отправить");
      submit.type = "submit";
      form.appendChild(submit);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (state.sending) return;
        state.values.subject = subjectInput.value;
        state.values.category = categorySelect.value;
        state.values.description = descInput.value;
        state.values.email = emailInput ? emailInput.value : "";
        if (!validate(state.values, isAuthed)) return;
        send(submit, alert, isAuthed);
      });

      panel.appendChild(form);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      subjectInput.focus();
    }

    function send(submit, alert, isAuthed) {
      state.sending = true;
      submit.disabled = true;
      alert.classList.remove("cf-sup-visible");
      var spinner = el("span", "cf-sup-spinner");
      submit.textContent = "";
      submit.appendChild(spinner);
      submit.appendChild(document.createTextNode("Отправка…"));

      var body = {
        subject: state.values.subject.trim(),
        category: state.values.category,
        description: state.values.description.trim(),
        page_url: window.location.href,
        user_agent: navigator.userAgent,
      };
      if (!isAuthed) body.email = state.values.email.trim();

      var headers = { "Content-Type": "application/json", Accept: "application/json" };
      var token = getToken();
      if (token) headers["Authorization"] = "Bearer " + token;

      fetch(getApiBase() + "/support/tickets", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      })
        .then(function (resp) {
          return resp
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              if (!resp.ok) {
                var detail = typeof data.detail === "string" ? data.detail : "Не удалось отправить обращение. Попробуйте позже.";
                if (resp.status === 429) detail = "Слишком много обращений. Попробуйте позже.";
                throw new Error(detail);
              }
              renderSuccess(data.ticket_number || "");
            });
        })
        .catch(function (err) {
          state.sending = false;
          submit.disabled = false;
          submit.textContent = "Отправить";
          alert.textContent = err && err.message ? err.message : "Не удалось отправить обращение. Попробуйте позже.";
          alert.classList.add("cf-sup-visible");
        });
    }

    function renderSuccess(ticketNumber) {
      state.sending = false;
      if (!overlay) return;
      var panel = overlay.querySelector(".cf-sup-panel");
      if (!panel) return;
      panel.textContent = "";

      var head = el("div", "cf-sup-head");
      head.appendChild(el("div", "cf-sup-title", "Поддержка"));
      var closeBtn = el("button", "cf-sup-close");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Закрыть");
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      closeBtn.addEventListener("click", closeWidget);
      head.appendChild(closeBtn);
      panel.appendChild(head);

      var box = el("div", "cf-sup-success");
      var icon = el("div", "cf-sup-success-icon");
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      box.appendChild(icon);
      box.appendChild(el("p", "", "Обращение отправлено! Мы вернёмся с ответом."));
      if (ticketNumber) {
        var numWrap = el("div", "");
        numWrap.style.marginTop = "8px";
        var numLabel = el("span", "", "Номер вашего обращения:");
        numLabel.style.cssText = "display:block;font-size:11.5px;font-weight:600;color:#94a3b8;margin-bottom:4px";
        numWrap.appendChild(numLabel);
        numWrap.appendChild(el("span", "cf-sup-success-num", ticketNumber));
        box.appendChild(numWrap);
      }
      var again = el("button", "cf-sup-submit cf-sup-again", "Отправить ещё");
      again.type = "button";
      again.addEventListener("click", function () {
        state.values.subject = "";
        state.values.description = "";
        state.values.category = "bug";
        renderFormReset();
      });
      box.appendChild(again);
      panel.appendChild(box);
    }

    function renderFormReset() {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      renderForm();
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
