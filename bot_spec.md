# Project: Garden Sheds WhatsApp Bot (High-Involvement Sales)

## 1. Project Overview & Tech Context
We are building a WhatsApp Chatbot using the WhatsApp Cloud API (Meta).

**Goal**: Qualify leads for garden sheds, filter non-relevant customers, and prepare data for human sales agents.

**Infrastructure**: Custom Webhook (Node.js/Python).

**Primary Constraint**: Button text must be under 16 characters to ensure visibility on all devices.

**Language**: Hebrew.

## 2. User Session Data Structure (JSON)
Every user interaction must update a session object (stored in DB/Memory). The AI Agent/Code must maintain this state.

```json
{
  "phone_number": "972501234567",
  "current_state": "STATE_WELCOME",
  "lead_data": {
    "intent": null,          // "sales", "support", "order_status"
    "shed_size": null,       // "small", "medium", "large"
    "flooring_status": null, // "concrete", "soil", "unknown"
    "city": null             // User free text input
  },
  "timestamps": {
    "last_interaction": "2023-10-27T10:00:00Z"
  }
}
```

## 3. The State Machine (Flow Logic)
The bot logic should be implemented as a State Machine to manage the conversation flow accurately.

### States Definitions

#### STATE_WELCOME (Initial State)
*   **Trigger**: Incoming message (start of conversation).
*   **Action**: Send Welcome Message with 3 Interactive Buttons.
*   **Next State**: Depends on button selection.

#### STATE_QUALIFY_SIZE
*   **Trigger**: User selected "Buy New Shed".
*   **Action**: Ask for shed size preference (Interactive Buttons).
*   **Logic**: Update `lead_data.intent = 'sales'`.

#### STATE_QUALIFY_FLOOR
*   **Trigger**: User selected a size.
*   **Action**: Ask about ground infrastructure (Interactive Buttons).
*   **Logic**: Update `lead_data.shed_size`.
*   **Special Rule**: If user selects "Soil/Grass", save flag but continue to next step (do not block).

#### STATE_ASK_LOCATION
*   **Trigger**: User selected flooring status.
*   **Action**: Ask for city/location (Free Text).
*   **Logic**: Update `lead_data.flooring_status`.
*   **Warning Logic**: If previous answer was "Soil", append a small tip about base requirements in the next message.

#### STATE_SUMMARY_HANDOFF
*   **Trigger**: User entered city name.
*   **Action**: Send summary message + Link to catalog + "Agent will contact you".
*   **Logic**: Save `lead_data.city`. Trigger "Notify Admin" function. Reset state to IDLE.

#### STATE_HUMAN_HANDOFF
*   **Trigger**: User explicitly asks for "Agent" or keywords like "Human", "Talk to someone".
*   **Action**: Stop bot flow. Send "Agent has been notified" message.

## 4. Content & Copy (Hebrew)
**Strict Rule**: Button titles must not exceed 16 chars.

### A. Welcome Message (STATE_WELCOME)
**Body**: "שלום וברוכים הבאים ל[שם העסק] 🏡. כדי שנוכל לתת שירות מהיר ויעיל, באיזה נושא הפנייה?"

**Buttons (Action)**:
*   id: `btn_sales` -> Title: מתעניין במחסן
*   id: `btn_order` -> Title: בירור הזמנה
*   id: `btn_support` -> Title: נציג שירות

### B. Size Question (STATE_QUALIFY_SIZE)
**Body**: "בשמחה! כדי שנתאים לך דגם מדויק, מה גודל המחסן שאתה מחפש בערך?"

**Buttons**:
*   id: `size_small` -> Title: קטן (מרפסת)
*   id: `size_medium` -> Title: בינוני (רגיל)
*   id: `size_large` -> Title: גדול / ענק

### C. Flooring Question (STATE_QUALIFY_FLOOR)
**Body**: "תודה. שאלה קריטית להתקנה: האם יש במקום המיועד משטח קשיח ומפולס (בטון/ריצוף)?"

**Buttons**:
*   id: `floor_yes` -> Title: כן, יש משטח
*   id: `floor_no` -> Title: לא, יש אדמה
*   id: `floor_unsure` -> Title: טרם ידוע

### D. Location Question (STATE_ASK_LOCATION)
**Context**: If user selected `floor_no`, Prepend: "שימו לב: להתקנת מחסן חובה משטח ישר. נציג יסביר על פתרונות רצפה בהמשך. 🏗️"

**Body**: "שאלה אחרונה לסיום - לאיזו עיר המשלוח?"

**Input Type**: Free Text (Wait for user reply).

### E. Closing / Summary (STATE_SUMMARY_HANDOFF)
**Body**: "רשמתי הכל! ✅ העברתי את הפרטים לנציג מומחה שיחזור אליך עם מחיר והתאמה מדויקת (כולל הובלה ל{city}). בינתיים אפשר להציץ בקטלוג: [LINK] יום מקסים!"

## 5. Technical Implementation Guidelines (For the Agent)
*   **Webhook Verification**: Ensure standard Meta verification token logic is handled.
*   **Incoming Message Handling**: Differentiate between text messages and interactive (button_reply) messages.
*   **State Persistence**: Since this is a serverless/webhook environment, imply using a database (like MongoDB/Firebase) or an in-memory store (Redis) to hold the `phone_number` + `current_state` mapping.
*   **Error Handling**: If the user sends text when we expect a button, re-send the button menu with a polite "Please select an option" message.
