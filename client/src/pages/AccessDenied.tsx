import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AccessDenied() {
  return (
    <div className="container-site flex min-h-[60vh] items-center justify-center py-16">
      <div className="text-center">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-red-100 text-red-600">
          <Lock className="h-10 w-10" />
        </span>
        <h1 className="mt-6 font-display text-3xl font-black text-brand-950">ﻻ يمكنك الوصول إلى هنا</h1>
        <p className="mx-auto mt-3 max-w-md text-stone-500">
          هذه الصفحة تتطلب صلاحية إدارية غير متاحة لحسابك الحالي. إذا كنت تحتاجها، تواصل مع المشرف العام للموقع.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn-primary">
            العودة للرئيسية
          </Link>
          <Link to="/login" className="btn-outline">
            تسجيل الدخول بحساب آخر
          </Link>
        </div>
      </div>
    </div>
  );
}