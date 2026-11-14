import { Instagram, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorState, Select, SkeletonLines } from '../../components/kit';
import { Btn, Modal, useToast } from '../../components/ui';
import { ApiError, api, type BrandItem, type InstagramAccountItem } from '../../services/api';

const COUNTRIES = [
  { v: 'at', label: 'Австрия (Austria)' },
  { v: 'az', label: 'Азербайджан (Azerbaijan)' },
  { v: 'by', label: 'Беларусь (Belarus)' },
  { v: 'bg', label: 'Болгария (Bulgaria)' },
  { v: 'br', label: 'Бразилия (Brazil)' },
  { v: 'gb', label: 'Великобритания (United Kingdom)' },
  { v: 'hu', label: 'Венгрия (Hungary)' },
  { v: 've', label: 'Венесуэла (Venezuela)' },
  { v: 'vn', label: 'Вьетнам (Vietnam)' },
  { v: 'de', label: 'Германия (Germany)' },
  { v: 'gr', label: 'Греция (Greece)' },
  { v: 'ge', label: 'Грузия (Georgia)' },
  { v: 'dk', label: 'Дания (Denmark)' },
  { v: 'il', label: 'Израиль (Israel)' },
  { v: 'id', label: 'Индонезия (Indonesia)' },
  { v: 'es', label: 'Испания (Spain)' },
  { v: 'it', label: 'Италия (Italy)' },
  { v: 'kz', label: 'Казахстан (Kazakhstan)' },
  { v: 'ca', label: 'Канада (Canada)' },
  { v: 'ke', label: 'Кения (Kenya)' },
  { v: 'cy', label: 'Кипр (Cyprus)' },
  { v: 'kg', label: 'Киргизия (Kyrgyzstan)' },
  { v: 'lv', label: 'Латвия (Latvia)' },
  { v: 'lt', label: 'Литва (Lithuania)' },
  { v: 'md', label: 'Молдова (Moldova)' },
  { v: 'nl', label: 'Нидерланды (Netherlands)' },
  { v: 'no', label: 'Норвегия (Norway)' },
  { v: 'ae', label: 'ОАЭ (United Arab Emirates)' },
  { v: 'pl', label: 'Польша (Poland)' },
  { v: 'pt', label: 'Португалия (Portugal)' },
  { v: 'ro', label: 'Румыния (Romania)' },
  { v: 'us', label: 'США (United States)' },
  { v: 'rs', label: 'Сербия (Serbia)' },
  { v: 'th', label: 'Таиланд (Thailand)' },
  { v: 'tr', label: 'Турция (Turkey)' },
  { v: 'uz', label: 'Узбекистан (Uzbekistan)' },
  { v: 'ua', label: 'Украина (Ukraine)' },
  { v: 'fi', label: 'Финляндия (Finland)' },
  { v: 'fr', label: 'Франция (France)' },
  { v: 'cz', label: 'Чехия (Czech Republic)' },
  { v: 'ch', label: 'Швейцария (Switzerland)' },
  { v: 'se', label: 'Швеция (Sweden)' },
  { v: 'ee', label: 'Эстония (Estonia)' },
  { v: 'kr', label: 'Южная Корея (South Korea)' },
];

const STATUS_LABELS: Record<InstagramAccountItem['status'], string> = {
  in_queue: 'Проверка...',
  needcheck: 'Проверка ещё идёт, подождите 1 минуту',
  ok: 'Аккаунт подтверждён и активен',
  bad_password: 'Instagram не подтвердил вход. Можно повторить с сохранёнными данными.',
  rate_limit_error: 'Откройте Instagram и проверьте уведомления',
  not_logged_in: 'Введите резервный или 2FA-код',
  not_logged_in_bad: 'Код неверен. Введите его повторно',
  email_code: 'Проверьте почту, SMS или WhatsApp и введите код',
  error: 'Ошибка проверки аккаунта',
};

const isPolling = (account: InstagramAccountItem) => account.status === 'in_queue' || account.status === 'needcheck';

const getDefaultCountry = (): string => {
  const region = new Intl.Locale(navigator.language).region?.toLowerCase();
  return region && region !== 'ru' && COUNTRIES.some(item => item.v === region) ? region : 'us';
};

