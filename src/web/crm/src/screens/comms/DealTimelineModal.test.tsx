import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DealTimelineModal from './DealTimelineModal';
import { api, type ChannelIdentityItem, type DealActivityItem } from '../../services/api';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...actual,
    api: {
      getDealTimeline: vi.fn(),
      getDealChannels: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);
const NOW = '2026-11-06T12:00:00Z';

function activity(overrides: Partial<DealActivityItem> = {}): DealActivityItem {
  return {
    id: 2,
    event_type: 'channel_replaced',
    description: 'Канал заменён, этап сохранён',
    thread_id: 20,
    channel_identity_id: 10,
    message_id: null,
    from_stage: null,
    to_stage: null,
    created_at: NOW,
    ...overrides,
  };
}

function channel(overrides: Partial<ChannelIdentityItem> = {}): ChannelIdentityItem {
  return {
    id: 10,
    sender_account_id: 5,
    sender_login: 'new_account',
    platform: 'instagram',
    status: 'active',
    replaced_by_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  mockedApi.getDealTimeline.mockResolvedValue([
    activity(),
    activity({ id: 1, event_type: 'message', description: 'Старое сообщение', channel_identity_id: 9 }),
  ]);
  mockedApi.getDealChannels.mockResolvedValue([
    channel(),
    channel({ id: 9, sender_login: 'old_account', status: 'replaced', replaced_by_id: 10 }),
  ]);
});

describe('DealTimelineModal', () => {
  it('loads the shared timeline and filters events by channel', async () => {
    const user = userEvent.setup();
    render(<DealTimelineModal dealId={7} dealTitle="Кампания" onClose={vi.fn()} />);

    expect(await screen.findByText('Канал заменён, этап сохранён')).toBeInTheDocument();
    expect(mockedApi.getDealTimeline).toHaveBeenCalledWith(7, { limit: 100 });
    expect(mockedApi.getDealChannels).toHaveBeenCalledWith(7);

    await user.click(screen.getByRole('button', { name: 'instagram @old_account' }));
    expect(screen.getByText('Старое сообщение')).toBeInTheDocument();
    expect(screen.queryByText('Канал заменён, этап сохранён')).not.toBeInTheDocument();
  });

  it('requests older activities with keyset pagination', async () => {
    mockedApi.getDealTimeline.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => activity({ id: 101 - index })));
    mockedApi.getDealTimeline.mockResolvedValueOnce([activity({ id: 1, description: 'Самое раннее событие' })]);
    const user = userEvent.setup();
    render(<DealTimelineModal dealId={7} dealTitle="Кампания" onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Показать более ранние события' }));
    expect(mockedApi.getDealTimeline).toHaveBeenLastCalledWith(7, { beforeId: 2, limit: 100 });
    expect(await screen.findByText('Самое раннее событие')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    mockedApi.getDealTimeline.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    render(<DealTimelineModal dealId={7} dealTitle="Кампания" onClose={vi.fn()} />);

    expect(await screen.findByText('Не удалось загрузить историю сделки')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /повтор/i }));
    expect(await screen.findByText('Канал заменён, этап сохранён')).toBeInTheDocument();
  });
});
