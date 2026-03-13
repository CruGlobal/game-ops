// app/lib/appSettings.js
// Lightweight app settings stored in a key-value table without requiring Prisma migrations.

import { prisma } from './prisma.js';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

const CREATE_FUNC_SQL = `
CREATE OR REPLACE FUNCTION app_settings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`;

const DROP_TRIGGER_SQL = `DROP TRIGGER IF EXISTS app_settings_touch ON app_settings;`;

const CREATE_TRIGGER_SQL = `
CREATE TRIGGER app_settings_touch
BEFORE UPDATE ON app_settings
FOR EACH ROW EXECUTE PROCEDURE app_settings_touch_updated_at();`;

const CRON_KEY = 'cron_enabled';
const CRON_TASKS_KEY = 'cron_tasks';

// Default task definitions with schedule descriptions
export const CRON_TASK_DEFAULTS = {
  prReviewSync:     { enabled: false, label: 'PR/Review Sync',       schedule: 'Every 6 hours' },
  badgeAwards:      { enabled: false, label: 'Badge Awards',         schedule: 'Every 6 hours' },
  billAwards:       { enabled: false, label: 'Bill/Vonette Awards',  schedule: 'Daily midnight' },
  challengeGen:     { enabled: false, label: 'Challenge Generation', schedule: 'Weekly (Monday)' },
  challengeExpiry:  { enabled: false, label: 'Challenge Expiry',     schedule: 'Daily midnight' },
  quarterCheck:     { enabled: false, label: 'Quarter Boundary Check', schedule: 'Daily midnight' },
  devOpsSync:       { enabled: false, label: 'DevOps Team Sync',     schedule: 'Daily 2 AM UTC' }
};

export async function ensureAppSettingsTable() {
  // Execute DDL statements individually (Postgres disallows multiple commands in one prepared statement)
  try { await prisma.$executeRawUnsafe(CREATE_TABLE_SQL); } catch (e) { /* ignore if fails */ }
  try { await prisma.$executeRawUnsafe(CREATE_FUNC_SQL); } catch (e) { /* ignore if fails */ }
  try { await prisma.$executeRawUnsafe(DROP_TRIGGER_SQL); } catch (e) { /* ignore if fails */ }
  try { await prisma.$executeRawUnsafe(CREATE_TRIGGER_SQL); } catch (e) { /* ignore if fails */ }
}

export async function getCronEnabled() {
  try {
    const rows = await prisma.$queryRaw`SELECT value FROM app_settings WHERE key = ${CRON_KEY}`;
    if (Array.isArray(rows) && rows.length > 0) {
      const val = rows[0].value;
      return Boolean(val?.enabled === true);
    }
    // default disabled
    return false;
  } catch (e) {
    // If table not found yet, treat as disabled
    return false;
  }
}

export async function setCronEnabled(enabled) {
  const value = { enabled: !!enabled };
  // Upsert semantics using ON CONFLICT
  await prisma.$executeRaw`INSERT INTO app_settings(key, value) VALUES (${CRON_KEY}, ${JSON.stringify(value)}::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return value.enabled;
}

// Per-task settings
export async function getCronTaskSettings() {
  try {
    const rows = await prisma.$queryRaw`SELECT value FROM app_settings WHERE key = ${CRON_TASKS_KEY}`;
    if (Array.isArray(rows) && rows.length > 0) {
      return { ...CRON_TASK_DEFAULTS, ...rows[0].value };
    }
    return { ...CRON_TASK_DEFAULTS };
  } catch (e) {
    return { ...CRON_TASK_DEFAULTS };
  }
}

export async function setCronTaskSetting(taskName, enabled) {
  const current = await getCronTaskSettings();
  if (!current[taskName]) throw new Error(`Unknown task: ${taskName}`);
  current[taskName] = { ...current[taskName], enabled: !!enabled };
  await prisma.$executeRaw`INSERT INTO app_settings(key, value) VALUES (${CRON_TASKS_KEY}, ${JSON.stringify(current)}::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return current;
}

export async function isTaskEnabled(taskName) {
  const settings = await getCronTaskSettings();
  return Boolean(settings[taskName]?.enabled);
}
