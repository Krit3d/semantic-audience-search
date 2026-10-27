import { useEffect, useState } from 'react';
import { Check, Lock, LogOut, Zap } from 'lucide-react';
import { api, legalUrl, type SubscriptionPlanItem, type SubscriptionStatusInfo } from '../services/api';
import { Btn } from '../components/ui';
import { FEATURE_TITLES, fmtPrice, planTitle } from './pricing/planMeta';

const PUBLIC_PRICING_URL = `${((import.meta.env.VITE_SEARCH_URL as string | undefined) || 'https://collabrama.ru').replace(/\/+$/, '')}/pricing`;

function TrialBanner({ sub, onActivated }: { sub: SubscriptionStatusInfo | null; onActivated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (sub && !sub.trial_available) return null;

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
    <div className="w-full rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-6 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 h-6 inline-flex items-center rounded-full bg-indigo-600 text-white text-[11px] font-bold">Пробный период</span>
          <span className="text-[17px] font-extrabold text-gray-900">14 дней бесплатно</span>
        </div>
        <p className="mt-2 text-[12.5px] font-medium text-gray-500 leading-relaxed">
          Полный доступ к CRM на 2 недели. <strong className="text-gray-700">Банковская карта не требуется</strong> —
          по окончании триала ничего не спишется автоматически.
        </p>
        {error && <div className="mt-2 text-[12.5px] font-semibold text-red-500">{error}</div>}
      </div>
      <div className="shrink-0">
        <Btn onClick={activate} disabled={busy}>
          <Zap size={14} />{busy ? 'Активируем…' : 'Активировать триал'}
        </Btn>
      </div>
    </div>
  );
}

function PlanCard({ plan, onPay }: { plan: SubscriptionPlanItem; onPay: (name: string) => void }) {
  const disabled = !plan.is_active;
  const limits: string[] = [];
  if (plan.limits.brand_limit) limits.push(`Брендов: ${plan.limits.brand_limit}`);
  if (plan.limits.dialogs_monthly_limit) limits.push(`Диалогов в месяц: ${plan.limits.dialogs_monthly_limit}`);
  const features = Object.entries(plan.features)
    .filter(([, enabled]) => enabled)
    .map(([key]) => FEATURE_TITLES[key] ?? key);

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-3 w-[260px] ${disabled ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-indigo-100 bg-white shadow-sm'}`}>
      <div className="flex items-center justify-between">
        <div className={`text-[15px] font-bold ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>
          {planTitle(plan.name)}
        </div>
        {disabled && <Lock size={14} className="text-gray-300" />}
      </div>
      <div className={`text-[22px] font-extrabold font-display ${disabled ? 'text-gray-300' : 'text-indigo-600'}`}>
        {fmtPrice(plan.price)}
      </div>
      <div className="flex flex-col gap-1.5 text-[12px] font-semibold text-gray-500">
        {limits.map(item => <div key={item}>{item}</div>)}
        {features.map(item => (
          <div key={item} className="flex items-center gap-1.5">
            <Check size={12} className={disabled ? 'text-gray-300' : 'text-emerald-500'} />
            {item}
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2">
        {plan.is_custom ? (
          <Btn variant="ghost" onClick={() => { window.location.href = 'mailto:support@collabrama.ru?subject=Enterprise'; }}>
            Связаться с менеджером
          </Btn>
        ) : disabled ? (
          <Btn variant="ghost" disabled>Временно недоступен</Btn>
        ) : (
          <Btn onClick={() => onPay(plan.name)}>Подробнее и оплата</Btn>
        )}
      </div>
    </div>
  );
}

export default function PaywallScreen({ onLogout }: { onLogout: () => void }) {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [sub, setSub] = useState<SubscriptionStatusInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  const load = () => {
    setStatus('loading');
    Promise.all([api.getPlans(), api.getSubscription().catch(() => null)])
      .then(([items, subscription]) => {
        setPlans(items.filter(p => p.name !== 'trial'));
        setSub(subscription);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  };

  useEffect(load, []);

  const handlePay = (_planName: string) => {
    window.location.href = PUBLIC_PRICING_URL;
  };

  const trialExpired = sub?.status === 'trial' && sub.trial_used && !sub.is_active;
  const paidAccessExpired = !sub?.is_active && ['active', 'past_due', 'expired'].includes(sub?.status ?? '');
  const title = trialExpired
    ? 'Пробный период закончился'
    : paidAccessExpired
      ? 'Период подписки закончился'
      : 'Начните работу с Collabrama CRM';
  const description = trialExpired || paidAccessExpired
    ? 'Доступ к функциям и данным временно приостановлен. Авторы, сделки и переписки сохранены и снова станут доступны после оформления подписки.'
    : 'Активируйте 14 дней бесплатно без карты или выберите тариф. После пробного периода ничего не спишется автоматически.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 overflow-y-auto">
      <div className="max-w-[900px] w-full px-5 sm:px-6 py-8 sm:py-10 flex flex-col items-center gap-6">
        <div className="text-center max-w-[650px]">
          <div className="text-[24px] font-extrabold font-display text-gray-900">{title}</div>
          <div className="text-[13.5px] font-medium text-gray-500 mt-2 leading-relaxed">{description}</div>
        </div>
        {status === 'loading' && <div className="text-[13px] font-semibold text-gray-400">Загружаем тарифы…</div>}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-[13px] font-semibold text-red-400">Не удалось загрузить тарифы</div>
            <Btn variant="ghost" onClick={load}>Повторить</Btn>
          </div>
        )}
        {status === 'ready' && <TrialBanner sub={sub} onActivated={() => window.location.reload()} />}
        {status === 'ready' && plans.length === 0 && (
          <div className="text-[13px] font-semibold text-gray-400">Тарифы пока не настроены. Напишите в поддержку.</div>
        )}
        {status === 'ready' && plans.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4">
            {plans.map(plan => <PlanCard key={plan.id} plan={plan} onPay={handlePay} />)}
          </div>
        )}
        <div className="text-[11.5px] font-semibold text-gray-400 text-center">
          После оплаты доступ восстановится автоматически в течение минуты.
        </div>
        <div className="text-[11.5px] font-medium text-gray-400 text-center max-w-[560px] leading-relaxed">
          Оплата банковской картой через CloudPayments. Подписка продлевается автоматически каждые 31 день,
          отменить можно в любой момент — доступ сохранится до конца оплаченного периода.
          Оплачивая, вы принимаете{' '}
          <a href={legalUrl('offer.html')} target="_blank" rel="noopener" className="text-indigo-500 underline underline-offset-2">Публичную оферту</a>
          {' '}(порядок возврата — раздел 7).
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-[12.5px] font-semibold">
          <a href="mailto:support@collabrama.ru" className="text-indigo-600 hover:text-indigo-700">Написать в поддержку</a>
          <a href={`${PUBLIC_PRICING_URL.replace(/\/pricing$/, '')}/landing`} className="text-gray-500 hover:text-gray-700">Вернуться на лендинг</a>
          <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-red-600">
            <LogOut size={14} />Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}