export default function InstagramAccounts({ brandId }: { brandId?: number }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<InstagramAccountItem[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<InstagramAccountItem | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [accountItems, brandItems] = await Promise.all([api.getInstagramAccounts(brandId), api.getBrands()]);
      setAccounts(accountItems);
      setBrands(brandItems);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить аккаунты');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!accounts.some(isPolling)) return;
    const timer = window.setTimeout(() => { void load(true); }, 60_000);
    return () => window.clearTimeout(timer);
  }, [accounts, load]);

  const replaceAccount = (updated: InstagramAccountItem) => {
    setAccounts(current => current.map(item => item.id === updated.id ? updated : item));
  };

  const removeAccount = async () => {
    if (!deleting || deleteSaving) return;
    const target = deleting;
    setDeleteSaving(true);
    try {
      if (brandId) await api.deleteInstagramAccount(target.id, brandId);
      else await api.deleteInstagramAccount(target.id);
      setAccounts(current => current.filter(item => item.id !== target.id));
      setDeleting(null);
      toast('info', `Аккаунт @${target.login} удалён`);
    } catch (reason: unknown) {
      toast('err', reason instanceof Error ? reason.message : 'Не удалось удалить аккаунт');
    } finally {
      setDeleteSaving(false);
    }
  };

  return (
    <section aria-labelledby="instagram-accounts-title" className="bg-white border border-line rounded-[14px] overflow-hidden">
      <div className="px-4 pt-3.5 flex flex-wrap items-center gap-2">
        <span className="w-9 h-9 rounded-[10px] bg-violet-50 text-violet-600 flex items-center justify-center"><Instagram size={18} /></span>
        <div className="min-w-0">
          <h2 id="instagram-accounts-title" className="m-0 text-[16px] font-extrabold text-ink">Настройки аккаунтов</h2>
          <p className="m-0 text-[12px] text-muted">Пул аккаунтов бренда · автоматическая ротация</p>
        </div>
        <Btn size="sm" className="ml-auto !rounded-full" onClick={() => setAddOpen(true)}><Plus size={13} />Добавить аккаунт</Btn>
      </div>
      <div className="p-4">
        {loading && <SkeletonLines rows={4} />}
        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
        {!loading && !error && accounts.length === 0 && (
          <Empty title="Instagram-аккаунтов пока нет" text="Подключите аккаунт, чтобы вести диалоги с авторами от лица бренда" />
        )}
        {!loading && !error && accounts.length > 0 && (
          <div className="flex flex-col gap-3">
            {accounts.map(account => (
              <InstagramAccountCard
                key={account.id}
                account={account}
                brand={brands.find(item => item.id === account.brand_id)}
                brandId={brandId}
                onUpdated={replaceAccount}
                onDelete={() => setDeleting(account)}
              />
            ))}
          </div>
        )}
      </div>
      {addOpen && (
        <InstagramAccountForm
          brands={brands}
          fixedBrandId={brandId}
          onClose={() => setAddOpen(false)}
          onAdded={account => {
            setAccounts(current => [...current, account]);
            setAddOpen(false);
          }}
        />
      )}
      {deleting && (
        <Modal onClose={() => setDeleting(null)} w="max-w-md">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h2 className="m-0 text-[16px] font-collab font-semibold text-ink">Удалить Instagram-аккаунт?</h2>
            <button type="button" aria-label="Закрыть" onClick={() => setDeleting(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3 text-[13px] leading-relaxed">
            <p className="m-0 font-bold text-ink">Вы точно хотите удалить @{deleting.login}?</p>
            {accounts.length === 1 && <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 font-semibold">Это последний аккаунт. После удаления у вас не останется Instagram-аккаунтов для новых диалогов.</div>}
            <div>
              <div className="font-bold text-ink mb-1">Будет удалено:</div>
              <ul className="m-0 pl-5 text-muted"><li>Подключение к Bridgit, сохранённый пароль и возможность отправлять новые сообщения с этого аккаунта.</li></ul>
            </div>
            <div>
              <div className="font-bold text-ink mb-1">Останется:</div>
              <ul className="m-0 pl-5 text-muted"><li>Сделки, их этапы, диалоги и история сообщений. Если в пуле есть другой рабочий аккаунт, канал будет заменён автоматически.</li></ul>
            </div>
          </div>
          <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
            <Btn variant="secondary" size="sm" disabled={deleteSaving} onClick={() => setDeleting(null)}>Отмена</Btn>
            <Btn size="sm" disabled={deleteSaving} onClick={() => void removeAccount()}>{deleteSaving ? 'Удаляем…' : 'Удалить аккаунт'}</Btn>
          </div>
        </Modal>
      )}
    </section>
  );
}

function InstagramAccountCard({ account, brand, brandId, onUpdated, onDelete }: {
  account: InstagramAccountItem;
  brand: BrandItem | undefined;
  brandId?: number;
  onUpdated: (account: InstagramAccountItem) => void;
  onDelete: () => void;
}) {
  const [actionOpen, setActionOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const toast = useToast();
  const needsForm = ['not_logged_in', 'not_logged_in_bad', 'email_code'].includes(account.status);

  const reset = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      onUpdated(brandId
        ? await api.resetInstagramAccount(account.id, brandId)
        : await api.resetInstagramAccount(account.id));
    } catch (reason: unknown) {
      toast('err', reason instanceof Error ? reason.message : 'Не удалось начать подключение заново');
    } finally {
      setResuming(false);
    }
  };

  const resume = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      onUpdated(brandId
        ? await api.resumeInstagramAccount(account.id, brandId)
        : await api.resumeInstagramAccount(account.id));
    } catch (reason: unknown) {
      toast('err', reason instanceof Error ? reason.message : 'Не удалось возобновить проверку');
    } finally {
      setResuming(false);
    }
  };

  return (
    <article className="p-3.5 rounded-[14px] border border-line bg-white flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><Instagram size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-ink">@{account.login}</div>
          <div className="text-[12px] text-muted">{brand ? `Бренд: ${brand.name}` : 'Бренд не назначен'}</div>
        </div>
        <button type="button" aria-label={`Удалить @${account.login}`} onClick={onDelete} className="w-9 h-9 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 flex items-center justify-center"><Trash2 size={16} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
        <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700">{account.platform ?? 'instagram'} · {account.provider ?? 'bridgit'} · {account.rotation_enabled === false ? 'вне ротации' : 'в ротации'}</span>
        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">billing: {account.billing || '—'}</span>
        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">promo: {account.promo || '—'}</span>
      </div>
      <div className="text-[13px] font-semibold text-body">{STATUS_LABELS[account.status]}</div>
      {account.stuck && (
        <div role="alert" className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12.5px] font-semibold">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />Проверка длится больше 20 минут. Начните подключение заново — пароль повторно вводить не нужно.
        </div>
      )}
      {account.status === 'bad_password' && (
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" disabled={resuming} onClick={() => void reset()}>{resuming ? 'Начинаем заново…' : 'Начать подключение заново'}</Btn>
          <Btn size="sm" variant="secondary" onClick={() => setActionOpen(true)}>Изменить пароль</Btn>
        </div>
      )}
      {account.stuck && account.status !== 'bad_password' && <Btn size="sm" disabled={resuming} onClick={() => void reset()}>{resuming ? 'Начинаем заново…' : 'Начать подключение заново'}</Btn>}
      {needsForm && <Btn size="sm" variant="secondary" onClick={() => setActionOpen(true)}>Ввести код</Btn>}
      {account.status === 'rate_limit_error' && <Btn size="sm" variant="secondary" disabled={resuming} onClick={() => void resume()}>{resuming ? 'Возобновляем…' : 'Я проверил уведомления'}</Btn>}
      {actionOpen && (
        <InstagramAccountForm
          account={account}
          brands={[]}
          fixedBrandId={brandId}
          onClose={() => setActionOpen(false)}
          onAdded={updated => { onUpdated(updated); setActionOpen(false); }}
        />
      )}
    </article>
  );
}

