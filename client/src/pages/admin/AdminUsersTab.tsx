import { useEffect, useState } from 'react';
import { Search, UserPlus, Save, Loader as LoaderIcon, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { AdminUser, Category } from '../../lib/types';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';

interface Props {
  categories: Category[];
}

export default function AdminUsersTab({ categories }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'visitor' | 'admin'>('visitor');
  const [newCats, setNewCats] = useState<string[]>([]);
  const [newSched, setNewSched] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = async (query = q) => {
    setLoading(true);
    try {
      const res = await api<{ users: AdminUser[] }>(`/users?q=${encodeURIComponent(query)}`);
      setUsers(res.users);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  const toggleCat = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const saveUser = async (u: AdminUser, role: typeof u.role, cats: string[], sched: boolean) => {
    setBusyId(u.id);
    setError(null);
    try {
      const res = await api<{ user: AdminUser }>(`/users/${u.id}`, {
        method: 'PUT',
        body: { role, categoryIds: cats, canManageSchedule: sched },
      });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? res.user : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusyId(null);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const res = await api<{ user: AdminUser }>('/users', {
        method: 'POST',
        body: {
          name: newName.trim(),
          email: newEmail.trim(),
          password: newPassword,
          role: newRole,
          categoryIds: newCats,
          canManageSchedule: newSched,
        },
      });
      setUsers((prev) => [res.user, ...prev]);
      setShowCreate(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('visitor');
      setNewCats([]);
      setNewSched(false);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'تعذّر إنشاء الحساب');
    } finally {
      setCreateBusy(false);
    }
  };

  const GrantCheckboxes = ({
    checked,
    onChange,
  }: {
    checked: string[];
    onChange: (v: string[]) => void;
  }) => (
    <div className="flex flex-wrap gap-2">
      {categories.length === 0 && <span className="text-xs text-stone-400">لا توجد أقسام بعد</span>}
      {categories.map((c) => (
        <label key={c.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={checked.includes(c.id)}
            onChange={() => toggleCat(checked, onChange, c.id)}
            className="h-3.5 w-3.5 accent-brand-700"
          />
          {c.name}
        </label>
      ))}
    </div>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black text-brand-950">المستخدمون والصلاحيات</h2>
          <p className="text-sm text-stone-500">
            صلاحيات «إدارة الجدول» و«أقسام النشر» تُطبَّق فورًا عند الحفظ
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              className="input !py-2 pl-3 pr-9"
              placeholder="بحث بالاسم أو البريد…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
          <button onClick={() => setShowCreate((v) => !v)} className="btn-primary">
            <UserPlus className="h-4 w-4" />
            حساب جديد
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {showCreate && (
        <form
          onSubmit={createUser}
          className="mb-6 space-y-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-5"
        >
          <h3 className="font-display text-base font-black text-brand-950">إنشاء حساب جديد</h3>
          {createError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">الاسم</label>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input
                type="email"
                dir="ltr"
                className="input text-left"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">كلمة المرور (٨ أحرف فأكثر)</label>
              <input
                type="password"
                dir="ltr"
                className="input text-left"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">الدور</label>
              <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as 'visitor' | 'admin')}>
                <option value="visitor">مشرف أقسام — صلاحيات محددة</option>
                <option value="admin">مشرف عام — كل الصلاحيات</option>
              </select>
            </div>
            <div>
              <label className="label flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newSched}
                  onChange={(e) => setNewSched(e.target.checked)}
                  className="h-4 w-4 accent-brand-700"
                />
                إدارة الجدول الأسبوعي
              </label>
            </div>
          </div>
          {newRole === 'visitor' && (
            <div>
              <label className="label">الأقسام الموكلة</label>
              <GrantCheckboxes checked={newCats} onChange={setNewCats} />
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" className="btn-primary" disabled={createBusy}>
              {createBusy && <LoaderIcon className="h-4 w-4 animate-spin" />}
              إنشاء الحساب
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-outline">
              إلغاء
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="لا يوجد مستخدمون" description="أنشئ أول حساب من الزر أعلاه" />
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const role = u.role;
            const cats = u.managedCategories.map((c) => c.id);
            const sched = u.canManageSchedule;
            return (
              <div key={u.id} className="rounded-2xl border border-brand-100 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-extrabold text-brand-700">
                      {u.name.charAt(0)}
                    </span>
                    <div className="leading-tight">
                      <p className="font-extrabold text-brand-950">{u.name}</p>
                      <p className="text-xs text-stone-400" dir="ltr">
                        {u.email}
                      </p>
                    </div>
                    {role === 'admin' && (
                      <span className="rounded-full bg-gold-400/30 px-2.5 py-0.5 text-xs font-bold text-gold-700">
                        مشرف عام
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => saveUser(u, role, cats, sched)}
                    className="btn-primary !px-3 !py-1.5 text-xs"
                    disabled={busyId === u.id}
                  >
                    {busyId === u.id ? (
                      <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    حفظ الصلاحيات
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500">الدور:</span>
                    <select
                      className="input !py-1.5 text-sm"
                      value={role}
                      onChange={(e) => saveUser(u, e.target.value as 'visitor' | 'admin', cats, sched)}
                    >
                      <option value="visitor">مشرف أقسام</option>
                      <option value="admin">مشرف عام</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-500">
                    <input
                      type="checkbox"
                      checked={sched}
                      onChange={(e) => saveUser(u, role, cats, e.target.checked)}
                      className="h-4 w-4 accent-brand-700"
                    />
                    إدارة الجدول الأسبوعي
                  </label>
                </div>
                {role === 'visitor' && (
                  <div className="mt-3">
                    <p className="label">الأقسام الموكلة</p>
                    <GrantCheckboxes checked={cats} onChange={(v) => saveUser(u, role, v, sched)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}