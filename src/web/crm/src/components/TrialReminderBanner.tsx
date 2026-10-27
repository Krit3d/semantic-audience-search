import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { api, type SubscriptionStatusInfo } from '../services/api';

const DAY_MS = 24 * 60 * 60 * 1000;

function remainingLabel(days: number): string {
  if (days === 1) return 'Остался 1 день';
  if (days === 2) return 'Осталось 2 дня';
  return `Осталось ${days} дня`;
}

export default function TrialReminderBanner({ onOpenPricing }: { onOpenPricing: () => void }) {
  const [subscription, setSubscription] = useState<SubscriptionStatusInfo | null>(null);

  useEffect(() => {
    let active = true;
    api.getSubscription()
      .then(value => { if (active) setSubscription(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!subscription?.is_active || subscription.status !== 'trial' || !subscription.expires_at) return null;
  const remainingMs = new Date(subscription.expires_at).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0 || remainingMs > 3 * DAY_MS) return null;

  const days = Math.max(1, Math.ceil(remainingMs / DAY_MS));
  const expires = new Date(subscription.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

  return (
    <div role="status" className="shrink-0 bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center">
      <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-amber-900">
        <Clock3 size={15} className="shrink-0 text-amber-600" />
        Пробный период заканчивается {expires}. {remainingLabel(days)} — данные и доступ сохранятся после оформления подписки.
      </span>
      <button type="button" onClick={onOpenPricing}
        className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-amber-800 transition-colors">
        Выбрать тариф
      </button>
    </div>
  );
}
