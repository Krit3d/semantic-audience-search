import { Instagram, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorState, Select, SkeletonLines } from '../../components/kit';
import { Btn, Modal, useToast } from '../../components/ui';
import { ApiError, api, type BrandItem, type InstagramAccountItem } from '../../services/api';
import countryData from '../../../../../config/iso_countries.json';

type CountryItem = { code: string; name_ru: string };
type CountryData = { countries: CountryItem[] };

const COUNTRIES = (countryData as CountryData).countries
  .filter(item => item.code.toLowerCase() !== 'ru')
  .map(item => ({ v: item.code.toLowerCase(), label: `${item.name_ru} (${item.code.toLowerCase()})` }))
  .sort((a, b) => a.label.localeCompare(b.label, 'ru'));

const STATUS_LABELS: Record<InstagramAccountItem['status'], string> = {
  in_queue: 'Проверка...',
  needcheck: 'Проверка ещё идёт, подождите 1 минуту',
  ok: 'Аккаунт подтверждён и активен',
  bad_password: 'Нужен новый пароль',
  rate_limit_error: 'Откройте Instagram и проверьте уведомления',
  not_logged_in: 'Введите резервный или 2FA-код',
  not_logged_in_bad: 'Код неверен. Введите его повторно',
  email_code: 'Проверьте почту, SMS или WhatsApp и введите код',
  error: 'Ошибка проверки аккаунта',
};

const isPolling = (account: InstagramAccountItem) => account.status === 'in_queue' || account.status === 'needcheck';

export default function InstagramAccounts() {
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
      const [accountItems, brandItems] = await Promise.all([api.getInstagramAccounts(), api.getBrands()]);
      setAccounts(accountItems);
      setBrands(brandItems);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить Instagram-аккаунты');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

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
      await api.deleteInstagramAccount(target.id);
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
          <h2 id="instagram-accounts-title" className="m-0 text-[16px] font-extrabold text-ink">Instagram-аккаунты</h2>
          <p className="m-0 text-[12px] text-muted">Аккаунты для диалогов от лица ваших брендов</p>
        </div>
        <Btn size="sm" className="ml-auto !rounded-full" onClick={() => setAddOpen(true)}><Plus size={13} />Добавить Instagram</Btn>
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
              <ul className="m-0 pl-5 text-muted"><li>Сделки, диалоги, история сообщений и сведения об отправителе. Активные сделки с этим аккаунтом будут архивированы с отметкой об удалении.</li></ul>
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

function InstagramAccountCard({ account, brand, onUpdated, onDelete }: {
  account: InstagramAccountItem;
  brand: BrandItem | undefined;
  onUpdated: (account: InstagramAccountItem) => void;
  onDelete: () => void;
}) {
  const [actionOpen, setActionOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const toast = useToast();
  const needsForm = ['bad_password', 'not_logged_in', 'not_logged_in_bad', 'email_code'].includes(account.status);

  const resume = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      onUpdated(await api.resumeInstagramAccount(account.id));
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
        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">billing: {account.billing || '—'}</span>
        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">promo: {account.promo || '—'}</span>
      </div>
      <div className="text-[13px] font-semibold text-body">{STATUS_LABELS[account.status]}</div>
      {account.stuck && (
        <div role="alert" className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12.5px] font-semibold">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />Проверка длится больше 20 минут. Попробуйте повторить позже или обратитесь в поддержку.
        </div>
      )}
      {needsForm && <Btn size="sm" variant="secondary" onClick={() => setActionOpen(true)}>{account.status === 'bad_password' ? 'Изменить пароль' : 'Ввести код'}</Btn>}
      {account.status === 'rate_limit_error' && <Btn size="sm" variant="secondary" disabled={resuming} onClick={() => void resume()}>{resuming ? 'Возобновляем…' : 'Я проверил уведомления'}</Btn>}
      {actionOpen && (
        <InstagramAccountForm
          account={account}
          brands={[]}
          onClose={() => setActionOpen(false)}
          onAdded={updated => { onUpdated(updated); setActionOpen(false); }}
        />
      )}
    </article>
  );
}

function InstagramAccountForm({ account, brands, onClose, onAdded }: {
  account?: InstagramAccountItem;
  brands: BrandItem[];
  onClose: () => void;
  onAdded: (account: InstagramAccountItem) => void;
}) {
  const toast = useToast();
  const [login, setLogin] = useState(account?.login ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [country, setCountry] = useState('');
  const [brandId, setBrandId] = useState(account?.brand_id ? String(account.brand_id) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const passwordRequired = !account || account.status === 'bad_password';
  const codeRequired = Boolean(account && ['not_logged_in', 'not_logged_in_bad', 'email_code'].includes(account.status));

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      const updated = account
        ? await api.confirmInstagramAccount(account.id, {
          ...(password ? { password } : {}),
          ...(code ? { two_factor: code } : {}),
        })
        : await api.addInstagramAccount({
          login: login.trim(),
          password,
          ...(country ? { country } : {}),
          ...(code ? { two_factor: code } : {}),
          ...(brandId ? { brand_id: Number(brandId) } : {}),
        });
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
  const countryOptions = [{ v: '', label: 'Выберите страну' }, ...COUNTRIES];
  const valid = Boolean(account || (login.trim() && password)) && (!passwordRequired || password) && (!codeRequired || code);

  return (
    <Modal onClose={onClose} w="max-w-md">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="m-0 text-[16px] font-collab font-semibold text-ink">{account ? `Подтверждение @${account.login}` : 'Добавить Instagram'}</h2>
        <button type="button" aria-label="Закрыть" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        {!account && (
          <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Логин
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
        {(codeRequired || !account) && (
          <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">2FA или полученный код{!account && ' (необязательно)'}
            <input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" className="h-9 px-3 rounded-lg border border-line text-[13.5px] text-ink outline-none focus:border-brand-400" />
            {fieldError === 'two_factor' && <span className="text-red-600">{error}</span>}
          </label>
        )}
        {!account && (
          <>
            <div className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Страна
              <Select options={countryOptions} value={country} onChange={setCountry} label="Страна" width="100%" size="md" />
              {fieldError === 'country' && <span className="text-red-600">{error}</span>}
            </div>
            <div className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Бренд
              <Select options={brandOptions} value={brandId} onChange={setBrandId} label="Бренд" width="100%" size="md" />
              {fieldError === 'brand_id' && <span className="text-red-600">{error}</span>}
            </div>
          </>
        )}
        {error && !fieldError && <div role="alert" className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12.5px] font-semibold">{error}</div>}
      </div>
      <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
        <Btn variant="secondary" size="sm" onClick={onClose}>Отмена</Btn>
        <Btn size="sm" disabled={!valid || saving} onClick={() => void submit()}>{saving ? 'Отправляем…' : account ? 'Подтвердить' : 'Добавить'}</Btn>
      </div>
    </Modal>
  );
}
