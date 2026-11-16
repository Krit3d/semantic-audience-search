import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DealPanel from './DealPanel';
import type { Deal } from '../data';
import { api } from '../services/api';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      getBrands: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

function makeDeal(stage: number): Deal {
  return {
    id: '21',
    title: 'Автор · интеграция',
    brandId: 'Luma',
    authorId: '31',
    budget: 0,
    type: 'Пост',
    stage,
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
}

function renderPanel(stage: number) {
  const deal = makeDeal(stage);
  return render(<DealPanel
    deal={deal}
    deals={[deal]}
    onClose={vi.fn()}
    onUpdate={vi.fn()}
    onOpenKB={vi.fn()}
    onGenerateContract={vi.fn()}
    onRepeat={vi.fn()}
    onOpenDeal={vi.fn()}
  />);
}

beforeEach(() => {
  mockedApi.getBrands.mockResolvedValue([]);
});

describe('DealPanel progress', () => {
  it('does not mark work stages complete for a shortlist deal', () => {
    const { container } = renderPanel(7);

    expect(container.querySelectorAll('.lucide-check')).toHaveLength(0);
    expect(screen.getByText('Сделка находится в шорт-листе. Рабочие этапы ещё не начались.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Создать повторную сделку' })).not.toBeInTheDocument();
  });

  it('keeps normal progress for a completed work deal', () => {
    const { container } = renderPanel(6);

    expect(container.querySelectorAll('.lucide-check')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Создать повторную сделку' })).toBeInTheDocument();
  });
});
