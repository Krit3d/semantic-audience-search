import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DealsScreen from './DealsScreen';
import type { Deal } from '../../data';
import {
  api,
  type AutoOutreachPreview,
  type AutoOutreachRunResult,
  type BrandItem,
} from '../../services/api';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...actual,
    api: {
      getShortlist: vi.fn(),
      getBrands: vi.fn(),
      previewAutoOutreach: vi.fn(),
      runAutoOutreach: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

const brand: BrandItem = {
  id: 5,
  name: 'Luma',
  category: 'Косметика',
  status: 'Активен',
  hue: 235,
  desc: 'Уходовая косметика',
  deals_count: 1,
  shortlist_count: 0,
  kb: {
    short: 'Мягкий уход',
    products: [],
    usp: [],
    allowed: [],
    forbidden: [],
    mentions: [],
    pay_types: [],
    requisites: {},
    logo_url: '',
    product_url: '',
    sku: '',
    gallery: [],
  },
  created_at: '2026-11-14T12:00:00Z',
  updated_at: '2026-11-14T12:00:00Z',
};

const deal: Deal = {
  id: '21',
  title: 'Интеграция',
  brandId: 'Luma',
  authorId: '31',
  budget: 0,
  type: 'Reels',
  stage: 1,
  date: '14.11.2026',
  pubDate: '',
  msgs: [],
  desc: '',
  terms: '',
  exclusive: false,
  edits: 0,
  authorSummary: {
    id: '31',
    platform: 'INSTAGRAM',
    username: 'author',
    title: 'Автор',
    subscribers_count: 10000,
    static_avg_er: 4.2,
    category_path: 'Fashion',
  },
};

const preview: AutoOutreachPreview = {
  brand_id: 5,
  brand_name: 'Luma',
  total_deals: 1,
  eligible_count: 1,
  already_contacted_count: 0,
  unsupported_count: 0,
  accounts: [{ id: 7, login: 'sender', brand_id: 5 }],
};

const runResult: AutoOutreachRunResult = {
  queued_count: 1,
  skipped_count: 0,
  failed_count: 0,
  results: [],
};

function renderScreen(onFinished = vi.fn()) {
  render(<DealsScreen
    deals={[deal]}
    dealsStatus="ready"
    onRetryDeals={onFinished}
    setDeals={vi.fn()}
    onOpenDeal={vi.fn()}
    onNewDeal={vi.fn()}
    onOpenComms={vi.fn()}
  />);
  return onFinished;
}

beforeEach(() => {
  mockedApi.getShortlist.mockResolvedValue([]);
  mockedApi.getBrands.mockResolvedValue([brand]);
  mockedApi.previewAutoOutreach.mockResolvedValue(preview);
  mockedApi.runAutoOutreach.mockResolvedValue(runResult);
});

describe('DealsScreen automatic outreach', () => {
  it('requires brand selection and confirmation before starting', async () => {
    const user = userEvent.setup();
    const onFinished = renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Автоаутрич' }));
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    expect(mockedApi.runAutoOutreach).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Luma/ }));
    expect(await screen.findByText('@sender')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(screen.getByText('Вы уверены, что хотите разослать приветственные сообщения?')).toBeInTheDocument();
    expect(mockedApi.runAutoOutreach).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Подтвердить и отправить' }));

    expect(mockedApi.previewAutoOutreach).toHaveBeenCalledWith(5);
    expect(mockedApi.runAutoOutreach).toHaveBeenCalledWith(5);
    expect(await screen.findByText('Обработка завершена')).toBeInTheDocument();
    expect(onFinished).toHaveBeenCalled();
  });
});
