import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CalendarClock, Check, CreditCard, Lock, Mail, RefreshCw, ShieldCheck, X, AlertTriangle } from 'lucide-react';
import { api, legalUrl, type SubscriptionPlanItem, type SubscriptionStatusInfo } from '../../services/api';
import { Btn } from '../../components/ui';
import {
  SUBSCRIPTION_INCLUDES,
  fmtPeriod,
  fmtPrice,
  planExcludedFeatures,
  planIncludedFeatures,
  planLimits,
  planTitle,
} from './planMeta';

const PUBLIC_PRICING_URL = `${((import.meta.env.VITE_SEARCH_URL as string | undefined) || 'https://collabrama.ru').replace(/\/+$/, '')}/pricing`;

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: 'Активна', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  trial: { label: 'Триал', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  expired: { label: 'Истекла', cls: 'bg-red-50 text-red-600 border-red-200' },
};

function statusMeta(sub: SubscriptionStatusInfo): { label: string; cls: string } {
  if (sub.is_active) return STATUS_META.active;
  if (sub.status === 'trial') return STATUS_META.trial;
  if (sub.expires_at) return STATUS_META.expired;
  return STATUS_META[sub.status] ?? { label: 'Не оформлена', cls: 'bg-gray-50 text-gray-500 border-gray-200' };
}

function TrialBanner({ sub, onActivated }: { sub: SubscriptionStatusInfo; onActivated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (sub.is_active) return null;

  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      await api.activateTrial();
      onActivated();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Не удалось активировать триал');
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-6 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 h-6 inline-flex items-center rounded-full bg-indigo-600 text-white text-[11px] font-bold">Пробный период</span>
          <span className="text-[17px] font-extrabold text-gray-900">14 дней бесплатно</span>
        </div>
        <p className="mt-2 text-[12.5px] font-medium text-gray-500 leading-relaxed">
          Полный доступ к CRM на 2 недели. <strong className="text-gray-700">Банковская карта не требуется</strong> —
          по окончании триала ничего не спишется автоматически.
        </p>
        {sub.trial_used && (
          <div className="mt-2 text-[12.5px] font-semibold text-gray-400">Ваш пробный период уже использован — выберите тариф ниже.</div>
        )}
        {error && <div className="mt-2 text-[12.5px] font-semibold text-red-500">{error}</div>}
      </div>
      {sub.trial_available && (
        <div className="shrink-0">
          <Btn onClick={activate} disabled={busy}>
            {busy ? 'Активируем…' : 'Активировать триал'}
          </Btn>
        </div>
      )}
    </div>
  );
}

