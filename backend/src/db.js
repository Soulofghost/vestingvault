import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

const dbPath = process.env.VESTINGVAULT_DB || join(DATA_DIR, 'vestingvault.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      beneficiary TEXT NOT NULL,
      beneficiary_name TEXT NOT NULL,
      role TEXT NOT NULL,
      total_allocation REAL NOT NULL,
      released_amount REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      cliff_months INTEGER NOT NULL,
      duration_months INTEGER NOT NULL,
      revocable INTEGER NOT NULL DEFAULT 1,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      amount REAL NOT NULL,
      tx_hash TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
    );
  `);

  const countRow = db.prepare('SELECT COUNT(*) as c FROM schedules;').get();
  if (countRow.c === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const seedSchedules = [
    {
      id: 'sch-founding-eng',
      beneficiary: '0x1234567890123456789012345678901234567890',
      beneficiary_name: 'Dr. Evelyn Reed',
      role: 'Founding Cryptographer',
      total_allocation: 100000.0,
      released_amount: 25000.0,
      start_date: new Date(Date.now() - 86400000 * 365).toISOString(), // 12 months ago
      cliff_months: 6,
      duration_months: 48,
      revocable: 1,
      revoked: 0
    },
    {
      id: 'sch-advisor-01',
      beneficiary: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      beneficiary_name: 'Soren Lindqvist',
      role: 'Strategic Ecosystem Advisor',
      total_allocation: 40000.0,
      released_amount: 10000.0,
      start_date: new Date(Date.now() - 86400000 * 180).toISOString(), // 6 months ago
      cliff_months: 3,
      duration_months: 24,
      revocable: 1,
      revoked: 0
    },
    {
      id: 'sch-core-dev-02',
      beneficiary: '0x7777888899990000111122223333444455556666',
      beneficiary_name: 'Kai Nakamura',
      role: 'Senior Protocol Engineer',
      total_allocation: 80000.0,
      released_amount: 0.0,
      start_date: new Date(Date.now() - 86400000 * 30).toISOString(), // 1 month ago (pre-cliff)
      cliff_months: 6,
      duration_months: 48,
      revocable: 1,
      revoked: 0
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO schedules (id, beneficiary, beneficiary_name, role, total_allocation, released_amount, start_date, cliff_months, duration_months, revocable, revoked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  for (const s of seedSchedules) {
    stmt.run(s.id, s.beneficiary, s.beneficiary_name, s.role, s.total_allocation, s.released_amount, s.start_date, s.cliff_months, s.duration_months, s.revocable, s.revoked);
  }

  // Seed sample claim
  db.prepare(`
    INSERT INTO claims (id, schedule_id, amount, tx_hash)
    VALUES ('clm-1', 'sch-founding-eng', 25000.0, '0x9999999999999999999999999999999999999999999999999999999999999999');
  `).run();
}

initDb();
