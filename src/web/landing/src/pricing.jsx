import React from "react";
import { I } from "./icons.jsx";
import { getCrmLoginUrl } from "./auth.js";
import { PageShell } from "./page-shell.jsx";
// Публичная страница тарифов: доступна без регистрации, покупка — сразу со страницы.
// Данные — из открытого API /billing/plans. Залогиненным (токен в localStorage) —
// привязка по accountId, остальным — по email с автосозданием аккаунта после оплаты.

const PLAN_TITLES = { trial: "Триал", basic: "Базовый", pro: "Pro", enterprise: "Enterprise" };
const PLAN_DESCRIPTIONS = {
  trial: "Познакомьтесь с сервисом без оплаты и без привязки карты.",
  basic: "Для небольших команд, которые ведут сделки с авторами в одном месте.",
  pro: "Для агентств и брендов с регулярными кампаниями и автоматизацией.",
  enterprise: "Индивидуальные условия, объёмы и сопровождение.",
};
const FEATURE_TITLES = {
  automation_dialogs: "Автоматизация диалогов",
  automation_contracts: "Автоматизация договоров",
  automation_marking: "Автоматизация маркировки",
};
const LIMIT_TITLES = {
  brand_limit: "Брендов в базе знаний",
  dialogs_monthly_limit: "Диалогов в месяц",
};

const SUBSCRIPTION_INCLUDES = [
  "Шорт-лист и сделки: канбан от первого касания до публикации",
  "Коммуникации с авторами и история переписки",
  "Аналитика кампаний и авторов",
  "База авторов с карточками и контактами",
  "Реестр маркировки рекламы и документы по сделкам",
];

const FAQ = [
  {
    q: "Нужна ли карта для триала?",
    a: "Нет. Триал оформляется без карты и без автоматических списаний: когда пробный период закончится, ничего не спишется — вы просто решите, переходить ли на платный тариф.",
  },
  {
    q: "Как работает автопродление?",
    a: "Платная подписка продлевается автоматически в конце каждого оплаченного периода — по той же цене, что указана на этой странице. Никаких скрытых доплат и изменений цены без уведомления.",
  },
  {
    q: "Как отменить подписку?",
    a: "В один клик: в личном кабинете CRM откройте раздел «Тарифы» и нажмите «Отменить подписку» — потребуется только пароль от аккаунта. Доступ сохранится до конца уже оплаченного периода. Можно также написать на support@collabrama.ru.",
  },
  {
    q: "Можно ли вернуть деньги?",
    a: "Да, возврат возможен по правилам раздела 7 Публичной оферты. Напишите на support@collabrama.ru с почты аккаунта — разберёмся без бюрократии.",
  },
  {
    q: "Я оплатил(а) без регистрации. Как войти?",
    a: "Аккаунт создаётся автоматически на email, указанный при оплате. Откройте страницу входа, нажмите «Забыли пароль?» и задайте пароль по ссылке из письма — это займёт минуту.",
  },
  {
    q: "Что будет с моими данными, если подписка закончится?",
    a: "Ничего не удаляется: сделки, база авторов и переписки сохраняются. Доступ приостанавливается до продления — после оплаты всё снова на месте.",
  },
];

const fmtPrice = (price) => {
  if (price === null || price === undefined) return "Индивидуально";
  const value = Number(price);
  if (!Number.isFinite(value) || value === 0) return "0 ₽";
  return `${value.toLocaleString("ru-RU")} ₽`;
};

