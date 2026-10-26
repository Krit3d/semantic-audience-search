import type { SubscriptionPlanItem } from '../../services/api';

export const PLAN_TITLES: Record<string, string> = {
  trial: 'Триал',
  basic: 'Базовый',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export const PLAN_DESCRIPTIONS: Record<string, string> = {
  trial: 'Познакомьтесь с CRM без оплаты и без привязки карты.',
  basic: 'Для небольших команд, которые ведут сделки с авторами в одном месте.',
  pro: 'Для агентств и брендов с регулярными кампаниями и автоматизацией.',
  enterprise: 'Индивидуальные условия, объёмы и сопровождение.',
};

export const FEATURE_TITLES: Record<string, string> = {
  automation_dialogs: 'Автоматизация диалогов',
  automation_contracts: 'Автоматизация договоров',
  automation_marking: 'Автоматизация маркировки',
};

export const LIMIT_TITLES: Record<string, string> = {
  brand_limit: 'Брендов в базе знаний',
  dialogs_monthly_limit: 'Диалогов в месяц',
};

/** Подписка в целом даёт доступ ко всем разделам CRM — это важно показывать явно. */
export const SUBSCRIPTION_INCLUDES: string[] = [
  'Шорт-лист и сделки: канбан от первого касания до публикации',
  'Коммуникации с авторами и история переписки',
  'Аналитика кампаний и авторов',
  'Моя база авторов с карточками и контактами',
  'Реестр маркировки рекламы и документы по сделкам',
];

export const planTitle = (name: string): string => PLAN_TITLES[name] ?? name;

export const fmtPrice = (price: string | null): string => {
  if (price === null) return 'Индивидуально';
  const value = Number(price);
  if (!Number.isFinite(value) || value === 0) return '0 ₽';
  return `${value.toLocaleString('ru-RU')} ₽`;
};

export const fmtPeriod = (periodDays: number): string => {
  if (periodDays === 30 || periodDays === 31) return 'в месяц';
  if (periodDays === 14) return 'за 14 дней';
  if (periodDays % 10 === 1 && periodDays % 100 !== 11) return `за ${periodDays} день`;
  if ([2, 3, 4].includes(periodDays % 10) && ![12, 13, 14].includes(periodDays % 100)) return `за ${periodDays} дня`;
  return `за ${periodDays} дней`;
};

export const planLimits = (plan: SubscriptionPlanItem): string[] =>
  Object.entries(plan.limits ?? {})
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .map(([key, value]) => `${LIMIT_TITLES[key] ?? key}: ${value}`);

export const planIncludedFeatures = (plan: SubscriptionPlanItem): string[] =>
  Object.entries(plan.features ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => FEATURE_TITLES[key] ?? key);

export const planExcludedFeatures = (plan: SubscriptionPlanItem): string[] =>
  Object.entries(plan.features ?? {})
    .filter(([, enabled]) => !enabled)
    .map(([key]) => FEATURE_TITLES[key] ?? key);
