const { Pool } = require('pg');

// Create PostgreSQL connection pool
const isProduction = process.env.NODE_ENV === 'production';
let pool;

if (process.env.DATABASE_URL) {
    const poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false
    };
    pool = new Pool(poolConfig);
} else {
    console.warn("⚠️ DATABASE_URL not found. Using In-Memory Mock Database.");
    // Mock Pool for local testing
    pool = {
        connect: async () => ({
            query: async (text, params) => mockQuery(text, params),
            release: () => {}
        }),
        query: async (text, params) => mockQuery(text, params)
    };
}

// Check if pool is real or mock
const isMock = !process.env.DATABASE_URL;

// --- MOCK DATABASE IMPLEMENTATION ---
const mockStorage = {
    sessions: {},
    leads: [],
    messages: []
};

async function mockQuery(text, params = []) {
    const query = text.trim().toUpperCase();
    
    // MOCK: Init DB
    if (query.startsWith('CREATE TABLE')) {
        return { rows: [] };
    }

    // MOCK: Get Session
    if (query.startsWith('SELECT * FROM SESSIONS')) {
        const phone = params[0];
        const session = mockStorage.sessions[phone];
        return { rows: session ? [session] : [] }; // Return array of rows
    }

    // MOCK: Create Session (Insert)
    if (query.startsWith('INSERT INTO SESSIONS')) {
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
            updated_at: new Date()
        };
        return { rowCount: 1 };
    }

    // MOCK: Update Session
    if (query.startsWith('UPDATE SESSIONS')) {
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

        console.log('✅ Database tables initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
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
            'SELECT * FROM sessions WHERE phone_number = $1',
            [phoneNumber]
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
                    city: row.city
                },
                timestamps: {
                    created_at: row.created_at,
                    last_interaction: row.updated_at
                }
            };
        } else {
            // Create new session
            await client.query(
                `INSERT INTO sessions (phone_number, current_state) 
                 VALUES ($1, $2)`,
                [phoneNumber, 'STATE_WELCOME']
            );

            return {
                phone_number: phoneNumber,
                current_state: 'STATE_WELCOME',
                lead_data: {
                    intent: null,
                    shed_size: null,
                    flooring_status: null,
                    city: null
                },
                timestamps: {
                    created_at: new Date(),
                    last_interaction: new Date()
                }
            };
        }
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
            SET ${setClauses.join(', ')}
            WHERE phone_number = $${paramCount}
        `;

        await client.query(query, values);
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
                'completed'
            ]
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
            [phoneNumber, messageType, content, direction]
        );
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    initDB,
    getSession,
    updateSession,
    saveLead,
    logMessage
};
