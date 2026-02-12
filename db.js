const { Pool } = require("pg");

// Create PostgreSQL connection pool
const isProduction = process.env.NODE_ENV === "production";
let pool;

if (process.env.DATABASE_URL) {
  const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  };
  pool = new Pool(poolConfig);
} else {
  console.warn("⚠️ DATABASE_URL not found. Using In-Memory Mock Database.");
  // Mock Pool for local testing
  pool = {
    connect: async () => ({
      query: async (text, params) => mockQuery(text, params),
      release: () => {},
    }),
    query: async (text, params) => mockQuery(text, params),
  };
}

// Check if pool is real or mock
const isMock = !process.env.DATABASE_URL;

// --- MOCK DATABASE IMPLEMENTATION ---
const mockStorage = {
  sessions: {},
  leads: [],
  messages: [],
};

async function mockQuery(text, params = []) {
  const query = text.trim().toUpperCase();

  // MOCK: Init DB
  if (query.startsWith("CREATE TABLE")) {
    return { rows: [] };
  }

  // MOCK: Get Session
  if (query.startsWith("SELECT * FROM SESSIONS")) {
    const phone = params[0];
    const session = mockStorage.sessions[phone];
    return { rows: session ? [session] : [] }; // Return array of rows
  }

  // MOCK: Create Session (Insert)
  if (query.startsWith("INSERT INTO SESSIONS")) {
    const phone = params[0];
    const state = params[1];
    mockStorage.sessions[phone] = {
      phone_number: phone,
      current_state: state,
      intent: null,
      shed_size: null,
      flooring_status: null,
      city: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    return { rowCount: 1 };
  }

  // MOCK: Update Session
  if (query.startsWith("UPDATE SESSIONS")) {
    // Very basic mock parser for the update logic in this app
    const phone = params[params.length - 1]; // Last param is always phone in updateSession
    if (mockStorage.sessions[phone]) {
      // Update the mock object fields based on the params passed (naive mapping)
      // Note: In a real mock this would need complex SQL parsing,
      // but for our specific app usage, we can infer updates.
      // For now, let's just update the timestamp to show activity.
      mockStorage.sessions[phone].updated_at = new Date();

      // We need to actually update the fields to test state transitions.
      // Since mapping SQL params back to fields is hard without parsing,
      // we will rely on the app logic to just work, but we might miss storing value
      // in the mock. For the purpose of "Seeing it work", logging is enough.
    }
    return { rowCount: 1 };
  }

  // Default fallback
  return { rows: [] };
}

// Initialize database tables
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                phone_number VARCHAR(20) PRIMARY KEY,
                current_state VARCHAR(50) NOT NULL,
                intent VARCHAR(50),
                shed_size VARCHAR(50),
                flooring_status VARCHAR(50),
                city VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

    await client.query(`
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                phone_number VARCHAR(20) NOT NULL,
                intent VARCHAR(50),
                shed_size VARCHAR(50),
                flooring_status VARCHAR(50),
                city VARCHAR(100),
                status VARCHAR(50) DEFAULT 'new',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

    await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                phone_number VARCHAR(20) NOT NULL,
                message_type VARCHAR(20),
                message_content TEXT,
                direction VARCHAR(10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Get or create session
async function getSession(phoneNumber) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM sessions WHERE phone_number = $1",
      [phoneNumber],
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        phone_number: row.phone_number,
        current_state: row.current_state,
        lead_data: {
          intent: row.intent,
          shed_size: row.shed_size,
          flooring_status: row.flooring_status,
          city: row.city,
        },
        timestamps: {
          created_at: row.created_at,
          last_interaction: row.updated_at,
        },
      };
    } else {
      // Create new session
      await client.query(
        `INSERT INTO sessions (phone_number, current_state) 
                 VALUES ($1, $2)`,
        [phoneNumber, "STATE_WELCOME"],
      );

      return {
        phone_number: phoneNumber,
        current_state: "STATE_WELCOME",
        lead_data: {
          intent: null,
          shed_size: null,
          flooring_status: null,
          city: null,
        },
        timestamps: {
          created_at: new Date(),
          last_interaction: new Date(),
        },
      };
    }
  } finally {
    client.release();
  }
}

// Get session if exists (does NOT create)
async function getSessionByPhone(phoneNumber) {
  const phone = String(phoneNumber).trim();

  if (isMock) {
    const row = mockStorage.sessions[phone];
    if (!row) return null;

    return {
      phone_number: row.phone_number,
      current_state: row.current_state,
      lead_data: {
        intent: row.intent,
        shed_size: row.shed_size,
        flooring_status: row.flooring_status,
        city: row.city,
      },
      timestamps: {
        created_at: row.created_at,
        last_interaction: row.updated_at,
      },
    };
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM sessions WHERE phone_number = $1",
      [phone],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      phone_number: row.phone_number,
      current_state: row.current_state,
      lead_data: {
        intent: row.intent,
        shed_size: row.shed_size,
        flooring_status: row.flooring_status,
        city: row.city,
      },
      timestamps: {
        created_at: row.created_at,
        last_interaction: row.updated_at,
      },
    };
  } finally {
    client.release();
  }
}

// Update session
async function updateSession(phoneNumber, updates) {
  if (isMock) {
    if (mockStorage.sessions[phoneNumber]) {
      Object.assign(mockStorage.sessions[phoneNumber], updates);
      mockStorage.sessions[phoneNumber].updated_at = new Date();
      console.log(`[MOCK DB] Updated session for ${phoneNumber}:`, updates);
    }
    return;
  }

  const client = await pool.connect();
  try {
    const setClauses = [];
    const values = [];
    let paramCount = 1;

    if (updates.current_state !== undefined) {
      setClauses.push(`current_state = $${paramCount++}`);
      values.push(updates.current_state);
    }
    if (updates.intent !== undefined) {
      setClauses.push(`intent = $${paramCount++}`);
      values.push(updates.intent);
    }
    if (updates.shed_size !== undefined) {
      setClauses.push(`shed_size = $${paramCount++}`);
      values.push(updates.shed_size);
    }
    if (updates.flooring_status !== undefined) {
      setClauses.push(`flooring_status = $${paramCount++}`);
      values.push(updates.flooring_status);
    }
    if (updates.city !== undefined) {
      setClauses.push(`city = $${paramCount++}`);
      values.push(updates.city);
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(phoneNumber);

    const query = `
            UPDATE sessions 
            SET ${setClauses.join(", ")}
            WHERE phone_number = $${paramCount}
        `;

    await client.query(query, values);
  } finally {
    client.release();
  }
}

async function listHandoffs() {
  const handoffState = "STATE_HUMAN_HANDOFF";

  if (isMock) {
    return Object.values(mockStorage.sessions)
      .filter((s) => s.current_state === handoffState)
      .map((s) => ({
        phone_number: s.phone_number,
        current_state: s.current_state,
        updated_at: s.updated_at,
      }));
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT phone_number, current_state, updated_at FROM sessions WHERE current_state = $1",
      [handoffState],
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Save completed lead
async function saveLead(session) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO leads (phone_number, intent, shed_size, flooring_status, city, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        session.phone_number,
        session.lead_data.intent,
        session.lead_data.shed_size,
        session.lead_data.flooring_status,
        session.lead_data.city,
        "completed",
      ],
    );
    console.log(`✅ Lead saved for ${session.phone_number}`);
  } finally {
    client.release();
  }
}

// Log message
async function logMessage(phoneNumber, messageType, content, direction) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO messages (phone_number, message_type, message_content, direction)
             VALUES ($1, $2, $3, $4)`,
      [phoneNumber, messageType, content, direction],
    );
  } finally {
    client.release();
  }
}

