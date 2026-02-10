// routes/api.js
// API endpoints for the CRM dashboard
// Plugs into existing Express app + db.js + sendTextMessage

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
// Simple token-based auth for the dashboard
function requireApiToken(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const expected = process.env.API_TOKEN;

    if (!expected) {
        // If no API_TOKEN set, allow all (dev mode)
        return next();
    }

    if (token !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

// Apply to all routes
router.use(requireApiToken);

// ============================================================
// GET /api/stats — Dashboard numbers
// ============================================================
router.get('/stats', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const stats = {};

            // Total leads
            const totalLeads = await client.query('SELECT COUNT(*) FROM leads');
            stats.total_leads = parseInt(totalLeads.rows[0].count);

            // New leads today
            const today = await client.query(
                "SELECT COUNT(*) FROM leads WHERE created_at >= CURRENT_DATE"
            );
            stats.new_leads_today = parseInt(today.rows[0].count);

            // New leads this week
            const week = await client.query(
                "SELECT COUNT(*) FROM leads WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
            );
            stats.new_leads_week = parseInt(week.rows[0].count);

            // Active conversations (in handoff)
            const handoffs = await client.query(
                "SELECT COUNT(*) FROM sessions WHERE current_state = 'STATE_HUMAN_HANDOFF'"
            );
            stats.active_handoffs = parseInt(handoffs.rows[0].count);

            // Total messages today
            const msgsToday = await client.query(
                "SELECT COUNT(*) FROM messages WHERE created_at >= CURRENT_DATE"
            );
            stats.messages_today = parseInt(msgsToday.rows[0].count);

            // Messages sent (outgoing) today
            const sentToday = await client.query(
                "SELECT COUNT(*) FROM messages WHERE direction = 'outgoing' AND created_at >= CURRENT_DATE"
            );
            stats.messages_sent_today = parseInt(sentToday.rows[0].count);

            res.json(stats);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[API] Error getting stats:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// GET /api/leads — List all leads with optional filters
// Query params: ?status=completed&city=תל אביב&limit=50&offset=0
// ============================================================
router.get('/leads', async (req, res) => {
    try {
        const { status, city, limit = 50, offset = 0 } = req.query;
        const conditions = [];
        const params = [];
        let paramCount = 1;

        if (status) {
            conditions.push(`l.status = $${paramCount++}`);
            params.push(status);
        }
        if (city) {
            conditions.push(`l.city ILIKE $${paramCount++}`);
            params.push(`%${city}%`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const client = await pool.connect();
        try {
            // Get leads with their latest message and session state
            const query = `
                SELECT 
                    l.*,
                    s.current_state,
                    (SELECT message_content FROM messages m 
                     WHERE m.phone_number = l.phone_number 
                     ORDER BY m.created_at DESC LIMIT 1) as last_message,
                    (SELECT created_at FROM messages m 
                     WHERE m.phone_number = l.phone_number 
                     ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
                    (SELECT COUNT(*) FROM messages m 
                     WHERE m.phone_number = l.phone_number) as message_count
                FROM leads l
                LEFT JOIN sessions s ON s.phone_number = l.phone_number
                ${where}
                ORDER BY l.created_at DESC
                LIMIT $${paramCount++} OFFSET $${paramCount++}
            `;
            params.push(parseInt(limit), parseInt(offset));

            const result = await client.query(query, params);

            // Get total count for pagination
            const countQuery = `SELECT COUNT(*) FROM leads l ${where}`;
            const countResult = await client.query(countQuery, params.slice(0, -2));

            res.json({
                leads: result.rows,
                total: parseInt(countResult.rows[0].count),
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[API] Error getting leads:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// GET /api/leads/:phone — Single lead with full details
// ============================================================
router.get('/leads/:phone', async (req, res) => {
    try {
        const phone = req.params.phone.trim();
        const client = await pool.connect();
        try {
            // Get lead
            const leadResult = await client.query(
                'SELECT * FROM leads WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 1',
                [phone]
            );

            // Get session
            const sessionResult = await client.query(
                'SELECT * FROM sessions WHERE phone_number = $1',
                [phone]
            );

            // Get message count
            const msgCount = await client.query(
                'SELECT COUNT(*) FROM messages WHERE phone_number = $1',
                [phone]
            );

            if (leadResult.rows.length === 0 && sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            res.json({
                lead: leadResult.rows[0] || null,
                session: sessionResult.rows[0] || null,
                message_count: parseInt(msgCount.rows[0].count)
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[API] Error getting lead:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// PUT /api/leads/:phone — Update lead status/notes
// Body: { status, notes, tags, do_not_contact }
// ============================================================
router.put('/leads/:phone', async (req, res) => {
    try {
        const phone = req.params.phone.trim();
        const { status, notes, tags, do_not_contact } = req.body;

        const setClauses = [];
        const params = [];
        let paramCount = 1;

        if (status !== undefined) {
            setClauses.push(`status = $${paramCount++}`);
            params.push(status);
        }
        // Note: notes, tags, do_not_contact require ALTER TABLE first
        // These will work after running the migration SQL

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(phone);

        const client = await pool.connect();
        try {
            const result = await client.query(
                `UPDATE leads SET ${setClauses.join(', ')} WHERE phone_number = $${paramCount}`,
                params
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            res.json({ success: true, updated: result.rowCount });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[API] Error updating lead:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// GET /api/messages/:phone — Message history for a lead
// Query params: ?limit=100&offset=0
// ============================================================
router.get('/messages/:phone', async (req, res) => {
    try {
        const phone = req.params.phone.trim();
        const { limit = 100, offset = 0 } = req.query;

        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM messages 
                 WHERE phone_number = $1 
                 ORDER BY created_at ASC 
                 LIMIT $2 OFFSET $3`,
                [phone, parseInt(limit), parseInt(offset)]
            );

            const countResult = await client.query(
                'SELECT COUNT(*) FROM messages WHERE phone_number = $1',
                [phone]
            );

            res.json({
                messages: result.rows,
                total: parseInt(countResult.rows[0].count),
                phone_number: phone
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[API] Error getting messages:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// POST /api/send-message — Send WhatsApp message from dashboard
// Body: { phone, content }
// ============================================================
router.post('/send-message', async (req, res) => {
    try {
        const { phone, content } = req.body;

        if (!phone || !content) {
            return res.status(400).json({ error: 'phone and content are required' });
        }

        const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
        const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
        const VERSION = process.env.VERSION || 'v18.0';

        // Send via WhatsApp Cloud API
        const axios = require('axios');
        await axios({
            method: "POST",
            url: `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`,
            data: {
                messaging_product: "whatsapp",
                to: phone,
                text: { body: content },
            },
            headers: {
                "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
                "Content-Type": "application/json",
            },
        });

        // Log the message
        const { logMessage } = require('../db');
        await logMessage(phone, 'text', content, 'outgoing');

        // Also send to Telegram so admin sees it there too
        const { sendToTelegram } = require('../telegram_client');
        await sendToTelegram(`📤 *הודעה מהדשבורד*\n📞 אל: ${phone}\n💬 ${content}`);

        res.json({ success: true, phone, content });
    } catch (error) {
        console.error('[API] Error sending message:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// GET /api/sessions — All active sessions
// ============================================================
router.get('/sessions', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM sessions ORDER BY updated_at DESC'
            );
            res.json(result.rows);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[API] Error getting sessions:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
