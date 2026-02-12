# ✅ Flow Engine - Deployment Checklist

## 📦 מה נוסף לפרויקט

### קבצים חדשים:
- [x] `flow_engine.js` - מנוע האוטומציות
- [x] `migrations/001_create_flow_executions.sql` - SQL migration
- [x] `scripts/run_migrations.js` - סקריפט להרצת migrations
- [x] `docs/Flow_Engine_Setup.md` - הדרכת setup מלאה
- [x] `docs/Railway_Deployment.md` - הנחיות deployment

### שינויים בקבצים קיימים:
- [x] `index.js` - אינטגרציה של flow engine
- [x] `routes/api.js` - trigger + API endpoints
- [x] `package.json` - dependencies + migrate script
- [x] `.env.example` - Supabase variables

### חבילות שהותקנו:
- [x] `node-cron@^4.2.1` - cron job scheduler
- [x] `@supabase/supabase-js@^2.95.3` - Supabase client

---

## 🚀 מה צריך לעשות ב-Railway

### 1. הוסף משתני סביבה (חובה!)
```
Railway Dashboard → Variables → Add:
SUPABASE_URL=https://kyujxlldfsaripztblcn.supabase.co
SUPABASE_ANON_KEY=<get-from-supabase-dashboard>
```

**איפה למצוא:**
Supabase → Settings → API → Copy "anon public" key

### 2. הרץ Migration (אחת בלבד!)

**אוטומטית:**
```bash
railway run npm run migrate
```

**ידנית (אם יש בעיה):**
Railway Dashboard → PostgreSQL → Query → paste from `migrations/001_create_flow_executions.sql`

### 3. Redeploy (אוטומטי)
Railway יעשה deploy כשהקוד מגיע ל-GitHub - אין צורך לעשות כלום!

### 4. בדוק Logs
```
Railway Dashboard → Deployments → View Logs

חפש:
✅ flow_executions table initialized
✅ Supabase client initialized for Flow Engine
✅ Flow Engine started - checking every minute
```

---

## 🧪 בדיקה ראשונית

### צור Flow בדשבורד (Lovable):
```json
{
  "name": "בדיקת מערכת",
  "trigger_on_status": "contacted",
  "is_active": true,
  "steps": [
    {
      "type": "wait",
      "delay_minutes": 2
    },
    {
      "type": "send_message",
      "content": "זו הודעת בדיקה אוטומטית מהמערכת 🤖"
    }
  ]
}
```

### עדכן סטטוס ליד:
```bash
curl -X PUT https://whatsapp-bot-effectiv-production.up.railway.app/api/leads/972XXXXXXXXX \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "contacted"}'
```

### בדוק שזה עובד:
1. **מיד:** לוג יראה `Started flow "בדיקת מערכת" for 972XXX`
2. **אחרי 2 דקות:** הודעה תישלח ללקוח ב-WhatsApp
3. **בלוגים:** `✉️ Sent message to 972XXX: זו הודעת בדיקה...`

---

## 📊 API Endpoints זמינים

### לניטור בדשבורד (Lovable):

```javascript
// קבל flows פעילים לליד
GET /api/leads/:phone/executions
Headers: { Authorization: "Bearer YOUR_API_TOKEN" }

// קבל ביצועים של flow מסוים
GET /api/flows/:flowId/executions?limit=50

// השהה execution
POST /api/flows/executions/:executionId/pause

// המשך execution
POST /api/flows/executions/:executionId/resume

// בטל execution
DELETE /api/flows/executions/:executionId
```

---

## 🐛 Troubleshooting מהיר

| בעיה | פתרון |
|------|-------|
| "Supabase not configured" | הוסף SUPABASE_URL + SUPABASE_ANON_KEY ב-Railway |
| "flow_executions does not exist" | הרץ `railway run npm run migrate` |
| Flows לא מתחילים | ודא: flow פעיל, trigger_on_status תואם, אין execution קיים |
| הודעות לא נשלחות | בדוק WHATSAPP_TOKEN ו-PHONE_NUMBER_ID |

---

## 📝 Git Commits

```
61f8399 - feat: implement Flow Automation Engine with Supabase integration
85679fc - docs: add Flow Engine documentation and migration script
```

**הכל ב-GitHub!** 🎉

---

## 🎯 מה הלאה?

### לדשבורד (Lovable):
- [ ] הוסף UI להצגת executions פעילים
- [ ] הוסף כפתורים pause/resume/cancel
- [ ] הוסף statistics על flows (כמה בוצעו, כמה failed)

### לבוט (Railway):
- [x] ✅ מנוע Flow Engine - מוכן!
- [ ] (אופציונלי) הוסף retry logic לשליחת הודעות
- [ ] (אופציונלי) הוסף webhook ל-Supabase כשexecution מסתיים

---

**סטטוס:** ✅ מוכן ל-Production  
**תאריך:** February 12, 2026  
**Commits:** 85679fc
