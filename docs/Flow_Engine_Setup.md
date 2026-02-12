# 🤖 Flow Automation Engine - Setup Guide

## 📋 Overview

מנוע האוטומציות מאפשר ליצור flows אוטומטיים שמופעלים כשסטטוס של ליד משתנה. כל flow יכול לכלול:
- ✉️ שליחת הודעות WhatsApp
- ⏳ המתנה (דקות/שעות/ימים)
- 🔄 שינוי סטטוס ליד

---

## 🚀 Setup Steps

### 1. הוסף משתני סביבה

**ב-Railway:**
```env
SUPABASE_URL=https://kyujxlldfsaripztblcn.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

**מקומית (optional):**
הוסף ל-`.env`:
```env
SUPABASE_URL=https://kyujxlldfsaripztblcn.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### 2. הרץ Migration

**אוטומטית (מומלץ):**
```bash
npm run migrate
```

**ידנית:**
אם יש בעיה, העתק את התוכן מ-`migrations/001_create_flow_executions.sql` והרץ ב-Railway PostgreSQL או ב-DB מקומית.

### 3. Restart הבוט

ב-Railway - הבוט יעשה Redeploy אוטומטית.
מקומית:
```bash
npm start
```

---

## 📊 Database Schema

### טבלת `flow_executions`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | מזהה ייחודי |
| flow_id | UUID | מזהה ה-flow מ-Supabase |
| lead_phone | VARCHAR(20) | טלפון הליד |
| current_step | INT | אינדקס הצעד הנוכחי |
| next_run_at | TIMESTAMPTZ | מתי להריץ את הצעד הבא |
| status | VARCHAR(20) | active/paused/completed/failed |
| created_at | TIMESTAMPTZ | תאריך יצירה |
| updated_at | TIMESTAMPTZ | תאריך עדכון אחרון |

**Indexes:**
- `idx_next_run` - על `next_run_at WHERE status = 'active'`
- `idx_lead_phone` - על `lead_phone`
- `idx_flow_id` - על `flow_id`

---

## 🎯 How It Works

### Flow Trigger
כשסטטוס ליד משתנה ב-API (`PUT /api/leads/:phone`), המערכת:
1. בודקת אילו flows פעילים מוקפצים על הסטטוס החדש
2. יוצרת `flow_execution` חדש לכל flow רלוונטי
3. קובעת מתי להריץ את הצעד הראשון

### Flow Execution
Cron job רץ **כל דקה** ובודק:
1. אילו executions צריכים להתבצע עכשיו (`next_run_at <= NOW()`)
2. מריץ את הצעד הנוכחי:
   - **send_message**: שולח הודעת WhatsApp
   - **wait**: לא עושה כלום (ה-timer מטופל ב-`next_run_at`)
   - **change_status**: משנה סטטוס ליד ב-DB
3. עובר לצעד הבא או מסמן כ-`completed`

---

## 🔌 API Endpoints

### Monitor Flow Executions

**קבל ביצועים של flow מסוים:**
```http
GET /api/flows/:flowId/executions?limit=50
```

**קבל flows פעילים לליד:**
```http
GET /api/leads/:phone/executions
```

**השהה execution:**
```http
POST /api/flows/executions/:executionId/pause
```

**המשך execution:**
```http
POST /api/flows/executions/:executionId/resume
```

**בטל execution:**
```http
DELETE /api/flows/executions/:executionId
```

---

## 📝 Example Flow

```json
{
  "name": "פולו-אפ אחרי שיחה ראשונה",
  "is_active": true,
  "trigger_on_status": "contacted",
  "steps": [
    { 
      "type": "wait", 
      "delay_minutes": 1440 
    },
    { 
      "type": "send_message", 
      "content": "היי, רק רציתי לוודא שקיבלת את המידע?" 
    },
    { 
      "type": "wait", 
      "delay_minutes": 4320 
    },
    { 
      "type": "send_message", 
      "content": "עדיין מעוניין? נשמח לעזור!" 
    },
    { 
      "type": "change_status", 
      "status": "lost" 
    }
  ]
}
```

**התרחיש:**
1. כשליד עובר לסטטוס `contacted`
2. מחכה 24 שעות (1440 דקות)
3. שולח הודעת follow-up
4. מחכה עוד 3 ימים (4320 דקות)
5. שולח תזכורת נוספת
6. משנה סטטוס ל-`lost`

---

## 🧪 Testing

### 1. צור Flow בדשבורד
- Trigger: `contacted`
- Step 1: Wait 2 minutes
- Step 2: Send message "זו הודעת בדיקה"

### 2. עדכן סטטוס ליד
```bash
curl -X PUT http://localhost:3002/api/leads/972XXXXXXXXX \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "contacted"}'
```

### 3. בדוק Logs
תוך 2 דקות תראה:
```
[FLOW] 🎯 Found 1 flow(s) for status "contacted"
[FLOW] ✨ Started flow "..." for 972XXXXXXXXX
[FLOW] 🔄 Processing 1 pending execution(s)...
[FLOW] ✉️ Sent message to 972XXXXXXXXX: זו הודעת בדיקה
```

---

## 🐛 Troubleshooting

### לוגים לא מופיעים?
```bash
# בדוק שהמשתנים מוגדרים
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# בדוק חיבור ל-Supabase
curl $SUPABASE_URL/rest/v1/flows \
  -H "apikey: $SUPABASE_ANON_KEY"
```

### הטבלה לא קיימת?
```bash
# הרץ migration
npm run migrate

# או ידנית
psql $DATABASE_URL < migrations/001_create_flow_executions.sql
```

### Flows לא מתחילים?
בדוק ש:
- [ ] ה-flow פעיל (`is_active: true`)
- [ ] ה-`trigger_on_status` תואם לסטטוס שעודכן
- [ ] אין execution פעיל קיים לליד הזה על אותו flow

---

## 🔐 Security Notes

- ✅ משתני Supabase מוגנים ב-`.env`
- ✅ API endpoints דורשים authentication
- ✅ Flow executions מבודדים לפי ליד
- ⚠️ אל תחשוף את ה-`SUPABASE_ANON_KEY` בקוד לקוח

---

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [node-cron Documentation](https://www.npmjs.com/package/node-cron)
- [Flow Builder in Dashboard](https://crm-dashboard-url.com/flows)

---

**נוצר בתאריך:** February 2026  
**גרסה:** 1.0.0
