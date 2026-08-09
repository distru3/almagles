import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, LogIn, UserPlus, LogOut, LayoutDashboard, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-bold transition ${
    isActive ? 'bg-brand-700 text-white' : 'text-brand-900 hover:bg-brand-100'
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100 bg-cream/90 backdrop-blur">
      <div className="container-site">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <Logo className="h-10 w-10" />
            <div className="leading-tight">
              <span className="font-display text-xl font-extrabold text-brand-900">رجال الأمة</span>
              <span className="block text-[11px] font-medium text-stone-500">مقرر وفوائد يومية</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/" className={navLinkClass} end>
              الرئيسية
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/admin" className={navLinkClass}>
                <span className="inline-flex items-center gap-1.5">
                  <Shield className="h-4 w-4" />
                  لوحة التحكم
                </span>
              </NavLink>
            )}
            <div className="mx-2 h-6 w-px bg-brand-200" />
            {user ? (
              <>
                <span className="px-2 text-sm font-bold text-brand-800">{user.name}</span>
                <button onClick={handleLogout} className="btn-outline !px-3 !py-1.5">
                  <LogOut className="h-4 w-4" />
                  خروج
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="btn-outline !px-3 !py-1.5">
                  <LogIn className="h-4 w-4" />
                  دخول
                </NavLink>
                <NavLink to="/signup" className="btn-primary !px-3 !py-1.5">
                  <UserPlus className="h-4 w-4" />
                  حساب جديد
                </NavLink>
              </>
            )}
          </nav>

          {/* Mobile toggle */}
          <button
            className="rounded-lg p-2 text-brand-900 hover:bg-brand-100 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-brand-200 bg-white md:hidden">
          <nav className="container-site flex flex-col gap-1 py-3">
            <NavLink to="/" className={navLinkClass} end onClick={() => setOpen(false)}>
              الرئيسية
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/admin" className={navLinkClass} onClick={() => setOpen(false)}>
                <span className="inline-flex items-center gap-1.5">
                  <LayoutDashboard className="h-4 w-4" />
                  لوحة التحكم
                </span>
              </NavLink>
            )}
            <div className="my-2 h-px bg-brand-100" />
            {user ? (
              <>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-brand-800">
                    {user.role === 'admin' && <Shield className="h-4 w-4 text-gold-600" />}
                    {user.name}
                  </span>
                  <button onClick={handleLogout} className="btn-outline !px-2 !py-1 text-xs">
                    <LogOut className="h-3.5 w-3.5" />
                    خروج
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2 px-3 py-2">
                <Link to="/login" className="btn-outline" onClick={() => setOpen(false)}>
                  <LogIn className="h-4 w-4" />
                  دخول
                </Link>
                <Link to="/signup" className="btn-primary" onClick={() => setOpen(false)}>
                  <UserPlus className="h-4 w-4" />
                  حساب جديد
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}