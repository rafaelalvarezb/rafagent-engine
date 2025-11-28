import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  title: text("title"),
  timezone: text("timezone").default('America/Mexico_City'),
  // OAuth tokens for Google integration
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User configuration
export const userConfig = pgTable("user_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  customName: text("custom_name"), // User's preferred name (overrides Google name)
  daysBetweenFollowups: integer("days_between_followups").default(4),
  numberOfTouchpoints: integer("number_of_touchpoints").default(4),
  meetingTitle: text("meeting_title").default('${companyName} & Google'),
  meetingDescription: text("meeting_description"),
  searchStartTime: text("search_start_time").default('09:00'),
  searchEndTime: text("search_end_time").default('17:00'),
  agentFrequencyHours: real("agent_frequency_hours").default(2),
  workingDays: text("working_days").default("monday,tuesday,wednesday,thursday,friday"), // Comma-separated days
  timezone: text("timezone").default("America/Mexico_City"),
  lastAgentRun: timestamp("last_agent_run"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Prospects table
export const prospects = pgTable("prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sequenceId: varchar("sequence_id").references(() => sequences.id, { onDelete: 'set null' }), // Which sequence to use
  externalCid: text("external_cid"),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactTitle: text("contact_title"),
  companyName: text("company_name"),
  industry: text("industry"),
  status: text("status").default(''),
  sendSequence: boolean("send_sequence").default(false),
  touchpointsSent: integer("touchpoints_sent").default(0),
  lastContactDate: timestamp("last_contact_date"),
  threadId: text("thread_id"),
  threadLink: text("thread_link"),
  lastMessageId: text("last_message_id"), // Gmail Message-ID for email threading
  suggestedDays: text("suggested_days"),
  suggestedTime: text("suggested_time"),
  suggestedTimezone: text("suggested_timezone"),
  suggestedWeek: text("suggested_week"),
  emailOpened: boolean("email_opened").default(false), // For analytics - pixel tracking
  emailOpenedAt: timestamp("email_opened_at"), // When email was opened
  repliedAt: timestamp("replied_at"), // When prospect replied
  meetingTime: timestamp("meeting_time"), // When the meeting is scheduled for
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sequences (for organizing templates into sequences)
export const sequences = pgTable("sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false), // Standard Sequence is default
  // Meeting templates for this sequence
  meetingTitle: text("meeting_title").default('${companyName} & Google'),
  meetingDescription: text("meeting_description"),
  // Reminder templates (DISABLED - keeping for compatibility)
  reminderEnabled: boolean("reminder_enabled").default(false), // Disabled
  reminderTiming: text("reminder_timing").default('24h'), // Not used
  reminderSubject: text("reminder_subject").default('Reminder: Meeting Tomorrow'), // Not used
  reminderBody: text("reminder_body").default('Hi ${contactName},\n\nThis is a friendly reminder about our meeting scheduled for tomorrow.\n\nLooking forward to speaking with you!\n\nBest,\n${yourName}'), // Not used
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email templates
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sequenceId: varchar("sequence_id").references(() => sequences.id, { onDelete: 'cascade' }),
  templateName: text("template_name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  isActive: boolean("is_active").default(true),
  orderIndex: integer("order_index").default(0), // Order within sequence
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Activity logs
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  prospectId: varchar("prospect_id").references(() => prospects.id, { onDelete: 'cascade' }),
  action: text("action").notNull(),
  detail: text("detail"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Campaigns (for tracking automated sequences)
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Mailboxes (for multiple Gmail accounts per user)
export const mailboxes = pgTable("mailboxes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  displayName: text("display_name"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry"),
  isActive: boolean("is_active").default(true),
  dailySendLimit: integer("daily_send_limit").default(25),
  emailsSentToday: integer("emails_sent_today").default(0),
  lastResetDate: timestamp("last_reset_date"),
  warmupStatus: text("warmup_status").default('not_started'),
  warmupStartDate: timestamp("warmup_start_date"),
  warmupCurrentDay: integer("warmup_current_day").default(0),
  reputationScore: real("reputation_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertUserConfigSchema = createInsertSchema(userConfig).omit({
  id: true,
});

export const insertProspectSchema = createInsertSchema(prospects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSequenceSchema = createInsertSchema(sequences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  timestamp: true,
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
});

export const insertMailboxSchema = createInsertSchema(mailboxes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserConfig = typeof userConfig.$inferSelect;
export type InsertUserConfig = z.infer<typeof insertUserConfigSchema>;

export type Prospect = typeof prospects.$inferSelect;
export type InsertProspect = z.infer<typeof insertProspectSchema>;

export type Sequence = typeof sequences.$inferSelect;
export type InsertSequence = z.infer<typeof insertSequenceSchema>;

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type Mailbox = typeof mailboxes.$inferSelect;
export type InsertMailbox = z.infer<typeof insertMailboxSchema>;
