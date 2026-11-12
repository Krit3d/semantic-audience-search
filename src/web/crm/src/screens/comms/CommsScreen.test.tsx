import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommsScreen from './CommsScreen';
import { api, type CommunicationAccountAvailability } from '../../services/api';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...actual,
    api: {
      getCommunicationAccountAvailability: vi.fn(),
      getCommunications: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

function availability(overrides: Partial<CommunicationAccountAvailability> = {}): CommunicationAccountAvailability {
  return {
    total_accounts: 1,
    working_accounts: 0,
    has_working_account: false,
    ...overrides,
  };
}

function renderScreen() {
  return render(<CommsScreen deals={[]} user={null} onOpenSettings={vi.fn()} />);
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), writable: true });
  mockedApi.getCommunications.mockResolvedValue([]);
});

describe('CommsScreen Instagram availability', () => {
  it('keeps history read-only while the only account is being verified', async () => {
    mockedApi.getCommunicationAccountAvailability.mockResolvedValue(availability());
    renderScreen();

    expect(await screen.findByText('Не добавлен ни один Instagram-аккаунт. История сообщений доступна только для просмотра.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Не добавлен ни один Instagram-аккаунт')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Instagram-аккаунты не добавлены' })).toBeInTheDocument();
  });

  it('enables messaging only after a working account is confirmed', async () => {
    mockedApi.getCommunicationAccountAvailability.mockResolvedValue(availability({ working_accounts: 1, has_working_account: true }));
    renderScreen();

    await screen.findByText('Нет активных чатов');
    expect(screen.queryByText('Не добавлен ни один Instagram-аккаунт. История сообщений доступна только для просмотра.')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Сообщение для …')).toBeEnabled();
  });
});
