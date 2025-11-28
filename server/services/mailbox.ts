import { storage } from '../storage';
import { getAuthUrl, getTokensFromCode, getUserInfo } from '../auth';
import type { InsertMailbox, Mailbox } from '@shared/schema';

/**
 * Get OAuth URL for adding a new mailbox
 */
export function getMailboxAuthUrl(): string {
  const { google } = require('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
  );
  
  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: 'add_mailbox' // State to identify this is for adding mailbox
  });
}

/**
 * Create a new mailbox from OAuth callback
 */
export async function createMailboxFromOAuth(
  userId: string,
  code: string
): Promise<Mailbox> {
  // Exchange code for tokens
  const tokens = await getTokensFromCode(code);
  
  if (!tokens.access_token) {
    throw new Error('No access token received');
  }

  // Get user info from Google
  const userInfo = await getUserInfo(tokens.access_token, tokens.refresh_token);
  
  if (!userInfo.email) {
    throw new Error('No email received from Google');
  }

  // Check if mailbox already exists for this user
  const existingMailboxes = await storage.getMailboxesByUser(userId);
  const existingMailbox = existingMailboxes.find(m => m.email === userInfo.email);
  
  if (existingMailbox) {
    // Update existing mailbox with new tokens
    return await storage.updateMailbox(existingMailbox.id, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token || undefined,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      displayName: userInfo.name || undefined,
      isActive: true
    }) || existingMailbox;
  }

  // Create new mailbox
  const mailbox: InsertMailbox = {
    userId,
    email: userInfo.email,
    displayName: userInfo.name || undefined,
    googleAccessToken: tokens.access_token,
    googleRefreshToken: tokens.refresh_token || undefined,
    googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    isActive: true,
    dailySendLimit: 25,
    emailsSentToday: 0,
    warmupStatus: 'not_started',
    warmupCurrentDay: 0,
    reputationScore: 0
  };

  return await storage.createMailbox(mailbox);
}

/**
 * Get next available mailbox for sending emails
 * Implements round-robin rotation
 */
export async function getNextAvailableMailbox(userId: string): Promise<Mailbox | undefined> {
  return await storage.getNextAvailableMailbox(userId);
}

/**
 * Increment email count for a mailbox
 */
export async function incrementMailboxEmailCount(mailboxId: string): Promise<void> {
  const mailbox = await storage.getMailbox(mailboxId);
  if (!mailbox) {
    throw new Error('Mailbox not found');
  }

  const newCount = (mailbox.emailsSentToday || 0) + 1;
  await storage.updateMailbox(mailboxId, {
    emailsSentToday: newCount
  });
}

/**
 * Check if mailbox can send more emails today
 */
export async function canMailboxSendEmail(mailboxId: string): Promise<boolean> {
  const mailbox = await storage.getMailbox(mailboxId);
  if (!mailbox || !mailbox.isActive) {
    return false;
  }

  const emailsSent = mailbox.emailsSentToday || 0;
  const dailyLimit = mailbox.dailySendLimit || 25;

  return emailsSent < dailyLimit;
}

/**
 * Sync user's main mailbox from their OAuth tokens
 * Creates a mailbox if user has OAuth tokens but no mailbox exists
 */
export async function syncUserMainMailbox(userId: string): Promise<Mailbox | null> {
  const user = await storage.getUser(userId);
  if (!user || !user.googleAccessToken || !user.email) {
    return null;
  }

  // Import storage here to avoid circular dependency
  const { storage: storageInstance } = await import('../storage');

  // Check if mailbox already exists for this email
  const existingMailboxes = await storageInstance.getMailboxesByUser(userId);
  const existingMailbox = existingMailboxes.find(m => m.email === user.email);
  
  if (existingMailbox) {
    // Update existing mailbox with current tokens
    return await storageInstance.updateMailbox(existingMailbox.id, {
      googleAccessToken: user.googleAccessToken,
      googleRefreshToken: user.googleRefreshToken || undefined,
      googleTokenExpiry: user.googleTokenExpiry || undefined,
      isActive: true
    }) || existingMailbox;
  }

  // Create new mailbox from user's OAuth tokens
  const mailbox: InsertMailbox = {
    userId,
    email: user.email,
    displayName: user.name || undefined,
    googleAccessToken: user.googleAccessToken,
    googleRefreshToken: user.googleRefreshToken || undefined,
    googleTokenExpiry: user.googleTokenExpiry || undefined,
    isActive: true,
    dailySendLimit: 25,
    emailsSentToday: 0,
    warmupStatus: 'not_started',
    warmupCurrentDay: 0,
    reputationScore: 0
  };

  return await storageInstance.createMailbox(mailbox);
}

