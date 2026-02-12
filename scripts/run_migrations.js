#!/usr/bin/env node

/**
 * Migration Runner
 * Runs database migrations for the bot
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set in environment');
  process.exit(1);
}

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(poolConfig);

async function runMigration(filename) {
  const migrationPath = path.join(__dirname, '..', 'migrations', filename);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${filename}`);
    return false;
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    console.log(`⏳ Running migration: ${filename}...`);
    await pool.query(sql);
    console.log(`✅ Migration completed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`❌ Migration failed: ${filename}`);
    console.error(error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting migrations...\n');

  // List of migrations in order
  const migrations = [
    '001_create_flow_executions.sql',
  ];

  let allSucceeded = true;

  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (!success) {
      allSucceeded = false;
      break;
    }
  }

  await pool.end();

  if (allSucceeded) {
    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Some migrations failed');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Migration runner error:', error);
  process.exit(1);
});
