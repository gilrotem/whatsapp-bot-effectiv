// routes/api.js
const express = require('express');
const { 
  getRecentStats, 
  getLeads, 
  getLeadByPhone, 
  updateLeadStatus, 
  getMessagesByPhone, 
  getAllSessions 
} = require('../db');
const { sendWhatsAppMessage } = require('../index');

const router = express.Router();

console.log('API_TOKEN environment variable:', process.env.API_TOKEN ? 'EXISTS' : 'MISSING');

// Middleware לבדיקת API token
const authenticateAPI = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const expectedToken = process.env.API_TOKEN;
  
  process.stdout.write('=== AUTH DEBUG START ===\n');
  process.stdout.write(`Received token: ${token}\n`);
  process.stdout.write(`Expected token: ${expectedToken}\n`);
  process.stdout.write(`Match: ${token === expectedToken}\n`);
  
  if (!token || token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Apply authentication to all routes
router.use(authenticateAPI);

// GET /api/stats - Dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await getRecentStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads - Get all leads with optional filters
router.get('/leads', async (req, res) => {
  try {
    const { status, intent, city, limit = 50, offset = 0 } = req.query;
    const filters = { status, intent, city };
    const leads = await getLeads(filters, parseInt(limit), parseInt(offset));
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads/:phone - Get specific lead with session data
router.get('/leads/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const lead = await getLeadByPhone(phone);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/leads/:phone - Update lead status
router.put('/leads/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { status, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const updated = await updateLeadStatus(phone, status, notes);
    
    if (!updated) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json({ success: true, updated });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/messages/:phone - Get message history for specific lead
router.get('/messages/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const messages = await getMessagesByPhone(phone, parseInt(limit), parseInt(offset));
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/send-message - Send WhatsApp message from dashboard
router.post('/send-message', async (req, res) => {
  try {
    const { phone, message, message_type = 'text' } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }
    
    const success = await sendWhatsAppMessage(phone, message, message_type);
    
    if (success) {
      res.json({ success: true, message: 'Message sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send message' });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions - Get all active sessions (for debugging)
router.get('/sessions', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const sessions = await getAllSessions(parseInt(limit), parseInt(offset));
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
