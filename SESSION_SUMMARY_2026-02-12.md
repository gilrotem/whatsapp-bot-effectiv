# 📝 Session Summary - Flow Automation Engine Development
**תאריך:** February 12, 2026  
**משך:** ~2 שעות  
**מטרה:** בניית מנוע אוטומציות (Flow Engine) לבוט WhatsApp

---

## 🎯 מה היה המצב ההתחלתי?

### מצב הפרויקט לפני הסשן:
```
Repository: whatsapp-bot-effectiv
Branch: main
Last commit: 104d966 - merge: resolve conflicts and integrate latest remote changes
```

### מה היה קיים:
- ✅ בוט WhatsApp פעיל ב-Railway
- ✅ PostgreSQL DB עם טבלאות: `sessions`, `leads`, `messages`
- ✅ API endpoints לניהול leads
- ✅ Telegram notifications
- ✅ Dashboard (Lovable) עם Supabase

### מה חסר:
- ❌ מנוע אוטומציות לשליחת הודעות מתוזמנות
- ❌ חיבור ל-Supabase (לקריאת flows)
- ❌ Cron job לביצוע אוטומטי
- ❌ טבלה לעקוב אחרי ביצועי flows

---

## 🛠️ מה בנינו?

### 1. **Flow Automation Engine** (`flow_engine.js`)
מנוע מלא לביצוע אוטומציות:

**תכונות:**
- ✅ Cron job שרץ כל דקה
- ✅ קריאת flows מ-Supabase
- ✅ ניהול executions ב-PostgreSQL
- ✅ תמיכה ב-3 סוגי צעדים:
  - `send_message` - שליחת הודעת WhatsApp
  - `wait` - המתנה (דקות)
  - `change_status` - שינוי סטטוס ליד

**פונקציות עיקריות:**
- `startFlowEngine()` - מפעיל את ה-cron
- `triggerFlowsOnStatusChange()` - מפעיל flows כששינוי סטטוס מתרחש
- `processFlowStep()` - מעבד צעד בודד
- `executeStep()` - מבצע את הפעולה (שליחה/המתנה/שינוי)
- `calculateNextRun()` - מחשב מתי להריץ צעד הבא

### 2. **Database Schema** (`flow_executions` table)

```sql
CREATE TABLE flow_executions (
  id SERIAL PRIMARY KEY,
  flow_id UUID NOT NULL,                -- מזהה flow מ-Supabase
  lead_phone VARCHAR(20) NOT NULL,      -- טלפון ליד
  current_step INT DEFAULT 0,           -- אינדקס צעד נוכחי
  next_run_at TIMESTAMPTZ,             -- מתי להריץ
  status VARCHAR(20) DEFAULT 'active',  -- active/paused/completed/failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_next_run` - חיפוש מהיר של executions ממתינים
- `idx_lead_phone` - חיפוש לפי ליד
- `idx_flow_id` - חיפוש לפי flow

### 3. **API Endpoints חדשים** (`routes/api.js`)

```javascript
GET    /api/flows/:flowId/executions        // ביצועים של flow
GET    /api/leads/:phone/executions         // flows פעילים לליד
POST   /api/flows/executions/:id/pause      // השהה execution
POST   /api/flows/executions/:id/resume     // המשך execution
DELETE /api/flows/executions/:id            // בטל execution
```

### 4. **Integration Points**

**ב-`index.js`:**
```javascript
const { startFlowEngine, initFlowExecutionsTable } = require('./flow_engine');

// בהפעלת שרת:
await initFlowExecutionsTable();
startFlowEngine(sendWhatsAppMessage, updateLeadStatus);
```

**ב-`routes/api.js`:**
```javascript
// Trigger ב-PUT /api/leads/:phone
const { triggerFlowsOnStatusChange } = require('../flow_engine');
await triggerFlowsOnStatusChange(phone, status);
```

### 5. **תיעוד מקיף**

קבצי תיעוד שנוצרו:
- `docs/Flow_Engine_Setup.md` - מדריך setup מלא
- `docs/Railway_Deployment.md` - הנחיות deployment
- `DEPLOYMENT_CHECKLIST.md` - checklist מהיר
- `scripts/run_migrations.js` - סקריפט migration

### 6. **Dependencies חדשות**

```json
{
  "node-cron": "^4.2.1",
  "@supabase/supabase-js": "^2.95.3"
}
```

---

## 📦 Git Commits שנוצרו

```
4d5f515 - chore: trigger redeploy with Flow Engine configuration
e7dfb10 - docs: add deployment checklist for quick reference
85679fc - docs: add Flow Engine documentation and migration script
61f8399 - feat: implement Flow Automation Engine with Supabase integration
```

**קבצים שנוספו/שונו:**
```
קבצים חדשים:
+ flow_engine.js
+ migrations/001_create_flow_executions.sql
+ scripts/run_migrations.js
+ docs/Flow_Engine_Setup.md
+ docs/Railway_Deployment.md
+ DEPLOYMENT_CHECKLIST.md

קבצים ששונו:
~ index.js (integration)
~ routes/api.js (trigger + endpoints)
~ package.json (dependencies + scripts)
~ .env.example (Supabase vars)
```