function CancelSubscriptionModal({ planName, expiresAt, onClose, onDone }: {
  planName: string;
  expiresAt: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const submit = async () => {
    if (!password) {
      setError('Введите пароль от аккаунта');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.cancelSubscription(password);
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Не удалось отменить подписку. Попробуйте позже.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Отмена подписки">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[440px] rounded-[20px] border border-line bg-white shadow-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="text-[16px] font-extrabold text-ink">Отмена подписки</div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500" aria-label="Закрыть">
            <X size={15} />
          </button>
        </div>
        <p className="mt-3 text-[13px] font-medium text-gray-600 leading-relaxed">
          Вы уверены, что хотите отменить подписку «{planName}»? После нажатия кнопки данное действие уже нельзя будет обратить вспять.
        </p>
        <p className="mt-2 text-[12px] font-medium text-gray-400 leading-relaxed">
          Автопродление выключится, а доступ к CRM сохранится до конца оплаченного периода{expiresAt ? ` — до ${fmtDate(expiresAt)}` : ''}.
        </p>
        <div className="mt-4">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Пароль от аккаунта</label>
          <input type="password" autoFocus autoComplete="current-password"
            className="w-full h-9.5 px-3 rounded-lg border border-gray-200 bg-white text-[13.5px] text-gray-900 outline-none transition-shadow focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            placeholder="••••••••" value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-600">
            <AlertTriangle size={14} className="shrink-0" />{error}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Оставить подписку</Btn>
          <button type="button" onClick={submit} disabled={busy}
            className="inline-flex items-center gap-1.5 h-9.5 px-4 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition-colors disabled:opacity-60">
            {busy && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Отменить подписку
          </button>
        </div>
      </div>
    </div>
  );
}

function SubscriptionCard({ sub, onPay, onChanged }: { sub: SubscriptionStatusInfo; onPay: (name: string) => void; onChanged: () => void }) {
  const meta = statusMeta(sub);
  const currentPlan = sub.plan;
  const [cancelOpen, setCancelOpen] = useState(false);
  const rows: { label: string; value: string }[] = [
    { label: 'Тариф', value: currentPlan ? planTitle(currentPlan.name) : sub.status === 'trial' ? 'Триал' : '—' },
    { label: sub.is_active ? 'Оформлена' : 'Дата первой оплаты', value: fmtDate(sub.started_at ?? sub.registered_at) },
    { label: sub.is_active ? 'Действует до' : 'Истекла', value: fmtDate(sub.expires_at) },
  ];
  if (sub.last_payment_at) rows.push({ label: 'Последнее списание', value: fmtDate(sub.last_payment_at) });

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white shadow-sm p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><CreditCard size={18} /></span>
        <div className="text-[17px] font-extrabold font-display text-gray-900">Ваша подписка</div>
        <span className={`px-2.5 h-6 inline-flex items-center rounded-full border text-[11.5px] font-bold ${meta.cls}`}>{meta.label}</span>
        {sub.auto_renew && sub.is_active && (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500">
            <RefreshCw size={12} />Автопродление включено
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        {rows.map(r => (
          <div key={r.label}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{r.label}</div>
            <div className="mt-1 text-[14px] font-bold text-gray-900">{r.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-[12.5px] font-medium text-gray-500 leading-relaxed">
        {sub.is_active ? (
          <>
            Подписка продлевается автоматически каждый расчётный период
            {currentPlan ? ` (${fmtPeriod(currentPlan.period_days).replace('за ', '').replace('в ', '')} — ${fmtPrice(currentPlan.price)})` : ''}.
            {sub.auto_renew
              ? 'Автопродление можно отключить кнопкой ниже — доступ сохранится до конца оплаченного периода.'
              : 'Автопродление отключено — доступ сохранится до конца оплаченного периода.'}
          </>
        ) : (
          <>Подписка не активна. Выберите тариф ниже — данные и сделки сохранены и станут доступны сразу после оплаты.</>
        )}
        {sub.billing_email && (
          <span className="block mt-1.5">Платёжные уведомления отправляются на {sub.billing_email}.</span>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        {!sub.is_active && currentPlan && (
          <Btn onClick={() => onPay(currentPlan.name)}>Продлить {planTitle(currentPlan.name)}</Btn>
        )}
        {sub.is_active && sub.auto_renew && (
          <button type="button" onClick={() => setCancelOpen(true)}
            className="text-[12.5px] font-semibold text-red-500 hover:text-red-600 underline underline-offset-2">
            Отменить подписку
          </button>
        )}
      </div>
      {cancelOpen && currentPlan && (
        <CancelSubscriptionModal
          planName={planTitle(currentPlan.name)}
          expiresAt={sub.expires_at}
          onClose={() => setCancelOpen(false)}
          onDone={() => { setCancelOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function PlanCard({ plan, current, onPay }: { plan: SubscriptionPlanItem; current: boolean; onPay: (name: string) => void }) {
  const disabled = !plan.is_active;
  const included = planIncludedFeatures(plan);
  const excluded = planExcludedFeatures(plan);
  const limits = planLimits(plan);
  const isFree = plan.price !== null && Number(plan.price) === 0;

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-3 w-[280px] ${
      current ? 'border-indigo-300 bg-indigo-50/40 shadow-sm'
        : disabled ? 'border-gray-200 bg-gray-50 opacity-60'
          : 'border-indigo-100 bg-white shadow-sm'}`}>
      <div className="flex items-center justify-between">
        <div className={`text-[15px] font-bold ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{planTitle(plan.name)}</div>
        {current && <span className="px-2 h-5 inline-flex items-center rounded-full bg-indigo-600 text-white text-[10.5px] font-bold">Ваш тариф</span>}
        {disabled && !current && <Lock size={14} className="text-gray-300" />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[24px] font-extrabold font-display ${disabled ? 'text-gray-300' : 'text-indigo-600'}`}>{fmtPrice(plan.price)}</span>
        {!isFree && plan.price !== null && <span className="text-[12px] font-semibold text-gray-400">{fmtPeriod(plan.period_days)}</span>}
        {isFree && <span className="text-[12px] font-semibold text-gray-400">{fmtPeriod(plan.period_days)}</span>}
      </div>
      <div className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-gray-500">
        {limits.map(item => <div key={item}>{item}</div>)}
        {included.map(item => (
          <div key={item} className="flex items-center gap-1.5">
            <Check size={12} className={disabled ? 'text-gray-300' : 'text-emerald-500'} />{item}
          </div>
        ))}
        {excluded.map(item => (
          <div key={item} className="flex items-center gap-1.5 text-gray-300">
            <X size={12} />{item}
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2">
        {current ? (
          <Btn variant="ghost" disabled>Текущий тариф</Btn>
        ) : plan.is_custom ? (
          <Btn variant="ghost" onClick={() => { window.location.href = 'mailto:support@collabrama.ru?subject=Enterprise'; }}>
            Связаться с менеджером
          </Btn>
        ) : disabled ? (
          <Btn variant="ghost" disabled>Временно недоступен</Btn>
        ) : isFree ? null : (
          <Btn onClick={() => onPay(plan.name)}>
            Оформить
          </Btn>
        )}
      </div>
    </div>
  );
}

export default function PricingScreen() {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [sub, setSub] = useState<SubscriptionStatusInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([api.getPlans(), api.getSubscription()])
      .then(([items, subscription]) => { setPlans(items); setSub(subscription); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  // «Оформить» ведёт на публичную страницу тарифов: там подробности о каждом плане и оплата.
  const handlePay = (_planName: string) => {
    window.location.href = PUBLIC_PRICING_URL;
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-[1060px] mx-auto px-6 py-8 flex flex-col gap-6">
        <div>
          <h1 className="text-[24px] font-extrabold font-display text-gray-900">Тарифы и подписка</h1>
          <p className="mt-1.5 text-[13.5px] font-medium text-gray-500 max-w-[720px] leading-relaxed">
            Все цены открыты: вы заранее видите стоимость, расчётный период и состав каждого тарифа —
            без скрытых платежей и обязательств.
          </p>
        </div>

        {status === 'loading' && <div className="text-[13px] font-semibold text-gray-400">Загружаем тарифы…</div>}
        {status === 'error' && (
          <div className="flex items-center gap-3">
            <div className="text-[13px] font-semibold text-red-400">Не удалось загрузить данные</div>
            <Btn variant="ghost" onClick={load}>Повторить</Btn>
          </div>
        )}

        {status === 'ready' && (
          <>
            {sub && <SubscriptionCard sub={sub} onPay={handlePay} onChanged={load} />}
            {sub && <TrialBanner sub={sub} onActivated={load} />}

            <div className="rounded-2xl border border-gray-100 bg-white p-6">
              <div className="flex items-center gap-2.5">
                <BadgeCheck size={16} className="text-indigo-500" />
                <div className="text-[14.5px] font-bold text-gray-900">Что даёт любая платная подписка</div>
              </div>
              <div className="mt-3 grid md:grid-cols-2 gap-x-8 gap-y-2">
                {SUBSCRIPTION_INCLUDES.map(item => (
                  <div key={item} className="flex items-start gap-2 text-[12.5px] font-semibold text-gray-600">
                    <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />{item}
                  </div>
                ))}
              </div>
            </div>

            {plans.length === 0 ? (
              <div className="text-[13px] font-semibold text-gray-400">Тарифы пока не настроены. Напишите в поддержку.</div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {plans.filter(p => p.name !== 'trial').map(plan => (
                  <PlanCard key={plan.id} plan={plan} current={sub?.plan?.id === plan.id && sub.is_active} onPay={handlePay} />
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-gray-100 bg-white p-6 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={16} className="text-indigo-500" />
                <div className="text-[14.5px] font-bold text-gray-900">Прозрачные условия</div>
              </div>
              <ul className="flex flex-col gap-2 text-[12.5px] font-medium text-gray-600 leading-relaxed">
                <li className="flex gap-2"><CalendarClock size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  Оплата банковской картой через CloudPayments. Подписка продлевается автоматически в конце каждого оплаченного периода — стоимость продления равна цене тарифа, указанной выше.</li>
                <li className="flex gap-2"><X size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  Отмена в любой момент: кнопка «Отменить подписку» в карточке вашей подписки выше (с подтверждением паролем) — автопродление выключится, а доступ сохранится до конца уже оплаченного периода.</li>
                <li className="flex gap-2"><Mail size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  Возврат средств возможен по правилам раздела 7 Публичной оферты. После оплаты доступ открывается автоматически в течение минуты.</li>
              </ul>
              <div className="text-[11.5px] font-medium text-gray-400 leading-relaxed">
                Оформляя подписку, вы принимаете{' '}
                <a href={legalUrl('offer.html')} target="_blank" rel="noopener" className="text-indigo-500 underline underline-offset-2">Публичную оферту</a>
                {' '}и{' '}
                <a href={legalUrl('privacy.html')} target="_blank" rel="noopener" className="text-indigo-500 underline underline-offset-2">Политику обработки персональных данных</a>.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
