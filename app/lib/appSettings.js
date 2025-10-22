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
