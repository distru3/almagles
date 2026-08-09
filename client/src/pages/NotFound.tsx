import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="container-site flex flex-col items-center justify-center py-20 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
        <Compass className="h-8 w-8" />
      </span>
      <h1 className="mt-5 font-display text-3xl font-black text-brand-950">٤٠٤ — الصفحة غير موجودة</h1>
      <p className="mt-2 text-stone-500">الصفحة التي تبحث عنها لم توجد أو تم نقلها</p>
      <Link to="/" className="btn-primary mt-6">
        العودة للرئيسية
      </Link>
    </div>
  );
}