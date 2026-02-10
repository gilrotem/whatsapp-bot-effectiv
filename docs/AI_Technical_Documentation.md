# מסמך טכני מלא לסוכן AI – WhatsApp Bot (Effective Garden Sheds)

**תאריך**: 2026-02-10

מסמך זה נועד לאפשר לסוכן AI להבין לעומק את המערכת, הארכיטקטורה, הזרימה העסקית והטכנולוגית, נקודות ההרחבה והתחזוקה – בצורה יסודית ומעשית.

---

## 1. תקציר מערכת

בוט WhatsApp לאיסוף וליד קוואליפיקציה (Lead Qualification) לעסק מחסני גינה. המערכת פועלת כ־Webhook Server שמקבל אירועים מ־Meta (WhatsApp Cloud API), מנהלת שיחה במכונת מצבים, שומרת נתונים ל־PostgreSQL, ומבצעת העברה לנציג אנושי דרך Telegram.

---

## 2. טכנולוגיות מרכזיות

- **Node.js + Express**: שרת Webhook.
- **WhatsApp Cloud API (Meta)**: קליטה ושליחת הודעות.
- **PostgreSQL**: אחסון מצב שיחה ולידים.
- **Telegram Bot API**: התראות לנציגים וערוץ תשובה אנושי.
- **dotenv**: ניהול סודות וסביבה.

---

## 3. רכיבי מערכת וקבצים חשובים

