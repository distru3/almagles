import { useEffect, useState } from 'react';
import { Search, UserPlus, Loader as LoaderIcon, ShieldCheck, AlertTriangle, Check, X, Shield, PenTool } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { AdminUser, Category } from '../../lib/types';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';

interface Props {
  categories: Category[];
}

type Role = 'visitor' | 'writer' | 'admin';

const ROLE_LABELS: Record<Role, string> = {
  visitor: 'حساب عادي — تصفح وتفاعل فقط',
  writer: 'كاتب — نشر عبر صفحة مخصصة',
  admin: 'مشرف عام — كل الصلاحيات',
};

export default function AdminUsersTab({ categories }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('visitor');
  const [newCats, setNewCats] = useState<string[]>([]);
  const [newSched, setNewSched] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [popup, setPopup] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
  const [writerPrompt, setWriterPrompt] = useState<
    | { mode: 'row'; user: AdminUser; sched: boolean }
    | { mode: 'create' }
    | null
  >(null);
  const [promptCats, setPromptCats] = useState<string[]>([]);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

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

  const visibleUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    return true;
  });

  const toggleCat = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const saveUser = async (u: AdminUser, role: Role, cats: string[], sched: boolean) => {
    if (role === 'writer' && cats.length === 0) {
      setPromptCats([]);
      setPromptError(null);
      setWriterPrompt({ mode: 'row', user: u, sched });
      return;
    }
    setError(null);
    try {
      const res = await api<{ user: AdminUser }>(`/users/${u.id}`, {
        method: 'PUT',
        body: { role, categoryIds: cats, canManageSchedule: sched },
      });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? res.user : x)));
      setSavedId(u.id);
      window.setTimeout(() => setSavedId((cur) => (cur === u.id ? null : cur)), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createBusy) return;
    if (newRole === 'writer' && newCats.length === 0) {
      setPromptCats([]);
      setPromptError(null);
      setWriterPrompt({ mode: 'create' });
      return;
    }
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
          categoryIds: newRole === 'writer' ? newCats : [],
          canManageSchedule: newRole === 'writer' ? newSched : false,
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

  const confirmWriterPrompt = async () => {
    if (!writerPrompt || promptCats.length === 0 || promptBusy) return;
    setPromptBusy(true);
    setPromptError(null);
    try {
      if (writerPrompt.mode === 'row') {
        const res = await api<{ user: AdminUser }>(`/users/${writerPrompt.user.id}`, {
          method: 'PUT',
          body: { role: 'writer', categoryIds: promptCats, canManageSchedule: writerPrompt.sched },
        });
        setUsers((prev) => prev.map((x) => (x.id === res.user.id ? res.user : x)));
        setSavedId(res.user.id);
        window.setTimeout(() => setSavedId((cur) => (cur === res.user.id ? null : cur)), 1600);
      } else {
        const res = await api<{ user: AdminUser }>('/users', {
          method: 'POST',
          body: {
            name: newName.trim(),
            email: newEmail.trim(),
            password: newPassword,
            role: 'writer',
            categoryIds: promptCats,
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
      }
      setWriterPrompt(null);
      setPromptCats([]);
    } catch (err) {
      setPromptError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setPromptBusy(false);
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
      {categories.length === 0 && <span className="text-xs text-muted">لا توجد أقسام بعد</span>}
      {categories.map((c) => {
        const isSelected = checked.includes(c.id);
        return (
          <label
            key={c.id}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition select-none ${
              isSelected
                ? 'border-accent bg-surface-2/70 text-fg'
                : 'border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleCat(checked, onChange, c.id)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span>{c.name}</span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black text-fg">
            المستخدمون والصلاحيات
          </h2>
          <p className="text-xs text-muted mt-0.5">
            تحديد صلاحيات المشرفين وتعيين الأقسام الموكلة للكُتّاب
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input !py-2 pl-8 pr-9 text-xs"
              placeholder="بحث بالاسم أو البريد…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  load('');
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg-2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="btn-primary !py-2 text-xs"
          >
            <UserPlus className="h-4 w-4" />
            <span>حساب جديد</span>
          </button>
        </div>
      </div>

      {/* Role Filter Tabs */}
      <div className="mb-5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setRoleFilter('all')}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            roleFilter === 'all'
              ? 'bg-accent-fill text-on-accent'
              : 'border border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
          }`}
        >
          الكل ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setRoleFilter('admin')}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            roleFilter === 'admin'
              ? 'bg-accent-fill text-on-accent'
              : 'border border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
          }`}
        >
          المشرفون ({users.filter((u) => u.role === 'admin').length})
        </button>
        <button
          type="button"
          onClick={() => setRoleFilter('writer')}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            roleFilter === 'writer'
              ? 'bg-accent-fill text-on-accent'
              : 'border border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
          }`}
        >
          الكُتّاب ({users.filter((u) => u.role === 'writer').length})
        </button>
        <button
          type="button"
          onClick={() => setRoleFilter('visitor')}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            roleFilter === 'visitor'
              ? 'bg-accent-fill text-on-accent'
              : 'border border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
          }`}
        >
          حسابات عادية ({users.filter((u) => u.role === 'visitor').length})
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-danger bg-danger-soft px-3.5 py-2 text-xs font-bold text-danger">
          {error}
        </p>
      )}

      {showCreate && (
        <form
          onSubmit={createUser}
          className="card mb-6 space-y-4 rounded-2xl border border-line p-5"
        >
          <div className="flex items-center justify-between border-b border-line pb-2">
            <h3 className="font-display text-sm font-black text-fg">
              إنشاء حساب جديد
            </h3>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-muted hover:text-fg-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {createError && (
            <p className="rounded-xl border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
              {createError}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">الاسم</label>
              <input className="input !py-2 text-xs" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input
                type="email"
                dir="ltr"
                className="input !py-2 text-xs text-left"
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
                className="input !py-2 text-xs text-left"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>

          <div>
            <label className="label">الدور</label>
            <select
              className="input !py-2 text-xs"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              <option value="visitor">{ROLE_LABELS.visitor}</option>
              <option value="writer">{ROLE_LABELS.writer}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>
            {newRole === 'writer' && (
              <p className="mt-1 text-[11px] text-warn">
                تنبيه: يجب تحديد قسم واحد على الأقل ليتمكن الكاتب من النشر.
              </p>
            )}
          </div>

          {newRole === 'writer' && (
            <div className="space-y-3 rounded-xl border border-line p-3">
              <div>
                <label className="label">الأقسام الموكلة (مطلوب)</label>
                <GrantCheckboxes checked={newCats} onChange={setNewCats} />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newSched}
                    onChange={(e) => setNewSched(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span>صلاحية إضافية: إدارة الجدول الأسبوعي للمقرر</span>
                </label>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary !py-2 text-xs" disabled={createBusy}>
              {createBusy && <LoaderIcon className="h-4 w-4 animate-spin" />}
              <span>إنشاء الحساب</span>
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-outline !py-2 text-xs">
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
          {visibleUsers.map((u) => {
            const role = u.role;
            const isWriter = role === 'writer';
            const cats = u.managedCategories.map((c) => c.id);
            const sched = u.canManageSchedule;
            return (
              <div
                key={u.id}
                className="rounded-2xl border border-line bg-surface p-4 shadow-2xs transition hover:border-line-strong"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 font-black text-fg">
                      {u.name.charAt(0)}
                    </span>
                    <div className="leading-tight">
                      <p className="font-extrabold text-sm text-fg">{u.name}</p>
                      <p className="text-xs text-muted" dir="ltr">
                        {u.email}
                      </p>
                    </div>

                    {role === 'admin' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-fill/20 px-2.5 py-0.5 text-xs font-bold text-accent border border-accent/30">
                        <Shield className="h-3 w-3" />
                        مشرف عام
                      </span>
                    )}
                    {role === 'writer' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-accent border border-line/80">
                        <PenTool className="h-3 w-3" />
                        كاتب
                      </span>
                    )}
                    {role === 'visitor' && (
                      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-muted">
                        حساب عادي
                      </span>
                    )}
                  </div>

                  {savedId === u.id && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success animate-pulse">
                      <Check className="h-3.5 w-3.5" />
                      تم الحفظ
                    </span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted shrink-0">الدور:</span>
                    <select
                      className="input !py-1.5 text-xs"
                      value={role}
                      onChange={(e) => {
                        const next = e.target.value as Role;
                        if (next === 'visitor' && (cats.length > 0 || sched)) {
                          setPopup({
                            title: 'إلغاء الصلاحيات',
                            message:
                              'الحساب العادي لا يحمل صلاحيات. سيفقد إدارة الأقسام والجدول عند التحويل — هل تريد المتابعة؟',
                            onConfirm: () => saveUser(u, 'visitor', [], false),
                          });
                          return;
                        }
                        saveUser(u, next, next === 'visitor' ? [] : cats, next === 'visitor' ? false : sched);
                      }}
                    >
                      <option value="visitor">{ROLE_LABELS.visitor}</option>
                      <option value="writer">{ROLE_LABELS.writer}</option>
                      <option value="admin">{ROLE_LABELS.admin}</option>
                    </select>
                  </div>

                  {isWriter && (
                    <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sched}
                        onChange={(e) => saveUser(u, role, cats, e.target.checked)}
                        className="h-4 w-4 accent-accent"
                      />
                      <span>إدارة الجدول الأسبوعي للمقرر</span>
                    </label>
                  )}
                </div>

                {isWriter && (
                  <div className="mt-3 border-t border-line/60 pt-3">
                    <p className="text-xs font-bold text-fg-2 mb-1.5">
                      الأقسام الموكلة للكاتب (انقر للتعديل المباشر):
                    </p>
                    <GrantCheckboxes checked={cats} onChange={(v) => saveUser(u, role, v, sched)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {popup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={() => setPopup(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl border border-line"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warn-soft text-warn">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-center font-display text-lg font-black text-fg">
              {popup.title}
            </h3>
            <p className="mt-2 text-center text-xs leading-6 text-fg-2">
              {popup.message}
            </p>
            {popup.onConfirm ? (
              <div className="mt-5 flex gap-2.5">
                <button
                  onClick={() => {
                    setPopup(null);
                    popup.onConfirm?.();
                  }}
                  className="btn-danger flex-1"
                >
                  متابعة
                </button>
                <button onClick={() => setPopup(null)} className="btn-outline flex-1">
                  إلغاء
                </button>
              </div>
            ) : (
              <button onClick={() => setPopup(null)} className="btn-primary mt-5 w-full">
                حسناً، فهمت
              </button>
            )}
          </div>
        </div>
      )}

      {writerPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!promptBusy) {
              setWriterPrompt(null);
              setPromptCats([]);
              setPromptError(null);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl border border-line"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warn-soft text-warn">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-center font-display text-lg font-black text-fg">تحديد قسم مطلوب</h3>
            <p className="mt-2 text-center text-sm leading-7 text-fg-2">
              {writerPrompt.mode === 'row'
                ? `لا يمكن تحويل «${writerPrompt.user.name}» إلى كاتب دون تحديد قسم واحد على الأقل. اختر الأقسام الموكلة له:`
                : 'لا يمكن إنشاء حساب كاتب دون تحديد قسم واحد على الأقل. اختر الأقسام الموكلة له:'}
            </p>

            {promptError && (
              <p className="mt-3 rounded-xl border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
                {promptError}
              </p>
            )}

            <div className="mt-4 rounded-xl border border-line bg-surface-2/40 p-3">
              <GrantCheckboxes checked={promptCats} onChange={setPromptCats} />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={confirmWriterPrompt}
                disabled={promptCats.length === 0 || promptBusy}
                className="btn-primary flex-1"
              >
                {promptBusy && <LoaderIcon className="h-4 w-4 animate-spin" />}
                {writerPrompt.mode === 'row' ? 'تعيين كاتب بهذه الأقسام' : 'إنشاء الكاتب بهذه الأقسام'}
              </button>
              <button
                onClick={() => {
                  setWriterPrompt(null);
                  setPromptCats([]);
                  setPromptError(null);
                }}
                className="btn-outline"
                disabled={promptBusy}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}