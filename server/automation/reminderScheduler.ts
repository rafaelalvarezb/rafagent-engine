/**
 * RafAgent - Meeting Reminder Scheduler
 * 
 * This scheduler runs every hour and checks if there are any meetings
 * scheduled in the next 24 hours or 1 hour that need reminders sent.
 */

import { storage } from '../storage';
import { sendEmail } from '../services/gmail';
import { replaceTemplateVariables } from '../services/ai';
import cron from 'node-cron';

/**
 * Check and send meeting reminders
 */
async function checkAndSendReminders() {
  console.log('🔔 Checking for meeting reminders (24h before)...');
  
  try {
    const users = await storage.getAllUsers();
    
    for (const user of users) {
      if (!user.googleAccessToken) {
        continue;
      }

      try {
        // Get all prospects with meetings scheduled
        const prospects = await storage.getProspectsByUser(user.id);
        const prospectsWithMeetings = prospects.filter(p => 
          p.status && p.status.includes('Meeting Scheduled') && p.meetingTime
        );

        console.log(`Found ${prospectsWithMeetings.length} prospects with meetings for user ${user.email}`);

        for (const prospect of prospectsWithMeetings) {
          // Get the sequence to check reminder settings
          if (!prospect.sequenceId) continue;
          
          const sequence = await storage.getSequence(prospect.sequenceId);
          if (!sequence || !sequence.reminderEnabled) continue;

          // Only send 24h reminders (simplified)
          const meetingTime = new Date(prospect.meetingTime!);
          const now = new Date();
          const timeDiff = meetingTime.getTime() - now.getTime();
          const hoursUntilMeeting = timeDiff / (1000 * 60 * 60);

          // Send reminder if meeting is between 20-28 hours away (24h ± 4h window)
          if (hoursUntilMeeting >= 20 && hoursUntilMeeting <= 28) {
            // Check if we already sent a reminder for this meeting
            const existingReminder = await storage.getActivityLogsByProspect(prospect.id);
            const hasReminder = existingReminder.some(log => 
              log.action === 'Meeting Reminder Sent (Auto)' && 
              log.detail.includes(meetingTime.toISOString().split('T')[0])
            );

            if (!hasReminder) {
              await sendReminderEmail(user, prospect, sequence, meetingTime);
            }
          }
        }
      } catch (error) {
        console.error(`Error checking reminders for user ${user.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in reminder scheduler:', error);
  }
}

/**
 * Start the reminder scheduler
 * Runs every hour
 */
export function startReminderScheduler() {
  console.log('📅 Starting meeting reminder scheduler...');
  
  // Run every hour at minute 0
  cron.schedule('0 * * * *', () => {
    checkAndSendReminders();
  });
  
  console.log('✅ Reminder scheduler started - will run every hour');
}

/**
 * Send a reminder email to a prospect
 */
async function sendReminderEmail(
  user: any,
  prospect: any,
  sequence: any,
  meetingTime: Date
) {
  try {
    const subject = replaceTemplateVariables(sequence.reminderSubject || 'Reminder: Meeting Tomorrow', {
      externalCid: prospect.externalCid || '',
      contactName: prospect.contactName,
      companyName: prospect.companyName || '',
      contactTitle: prospect.contactTitle || '',
      industry: prospect.industry || '',
      yourName: user.name
    });

    const body = replaceTemplateVariables(sequence.reminderBody || '', {
      externalCid: prospect.externalCid || '',
      contactName: prospect.contactName,
      companyName: prospect.companyName || '',
      contactTitle: prospect.contactTitle || '',
      industry: prospect.industry || '',
      yourName: user.name,
      meetingTime: meetingTime.toLocaleString()
    });

    const htmlBody = body.replace(/\n/g, '<br>');
    
    await sendEmail(
      user.googleAccessToken,
      prospect.contactEmail,
      subject,
      htmlBody,
      prospect.threadId, // Use same thread
      user.googleRefreshToken,
      user.id,
      prospect.lastMessageId,
      prospect.lastMessageId,
      prospect.id, // prospectId for pixel tracking
      user.name || '' // Sender name for "From" header
    );

    console.log(`✅ Reminder sent to ${prospect.contactEmail}`);
    
    await storage.createActivityLog({
      userId: user.id,
      prospectId: prospect.id,
      action: 'Meeting Reminder Sent (Auto)',
      detail: `Reminder sent for meeting at ${meetingTime.toLocaleString()}`
    });
  } catch (error) {
    console.error(`Error sending reminder to ${prospect.contactEmail}:`, error);
  }
}