// — Горизонтальная плашка триала: активируется кнопкой, карта не нужна —
const TrialBanner = () => {
  const [state, setState] = React.useState("loading"); // loading | anon | available | used | active | done | error
  const [expires, setExpires] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let token = null;
    try { token = window.localStorage.getItem("creatorflow_token"); } catch { /* ignore */ }
    if (!token) { setState("anon"); return; }
    let active = true;
    fetch("/api/v1/billing/subscription", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((sub) => {
        if (!active) return;
        if (sub.is_active) setState("active");
        else setState(sub.trial_used ? "used" : "available");
      })
      .catch(() => { if (active) setState("available"); });
    return () => { active = false; };
  }, []);

  const activate = async () => {
    setBusy(true);
    setError("");
    try {
      const token = window.localStorage.getItem("creatorflow_token");
      const res = await fetch("/api/v1/billing/trial/activate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Не удалось активировать триал");
      const d = new Date(body.expires_at);
      setExpires(d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }));
      setState("done");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (state === "loading" || state === "active") return null;

  return (
    <div className="mt-10 card p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-5"
      style={{ background: "linear-gradient(120deg, color-mix(in oklch, var(--accent) 8%, white), white 60%)", borderColor: "color-mix(in oklch, var(--accent) 25%, white)" }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 h-6 inline-flex items-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--accent)" }}>Пробный период</span>
          <span className="text-[18px] font-extrabold text-ink-900">14 дней бесплатно</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
          Полный доступ к сервису на 2 недели. <strong>Банковская карта не требуется</strong> — активируйте одной кнопкой
          и спокойно оцените сервис: по окончании триала ничего не спишется автоматически.
        </p>
        {state === "done" && (
          <div className="mt-2 text-[12.5px] font-semibold text-emerald-600">Триал активирован до {expires}. Добро пожаловать!</div>
        )}
        {state === "used" && (
          <div className="mt-2 text-[12.5px] font-semibold text-ink-400">Ваш пробный период уже использован — выберите тариф ниже.</div>
        )}
        {error && <div className="mt-2 text-[12.5px] font-semibold text-rose-500">{error}</div>}
      </div>
      <div className="shrink-0">
        {state === "anon" && (
          <a href={getCrmLoginUrl()} className="btn-primary inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold">
            Начать бесплатно <I.Arrow size={14} />
          </a>
        )}
        {state === "available" && (
          <button type="button" onClick={activate} disabled={busy}
            className="btn-primary inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold disabled:opacity-60">
            {busy ? "Активируем…" : "Активировать триал"} <I.Arrow size={14} />
          </button>
        )}
        {state === "done" && (
          <a href="/" className="btn-primary inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold">
            Открыть приложение <I.Arrow size={14} />
          </a>
        )}
        {state === "used" && null}
      </div>
    </div>
  );
};

const fmtPeriod = (days) => {
  if (days === 30 || days === 31) return "в месяц";
  if (days % 10 === 1 && days % 100 !== 11) return `за ${days} день`;
  if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) return `за ${days} дня`;
  return `за ${days} дней`;
};

