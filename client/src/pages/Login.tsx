import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-site flex justify-center py-12">
      <div className="card card-editorial w-full max-w-md p-7">
        <div className="mb-6 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-800 text-white">
            <LogIn className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-black text-brand-950">تسجيل الدخول</h1>
          <p className="mt-1 text-sm text-stone-500">مرحباً بعودتك إلى رجال الأمة</p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              className="input"
              dir="ltr"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                className="input pl-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-brand-700"
                aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link
            to="/forgot-password"
            className="text-sm font-bold text-stone-500 transition hover:text-brand-700"
          >
            نسيت كلمة المرور؟
          </Link>
        </div>

        <p className="mt-4 text-center text-sm text-stone-500">
          ليس لديك حساب؟{' '}
          <Link to="/signup" className="font-extrabold text-brand-700 underline underline-offset-2">
            أنشئ حساباً جديداً
          </Link>
        </p>
      </div>
    </div>
  );
}
