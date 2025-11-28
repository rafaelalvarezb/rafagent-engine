import { db } from "./db";
import {
  users, userConfig, prospects, sequences, templates, activityLogs, campaigns, mailboxes,
  type User, type InsertUser,
  type UserConfig, type InsertUserConfig,
  type Prospect, type InsertProspect,
  type Sequence, type InsertSequence,
  type Template, type InsertTemplate,
  type ActivityLog, type InsertActivityLog,
  type Campaign, type InsertCampaign,
  type Mailbox, type InsertMailbox
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;

  // User Config
  getUserConfig(userId: string): Promise<UserConfig | undefined>;
  createUserConfig(config: InsertUserConfig): Promise<UserConfig>;
  updateUserConfig(userId: string, config: Partial<InsertUserConfig>): Promise<UserConfig | undefined>;

  // Prospects
  getProspect(id: string): Promise<Prospect | undefined>;
  getProspectsByUser(userId: string): Promise<Prospect[]>;
  createProspect(prospect: InsertProspect): Promise<Prospect>;
  updateProspect(id: string, prospect: Partial<InsertProspect>): Promise<Prospect | undefined>;
  deleteProspect(id: string): Promise<boolean>;
  getActiveSequenceProspects(userId: string): Promise<Prospect[]>;

  // Sequences
  getSequence(id: string): Promise<Sequence | undefined>;
  getSequencesByUser(userId: string): Promise<Sequence[]>;
  getDefaultSequence(userId: string): Promise<Sequence | undefined>;
  createSequence(sequence: InsertSequence): Promise<Sequence>;
  updateSequence(id: string, sequence: Partial<InsertSequence>): Promise<Sequence | undefined>;
  deleteSequence(id: string): Promise<boolean>;

  // Templates
  getTemplate(id: string): Promise<Template | undefined>;
  getTemplatesByUser(userId: string): Promise<Template[]>;
  getTemplatesBySequence(sequenceId: string): Promise<Template[]>;
  getTemplateByName(userId: string, templateName: string): Promise<Template | undefined>;
  getTemplateBySequenceAndName(sequenceId: string, templateName: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;

  // Activity Logs
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogsByUser(userId: string, limit?: number): Promise<ActivityLog[]>;
  getActivityLogsByProspect(prospectId: string): Promise<ActivityLog[]>;

  // Campaigns
  getCampaign(id: string): Promise<Campaign | undefined>;
  getCampaignsByUser(userId: string): Promise<Campaign[]>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, campaign: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<boolean>;

  // Mailboxes
  getMailbox(id: string): Promise<Mailbox | undefined>;
  getMailboxesByUser(userId: string): Promise<Mailbox[]>;
  getActiveMailboxesByUser(userId: string): Promise<Mailbox[]>;
  createMailbox(mailbox: InsertMailbox): Promise<Mailbox>;
  updateMailbox(id: string, mailbox: Partial<InsertMailbox>): Promise<Mailbox | undefined>;
  deleteMailbox(id: string): Promise<boolean>;
  getNextAvailableMailbox(userId: string): Promise<Mailbox | undefined>;
  resetDailyEmailCounts(): Promise<void>;
}

export class DbStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db.update(users).set(user).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  // User Config
  async getUserConfig(userId: string): Promise<UserConfig | undefined> {
    const result = await db.select().from(userConfig).where(eq(userConfig.userId, userId));
    return result[0];
  }

  async createUserConfig(config: InsertUserConfig): Promise<UserConfig> {
    const result = await db.insert(userConfig).values(config).returning();
    return result[0];
  }

  async updateUserConfig(userId: string, config: Partial<InsertUserConfig>): Promise<UserConfig | undefined> {
    const result = await db.update(userConfig).set(config).where(eq(userConfig.userId, userId)).returning();
    return result[0];
  }

  // Prospects
  async getProspect(id: string): Promise<Prospect | undefined> {
    const result = await db.select().from(prospects).where(eq(prospects.id, id));
    return result[0];
  }

  async getProspectsByUser(userId: string): Promise<Prospect[]> {
    return db.select().from(prospects).where(eq(prospects.userId, userId)).orderBy(desc(prospects.createdAt));
  }

  async createProspect(prospect: InsertProspect): Promise<Prospect> {
    const result = await db.insert(prospects).values(prospect).returning();
    return result[0];
  }

  async updateProspect(id: string, prospect: Partial<InsertProspect>): Promise<Prospect | undefined> {
    const updateData = {
      ...prospect,
      updatedAt: new Date()
    };
    const result = await db.update(prospects).set(updateData).where(eq(prospects.id, id)).returning();
    return result[0];
  }

  async deleteProspect(id: string): Promise<boolean> {
    const result = await db.delete(prospects).where(eq(prospects.id, id)).returning();
    return result.length > 0;
  }

  async getActiveSequenceProspects(userId: string): Promise<Prospect[]> {
    // Get prospects that either:
    // 1. Have active sequences (sendSequence = true) OR
    // 2. Have threadId (so we can check for responses even if sequence finished)
    // But exclude those with "Meeting Scheduled" status
    const allProspects = await db.select().from(prospects).where(
      eq(prospects.userId, userId)
    );
    
    return allProspects.filter(p => 
      (p.sendSequence === true || p.threadId) && 
      !p.status?.includes('Meeting Scheduled')
    );
  }

  // Sequences
  async getSequence(id: string): Promise<Sequence | undefined> {
    const result = await db.select().from(sequences).where(eq(sequences.id, id));
    return result[0];
  }

  async getSequencesByUser(userId: string): Promise<Sequence[]> {
    return db.select().from(sequences).where(eq(sequences.userId, userId)).orderBy(desc(sequences.createdAt));
  }

  async getDefaultSequence(userId: string): Promise<Sequence | undefined> {
    const result = await db.select().from(sequences).where(
      and(
        eq(sequences.userId, userId),
        eq(sequences.isDefault, true)
      )
    );
    return result[0];
  }

  async createSequence(sequence: InsertSequence): Promise<Sequence> {
    const result = await db.insert(sequences).values(sequence).returning();
    return result[0];
  }

  async updateSequence(id: string, sequence: Partial<InsertSequence>): Promise<Sequence | undefined> {
    const updateData = {
      ...sequence,
      updatedAt: new Date()
    };
    const result = await db.update(sequences).set(updateData).where(eq(sequences.id, id)).returning();
    return result[0];
  }

  async deleteSequence(id: string): Promise<boolean> {
    const result = await db.delete(sequences).where(eq(sequences.id, id)).returning();
    return result.length > 0;
  }

  // Templates
  async getTemplate(id: string): Promise<Template | undefined> {
    const result = await db.select().from(templates).where(eq(templates.id, id));
    return result[0];
  }

  async getTemplatesByUser(userId: string): Promise<Template[]> {
    return db.select().from(templates).where(eq(templates.userId, userId)).orderBy(desc(templates.createdAt));
  }

  async getTemplatesBySequence(sequenceId: string): Promise<Template[]> {
    return db.select().from(templates).where(eq(templates.sequenceId, sequenceId)).orderBy(templates.orderIndex);
  }

  async getTemplateByName(userId: string, templateName: string): Promise<Template | undefined> {
    const result = await db.select().from(templates).where(
      and(
        eq(templates.userId, userId),
        eq(templates.templateName, templateName)
      )
    );
    return result[0];
  }

  async getTemplateBySequenceAndName(sequenceId: string, templateName: string): Promise<Template | undefined> {
    const result = await db.select().from(templates).where(
      and(
        eq(templates.sequenceId, sequenceId),
        eq(templates.templateName, templateName)
      )
    );
    return result[0];
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const result = await db.insert(templates).values(template).returning();
    return result[0];
  }

  async updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<Template | undefined> {
    // Remove timestamp fields that shouldn't be updated
    const { updatedAt, createdAt, id: templateId, userId, ...templateData } = template;
    
    // Debug logging
    console.log('Updating template with data:', templateData);
    
    const result = await db.update(templates).set(templateData).where(eq(templates.id, id)).returning();
    return result[0];
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db.delete(templates).where(eq(templates.id, id)).returning();
    return result.length > 0;
  }

  // Activity Logs
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const result = await db.insert(activityLogs).values(log).returning();
    return result[0];
  }

  async getActivityLogsByUser(userId: string, limit: number = 50): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.timestamp))
      .limit(limit);
  }

  async getActivityLogsByProspect(prospectId: string): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(eq(activityLogs.prospectId, prospectId))
      .orderBy(desc(activityLogs.timestamp));
  }

  // Campaigns
  async getCampaign(id: string): Promise<Campaign | undefined> {
    const result = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return result[0];
  }

  async getCampaignsByUser(userId: string): Promise<Campaign[]> {
    return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const result = await db.insert(campaigns).values(campaign).returning();
    return result[0];
  }

  async updateCampaign(id: string, campaign: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const result = await db.update(campaigns).set(campaign).where(eq(campaigns.id, id)).returning();
    return result[0];
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await db.delete(campaigns).where(eq(campaigns.id, id)).returning();
    return result.length > 0;
  }

  // Mailboxes
  async getMailbox(id: string): Promise<Mailbox | undefined> {
    const result = await db.select().from(mailboxes).where(eq(mailboxes.id, id));
    return result[0];
  }

  async getMailboxesByUser(userId: string): Promise<Mailbox[]> {
    return db.select().from(mailboxes)
      .where(eq(mailboxes.userId, userId))
      .orderBy(desc(mailboxes.createdAt));
  }

  async getActiveMailboxesByUser(userId: string): Promise<Mailbox[]> {
    return db.select().from(mailboxes)
      .where(
        and(
          eq(mailboxes.userId, userId),
          eq(mailboxes.isActive, true)
        )
      )
      .orderBy(desc(mailboxes.createdAt));
  }

  async createMailbox(mailbox: InsertMailbox): Promise<Mailbox> {
    const result = await db.insert(mailboxes).values(mailbox).returning();
    return result[0];
  }

  async updateMailbox(id: string, mailbox: Partial<InsertMailbox>): Promise<Mailbox | undefined> {
    const updateData = {
      ...mailbox,
      updatedAt: new Date()
    };
    const result = await db.update(mailboxes).set(updateData).where(eq(mailboxes.id, id)).returning();
    return result[0];
  }

  async deleteMailbox(id: string): Promise<boolean> {
    const result = await db.delete(mailboxes).where(eq(mailboxes.id, id)).returning();
    return result.length > 0;
  }

  /**
   * Get next available mailbox for sending (hasn't reached daily limit)
   * Rotates through active mailboxes
   */
  async getNextAvailableMailbox(userId: string): Promise<Mailbox | undefined> {
    const activeMailboxes = await this.getActiveMailboxesByUser(userId);
    
    // Filter mailboxes that haven't reached daily limit
    const availableMailboxes = activeMailboxes.filter(
      m => (m.emailsSentToday || 0) < (m.dailySendLimit || 25)
    );

    if (availableMailboxes.length === 0) {
      return undefined;
    }

    // Simple round-robin: get the one with least emails sent today
    return availableMailboxes.reduce((prev, curr) => 
      (prev.emailsSentToday || 0) < (curr.emailsSentToday || 0) ? prev : curr
    );
  }

  /**
   * Reset daily email counts for all mailboxes (should be called daily via cron)
   */
  async resetDailyEmailCounts(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all mailboxes that need reset (lastResetDate is not today)
    const allMailboxes = await db.select().from(mailboxes);
    
    for (const mailbox of allMailboxes) {
      const lastReset = mailbox.lastResetDate ? new Date(mailbox.lastResetDate) : null;
      const needsReset = !lastReset || lastReset < today;

      if (needsReset) {
        await db.update(mailboxes)
          .set({
            emailsSentToday: 0,
            lastResetDate: today
          })
          .where(eq(mailboxes.id, mailbox.id));
      }
    }
  }

  // Helper: Clone a sequence with all its templates
  async cloneSequence(sourceSequenceId: string, userId: string, newName: string): Promise<Sequence> {
    // Get source sequence
    const sourceSequence = await this.getSequence(sourceSequenceId);
    if (!sourceSequence) {
      throw new Error('Source sequence not found');
    }

    // Create new sequence with same settings
    const newSequence = await this.createSequence({
      userId,
      name: newName,
      isDefault: false,
      meetingTitle: sourceSequence.meetingTitle,
      meetingDescription: sourceSequence.meetingDescription,
      reminderEnabled: sourceSequence.reminderEnabled,
      reminderTiming: sourceSequence.reminderTiming,
      reminderSubject: sourceSequence.reminderSubject,
      reminderBody: sourceSequence.reminderBody
    });

    // Clone all templates from source sequence
    const sourceTemplates = await this.getTemplatesBySequence(sourceSequenceId);
    for (const template of sourceTemplates) {
      await this.createTemplate({
        userId,
        sequenceId: newSequence.id,
        templateName: template.templateName,
        subject: template.subject,
        body: template.body,
        isActive: template.isActive,
        orderIndex: template.orderIndex
      });
    }

    return newSequence;
  }

  // Analytics functions
  async getAnalytics(userId: string): Promise<{
    totalSent: number;
    totalOpened: number;
    totalReplied: number;
    totalMeetingsScheduled: number;
  }> {
    const allProspects = await this.getProspectsByUser(userId);
    
    const totalSent = allProspects.filter(p => p.touchpointsSent && p.touchpointsSent > 0).length;
    const totalOpened = allProspects.filter(p => p.emailOpened).length;
    const totalReplied = allProspects.filter(p => p.repliedAt !== null).length; // Count prospects who replied
    const totalMeetingsScheduled = allProspects.filter(p => 
      p.status && p.status.includes('Meeting Scheduled')
    ).length;

    return {
      totalSent,
      totalOpened,
      totalReplied,
      totalMeetingsScheduled
    };
  }
}

export const storage = new DbStorage();