const PlanCard = ({ plan, onPay, paying }) => {
  const disabled = !plan.is_active;
  const isFree = plan.price !== null && Number(plan.price) === 0;
  const limits = Object.entries(plan.limits || {}).filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => `${LIMIT_TITLES[k] || k}: ${v}`);
  const features = Object.entries(plan.features || {});
  const included = features.filter(([, on]) => on).map(([k]) => FEATURE_TITLES[k] || k);
  const excluded = features.filter(([, on]) => !on).map(([k]) => FEATURE_TITLES[k] || k);

  return (
    <div className={`card p-6 flex flex-col gap-4 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-[17px] font-bold text-ink-900">{PLAN_TITLES[plan.name] || plan.name}</div>
        {plan.name === "pro" && !disabled && (
          <span className="px-2.5 h-6 inline-flex items-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--accent)" }}>Популярный</span>
        )}
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-500">{PLAN_DESCRIPTIONS[plan.name] || ""}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] font-extrabold accent-text">{fmtPrice(plan.price)}</span>
        {plan.price !== null && <span className="text-[12.5px] font-semibold text-ink-400">{fmtPeriod(plan.period_days)}</span>}
      </div>
      <div className="flex flex-col gap-2 text-[13px] text-ink-700">
        {limits.map((item) => <div key={item} className="font-semibold">{item}</div>)}
        {included.map((item) => (
          <div key={item} className="flex items-center gap-2">
            <span className="text-emerald-500 shrink-0"><I.Check size={14} /></span>{item}
          </div>
        ))}
        {excluded.map((item) => (
          <div key={item} className="flex items-center gap-2 text-ink-300">
            <span className="shrink-0"><I.Close size={14} /></span>{item}
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2">
        {plan.is_custom ? (
          <a href="mailto:support@collabrama.ru?subject=Enterprise" className="btn-ghost w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-[13.5px] font-semibold">
            Связаться с менеджером
          </a>
        ) : disabled ? (
          <span className="btn-ghost w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-[13.5px] font-semibold opacity-60">Временно недоступен</span>
        ) : isFree ? (
          <a href={getCrmLoginUrl()} className="btn-primary w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[13.5px] font-semibold">
            Попробовать бесплатно <I.Arrow size={13} />
          </a>
        ) : (
          <button type="button" onClick={() => onPay(plan)} disabled={paying}
            className="btn-primary w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[13.5px] font-semibold disabled:opacity-60">
            {paying ? "Переход к оплате…" : "Оформить"} <I.Arrow size={13} />
          </button>
        )}
      </div>
    </div>
  );
};

const CheckoutModal = ({ plan, onClose, onError }) => {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setError("Введите корректный email");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/billing/public-checkout-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.name, email: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Не удалось получить ссылку оплаты");
      window.location.href = body.url;
    } catch (err) {
      setBusy(false);
      setError(err.message || "Не удалось получить ссылку оплаты. Попробуйте ещё раз.");
      onError?.();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Оформление подписки">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative card w-full max-w-[440px] p-6 animate-rise">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[17px] font-bold text-ink-900">Тариф «{PLAN_TITLES[plan.name] || plan.name}» — {fmtPrice(plan.price)} {fmtPeriod(plan.period_days)}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500">
              Укажите email — на него придёт чек и к нему привяжется подписка. После оплаты аккаунт создастся автоматически:
              вы зададите пароль через «Забыли пароль?» на странице входа.
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-ink-100 hover:bg-ink-200 flex items-center justify-center text-ink-600" aria-label="Закрыть">
            <I.Close size={16} />
          </button>
        </div>

        <input type="email" autoFocus required value={email} placeholder="you@company.com"
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          className="mt-4 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-indigo-300" />

        {error && <div className="mt-2 text-[12px] font-semibold text-rose-500">{error}</div>}

        <button type="submit" disabled={busy}
          className="btn-primary mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold disabled:opacity-60">
          {busy ? "Переходим к оплате…" : "Перейти к оплате"} <I.Arrow size={14} />
        </button>

        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
          Оплата банковской картой через CloudPayments. Оформляя подписку, вы принимаете{" "}
          <a href="/legal/offer.html" target="_blank" rel="noopener" className="underline underline-offset-2 text-ink-600">Публичную оферту</a>{" "}
          и{" "}
          <a href="/legal/privacy.html" target="_blank" rel="noopener" className="underline underline-offset-2 text-ink-600">Политику обработки ПДн</a>.
          Уже есть аккаунт? <a href={getCrmLoginUrl()} className="underline underline-offset-2 text-ink-600">Войдите</a> — подписка привяжется к нему.
        </p>
      </form>
    </div>
  );
};

export default function PricingPage() {
  const [plans, setPlans] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [checkoutPlan, setCheckoutPlan] = React.useState(null);
  const [paying, setPaying] = React.useState(false);
  const [payError, setPayError] = React.useState("");

  React.useEffect(() => {
    let active = true;
    fetch("/api/v1/billing/plans")
      .then((r) => { if (!r.ok) throw new Error("bad status"); return r.json(); })
      .then((items) => { if (active) setPlans(items); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const handlePay = async (plan) => {
    setPayError("");
    // Залогиненный пользователь (токен лежит в localStorage этого origin) — оплата сразу на аккаунт.
    let token = null;
    try { token = window.localStorage.getItem("creatorflow_token"); } catch { /* ignore */ }
    if (token) {
      setPaying(true);
      try {
        const res = await fetch(`/api/v1/billing/checkout-url?plan=${encodeURIComponent(plan.name)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) throw new Error("unauthorized");
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Не удалось получить ссылку оплаты");
        window.location.href = body.url;
        return;
      } catch (err) {
        setPaying(false);
        if (err.message !== "unauthorized") {
          setPayError(err.message || "Не удалось получить ссылку оплаты. Попробуйте ещё раз.");
          return;
        }
        // Токен протух — продолжаем как аноним, через email.
      }
    }
    setCheckoutPlan(plan);
  };

  return (
    <PageShell>
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-14 pb-16">
        <div className="max-w-[720px]">
          <div className="mono-mini accent-text">Тарифы</div>
          <h1 className="mt-2 font-extrabold tracking-[-0.02em] text-[36px] sm:text-[44px] leading-[1.08]">Честные цены без скрытых платежей</h1>
          <p className="mt-4 text-[15.5px] leading-relaxed text-ink-600">
            Вы заранее видите стоимость, расчётный период и состав каждого тарифа — до регистрации и оплаты.
            Оформить подписку можно прямо здесь: аккаунт создастся автоматически после оплаты.
          </p>
        </div>

        <div className="mt-10 card p-6">
          <div className="text-[15px] font-bold text-ink-900">Что даёт любая платная подписка</div>
          <div className="mt-3 grid md:grid-cols-2 gap-x-8 gap-y-2">
            {SUBSCRIPTION_INCLUDES.map((item) => (
              <div key={item} className="flex items-start gap-2 text-[13px] text-ink-700">
                <span className="text-emerald-500 mt-0.5 shrink-0"><I.Check size={13} /></span>{item}
              </div>
            ))}
          </div>
        </div>

        {failed && (
          <div className="mt-8 text-[13.5px] font-semibold text-rose-500">Не удалось загрузить тарифы. Попробуйте обновить страницу.</div>
        )}
        {plans === null && !failed && (
          <div className="mt-8 text-[13.5px] font-semibold text-ink-400">Загружаем тарифы…</div>
        )}
        <TrialBanner />
        {plans !== null && (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {plans.filter((p) => p.name !== "trial").map((plan) => <PlanCard key={plan.id} plan={plan} onPay={handlePay} paying={paying} />)}
          </div>
        )}
        {payError && <div className="mt-4 text-[12.5px] font-semibold text-rose-500">{payError}</div>}

        <div className="mt-10 card p-6">
          <div className="text-[15px] font-bold text-ink-900">Прозрачные условия</div>
          <ul className="mt-3 flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-600">
            <li>Оплата банковской картой через CloudPayments. Подписка продлевается автоматически в конце оплаченного периода — по той же цене, что указана на этой странице.</li>
            <li>Отмена в любой момент: кнопка «Отменить подписку» в личном кабинете (раздел «Тарифы») — с подтверждением паролем, без писем и ожиданий. Доступ сохранится до конца оплаченного периода.</li>
            <li>Возврат средств — по правилам раздела 7 <a href="/legal/offer.html" target="_blank" rel="noopener" className="underline underline-offset-2 text-ink-800">Публичной оферты</a>.</li>
          </ul>
        </div>

        <div className="mt-10">
          <div className="mono-mini accent-text">FAQ</div>
          <h2 className="mt-2 text-[26px] font-extrabold text-ink-900">Частые вопросы</h2>
          <div className="mt-5 grid md:grid-cols-2 gap-4">
            {FAQ.map((f) => (
              <div key={f.q} className="card p-5">
                <div className="text-[14px] font-bold text-ink-900">{f.q}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {checkoutPlan && <CheckoutModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} />}
    </PageShell>
  );
}
