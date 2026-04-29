import { pool } from './db';
import { createLogger } from './logger';

const log = createLogger('migrate');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_email TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  auto_join BOOLEAN NOT NULL DEFAULT TRUE,
  join_notify_minutes INT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cal_provider_email_idx ON calendar_accounts(provider, account_email);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_account_id UUID REFERENCES calendar_accounts(id) ON DELETE SET NULL,
  external_event_id TEXT,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  meeting_url TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  host TEXT,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_join BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'scheduled',
  bot_id UUID,
  recording_path TEXT,
  transcript TEXT,
  transcript_json JSONB,
  summary TEXT,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  speakers JSONB NOT NULL DEFAULT '[]'::jsonb,
  notion_page_id TEXT,
  notion_page_url TEXT,
  duration_seconds INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_status_start_idx ON meetings(status, start_at);
CREATE INDEX IF NOT EXISTS meeting_user_start_idx ON meetings(user_id, start_at);
CREATE UNIQUE INDEX IF NOT EXISTS meeting_cal_event_uniq
  ON meetings(calendar_account_id, external_event_id)
  WHERE calendar_account_id IS NOT NULL AND external_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  bot_name TEXT NOT NULL DEFAULT 'Melvin Notetaker',
  status TEXT NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  container_id TEXT,
  pid INT,
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  log_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_user_provider_idx ON integrations(user_id, provider);

CREATE TABLE IF NOT EXISTS platform_settings (
  id INT PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id, data) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfills for columns added in later schema migrations
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS invite_bot_account BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  meeting_id UUID,
  user_id UUID,
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS error_event_created_idx ON error_events (created_at);
CREATE INDEX IF NOT EXISTS error_event_kind_idx ON error_events (kind, created_at);

CREATE TABLE IF NOT EXISTS highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT,
  start_sec INT,
  end_sec INT,
  color TEXT NOT NULL DEFAULT 'yellow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS highlight_meeting_idx ON highlights(meeting_id);
CREATE INDEX IF NOT EXISTS highlight_user_idx ON highlights(user_id, created_at);

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  vector JSONB NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embedding_user_meeting_idx ON embeddings(user_id, meeting_id);
CREATE UNIQUE INDEX IF NOT EXISTS embedding_meeting_chunk_uniq ON embeddings(meeting_id, chunk_index, source);
`;

export async function runMigrations(): Promise<void> {
  log.info('running migrations');
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    log.info('migrations complete');
  } finally {
    client.release();
  }
}
