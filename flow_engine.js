/**
 * Flow Automation Engine
 * Executes automation flows for leads based on status changes
 */

require('dotenv').config();
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabaseClient = null;
if (supabaseUrl && supabaseKey) {
  supabaseClient = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase client initialized for Flow Engine');
} else {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_ANON_KEY not set. Flow Engine disabled.');
}

// PostgreSQL connection
const isProduction = process.env.NODE_ENV === 'production';
let db;

if (process.env.DATABASE_URL) {
  const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  };
  db = new Pool(poolConfig);
} else {
  console.warn('⚠️ DATABASE_URL not found. Flow Engine cannot run without database.');
}

/**
 * Calculate when to run the next step based on step type
 */
function calculateNextRun(step) {
  const now = new Date();
  
  if (step.type === 'wait') {
    // Wait for X minutes
    const delayMs = (step.delay_minutes || 0) * 60 * 1000;
    return new Date(now.getTime() + delayMs);
  }
  
  // send_message or change_status - execute immediately
  return now;
}

/**
 * Execute a single step
 */
async function executeStep(step, phone, sendWhatsAppMessage, updateLeadInDB) {
  switch (step.type) {
    case 'send_message':
      // Send WhatsApp message
      await sendWhatsAppMessage(phone, step.content);
      console.log(`[FLOW] ✉️ Sent message to ${phone}: ${step.content.substring(0, 50)}...`);
      break;
      
    case 'wait':
      // Nothing to do - next_run_at handles the delay
      console.log(`[FLOW] ⏳ Wait step for ${phone}: ${step.delay_minutes} minutes`);
      break;
      
    case 'change_status':
      // Update lead status in database
      await updateLeadInDB(phone, { status: step.status });
      console.log(`[FLOW] 🔄 Changed status for ${phone} to ${step.status}`);
      break;
      
    default:
      console.warn(`[FLOW] ⚠️ Unknown step type: ${step.type}`);
  }
}

/**
 * Process a single flow execution step
 */
async function processFlowStep(execution, sendWhatsAppMessage, updateLeadInDB) {
  try {
    if (!supabaseClient) {
      console.warn('[FLOW] Supabase not configured, skipping execution');
      return;
    }

    // Fetch the flow from Supabase
    const { data: flow, error } = await supabaseClient
      .from('flows')
      .select('*')
      .eq('id', execution.flow_id)
      .single();
    
    if (error || !flow) {
      console.warn(`[FLOW] Flow ${execution.flow_id} not found or error:`, error?.message);
      // Mark execution as completed (flow was deleted)
      await db.query(
        'UPDATE flow_executions SET status = $1, updated_at = NOW() WHERE id = $2',
        ['completed', execution.id]
      );
      return;
    }

    if (!flow.is_active) {
      console.log(`[FLOW] Flow ${flow.name} is not active, marking execution as completed`);
      await db.query(
        'UPDATE flow_executions SET status = $1, updated_at = NOW() WHERE id = $2',
        ['completed', execution.id]
      );
      return;
    }
    
    const step = flow.steps[execution.current_step];
    if (!step) {
      // No more steps - execution complete
      console.log(`[FLOW] ✅ Flow ${flow.name} completed for ${execution.lead_phone}`);
      await db.query(
        'UPDATE flow_executions SET status = $1, updated_at = NOW() WHERE id = $2',
        ['completed', execution.id]
      );
      return;
    }
    
    // Execute the current step
    await executeStep(step, execution.lead_phone, sendWhatsAppMessage, updateLeadInDB);
    
    // Move to next step
    const nextStepIndex = execution.current_step + 1;
    const nextStep = flow.steps[nextStepIndex];
    
    if (!nextStep) {
      // This was the last step
      console.log(`[FLOW] ✅ Flow ${flow.name} completed for ${execution.lead_phone}`);
      await db.query(
        'UPDATE flow_executions SET status = $1, current_step = $2, updated_at = NOW() WHERE id = $3',
        ['completed', nextStepIndex, execution.id]
      );
    } else {
      // Schedule next step
      const nextRun = calculateNextRun(nextStep);
      console.log(`[FLOW] ⏭️ Scheduling next step for ${execution.lead_phone} at ${nextRun.toISOString()}`);
      await db.query(
        'UPDATE flow_executions SET current_step = $1, next_run_at = $2, updated_at = NOW() WHERE id = $3',
        [nextStepIndex, nextRun, execution.id]
      );
    }
    
  } catch (error) {
    console.error('[FLOW] ❌ Error processing step:', error);
    await db.query(
      'UPDATE flow_executions SET status = $1, updated_at = NOW() WHERE id = $2',
      ['failed', execution.id]
    );
  }
}

