# رجال الأمة — موقع عربي متكامل

موقع نشر إسلامي بالكامل بالعربية (RTL): منشورات حسب الفئات، الجدول الأسبوعي، التفاعلات، التعليقات والردود، ولوحة إدارة.

## البنية

| الجزء | التقنية |
|---|---|
| الواجهة | React 18 + Vite 6 + Tailwind CSS 4 + React Router 7 |
| الخادم | Node.js + Express 4 + Prisma 5 |
| قاعدة البيانات | PostgreSQL (Neon) |
| الصور | Cloudinary (اختياري) |
| الاستضافة | Render (خدمة واحدة تخدم الواجهة والواجهة البرمجية) |

## التشغيل محليًا

1. انسخ المتغيرات:
   ```bash
   cp server/.env.example server/.env
   ```
2. املأ `DATABASE_URL` بوصلة Postgres (Neon) في `server/.env`.
3. ثبت الاعتماديات وأنشئ قاعدة البيانات:
   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```
4. شغّل الخوادم:
   ```bash
   npm run dev
   ```
   - الواجهة: http://localhost:5173 (الخادم يتحكم بـ `/api` عبر Vite proxy)
   - الخادم: http://localhost:4000

## الحسابات الجاهزة (بعد `db:seed`)

- مشرف: `admin@almagles.app` — كلمة المرور من `SEED_ADMIN_PASSWORD`
- زائر تجريبي: `demo@almagles.app` — كلمة المرور من `SEED_DEMO_PASSWORD` أو `SEED_ADMIN_PASSWORD`

## الأدوار والصلاحيات

- `visitor` — حساب عادي: تصفح، تعليق، وتفاعل فقط، دون أي صلاحيات إدارية.
- `writer` — كاتب: ينشر من صفحة مخصصة (`/write`) في الأقسام الموكلة إليه فقط (إضافة/تعديل/حذف أي منشور ضمنها، وحذف التعليقات على منشوراتها). إذا مُنح صلاحية الجدول يُفتح له أيضًا صفحة مخصصة (`/manage/schedule`). عند منح هذا الدور يجب تحديد قسم واحد على الأقل وتُنظَّم العملية بنافذة تنبيه للمشرف.
- `admin` — مشرف عام: لوحة تحكم كاملة (منشورات، أقسام، جدول، تعليقات، مستخدمون) وإعادة توزيع الصلاحيات فورًا دون إعادة تشغيل.

## الإنتاج (Render)

- استخدم ملف `render.yaml` (Blueprint) أو Dockerfile المرفق.
- المتغيرات المطلوبة: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, وباختياري `CLOUDINARY_*`.
- الترحيلات تُشغَّل تلقائيًا بـ `npx prisma migrate deploy --schema=server/prisma/schema.prisma`.
- الخادم يخدم الواجهة المبنية من `client/dist` تلقائيًا عند `NODE_ENV=production`.

## المتغيرات البيئية

| المتغير | مطلوب | الوصف |
|---|---|---|
| `DATABASE_URL` | نعم | وصلة Neon Postgres |
| `JWT_SECRET` | نعم | لتوقيع التوكنات |
| `PORT` | لا | الافتراضي 4000 |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | لا | تفعيل رفع الصور |
| `SEED_ADMIN_PASSWORD` | لا | كلمة مرور المشرف في التهيئة |
| `RESEND_API_KEY` | لا* | إرسال رموز التحقق عبر Resend |
| `EMAIL_FROM` | لا | المرسل الافتراضي `onboarding@resend.dev` |
| `APP_BASE_URL` | لا | رابط الموقع (لرسائل البريد لاحقًا) |

> *`MAIL_DEV_MODE=0` في التطوير يُفعّل الإرسال الفعلي عبر Resend؛ الافتراضي في التطوير هو طباعة الرموز وإعادتها في الاستجابة (لا في الإنتاج).
