import { pgTable, text, timestamp, integer, jsonb, boolean, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
  timezone: text('timezone').default('America/New_York').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const calendarAccounts = pgTable('calendar_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: text('provider').notNull(),
  accountEmail: text('account_email').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  autoJoin: boolean('auto_join').default(true).notNull(),
  joinNotifyMinutes: integer('join_notify_minutes').default(2).notNull(),
  status: text('status').default('connected').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  providerEmailIdx: index('cal_provider_email_idx').on(t.provider, t.accountEmail),
}));

export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  calendarAccountId: uuid('calendar_account_id').references(() => calendarAccounts.id, { onDelete: 'set null' }),
  externalEventId: text('external_event_id'),
  title: text('title').notNull(),
  platform: text('platform').notNull(),
  meetingUrl: text('meeting_url').notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }),
  host: text('host'),
  attendees: jsonb('attendees').$type<Array<{ email: string; name?: string }>>().default([]).notNull(),
  autoJoin: boolean('auto_join').default(true).notNull(),
  status: text('status').default('scheduled').notNull(),
  botId: uuid('bot_id'),
  recordingPath: text('recording_path'),
  transcript: text('transcript'),
  transcriptJson: jsonb('transcript_json'),
  summary: text('summary'),
  actionItems: jsonb('action_items').$type<Array<{ owner?: string; task: string; deadline?: string }>>().default([]).notNull(),
  speakers: jsonb('speakers').$type<string[]>().default([]).notNull(),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  notionPageId: text('notion_page_id'),
  notionPageUrl: text('notion_page_url'),
  durationSeconds: integer('duration_seconds'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusStartIdx: index('meeting_status_start_idx').on(t.status, t.startAt),
  userStartIdx: index('meeting_user_start_idx').on(t.userId, t.startAt),
}));

export const bots = pgTable('bots', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  botName: text('bot_name').default('Melvin Notetaker').notNull(),
  status: text('status').default('pending').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  leftAt: timestamp('left_at', { withTimezone: true }),
  containerId: text('container_id'),
  pid: integer('pid'),
  statusHistory: jsonb('status_history').$type<Array<{ code: string; at: string; detail?: string }>>().default([]).notNull(),
  logPath: text('log_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: text('provider').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  status: text('status').default('connected').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userProviderIdx: index('integration_user_provider_idx').on(t.userId, t.provider),
}));

export const platformSettings = pgTable('platform_settings', {
  id: integer('id').primaryKey().default(1),
  data: jsonb('data').$type<PlatformSettingsData>().default(sql`'{}'::jsonb`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  source: text('source').notNull(),              // 'summary' | 'transcript'
  text: text('text').notNull(),
  vector: jsonb('vector').$type<number[]>().notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userMeetingIdx: index('embedding_user_meeting_idx').on(t.userId, t.meetingId),
  meetingChunkUniq: uniqueIndex('embedding_meeting_chunk_uniq').on(t.meetingId, t.chunkIndex, t.source),
}));

export const highlights = pgTable('highlights', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  text: text('text').notNull(),
  note: text('note'),
  startSec: integer('start_sec'),
  endSec: integer('end_sec'),
  color: text('color').default('yellow').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  meetingIdx: index('highlight_meeting_idx').on(t.meetingId),
  userIdx: index('highlight_user_idx').on(t.userId, t.createdAt),
}));

export const platformSettingsSchema = z.object({
  providers: z.object({
    ollama: z.object({
      baseUrl: z.string().default('http://ollama:11434'),
      summaryModel: z.string().default('llama3.1:8b'),
      apiKey: z.string().nullable().default(null),
      enabled: z.boolean().default(true),
    }).default({}),
    groq: z.object({
      apiKey: z.string().nullable().default(null),
      whisperModel: z.string().default('whisper-large-v3-turbo'),
    }).default({}),
    anthropic: z.object({
      apiKey: z.string().nullable().default(null),
    }).default({}),
  }).default({}),
  integrations: z.object({
    notion: z.object({
      apiKey: z.string().nullable().default(null),
      meetingsDatabaseId: z.string().nullable().default(null),
      autoCreatePage: z.boolean().default(true),
    }).default({}),
    googleOAuth: z.object({
      clientId: z.string().nullable().default(null),
      clientSecret: z.string().nullable().default(null),
    }).default({}),
    microsoftOAuth: z.object({
      clientId: z.string().nullable().default(null),
      clientSecret: z.string().nullable().default(null),
      tenantId: z.string().default('common'),
    }).default({}),
    linear: z.object({
      apiKey: z.string().nullable().default(null),
      teamId: z.string().nullable().default(null),
      defaultProjectId: z.string().nullable().default(null),
    }).default({}),
  }).default({}),
  bot: z.object({
    defaultName: z.string().default('Melvin Notetaker'),
    joinBuffer: z.number().default(60),
    maxDurationMinutes: z.number().default(180),
  }).default({}),
  melvinos: z.object({
    baseUrl: z.string().nullable().default(null),
    webhookSecret: z.string().nullable().default(null),
  }).default({}),
  email: z.object({
    smtpHost: z.string().nullable().default(null),
    smtpPort: z.number().int().default(587),
    smtpUser: z.string().nullable().default(null),
    smtpPassword: z.string().nullable().default(null),
    smtpSecure: z.boolean().default(false),           // true = SSL (465), false = STARTTLS (587)
    fromAddress: z.string().nullable().default(null), // e.g. "Memos <noreply@melvinos.com>"
  }).default({}),
  webhooks: z.object({
    outbound: z.array(z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      secret: z.string().nullable().default(null),      // HMAC-SHA256 signing secret
      events: z.array(z.enum(['meeting.completed', 'meeting.failed'])).default(['meeting.completed']),
      enabled: z.boolean().default(true),
      createdAt: z.string().optional(),
    })).default([]),
  }).default({}),
  digest: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['daily', 'weekly']).default('daily'),
    hourOfDay: z.number().int().min(0).max(23).default(8),   // 8am local
    dayOfWeek: z.number().int().min(0).max(6).default(1),    // Monday (for weekly)
    includeActionItems: z.boolean().default(true),
    includeRecentMeetings: z.boolean().default(true),
  }).default({}),
});

export type PlatformSettingsData = z.infer<typeof platformSettingsSchema>;

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const selectMeetingSchema = createSelectSchema(meetings);

export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = typeof meetings.$inferInsert;
export type User = typeof users.$inferSelect;
export type CalendarAccount = typeof calendarAccounts.$inferSelect;
export type Bot = typeof bots.$inferSelect;
export type Integration = typeof integrations.$inferSelect;

export const MEETING_STATUSES = [
  'scheduled', 'joining', 'in_call', 'recording', 'processing',
  'transcribing', 'summarizing', 'completed', 'failed', 'cancelled',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const PLATFORMS = ['google_meet', 'zoom', 'teams', 'voice'] as const;
export type Platform = (typeof PLATFORMS)[number];
