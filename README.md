# FreeMC Worker

واجهة Cloudflare Worker لإدارة بوابة استضافات ماينكرافت مجانية، مع طبقة Bridge منفصلة لربط Aternos عبر مكتبة غير رسمية.

## الفكرة
- **Cloudflare Worker**: واجهة المستخدم + API + التخزين في D1
- **Bridge Node.js**: ينفذ أوامر Aternos عبر مكتبة غير رسمية
- **GitHub**: يخزن الكود كاملًا ويصير المصدر الوحيد للمشروع

## الملفات المهمة
- `src/index.js` — الواجهة والـ API داخل Cloudflare Worker
- `bridge/aternos-wrapper.js` — ملف الـ wrapper غير الرسمي
- `bridge/server.js` — API bridge يستهلكه الـ Worker

## التشغيل
### 1) Cloudflare Worker
- أنشئ قاعدة D1
- شغّل الـ migration:
  ```bash
  wrangler d1 migrations apply freemc-db
  ```
- حدّث `database_id` داخل `wrangler.toml`
- عيّن:
  - `BRIDGE_URL`
  - `BRIDGE_KEY`

### 2) Bridge Node.js
في مجلد `bridge/`:
```bash
npm install
npm start
```

ثم ضع عنوانه في `BRIDGE_URL`.

## شكل الطلبات
الـ Worker يرسل:
- `POST /start`
- `POST /stop`
- `POST /refresh`
- `POST /create` (اختياري إذا دعمتها المكتبة)

بجسم JSON يشمل:
```json
{
  "email": "user@example.com",
  "password": "secret",
  "serverRef": "abc123",
  "name": "My Server",
  "settings": {}
}
```

## ملاحظة صريحة
المكتبة هنا غير رسمية ومبنية على واجهة أتمتة/تعامل مع Aternos، لذلك كل من الـ bridge والـ selectors أو الـ methods قد تحتاج تعديل إذا تغيّر الموقع.
