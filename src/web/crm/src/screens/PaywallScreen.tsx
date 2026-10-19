import { useEffect, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { api, type SubscriptionPlanItem } from '../services/api';
import { Btn } from '../components/ui';

const PLAN_TITLES: Record<string, string> = {
  trial: 'Триал',
  basic: 'Базовый',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const FEATURE_TITLES: Record<string, string> = {
  automation_dialogs: 'Автоматизация диалогов',
  automation_contracts: 'Автоматизация договоров',
  automation_marking: 'Автоматизация маркировки',
};

const fmtPrice = (price: string | null): string => {
  if (price === null) return 'Индивидуально';
  const value = Number(price);
  if (!Number.isFinite(value) || value === 0) return '0 ₽';
  return `${value.toLocaleString('ru-RU')} ₽/мес`;
};

function PlanCard({ plan, onPay, paying }: { plan: SubscriptionPlanItem; onPay: (name: string) => void; paying: boolean }) {
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
          {PLAN_TITLES[plan.name] ?? plan.name}
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
          <Btn onClick={() => onPay(plan.name)} disabled={paying}>
            {paying ? 'Переход к оплате…' : 'Оплатить'}
          </Btn>
        )}
      </div>
    </div>
  );
}

export default function PaywallScreen() {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const load = () => {
    setStatus('loading');
    api.getPlans()
      .then(items => { setPlans(items.filter(p => p.name !== 'trial')); setStatus('ready'); })
      .catch(() => setStatus('error'));
  };

  useEffect(load, []);

  const handlePay = (planName: string) => {
    setPaying(true);
    setPayError('');
    api.getCheckoutUrl(planName)
      .then(url => { window.location.href = url; })
      .catch(() => { setPaying(false); setPayError('Не удалось получить ссылку оплаты. Попробуйте ещё раз.'); });
  };

  return (
    <div className="h-full flex items-center justify-center bg-slate-50 overflow-y-auto">
      <div className="max-w-[900px] w-full px-6 py-10 flex flex-col items-center gap-6">
        <div className="text-center">
          <div className="text-[24px] font-extrabold font-display text-gray-900">Подписка не активна</div>
          <div className="text-[13.5px] font-semibold text-gray-400 mt-2">
            Чтобы продолжить работу с CRM, выберите тариф и оплатите доступ. Данные сохранены и никуда не денутся.
          </div>
        </div>
        {status === 'loading' && (
          <div className="text-[13px] font-semibold text-gray-400">Загружаем тарифы…</div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-[13px] font-semibold text-red-400">Не удалось загрузить тарифы</div>
            <Btn variant="ghost" onClick={load}>Повторить</Btn>
          </div>
        )}
        {status === 'ready' && plans.length === 0 && (
          <div className="text-[13px] font-semibold text-gray-400">Тарифы пока не настроены. Напишите в поддержку.</div>
        )}
        {status === 'ready' && plans.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4">
            {plans.map(plan => <PlanCard key={plan.id} plan={plan} onPay={handlePay} paying={paying} />)}
          </div>
        )}
        {payError && <div className="text-[12.5px] font-semibold text-red-400">{payError}</div>}
        <div className="text-[11.5px] font-semibold text-gray-300">
          После оплаты доступ откроется автоматически в течение минуты.
        </div>
        <div className="text-[11.5px] font-medium text-gray-400 text-center max-w-[560px] leading-relaxed">
          Оплата банковской картой через CloudPayments. Подписка продлевается автоматически каждые 31 день,
          отменить можно в любой момент — доступ сохранится до конца оплаченного периода.
          Оплачивая, вы принимаете{' '}
          <a href="/legal/offer.html" target="_blank" rel="noopener" className="text-indigo-500 underline underline-offset-2">Публичную оферту</a>
          {' '}(порядок возврата — раздел 7).
        </div>
      </div>
    </div>
  );
}
