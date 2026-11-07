import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InstagramAccounts from './InstagramAccounts';
import { api, type BrandItem, type InstagramAccountItem } from '../../services/api';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...actual,
    api: {
      getInstagramAccounts: vi.fn(),
      getBrands: vi.fn(),
      addInstagramAccount: vi.fn(),
      confirmInstagramAccount: vi.fn(),
      resumeInstagramAccount: vi.fn(),
      deleteInstagramAccount: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);
const NOW = '2026-11-04T12:00:00Z';

function account(overrides: Partial<InstagramAccountItem> = {}): InstagramAccountItem {
  return {
    id: 7,
    login: 'creator',
    brand_id: 3,
    country: 'de',
    status: 'ok',
    last_error_code: null,
    billing: 'active',
    promo: null,
    remote_status: 'ok',
    action_required: null,
    stuck: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function brand(): BrandItem {
  return {
    id: 3,
    name: 'Brand',
    category: 'Test',
    status: 'Активен',
    hue: 250,
    desc: '',
    deals_count: 0,
    shortlist_count: 0,
    kb: {},
    created_at: NOW,
    updated_at: NOW,
  } as BrandItem;
}

beforeEach(() => {
  mockedApi.getInstagramAccounts.mockResolvedValue([]);
  mockedApi.getBrands.mockResolvedValue([brand()]);
});

describe('InstagramAccounts', () => {
  it('renders empty state', async () => {
    render(<InstagramAccounts />);
    expect(await screen.findByText('Instagram-аккаунтов пока нет')).toBeInTheDocument();
  });

  it('submits add form without exposing secrets', async () => {
    mockedApi.addInstagramAccount.mockResolvedValue(account({ status: 'in_queue' }));
    const user = userEvent.setup();
    render(<InstagramAccounts />);
    await user.click(await screen.findByRole('button', { name: 'Добавить аккаунт' }));
    await user.type(screen.getByLabelText('Логин'), 'creator');
    await user.type(screen.getByLabelText('Пароль'), 'private-password');
    expect(screen.queryByLabelText(/2FA/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    await waitFor(() => expect(mockedApi.addInstagramAccount).toHaveBeenCalledWith({ login: 'creator', password: 'private-password', country: 'us' }));
    expect(screen.queryByDisplayValue('private-password')).not.toBeInTheDocument();
    expect(await screen.findByText('Проверка...')).toBeInTheDocument();
  });

  it('prevents duplicate submission while request is pending', async () => {
    let resolveRequest: ((value: InstagramAccountItem) => void) | undefined;
    mockedApi.addInstagramAccount.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
    const user = userEvent.setup();
    render(<InstagramAccounts />);
    await user.click(await screen.findByRole('button', { name: 'Добавить аккаунт' }));
    await user.type(screen.getByLabelText('Логин'), 'creator');
    await user.type(screen.getByLabelText('Пароль'), 'private-password');
    const submit = screen.getByRole('button', { name: 'Добавить' });
    await user.click(submit);
    expect(screen.getByRole('button', { name: 'Отправляем…' })).toBeDisabled();
    expect(mockedApi.addInstagramAccount).toHaveBeenCalledTimes(1);
    resolveRequest?.(account({ status: 'in_queue' }));
  });

  it('shows code form and sends confirmation', async () => {
    mockedApi.getInstagramAccounts.mockResolvedValue([account({ status: 'not_logged_in_bad', action_required: 'two_factor' })]);
    mockedApi.confirmInstagramAccount.mockResolvedValue(account({ status: 'in_queue' }));
    const user = userEvent.setup();
    render(<InstagramAccounts />);
    await user.click(await screen.findByRole('button', { name: 'Ввести код' }));
    await user.type(screen.getByLabelText('2FA или полученный код'), '123456');
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => expect(mockedApi.confirmInstagramAccount).toHaveBeenCalledWith(7, { two_factor: '123456' }));
  });

  it('warns before deleting the last account', async () => {
    mockedApi.getInstagramAccounts.mockResolvedValue([account()]);
    mockedApi.deleteInstagramAccount.mockResolvedValue({ status: 'deleted', id: 7, login: 'creator', was_last_account: true });
    const user = userEvent.setup();
    render(<InstagramAccounts />);
    await user.click(await screen.findByRole('button', { name: 'Удалить @creator' }));
    expect(screen.getByText('Это последний аккаунт. После удаления у вас не останется Instagram-аккаунтов для новых диалогов.')).toBeInTheDocument();
    expect(screen.getByText(/Сделки, их этапы, диалоги и история сообщений/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await waitFor(() => expect(mockedApi.deleteInstagramAccount).toHaveBeenCalledWith(7));
    expect(await screen.findByText('Instagram-аккаунтов пока нет')).toBeInTheDocument();
  });

  it('polls local backend after sixty seconds and cleans timer', async () => {
    vi.useFakeTimers();
    mockedApi.getInstagramAccounts.mockResolvedValue([account({ status: 'needcheck' })]);
    const view = render(<InstagramAccounts />);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockedApi.getInstagramAccounts).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockedApi.getInstagramAccounts).toHaveBeenCalledTimes(2);
    view.unmount();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockedApi.getInstagramAccounts).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('shows stuck warning', async () => {
    mockedApi.getInstagramAccounts.mockResolvedValue([account({ status: 'needcheck', stuck: true })]);
    render(<InstagramAccounts />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Проверка длится больше 20 минут');
  });
});