---

## 🚀 מה עשינו ב-Railway?

### Deployment Steps שבוצעו:

1. **הוספת משתני סביבה:**
   ```env
   SUPABASE_URL=https://kyujxlldfsaripztblcn.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. **יצירת טבלת `flow_executions`:**
   - נוצרה אוטומטית על ידי הבוט בעת startup
   - אימות: טבלה קיימת ב-Railway PostgreSQL

3. **Redeploy:**
   - Push ל-GitHub
   - Railway עשה auto-deploy
   - Commit: `4d5f515`

### תוצאות Deployment:

**Logs מציגים:**
```
✅ Database connected
✅ flow_executions table initialized
✅ Supabase client initialized for Flow Engine
🚀 Starting Flow Automation Engine...
✅ Flow Engine started - checking every minute
Server is running strictly on port: 8080
```

**סטטוס:** 🟢 **Active ועובד!**

---

## 🔄 איך זה עובד? (Technical Flow)

### Flow Lifecycle:

```
1. Dashboard (Lovable)
   ↓ User creates Flow
   ↓ saves to Supabase flows table
   
2. User updates lead status → "contacted"
   ↓ PUT /api/leads/:phone
   ↓ triggerFlowsOnStatusChange()
   ↓ Query Supabase for active flows
   ↓ Create flow_execution in PostgreSQL
   
3. Cron Job (every minute)
   ↓ SELECT * FROM flow_executions WHERE next_run_at <= NOW()
   ↓ processFlowStep()
   ↓ executeStep() based on type:
      - send_message → sendWhatsAppMessage()
      - wait → do nothing (timer handled by next_run_at)
      - change_status → UPDATE leads SET status
   ↓ Update current_step, next_run_at
   
4. Repeat until all steps completed
   ↓ SET status = 'completed'
```

### Data Flow:

```
Supabase (flows) ←--[read only]--← Bot (flow_engine.js)
                                      ↓
                              PostgreSQL (flow_executions)
                                      ↓
                              WhatsApp API (send messages)
```

---

## 📊 מצב נוכחי (End State)

### ✅ מה עובד:

| רכיב | סטטוס | הערות |
|------|-------|-------|
| Bot Server | 🟢 Active | Port 8080 |
| PostgreSQL | 🟢 Connected | flow_executions קיים |
| Supabase Connection | 🟢 Initialized | קורא flows |
| Flow Engine | 🟢 Running | Cron כל דקה |
| Telegram Webhook | 🟢 Set | Notifications |
| API Endpoints | 🟢 Active | 5 endpoints חדשים |

### 📂 Structure:

```
bot 1 efct/
├── index.js                          # Entry point + integration
├── flow_engine.js                    # ← NEW - Flow automation
├── db.js                             # Database functions
├── telegram_client.js                # Telegram integration
├── botConfig.json                    # Bot configuration
├── package.json                      # Dependencies + scripts
├── .env                              # Environment variables
├── routes/
│   └── api.js                        # API endpoints + triggers
├── scripts/
│   ├── run_migrations.js             # ← NEW - Migration runner
│   ├── reset_handoff.js
│   └── ...other scripts
├── migrations/
│   └── 001_create_flow_executions.sql # ← NEW - DB schema
└── docs/
    ├── Flow_Engine_Setup.md          # ← NEW - Setup guide
    ├── Railway_Deployment.md         # ← NEW - Deploy guide
    └── ...other docs
```

---

## 🧪 איך לבדוק שזה עובד?

### Test Case #1: Basic Flow

**1. צור flow בדשבורד:**
```json
{
  "name": "Welcome Flow",
  "trigger_on_status": "contacted",
  "is_active": true,
  "steps": [
    { "type": "wait", "delay_minutes": 2 },
    { "type": "send_message", "content": "שלום! תודה שיצרת קשר 🙂" }
  ]
}
```

**2. עדכן ליד:**
```bash
curl -X PUT https://whatsapp-bot-effectiv-production.up.railway.app/api/leads/972XXXXXXXXX \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "contacted"}'
```

**3. בדוק logs:**
```
[FLOW] 🎯 Found 1 flow(s) for status "contacted"
[FLOW] ✨ Started flow "Welcome Flow" for 972XXX
(wait 2 minutes...)
[FLOW] 🔄 Processing 1 pending execution(s)...
[FLOW] ✉️ Sent message to 972XXX: שלום! תודה...
```

**4. אמת ב-DB:**
```sql
SELECT * FROM flow_executions WHERE lead_phone = '972XXX';
```

---

## 🔧 Configuration Files

### משתני סביבה נדרשים:

```env
# Existing
PORT=3002
WHATSAPP_TOKEN=...
PHONE_NUMBER_ID=...
DATABASE_URL=postgres://...
TELEGRAM_TOKEN=...
API_TOKEN=...

# NEW - Flow Engine
SUPABASE_URL=https://kyujxlldfsaripztblcn.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

