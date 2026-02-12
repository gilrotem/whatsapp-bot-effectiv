// routes/api.js
const express = require("express");
const multer = require("multer");
const {
  getRecentStats,
  getLeads,
  getLeadByPhone,
  updateLeadStatus,
  getMessagesByPhone,
  getAllSessions,
} = require("../db");

const router = express.Router();

console.log(
  "API_TOKEN environment variable:",
  process.env.API_TOKEN ? "EXISTS" : "MISSING",
);

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

module.exports = router;
