// routes/api.js
const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const {
  getRecentStats,
  getLeads,
  getLeadByPhone,
  updateLeadStatus,
  getMessagesByPhone,
  getAllSessions,
} = require("../db");

// PostgreSQL connection for flow_executions queries
const isProduction = process.env.NODE_ENV === "production";
let db;
if (process.env.DATABASE_URL) {
  const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  };
  db = new Pool(poolConfig);
}

const router = express.Router();

console.log(
  "API_TOKEN environment variable:",
  process.env.API_TOKEN ? "EXISTS" : "MISSING",
);

// Middleware to log API requests
router.use((req, res, next) => {
  process.stdout.write('=== API REQUEST ===\n');
  process.stdout.write(`API Method: ${req.method}\n`);
  process.stdout.write(`API Path: ${req.path}\n`);
  next();
});

// Middleware לבדיקת API token
const authenticateAPI = (req, res, next) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  const expectedToken = process.env.API_TOKEN;

  process.stdout.write("=== AUTH DEBUG START ===\n");
  process.stdout.write(`Received token: ${token}\n`);
  process.stdout.write(`Expected token: ${expectedToken}\n`);
  process.stdout.write(`Match: ${token === expectedToken}\n`);

  if (!token || token !== expectedToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Apply authentication to all routes
router.use(authenticateAPI);

// GET /api/stats - Dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    const stats = await getRecentStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/leads - Get all leads with optional filters
router.get("/leads", async (req, res) => {
  try {
    const { status, intent, city, limit = 50, offset = 0 } = req.query;
    const filters = { status, intent, city };
    const leads = await getLeads(filters, parseInt(limit), parseInt(offset));
    res.json(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/leads/:phone - Get specific lead with session data
router.get("/leads/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    const lead = await getLeadByPhone(phone);

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json(lead);
  } catch (error) {
    console.error("Error fetching lead:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/leads/:phone - Update lead status
router.put("/leads/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const updated = await updateLeadStatus(phone, status, notes);

    if (!updated) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // Trigger automation flows if status changed
    const { triggerFlowsOnStatusChange } = require('../flow_engine');
    await triggerFlowsOnStatusChange(phone, status);

    res.json({ success: true, updated });
  } catch (error) {
    console.error("Error updating lead:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/messages/:phone - Get message history for specific lead
router.get("/messages/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messages = await getMessagesByPhone(
      phone,
      parseInt(limit),
      parseInt(offset),
    );
    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/send-message - Send WhatsApp message from dashboard
router.post("/send-message", async (req, res) => {
  try {
    const { phone, message, content, message_type = "text" } = req.body;
    const msg = message || content;

    if (!phone || !msg) {
      return res.status(400).json({ error: "Phone and message are required" });
    }

    const { sendWhatsAppMessage } = require("../index");

    try {
      await sendWhatsAppMessage(phone, msg, message_type);

      // Log outgoing message
      const { logMessage } = require("../db");
      await logMessage(phone, message_type, msg, "outgoing");
      console.log("[LOG] Outgoing message saved for:", phone);

      res.json({ success: true, message: "Message sent successfully" });
    } catch (waError) {
      console.error(
        "[WA] send-message failed:",
        waError.response?.status,
        waError.response?.data || waError.message,
      );
      return res.status(502).json({
        error: "whatsapp_send_failed",
        details: waError.response?.data || waError.message,
      });
    }
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/sessions - Get all active sessions (for debugging)
router.get("/sessions", async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const sessions = await getAllSessions(parseInt(limit), parseInt(offset));
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Multer setup for in-memory file upload ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB max
});

// Helper: map MIME type to WhatsApp media type
function mimeToMediaType(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

// POST /api/send-media - Send media message from CRM dashboard
router.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { phone, caption } = req.body;
    const file = req.file;

    if (!phone || !file) {
      return res.status(400).json({ error: "phone and file are required" });
    }

    const { uploadMediaToWhatsApp, sendMediaMessage } = require("../index");
    const { logMessage } = require("../db");

    const mimeType = file.mimetype;
    const mediaType = mimeToMediaType(mimeType);

    // a) Upload file to WhatsApp => wa_media_id
    const uploadResult = await uploadMediaToWhatsApp(
      file.buffer,
      mimeType,
      file.originalname,
    );
    const waMediaId = uploadResult.id;

    // b) Send media message to the phone
    await sendMediaMessage(phone, mediaType, waMediaId, caption || null);

    // c) Log to DB as outgoing
    await logMessage(
      phone,
      mediaType,
      caption || `[${mediaType}]`,
      "outgoing",
      {
        wa_media_id: waMediaId,
        media_mime: mimeType,
        media_caption: caption || null,
      },
    );

    // d) Return success
    res.json({ success: true, wa_media_id: waMediaId });
  } catch (error) {
    console.error(
      "Error sending media:",
      error.response?.data || error.message,
    );
    res.status(502).json({
      error: "media_send_failed",
      details: error.response?.data || error.message,
    });
  }
});

// GET /api/media/:waMediaId - Proxy to stream WhatsApp media to CRM
router.get("/media/:waMediaId", async (req, res) => {
  try {
    const { waMediaId } = req.params;
    const {
      getMediaDownloadUrl,
      streamMediaFromWhatsApp,
    } = require("../index");

    // Fetch the temporary download URL
    const { url, mime_type } = await getMediaDownloadUrl(waMediaId);

    // Stream the file back to the client
    const upstream = await streamMediaFromWhatsApp(url);
    res.set("Content-Type", mime_type || "application/octet-stream");
    upstream.data.pipe(res);
  } catch (error) {
    console.error(
      "Error proxying media:",
      error.response?.data || error.message,
    );
    res.status(502).json({
      error: "media_proxy_failed",
      details: error.response?.data || error.message,
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ===== FLOW AUTOMATION ENDPOINTS =====

// GET /api/flows/:flowId/executions - Get executions for a specific flow
router.get("/flows/:flowId/executions", async (req, res) => {
  try {
    const { flowId } = req.params;
    const { limit = 50 } = req.query;
    
    const { rows } = await db.query(
      `SELECT * FROM flow_executions 
       WHERE flow_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [flowId, parseInt(limit)]
    );
    
    res.json(rows);
  } catch (error) {
    console.error("Error fetching flow executions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/leads/:phone/executions - Get active flows for a lead
router.get("/leads/:phone/executions", async (req, res) => {
  try {
    const { phone } = req.params;
    
    const { rows } = await db.query(
      `SELECT * FROM flow_executions 
       WHERE lead_phone = $1 AND status = 'active'
       ORDER BY created_at DESC`,
      [phone]
    );
    
    res.json(rows);
  } catch (error) {
    console.error("Error fetching lead executions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/flows/executions/:executionId/pause - Pause a flow execution
router.post("/flows/executions/:executionId/pause", async (req, res) => {
  try {
    const { executionId } = req.params;
    
    const { rows } = await db.query(
      `UPDATE flow_executions 
       SET status = 'paused', updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [parseInt(executionId)]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Execution not found" });
    }
    
    res.json({ success: true, execution: rows[0] });
  } catch (error) {
    console.error("Error pausing execution:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/flows/executions/:executionId/resume - Resume a paused flow execution
router.post("/flows/executions/:executionId/resume", async (req, res) => {
  try {
    const { executionId } = req.params;
    
    const { rows } = await db.query(
      `UPDATE flow_executions 
       SET status = 'active', updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [parseInt(executionId)]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Execution not found" });
    }
    
    res.json({ success: true, execution: rows[0] });
  } catch (error) {
    console.error("Error resuming execution:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/flows/executions/:executionId - Cancel a flow execution
router.delete("/flows/executions/:executionId", async (req, res) => {
  try {
    const { executionId } = req.params;
    
    const { rows } = await db.query(
      `UPDATE flow_executions 
       SET status = 'completed', updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [parseInt(executionId)]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Execution not found" });
    }
    
    res.json({ success: true, execution: rows[0] });
  } catch (error) {
    console.error("Error canceling execution:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
