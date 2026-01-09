#!/usr/bin/env node

// Resets a WhatsApp user's session out of HUMAN_HANDOFF.
// Usage:
//   node scripts/reset_handoff.js 972547462208
//
// Forces NODE_ENV=production so db.js enables SSL for Railway-style DATABASE_URL.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

require('dotenv').config();

const { getSession, updateSession } = require('../db');
const fs = require('fs');
const path = require('path');

async function main() {
  const phone = process.argv[2];
  if (!phone) {
    console.error('Usage: node scripts/reset_handoff.js <phoneNumber>');
    process.exitCode = 1;
    return;
  }

  const normalized = String(phone).trim();

  const before = await getSession(normalized);
  console.log('[reset_handoff] Before:', {
    phone_number: before.phone_number,
    current_state: before.current_state,
    lead_data: before.lead_data,
  });

  await updateSession(normalized, {
    current_state: 'STATE_WELCOME',
    intent: null,
    shed_size: null,
    flooring_status: null,
    city: null,
  });

  const after = await getSession(normalized);
  console.log('[reset_handoff] After:', {
    phone_number: after.phone_number,
    current_state: after.current_state,
    lead_data: after.lead_data,
  });

  const outputPath = path.join(__dirname, 'reset_handoff.last.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        phone_number: normalized,
        before: {
          current_state: before.current_state,
          lead_data: before.lead_data,
        },
        after: {
          current_state: after.current_state,
          lead_data: after.lead_data,
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  console.log(`[reset_handoff] Wrote: ${outputPath}`);
}

main().catch((err) => {
  try {
    const outputPath = path.join(__dirname, 'reset_handoff.last.json');
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          ok: false,
          error: {
            message: err?.message || String(err),
            stack: err?.stack,
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
  } catch (_) {
    // ignore secondary errors writing debug file
  }

  console.error('[reset_handoff] Failed:', err?.message || err);
  process.exitCode = 1;
});