/**
 * Main cron job - runs every minute
 */
function startFlowEngine(sendWhatsAppMessage, updateLeadInDB) {
  if (!db || !supabaseClient) {
    console.warn('⚠️ Flow Engine not started: missing database or Supabase configuration');
    return null;
  }

  console.log('🚀 Starting Flow Automation Engine...');
  
  // Run every minute
  const task = cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      
      // Fetch all executions that need to run now
      const { rows: executions } = await db.query(
        `SELECT * FROM flow_executions 
         WHERE status = 'active' 
         AND next_run_at <= $1
         ORDER BY next_run_at ASC
         LIMIT 100`,
        [now]
      );
      
      if (executions.length > 0) {
        console.log(`[FLOW] 🔄 Processing ${executions.length} pending execution(s)...`);
      }
      
      for (const exec of executions) {
        await processFlowStep(exec, sendWhatsAppMessage, updateLeadInDB);
      }
      
    } catch (error) {
      console.error('[FLOW] ❌ Cron job error:', error);
    }
  });
  
  console.log('✅ Flow Engine started - checking every minute');
  return task;
}

/**
 * Trigger flows when a lead status changes
 */
async function triggerFlowsOnStatusChange(phone, newStatus) {
  if (!db || !supabaseClient) {
    return; // Flow engine not configured
  }

  try {
    // Fetch active flows triggered by this status
    const { data: flows, error } = await supabaseClient
      .from('flows')
      .select('*')
      .eq('is_active', true)
      .eq('trigger_on_status', newStatus);
    
    if (error) {
      console.error('[FLOW] Error fetching flows:', error);
      return;
    }

    if (!flows || flows.length === 0) {
      return; // No flows for this status
    }

    console.log(`[FLOW] 🎯 Found ${flows.length} flow(s) for status "${newStatus}"`);
    
    for (const flow of flows) {
      // Check if execution already exists
      const { rows: existing } = await db.query(
        'SELECT id FROM flow_executions WHERE lead_phone = $1 AND flow_id = $2 AND status = $3',
        [phone, flow.id, 'active']
      );
      
      if (existing.length > 0) {
        console.log(`[FLOW] ⏭️ Skipping flow "${flow.name}" - already running for ${phone}`);
        continue;
      }
      
      // Create new execution
      const firstStep = flow.steps[0];
      if (!firstStep) {
        console.warn(`[FLOW] ⚠️ Flow "${flow.name}" has no steps`);
        continue;
      }
      
      const nextRun = calculateNextRun(firstStep);
      
      await db.query(
        `INSERT INTO flow_executions (flow_id, lead_phone, current_step, next_run_at, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [flow.id, phone, 0, nextRun, 'active']
      );
      
      console.log(`[FLOW] ✨ Started flow "${flow.name}" for ${phone} - next run at ${nextRun.toISOString()}`);
    }
    
  } catch (error) {
    console.error('[FLOW] ❌ Error triggering flows:', error);
  }
}

/**
 * Initialize the flow_executions table
 */
async function initFlowExecutionsTable() {
  if (!db) return;

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS flow_executions (
        id SERIAL PRIMARY KEY,
        flow_id UUID NOT NULL,
        lead_phone VARCHAR(20) NOT NULL,
        current_step INT DEFAULT 0,
        next_run_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_next_run ON flow_executions(next_run_at) WHERE status = 'active'
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_phone ON flow_executions(lead_phone)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flow_id ON flow_executions(flow_id)
    `);

    console.log('✅ flow_executions table initialized');
  } catch (error) {
    console.error('❌ Error initializing flow_executions table:', error);
  }
}

module.exports = {
  startFlowEngine,
  triggerFlowsOnStatusChange,
  initFlowExecutionsTable,
  calculateNextRun,
  executeStep,
};
