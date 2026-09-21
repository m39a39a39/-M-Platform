# إعداد وتشغيل M Platform

المشروع التشغيلي مربوط حاليًا بـ GitHub وVercel وSupabase. هذا الملف مخصص لإعادة إنشاء بيئة جديدة أو تشغيل نسخة محلية، وليس وصفًا لحالة المشروع الحالية.

## Supabase

لبيئة جديدة:
1. أنشئ مشروع Supabase منفصلًا.
2. طبّق ملفات `database/migrations/` بالترتيب، بدءًا من `001_initial.sql`.
3. لا تعدّل migration مطبقًا في الإنتاج؛ أضف migration جديدًا.
4. خزّن `SUPABASE_SERVICE_ROLE_KEY` على الخادم فقط.
5. اضبط Site URL ورسائل الاستعادة وSMTP بما يناسب بيئة الإنتاج.
6. استخدم `database/bootstrap-owner.sql` فقط لإنشاء/ترقية المدير الرئيسي في بيئة جديدة.

## التشغيل المحلي

يتطلب Node.js 22.x.

```bash
cp .env.example .env
npm run build
npm run dev
```

مثال المتغيرات:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
APP_ORIGIN=http://localhost:3000
PORT=3000
```

يجب أن يطابق `APP_ORIGIN` أصل الموقع المستخدم في المتصفح.

## Vercel

- Build command: `npm run build`
- Output directory: `dist`
- API entry: `api/index.js`
- Node: 22.x

`dist/` ملف مولد أثناء البناء ولا يُحفظ كمصدر في Git.

## تطبيق الجوال

```bash
cd mobile-app
npm ci
npm run build
npx cap sync ios
# أو
npx cap sync android
```

تطبيق الجوال يستخدم `/api/v1/*`، ويحفظ الجلسة في التخزين الآمن على الجهاز.

## التحقق قبل الإصدار

```bash
npm test
npm run check
npm run build

cd mobile-app
npm ci
npm test
npm run build
npx cap sync ios
```

بالإضافة إلى ذلك، يجب أن تنجح GitHub Actions الخاصة بـ backend وmobile layout وiOS compile على نفس commit الذي سيتم تثبيته.

## Push

توجد جداول `push_devices` و`push_outbox` وAPI للتسجيل، لكن لا تعتبر إشعارات APNs/FCM الخارجية مكتملة حتى يتم ربط plugin/native registration وprovider sender فعلي. إشعارات الجرس داخل التطبيق مستقلة وتعمل عبر جدول `notifications`.
