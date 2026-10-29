import { useMemo } from 'react';

export default function SearchScreen() {
  const src = useMemo(() => {
    const base = ((import.meta.env.VITE_SEARCH_URL as string | undefined) || 'https://collabrama.ru').replace(/\/+$/, '');
    const target = new URL(`${base}/`);
    const token = localStorage.getItem('creatorflow_token');
    if (token) target.searchParams.set('session_token', token);
    try {
      const raw = localStorage.getItem('creatorflow_user');
      const user = raw ? JSON.parse(raw) as { id?: unknown; email?: unknown } : null;
      if (user?.id !== undefined && user?.id !== null) target.searchParams.set('user_id', String(user.id));
      if (typeof user?.email === 'string') target.searchParams.set('user_email', user.email);
    } catch {
    }
    return target.toString();
  }, []);

  return <iframe src={src} title="Поиск авторов" className="h-full w-full border-0 bg-white" />;
}
