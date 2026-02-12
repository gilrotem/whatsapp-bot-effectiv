# 🚂 Railway Deployment Guide - Flow Engine

## 📋 Pre-Deployment Checklist

לפני ה-deploy, ודא שיש לך:
- [ ] גישה ל-Railway Dashboard
- [ ] Supabase project עם טבלת `flows`
- [ ] `SUPABASE_ANON_KEY` מ-Supabase

---

## 🔧 שלב 1: הוספת משתני סביבה ב-Railway

1. היכנס ל-Railway Dashboard
2. בחר את ה-project: `whatsapp-bot-effectiv`
3. לחץ על **Variables**
4. הוסף משתנים חדשים:

```env
SUPABASE_URL=https://kyujxlldfsaripztblcn.supabase.co
SUPABASE_ANON_KEY=<paste-your-key-here>
```

**איפה למצוא את המפתח:**
- Supabase Dashboard → Settings → API
- העתק את ה-`anon` public key

---

## 🗄️ שלב 2: הרצת Migration

### אופציה A: דרך Railway CLI (מומלץ)

```bash
# התחבר ל-Railway
railway login

# קישור לפרויקט
railway link

# הרץ migration
railway run npm run migrate
```

### אופציה B: דרך Railway Dashboard

1. Railway Dashboard → Project → **Deployments**
2. בחר את ה-deployment האחרון
3. לחץ על **View Logs**
4. חפש: `✅ flow_executions table initialized`

אם אתה לא רואה את זה:

**אופציה C: SQL ישיר**

1. Railway Dashboard → PostgreSQL Database
2. לחץ על **Query**
3. העתק והרץ את התוכן מ-`migrations/001_create_flow_executions.sql`

---

## 🚀 שלב 3: Redeploy

Railway יעשה auto-deploy אוטומטית כשהקוד מגיע ל-GitHub.

**בדוק שה-deploy הצליח:**
```
Deploy Logs צריכים להראות:
✅ Database connected
✅ flow_executions table initialized
✅ Supabase client initialized for Flow Engine
🚀 Starting Flow Automation Engine...
✅ Flow Engine started - checking every minute
```

---

## ✅ שלב 4: בדיקה

### בדוק שהמנוע רץ:

1. **עדכן סטטוס ליד:**
```bash
curl -X PUT https://your-railway-url.up.railway.app/api/leads/972XXXXXXXXX \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "contacted"}'
```

2. **בדוק Logs ב-Railway:**
```
[FLOW] 🎯 Found X flow(s) for status "contacted"
[FLOW] ✨ Started flow "..." for 972XXXXXXXXX
```

3. **שאל את ה-API:**
```bash
curl https://your-railway-url.up.railway.app/api/leads/972XXXXXXXXX/executions \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

תקבל:
```json
[
  {
    "id": 1,
    "flow_id": "uuid...",
    "lead_phone": "972XXXXXXXXX",
    "current_step": 0,
    "next_run_at": "2026-02-13T15:30:00Z",
    "status": "active"
  }
]
```

---

## 🐛 Troubleshooting

### "Supabase not configured"
```bash
# בדוק שהמשתנים מוגדרים
railway variables

# צריך לראות:
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

### "flow_executions table does not exist"
```bash
# הרץ migration
railway run npm run migrate

# או חבר ל-DB ישירות
railway connect postgres
\dt  # רשימת טבלאות - צריך לראות flow_executions
```

### "Flows not triggering"
בדוק:
1. ה-flow פעיל ב-Supabase (`is_active: true`)
2. ה-`trigger_on_status` תואם לסטטוס שעודכן
3. אין execution קיים לליד (`status: active`)

**Debug query:**
```sql
-- בדוק executions קיימים
SELECT * FROM flow_executions WHERE lead_phone = '972XXXXXXXXX';

-- בדוק executions ממתינים
SELECT * FROM flow_executions WHERE status = 'active' AND next_run_at <= NOW();
```

---

## 📊 Monitoring

### לוגים חשובים לעקוב:

```
✅ Flow Engine started - checking every minute
[FLOW] 🔄 Processing X pending execution(s)...
[FLOW] ✉️ Sent message to 972XXX...
[FLOW] 🔄 Changed status for 972XXX to lost
[FLOW] ✅ Flow completed for 972XXX
```

### שגיאות אפשריות:

```
❌ [FLOW] Flow uuid... not found
→ ה-flow נמחק מ-Supabase

❌ [FLOW] Error processing step
→ בדוק שה-phone number תקין

⚠️ Supabase not configured
→ חסרים משתני SUPABASE_URL/KEY
```

---

## 🔄 Updates

כשמוסיפים features חדשים:

1. עדכן קוד מקומית
2. `git push origin main`
3. Railway עושה auto-deploy
4. בדוק logs שהכל תקין

---

## 📞 Support Commands

```bash
# ראה logs חיים
railway logs

# חבר לשרת
railway shell

# חבר ל-DB
railway connect postgres

# הרץ פקודה
railway run <command>
```

---

**עדכון אחרון:** February 2026  
**גרסה:** 1.0.0

🎉 **Flow Engine מוכן לעבודה!**
