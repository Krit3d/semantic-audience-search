import { useEffect, useState, type FormEvent } from 'react';
import { Zap, Mail, Lock, Eye, EyeOff, LogIn, UserPlus, AlertTriangle, KeyRound, CheckCircle2 } from 'lucide-react';
import { api, legalUrl, oauthStartUrl, type OAuthProviders } from '../services/api';
import { Btn, Field, inputCls, Tabs } from './ui';

const OAUTH_ERRORS: Record<string, string> = {
  provider_denied: 'Вы отменили вход через внешний сервис',
  missing_code: 'Сервис авторизации не вернул код подтверждения',
  state_expired: 'Сессия входа истекла. Попробуйте ещё раз',
  state_mismatch: 'Ошибка проверки безопасности входа. Попробуйте ещё раз',
  exchange_failed: 'Не удалось завершить вход через внешний сервис',
  email_required: 'Внешний сервис не передал email. Разрешите доступ к почте или войдите по email',
  account_disabled: 'Учётная запись деактивирована',
};

function readOAuthError(): string {
  const sources = [window.location.search, window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?')) : ''];
  for (const src of sources) {
    const code = new URLSearchParams(src).get('oauth_error');
    if (code) return OAUTH_ERRORS[code] ?? 'Не удалось выполнить вход. Попробуйте ещё раз';
  }
  return '';
}

function getRedirectTarget(): string | null {
  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = searchParams.get('redirect');
  if (fromSearch) return fromSearch;
  const hash = window.location.hash;
  if (hash.includes('?')) {
    const hashParams = new URLSearchParams(hash.substring(hash.indexOf('?')));
    const fromHash = hashParams.get('redirect');
    if (fromHash) return fromHash;
  }
  return null;
}

export default function LoginModal({ onLogin }: { onLogin: (user: Record<string, unknown>) => void }) {
  const trialIntent = new URLSearchParams(window.location.search).get('intent') === 'trial';
  const [mode, setMode] = useState<'login' | 'register'>(trialIntent ? 'register' : 'login');
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(readOAuthError);
  const [busy, setBusy] = useState(false);
  const [consentPdn, setConsentPdn] = useState(false);
  const [consentAds, setConsentAds] = useState(false);
  const [providers, setProviders] = useState<OAuthProviders>({ vk: false, yandex: false });

  useEffect(() => {
    let active = true;
    api.getOAuthProviders()
      .then(p => { if (active) setProviders(p); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const submitForgot = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Введите email');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.forgotPassword(trimmed);
      setForgotSent(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Не удалось отправить письмо. Попробуйте позже');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Введите email и пароль');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setError('Пароль должен содержать не менее 8 символов');
      return;
    }
    if (mode === 'register' && !consentPdn) {
      setError('Для регистрации необходимо согласие на обработку персональных данных');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = mode === 'register'
        ? await api.register(trimmed, password, name.trim() || undefined)
        : await api.login(trimmed, password);
      const redirectTarget = getRedirectTarget();
      if (redirectTarget) {
        const target = new URL(redirectTarget, window.location.origin);
        target.searchParams.set('session_token', data.token);
        if (data.user?.id != null) target.searchParams.set('user_id', String(data.user.id));
        if (data.user?.email != null) target.searchParams.set('user_email', String(data.user.email));
        window.location.href = target.toString();
        return;
      }
      if (trialIntent) {
        // Если триал уже использован или подписка активна, API вернёт 409:
        // после входа пользователь увидит актуальное состояние доступа.
        await api.activateTrial().catch(() => undefined);
      }
      onLogin(data.user);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Не удалось выполнить операцию. Проверьте подключение к серверу');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-gray-900 overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center gap-3 mb-8">
            <span className="w-11 h-11 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30"><Zap size={22} /></span>
            <div>
              <div className="text-[19px] font-extrabold font-display text-gray-900 leading-none">Collabrama CRM</div>
              <div className="text-[11px] font-medium text-gray-400 mt-1">CRM для работы с авторами</div>
            </div>
          </div>

          {forgot ? (
            <form onSubmit={submitForgot} className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 flex flex-col gap-4">
              <div>
                <h1 className="text-[17px] font-bold text-gray-900">Восстановление доступа</h1>
                <p className="text-[12.5px] font-medium text-gray-400 mt-1">Пришлём ссылку для установки нового пароля</p>
              </div>

              {forgotSent ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-700">
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                  Если аккаунт с такой почтой существует, мы отправили письмо со ссылкой для сброса пароля. Ссылка действует 1 час.
                </div>
              ) : (
                <>
                  <Field label="Email">
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                      <input className={inputCls + ' !pl-9'} type="email" autoComplete="email" autoFocus
                        placeholder="you@company.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} />
                    </div>
                  </Field>

                  {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-600">
                      <AlertTriangle size={15} className="shrink-0" />{error}
                    </div>
                  )}

                  <Btn type="submit" disabled={busy} className="w-full justify-center">
                    {busy ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <KeyRound size={15} />}
                    {busy ? 'Отправляем…' : 'Отправить ссылку для сброса'}
                  </Btn>
                </>
              )}

              <button type="button" onClick={() => { setForgot(false); setForgotSent(false); setError(''); }}
                className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-700">
                ← Вернуться ко входу
              </button>
            </form>
          ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 flex flex-col gap-4">
            <Tabs
              items={[
                { id: 'login', label: 'Вход', icon: <LogIn size={14} /> },
                { id: 'register', label: 'Регистрация', icon: <UserPlus size={14} /> },
              ]}
              active={mode}
              onChange={id => { setMode(id === 'register' ? 'register' : 'login'); setError(''); }}
            />

            <div>
              <h1 className="text-[17px] font-bold text-gray-900 leading-snug break-words">{mode === 'register' && trialIntent ? 'Попробуйте Collabrama CRM бесплатно' : mode === 'register' ? 'Создание аккаунта' : 'Вход в Collabrama CRM'}</h1>
              <p className="text-[12.5px] font-medium text-gray-400 mt-1 leading-relaxed">
                {mode === 'register' && trialIntent
                  ? '14 дней полного доступа. Банковская карта не нужна, автоматического списания не будет.'
                  : mode === 'register'
                    ? 'Создайте персональный кабинет Collabrama CRM'
                    : 'Используйте email и пароль от вашего аккаунта'}
              </p>
            </div>

            {mode === 'register' && (
              <Field label="Имя (необязательно)">
                <div className="relative">
                  <UserPlus size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input className={inputCls + ' !pl-9'} type="text" autoComplete="name"
                    placeholder="Иван Иванов" value={name} onChange={e => { setName(e.target.value); setError(''); }} />
                </div>
              </Field>
            )}

            <Field label="Email">
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input className={inputCls + ' !pl-9'} type="email" autoComplete="email" autoFocus
                  placeholder="you@company.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} />
              </div>
            </Field>

            <Field label="Пароль">
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input className={inputCls + ' !pl-9 !pr-9'} type={show ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder="••••••••" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} />
                <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            {mode === 'register' && (
              <p className="text-[11px] font-medium text-gray-400">Пароль должен содержать не менее 8 символов</p>
            )}

            {mode === 'register' && (
              <div className="flex flex-col gap-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={consentPdn} onChange={e => { setConsentPdn(e.target.checked); setError(''); }}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-[12px] font-medium text-gray-500 leading-snug">
                    Я даю{' '}
                    <a href={legalUrl('consent-pdn.html')} target="_blank" rel="noopener" className="text-indigo-600 underline underline-offset-2">согласие на обработку персональных данных</a>
                    {' '}и принимаю{' '}
                    <a href={legalUrl('privacy.html')} target="_blank" rel="noopener" className="text-indigo-600 underline underline-offset-2">Политику обработки ПДн</a>
                    {' '}и{' '}
                    <a href={legalUrl('offer.html')} target="_blank" rel="noopener" className="text-indigo-600 underline underline-offset-2">Публичную оферту</a>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={consentAds} onChange={e => setConsentAds(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-[12px] font-medium text-gray-500 leading-snug">
                    Я даю{' '}
                    <a href={legalUrl('consent-ads.html')} target="_blank" rel="noopener" className="text-indigo-600 underline underline-offset-2">согласие на получение рекламных и информационных рассылок</a>
                    {' '}(необязательно)
                  </span>
                </label>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-600">
                <AlertTriangle size={15} className="shrink-0" />{error}
              </div>
            )}

            <Btn type="submit" disabled={busy} className="w-full justify-center">
              {busy ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <LogIn size={15} />}
              {busy
                ? (mode === 'register' ? 'Создаём аккаунт…' : 'Входим…')
                : (mode === 'register' && trialIntent ? 'Создать аккаунт и начать триал' : mode === 'register' ? 'Зарегистрироваться' : 'Войти')}
            </Btn>

            {mode === 'login' && (
              <button type="button" onClick={() => { setForgot(true); setForgotSent(false); setError(''); }}
                className="self-center text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-700">
                Забыли пароль?
              </button>
            )}

            {(providers.vk || providers.yandex) && (
              <>
                <div className="flex items-center gap-3 text-[11px] font-bold text-gray-300 uppercase tracking-wide">
                  <span className="flex-1 h-px bg-gray-100" />или<span className="flex-1 h-px bg-gray-100" />
                </div>

                <div className={`grid gap-2.5 ${providers.vk && providers.yandex ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {providers.vk && (
                    <a href={oauthStartUrl('vk')}
                      className="inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-[#0077FF] text-white text-[13px] font-bold hover:bg-[#0066dd] transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.16 17.98c-5.6 0-8.8-3.83-8.94-10.22h2.81c.1 4.68 2.15 6.66 3.79 7.07V7.76h2.65v4.04c1.62-.17 3.31-2.02 3.88-4.04h2.65c-.43 2.53-2.22 4.4-3.5 5.17 1.28.6 3.34 2.19 4.1 5.05h-2.91c-.63-2.0-2.2-3.56-4.37-3.77v3.77h-2.16z"/></svg>
                      VK ID
                    </a>
                  )}
                  {providers.yandex && (
                    <a href={oauthStartUrl('yandex')}
                      className="inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-[#FC3F1D] text-white text-[13px] font-bold hover:bg-[#e6361a] transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm3.2 15.5h-1.9v-6.3l-1.9.3a3 3 0 0 1-1-.2 2.6 2.6 0 0 1-.9-.5 2.2 2.2 0 0 1-.6-.9 3 3 0 0 1-.2-1.2V6.5h1.9v2.1a1.2 1.2 0 0 0 .3.9 1.3 1.3 0 0 0 .9.3l1.4-.2V6.5h1.9z"/></svg>
                      Яндекс ID
                    </a>
                  )}
                </div>
              </>
            )}
          </form>
          )}

          <p className="text-[11.5px] font-medium text-gray-400 mt-5 text-center">{mode === 'register' ? 'После регистрации вы попадёте в свой персональный кабинет' : 'Войдите, чтобы продолжить работу с авторами'}</p>
        </div>
      </div>

      <div className="hidden lg:flex w-[420px] shrink-0 bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15" style={{ background: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,.6), transparent 45%), radial-gradient(circle at 85% 75%, rgba(255,255,255,.5), transparent 40%)' }} />
        <div className="relative p-8 flex flex-col gap-6">
          <div className="text-[13px] font-bold text-white/80 uppercase tracking-widest">Collabrama CRM</div>
          <div className="text-[26px] font-display font-semibold text-white leading-snug">Шортлист авторов, сделки и аналитика в одном окне</div>
          <div className="flex flex-col gap-3 text-[13px] font-semibold text-white/90">
            <span className="flex items-center gap-2.5"><span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center text-[12px]">1</span>Единая база авторов и контактов</span>
            <span className="flex items-center gap-2.5"><span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center text-[12px]">2</span>Статусы и охваты в реальном времени</span>
            <span className="flex items-center gap-2.5"><span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center text-[12px]">3</span>Воронка сделок и ERID-реестр</span>
          </div>
        </div>
      </div>
    </div>
  );
}