function InstagramAccountForm({ account, brands, fixedBrandId, onClose, onAdded }: {
  account?: InstagramAccountItem;
  brands: BrandItem[];
  fixedBrandId?: number;
  onClose: () => void;
  onAdded: (account: InstagramAccountItem) => void;
}) {
  const toast = useToast();
  const [login, setLogin] = useState(account?.login ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [country, setCountry] = useState(getDefaultCountry);
  const [brandId, setBrandId] = useState(String(account?.brand_id ?? fixedBrandId ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const passwordRequired = !account || account.status === 'bad_password';
  const codeRequired = Boolean(account && ['not_logged_in', 'not_logged_in_bad', 'email_code'].includes(account.status));

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      const confirmation = {
        ...(password ? { password } : {}),
        ...(code ? { two_factor: code } : {}),
      };
      const creation = {
        login: login.trim(),
        password,
        ...(country ? { country } : {}),
        ...(code.trim() ? { two_factor: code.trim() } : {}),
        ...(brandId ? { brand_id: Number(brandId) } : {}),
      };
      const updated = account
        ? (fixedBrandId
          ? await api.confirmInstagramAccount(account.id, confirmation, fixedBrandId)
          : await api.confirmInstagramAccount(account.id, confirmation))
        : (fixedBrandId
          ? await api.addInstagramAccount(creation, fixedBrandId)
          : await api.addInstagramAccount(creation));
      setPassword('');
      setCode('');
      onAdded(updated);
    } catch (reason: unknown) {
      setPassword('');
      setCode('');
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить аккаунт');
      if (reason instanceof ApiError) setFieldError(reason.field ?? null);
    } finally {
      setSaving(false);
    }
  };

  const brandOptions = [{ v: '', label: 'Без бренда' }, ...brands.map(item => ({ v: String(item.id), label: item.name }))];
  const valid = Boolean(account || (login.trim() && password)) && (!passwordRequired || password) && (!codeRequired || code);

  return (
    <>
      <Modal onClose={onClose} w="max-w-md">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h2 className="m-0 text-[16px] font-collab font-semibold text-ink">{account ? `Подтверждение @${account.login}` : 'Добавить Instagram'}</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          {!account && (
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Логин Instagram (юзернейм)
              <input value={login} onChange={event => setLogin(event.target.value)} autoFocus autoComplete="username" className="h-9 px-3 rounded-lg border border-line text-[13.5px] text-ink outline-none focus:border-brand-400" />
              {fieldError === 'login' && <span className="text-red-600">{error}</span>}
            </label>
          )}
          {(!account || passwordRequired || codeRequired) && (
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">{account ? `Новый пароль${passwordRequired ? '' : ' (необязательно)'}` : 'Пароль'}
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" className="h-9 px-3 rounded-lg border border-line text-[13.5px] text-ink outline-none focus:border-brand-400" />
              {fieldError === 'password' && <span className="text-red-600">{error}</span>}
            </label>
          )}
          {!account && (
            <>
              <div className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Страна прокси
                <Select options={COUNTRIES} value={country} onChange={setCountry} label="Страна прокси" width="100%" size="md" />
                <p className="m-0 text-[12px] font-normal leading-relaxed text-muted">Можно выбрать страну входа, например, ту же, что у вашего VPN. Если нужной страны нет — выберите Беларусь</p>
                {fieldError === 'country' && <span className="text-red-600">{error}</span>}
              </div>
              {!fixedBrandId && <div className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Бренд
                <Select options={brandOptions} value={brandId} onChange={setBrandId} label="Бренд" width="100%" size="md" />
                {fieldError === 'brand_id' && <span className="text-red-600">{error}</span>}
              </div>}
            </>
          )}
          {(codeRequired || !account) && (
            <div className="flex flex-col gap-1">
              <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Код 2FA (резервный)
                <input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" className="h-9 px-3 rounded-lg border border-line text-[13.5px] text-ink outline-none focus:border-brand-400" />
              </label>
              <p className="m-0 text-[12px] leading-relaxed text-muted">Если у вас включена двухфакторная авторизация — введите один из резервных кодов. <button type="button" onClick={() => setVideoOpen(true)} className="font-bold text-ink underline underline-offset-2 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-400">Где взять резервный код?</button> Если 2FA не включена — оставьте поле пустым.</p>
              {fieldError === 'two_factor' && <span className="text-[11.5px] font-semibold text-red-600">{error}</span>}
            </div>
          )}
          {error && !fieldError && <div role="alert" className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12.5px] font-semibold">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <Btn variant="secondary" size="sm" onClick={onClose}>Отмена</Btn>
          <Btn size="sm" disabled={!valid || saving} onClick={() => void submit()}>{saving ? 'Отправляем…' : account ? 'Подтвердить' : 'Добавить'}</Btn>
        </div>
      </Modal>
      {videoOpen && (
        <Modal onClose={() => setVideoOpen(false)} w="max-w-2xl">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h2 className="m-0 text-[16px] font-collab font-semibold text-ink">Где взять резервный код?</h2>
            <button type="button" aria-label="Закрыть видео" onClick={() => setVideoOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <video className="w-full max-h-[75vh] bg-black" controls autoPlay playsInline preload="metadata" aria-label="Инструкция: где взять резервный код Instagram" src="/instructions/instagram-2fa-backup-code.mp4" />
        </Modal>
      )}
    </>
  );
}
