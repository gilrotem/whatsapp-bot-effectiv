const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { pool } = require('../db');

async function dumpTable(client, table) {
  const res = await client.query(`SELECT * FROM ${table}`);
  return res.rows;
}

async function main() {
  const client = await pool.connect();
  try {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(__dirname, '..', 'backups', stamp);
    fs.mkdirSync(outDir, { recursive: true });

    const tables = ['sessions', 'leads', 'messages'];
    for (const t of tables) {
      const rows = await dumpTable(client, t);
      const file = path.join(outDir, `${t}.json`);
      fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
      console.log(`✔ Dumped ${t} → ${file} (${rows.length} rows)`);
    }
    console.log('✅ Backup completed:', outDir);
  } catch (err) {
    console.error('❌ Backup failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

main();