### npm Scripts:

```json
{
  "start": "node index.js",
  "dev": "nodemon index.js",
  "migrate": "node scripts/run_migrations.js"  // ← NEW
}
```

---

## 🐛 בעיות שנפתרו בסשן

### Issue #1: Logs לא נראים ב-Railway
**פתרון:** שינוי מ-`console.log` ל-`process.stdout.write`

### Issue #2: Migration לא רץ
**פתרון:** הטבלה נוצרת אוטומטית ב-`initFlowExecutionsTable()`

### Issue #3: Supabase משתנים לא זוהו
**פתרון:** הוספה ידנית ב-Railway Variables + redeploy

### Issue #4: Deployment לא התעדכן
**פתרון:** Push קטן ל-GitHub כדי לגרום ל-auto-deploy

---

## 📋 Checklist למפתח הבא

### לפני שמתחילים:

- [ ] ודא ש-Railway deployment active
- [ ] בדוק logs - חפש "Flow Engine started"
- [ ] אמת שטבלת flow_executions קיימת
- [ ] ודא ש-SUPABASE_URL ו-SUPABASE_ANON_KEY מוגדרים

### אם צריך לעשות שינויים:

1. **Pull latest:**
   ```bash
   git pull origin main
   ```

2. **עבוד מקומית:**
   ```bash
   npm install
   # ודא ש-.env מכיל את כל המשתנים
   npm start
   ```

3. **בדוק שינויים:**
   ```bash
   git status
   git diff
   ```

4. **Commit & Push:**
   ```bash
   git add .
   git commit -m "describe changes"
   git push origin main
   ```

5. **Railway יעשה auto-deploy**

---

## 🚀 מה הלאה? (Next Steps)

### תכונות שכדאי להוסיף:

1. **Retry Logic:**
   - אם שליחת הודעה נכשלת, נסה שוב אחרי X דקות
   ```javascript
   if (sendFailed && retries < 3) {
     next_run_at = NOW + 5 minutes
     retries++
   }
   ```

2. **Flow Conditions:**
   - תנאים לביצוע צעדים (if/else)
   ```json
   {
     "type": "condition",
     "field": "shed_size",
     "operator": "equals",
     "value": "large",
     "then": [...steps],
     "else": [...steps]
   }
   ```

3. **Webhook ל-Supabase:**
   - עדכן Dashboard כש-execution מסתיים
   ```javascript
   await supabaseClient.from('flow_logs').insert({
     flow_id, lead_phone, status: 'completed'
   })
   ```

4. **Analytics:**
   - כמה flows בוצעו
   - success rate
   - average completion time

5. **UI ב-Dashboard:**
   - הצג executions פעילים
   - כפתורים pause/resume/cancel
   - timeline visualization

### תיקונים אפשריים:

1. **Error Handling משופר:**
   - catch בכל executeStep
   - log מפורט יותר

2. **Performance:**
   - אם יש הרבה executions, limit ל-100 בכל run
   - pagination

3. **Testing:**
   - unit tests ל-flow_engine.js
   - integration tests

---

## 📞 Contact & Resources

### Documentation:
- [Flow_Engine_Setup.md](docs/Flow_Engine_Setup.md)
- [Railway_Deployment.md](docs/Railway_Deployment.md)
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)

### External Resources:
- [Supabase Docs](https://supabase.com/docs)
- [node-cron Docs](https://www.npmjs.com/package/node-cron)
- [Railway Docs](https://docs.railway.app)

### Repository:
```
https://github.com/gilrotem/whatsapp-bot-effectiv
```

---

## 🎓 Technical Notes למפתח

### חשוב לזכור:

1. **Flow Engine רץ כל דקה** - לא real-time
   - אם צריך real-time → שקול webhooks

2. **Supabase = Read Only**
   - הבוט רק קורא מ-flows
   - לא כותב חזרה

3. **PostgreSQL = Write/Read**
   - flow_executions נמצא כאן
   - מעקב אחרי state

4. **Cron Job ב-Memory**
   - אם הבוט מפסיק, ה-cron מפסיק
   - executions ממתינים ב-DB
   - כשהבוט חוזר, הם ממשיכים

5. **current_step = index**
   - 0-based (0, 1, 2...)
   - flow.steps[current_step]

6. **next_run_at logic:**
   - wait → NOW + delay_minutes
   - send_message/change_status → NOW (immediate)

---

## 📸 Screenshots Reference

אם צריך לבדוק deployment:
1. Railway → whatsapp-bot-effectiv → Deployments
2. לחץ על latest deployment → View logs
3. חפש: "Flow Engine started - checking every minute"

אם צריך לבדוק DB:
1. Railway → Postgres → Database tab
2. תראה: flow_executions, leads, messages, sessions

---

**Session completed:** Feb 12, 2026, 21:30 GMT+2  
**Status:** ✅ **Production Ready**  
**Next Session:** Continue with testing & monitoring

---

*מסמך זה נוצר אוטומטית בסיום session הפיתוח*