// ==========================
// CRM API helpers
// ==========================
async function getRecentStats() {
  try {
    const totalLeadsResult = await pool.query(
      "SELECT COUNT(*) as total FROM leads",
    );
    const activeSessionsResult = await pool.query(
      "SELECT COUNT(*) as active FROM sessions WHERE current_state != 'STATE_COMPLETE'",
    );
    const todayLeadsResult = await pool.query(
      "SELECT COUNT(*) as today FROM leads WHERE DATE(created_at) = CURRENT_DATE",
    );
    const messagesResult = await pool.query(
      "SELECT COUNT(*) as total FROM messages WHERE DATE(created_at) = CURRENT_DATE",
    );

    // Lead status breakdown
    const statusBreakdownResult = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM leads 
            GROUP BY status
        `);

    return {
      totalLeads: parseInt(totalLeadsResult.rows[0].total),
      activeSessions: parseInt(activeSessionsResult.rows[0].active),
      todayLeads: parseInt(todayLeadsResult.rows[0].today),
      todayMessages: parseInt(messagesResult.rows[0].total),
      statusBreakdown: statusBreakdownResult.rows,
    };
  } catch (error) {
    console.error("Error getting recent stats:", error);
    throw error;
  }
}

async function getLeads(filters = {}, limit = 50, offset = 0) {
  try {
    let query = `
        SELECT
          leads.*,
          last_message.direction AS last_message_direction,
          last_message.created_at AS last_message_at
        FROM leads
        LEFT JOIN LATERAL (
          SELECT direction, created_at
          FROM messages
          WHERE messages.phone_number = leads.phone_number
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message ON true
        WHERE 1=1
      `;
    const params = [];
    let paramCount = 0;

    // Add filters
    if (filters.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.intent) {
      paramCount++;
      query += ` AND intent = $${paramCount}`;
      params.push(filters.intent);
    }

    if (filters.city) {
      paramCount++;
      query += ` AND city ILIKE $${paramCount}`;
      params.push(`%${filters.city}%`);
    }

    query += ` ORDER BY leads.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error("Error getting leads:", error);
    throw error;
  }
}

async function getLeadByPhone(phone) {
  try {
    const leadQuery = "SELECT * FROM leads WHERE phone_number = $1";
    const sessionQuery = "SELECT * FROM sessions WHERE phone_number = $1";

    const [leadResult, sessionResult] = await Promise.all([
      pool.query(leadQuery, [phone]),
      pool.query(sessionQuery, [phone]),
    ]);

    if (leadResult.rows.length === 0) {
      return null;
    }

    return {
      lead: leadResult.rows[0],
      session: sessionResult.rows[0] || null,
    };
  } catch (error) {
    console.error("Error getting lead by phone:", error);
    throw error;
  }
}

async function updateLeadStatus(phone, status, notes = null) {
  try {
    let query = "UPDATE leads SET status = $1";
    const params = [status];
    let paramCount = 1;

    if (notes) {
      paramCount++;
      query += `, notes = $${paramCount}`;
      params.push(notes);
    }

    query += `, updated_at = CURRENT_TIMESTAMP WHERE phone_number = $${paramCount + 1} RETURNING *`;
    params.push(phone);

    const result = await pool.query(query, params);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error updating lead status:", error);
    throw error;
  }
}

async function getMessagesByPhone(phone, limit = 50, offset = 0) {
  try {
    const query = `
            SELECT * FROM messages 
            WHERE phone_number = $1 
            ORDER BY created_at ASC 
            LIMIT $2 OFFSET $3
        `;

    const result = await pool.query(query, [phone, limit, offset]);
    return result.rows;
  } catch (error) {
    console.error("Error getting messages by phone:", error);
    throw error;
  }
}

async function getAllSessions(limit = 50, offset = 0) {
  try {
    const query = `
            SELECT * FROM sessions 
            ORDER BY phone_number 
            LIMIT $1 OFFSET $2
        `;

    const result = await pool.query(query, [limit, offset]);
    return result.rows;
  } catch (error) {
    console.error("Error getting all sessions:", error);
    throw error;
  }
}

module.exports = {
  pool,
  initDB,
  getSession,
  getSessionByPhone,
  updateSession,
  listHandoffs,
  saveLead,
  logMessage,
  getRecentStats,
  getLeads,
  getLeadByPhone,
  updateLeadStatus,
  getMessagesByPhone,
  getAllSessions,
};
