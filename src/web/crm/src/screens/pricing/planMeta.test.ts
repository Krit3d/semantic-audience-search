import { describe, expect, it } from 'vitest';
import { planLimits } from './planMeta';
import type { SubscriptionPlanItem } from '../../services/api';

function plan(name: string, limits: Record<string, number>): SubscriptionPlanItem {
  return {
    id: 1,
    name,
    price: '0',
    period_days: 31,
    is_active: true,
    is_custom: false,
    limits,
    features: {},
  };
}

describe('planLimits', () => {
  it('shows all tariff limits with Russian labels', () => {
    expect(planLimits(plan('basic', { brand_limit: 2, instagram_account_limit: 3, dialogs_monthly_limit: 350 }))).toEqual([
      'Брендов в базе знаний: 2',
      'Instagram-аккаунтов для связи: 3',
      'Диалогов с авторами в месяц: 350',
    ]);
    expect(planLimits(plan('pro', { brand_limit: 5, instagram_account_limit: 10, dialogs_monthly_limit: 1000 }))).toEqual([
      'Брендов в базе знаний: 5',
      'Instagram-аккаунтов для связи: 10',
      'Диалогов с авторами в месяц: 1000',
    ]);
  });
});
