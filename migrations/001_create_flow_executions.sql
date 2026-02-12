-- Flow Executions Table
-- Tracks the execution of automation flows for each lead

CREATE TABLE IF NOT EXISTS flow_executions (
  id SERIAL PRIMARY KEY,
  flow_id UUID NOT NULL,                     -- ID of the flow from Supabase
  lead_phone VARCHAR(20) NOT NULL,           -- Phone number of the lead
  current_step INT DEFAULT 0,                -- Current step index in the flow
  next_run_at TIMESTAMPTZ,                  -- When to execute the next step
  status VARCHAR(20) DEFAULT 'active',       -- active/paused/completed/failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying of pending executions
CREATE INDEX IF NOT EXISTS idx_next_run ON flow_executions(next_run_at) WHERE status = 'active';

-- Index for querying executions by lead phone
CREATE INDEX IF NOT EXISTS idx_lead_phone ON flow_executions(lead_phone);

-- Index for querying executions by flow_id
CREATE INDEX IF NOT EXISTS idx_flow_id ON flow_executions(flow_id);

-- Add comment for documentation
COMMENT ON TABLE flow_executions IS 'Tracks automation flow execution state for each lead';
COMMENT ON COLUMN flow_executions.flow_id IS 'UUID reference to flows table in Supabase';
COMMENT ON COLUMN flow_executions.current_step IS 'Zero-based index of current step in flow.steps array';
COMMENT ON COLUMN flow_executions.next_run_at IS 'Timestamp when the next step should be executed';
COMMENT ON COLUMN flow_executions.status IS 'Execution status: active, paused, completed, or failed';