- **index.js**: לב המערכת (Webhooks, state machine, שליחת הודעות, נקודות אדמין).
- **db.js**: שכבת DB – חיבור, CRUD, ומצב Mock במקרה שאין `DATABASE_URL`.
- **botConfig.json**: הודעות וכפתורים (תוכן עסקי/שיווקי).
- **telegram_client.js**: אינטגרציה מלאה ל־Telegram (שליחה וקביעת webhook).
- **docs/**: מסמכי תחזוקה והפעלה.
- **scripts/**: כלי תפעול (בדיקות, גיבוי, דיבוג, סימולציות, reset).

---

## 4. זרימת מידע – End‑to‑End

### 4.1 WhatsApp Inbound
1. לקוח שולח הודעה ב־WhatsApp.
2. Meta שולחת אירוע ל־`POST /webhook`.
3. המערכת מאתרת Session (או יוצרת חדשה).
4. מתקבלת החלטה לפי מכונת מצבים.
5. תשובה נשלחת חזרה ללקוח דרך Meta Graph API.
6. כל הודעה נרשמת ל־DB ומועברת ל־Telegram לנציג.

### 4.2 Telegram Inbound (נציג אנושי)
1. נציג מקבל הודעה עם מספר לקוח.
2. הנציג מבצע Reply ב־Telegram (Reply להודעת הלקוח).
3. `POST /telegram_webhook` מזהה למי להשיב.
4. המערכת שולחת את תוכן התשובה ללקוח ב־WhatsApp.
5. `'/close'` או `"סיימנו"` מחזירים את הלקוח למצב בוט.

---

## 5. מכונת מצבים (State Machine)

המצבים מוגדרים בקובץ [index.js](index.js) ומנוהלים לפי `current_state`.

**מצבים**:
- `STATE_WELCOME`: תפריט פתיחה.
- `STATE_QUALIFY_SIZE`: איסוף גודל מחסן.
- `STATE_QUALIFY_FLOOR`: איסוף מצב תשתית.
- `STATE_ASK_LOCATION`: איסוף עיר משלוח.
- `STATE_SUMMARY_HANDOFF`: סיכום והשלמת ליד.
- `STATE_HUMAN_HANDOFF`: מצב שקט (bot silent) בזמן נציג.

**מעברים עיקריים**:
- `WELCOME` → `QUALIFY_SIZE` → `QUALIFY_FLOOR` → `ASK_LOCATION` → `SUMMARY_HANDOFF` → `WELCOME`
- בקשת נציג (“נציג/אנושי/human”) → `HUMAN_HANDOFF`.

---

## 6. שכבת נתונים (PostgreSQL)

### 6.1 טבלת `sessions`
- `phone_number` (PK)
- `current_state`
- `intent`
- `shed_size`
- `flooring_status`
- `city`
- `created_at`
- `updated_at`

### 6.2 טבלת `leads`
- `id` (PK)
- `phone_number`
- `intent`
- `shed_size`
- `flooring_status`
- `city`
- `status`
- `created_at`

### 6.3 טבלת `messages`
- `id`
- `phone_number`
- `message_type`
- `message_content`
- `direction`
- `created_at`

### 6.4 מצב Mock (ללא DB)
אם `DATABASE_URL` לא קיים – מופעל Mock In‑Memory במסד הנתונים בתוך [db.js](db.js). שימושי לפיתוח מקומי.

---

## 7. אינטגרציה עם WhatsApp Cloud API

### 7.1 Webhook Verification (GET)
Endpoint: `GET /webhook`
- בודק `hub.verify_token` מול `VERIFY_TOKEN`.
- מחזיר `hub.challenge` כדי לאמת.

### 7.2 קבלת הודעות (POST)
Endpoint: `POST /webhook`
- מפענח את `messages[0]`.
- מבצע Anti‑Echo: אם השולח זה `PHONE_NUMBER_ID` – מתעלם.
- לוג הודעה ושילוח ל־Telegram.

### 7.3 שליחת הודעות
Endpoint: `POST https://graph.facebook.com/{VERSION}/{PHONE_NUMBER_ID}/messages`
- `type: text`
- `type: interactive` (buttons)

---

## 8. אינטגרציה עם Telegram

- ב־[telegram_client.js](telegram_client.js):
  - `sendToTelegram()` שולח הודעות לנציג.
  - `setTelegramWebhook()` מגדיר את URL הציבורי ל־Telegram.
- ב־`/telegram_webhook`:
  - מזהה Reply ומחפש מספר לקוח.
  - שולח תגובה ל־WhatsApp.
  - פקודות סגירה: `"/close"` או `"סיימנו"`.

---

## 9. אבטחה, סיכונים ושיקולים

- אימות Webhook מבוסס `VERIFY_TOKEN` בלבד.
- קיימת הכנה ל־signature verification (שמירת `rawBody`), אך אימות חתימה (HMAC) לא ממומש בקוד.
- נתיבי admin (כמו `/admin/reset-handoff/:phone`) מוגנים ע"י `ADMIN_TOKEN` בסביבת production.

---

## 10. תפעול ותחזוקה

### נקודות בריאות
- `GET /` → טקסט חי.
- `GET /health` → JSON כולל זמן.

### סקריפטים מרכזיים (`scripts/`)
- `health_check.js` – בדיקת זמינות.
- `simulate_webhook.js` – סימולציה של הודעה נכנסת.
- `backup_db.js` – גיבוי נתונים.
- `reset_handoff.js` – איפוס מצב ידני.

---

## 11. הגדרות סביבה (Environment)

משתני חובה (ראה גם [docs/Environment.md](docs/Environment.md)):
- `VERIFY_TOKEN`
- `WHATSAPP_TOKEN`
- `PHONE_NUMBER_ID`
- `VERSION`
- `WABA_ID`
- `PUBLIC_URL`
- `DATABASE_URL`
- `TELEGRAM_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ADMIN_TOKEN` (ב־production)

---

## 11A. תוספת API לדשבורד (שלב 0A) — תקציר תפעולי

### מטרה
להוסיף שכבת API מאובטחת עבור דשבורד CRM: סטטיסטיקות, לידים, הודעות ושליחת הודעות יזומות.

### רכיב חדש
קובץ חדש: [routes/api.js](routes/api.js)

### שינוי מינימלי ב־[index.js](index.js)
1. להוסיף `const apiRoutes = require('./routes/api');`
2. להפעיל CORS עבור הדשבורד
3. לחבר את ה־API תחת `/api`

### תלות חדשה
להתקין `cors`.

### משתנה סביבה חדש
`API_TOKEN` — משמש לאימות ה־API באמצעות `Authorization: Bearer <token>`.
אם לא מוגדר, ה־API נפתח ללא אימות (מצב dev בלבד).

### סדר פעולות קצר
1. `mkdir routes`
2. להעתיק את [routes/api.js](routes/api.js) ל־`routes/`
3. להוסיף 3 שורות ל־[index.js](index.js)
4. `npm install cors`
5. להגדיר `API_TOKEN` ב־Railway Variables
6. `git add . && git commit && git push`
7. לבדוק עם curl
8. ✅ סיום

### בדיקה מהירה (דוגמאות)
- `GET /api/stats`
- `GET /api/leads`
- `GET /api/messages/:phone`

כל הבקשות מחייבות `Authorization: Bearer API_TOKEN` כאשר הטוקן מוגדר.

---

## 12. קבצי תוכן/תסריט שיחה

הטקסטים וכפתורי הניווט מוגדרים ב־[botConfig.json](botConfig.json). שינוי שם/תוכן/כפתורים מתבצע שם בלבד, ללא שינוי קוד.

---

## 13. נקודות הרחבה לסוכן AI

1. **Override לשיחה**: להוסיף דגל כמו `is_ai_agent_active` ב־`sessions` כדי לנתב אירועים למנוע AI.
2. **קונטקסט שיחה**: היסטוריית הודעות נשמרת ב־`messages` – מאפשר מודל קונטקסטואלי.
3. **הזרקת תגובות מותאמות**: יצירת פונקציה שמחליפה את ה־state machine באינטליגנציה חכמה לפי מדיניות.
4. **חיווי עסקי בזמן אמת**: שימוש ב־`sendToTelegram` להערות AI לנציגים.

---

## 14. גבולות מערכת נוכחית (Known Gaps)

- אין אימות חתימה של Meta (HMAC) למרות הכנה ב־rawBody.
- אין קיבוע תורים/ניטור (Queue) – הכל מסונכרן בזמן אמת.
- אין Rate Limiting.
- ניהול שגיאות בעיקר בלוגים.

---

## 15. סיכום

המערכת היא Webhook‑Driven, מתמקדת באיסוף מידע מובנה לצורך ליד, עם ניהול מצב פשוט וניהול handoff לנציג. היא בנויה בצורה מודולרית, כך שניתן לחבר סוכן AI שינהל תגובות חכמות, ימנף את DB כ־Memory ויבצע אינטגרציות חיצוניות נוספות.
