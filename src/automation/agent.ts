/**
 * RafAgent - Automated Email Sequence Engine
 * 
 * This is the heart of the system. It runs automatically every X hours and:
 * 1. Checks all prospects with sendSequence = true
 * 2. Sends initial emails or follow-ups based on timing
 * 3. Analyzes responses when they come in
 * 4. Schedules meetings for interested prospects
 * 5. Respects working hours and timezones
 */

import { google } from 'googleapis';
import { storage } from '../storage';
import { sendEmail, getThreadMessages, getMessageBody, cleanEmailForAI } from '../services/gmail';
import { classifyResponse, replaceTemplateVariables } from '../services/ai';
import { getAvailableSlots, findNextAvailableSlot, scheduleMeeting } from '../services/calendar';
import { isWithinWorkingHours, getWorkingHoursFromConfig, debugWorkingHours } from '../utils/workingHours';
import { getOAuth2ClientWithRefresh } from '../auth';
import { convertTimezone, getTimezoneDayAdjustment } from '../utils/timezone';
import { emitProspectUpdate, emitProspectStatusChange, emitMeetingScheduled } from '../services/websocket';

interface ProcessResult {
  processed: number;
  emailsSent: number;
  responsesAnalyzed: number;
  meetingsScheduled: number;
  errors: string[];
  outsideWorkingHours?: boolean;
  noNewResponses?: boolean;
  message?: string;
}

/**
 * Main agent function - processes all active prospects
 */
export async function runAgent(userId: string): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    emailsSent: 0,
    responsesAnalyzed: 0,
    meetingsScheduled: 0,
    errors: []
  };

  try {
    // Get user and config
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.googleAccessToken) {
      throw new Error('Google account not connected');
    }

    const config = await storage.getUserConfig(userId);
    if (!config) {
      throw new Error('User config not found');
    }

    // Check if we're in working hours using the new utility
    const workingHours = getWorkingHoursFromConfig(config);
    const debugInfo = debugWorkingHours(workingHours);
    console.log('Working hours debug:', debugInfo);

    if (!isWithinWorkingHours(workingHours)) {
      console.log('Skipping agent run - outside working hours');
      result.outsideWorkingHours = true;
      result.message = 'Agent execution is outside your configured working hours. Modify your working hours in Configuration to execute the agent now.';
      return result;
    }

    // Get all active prospects
    const prospects = await storage.getActiveSequenceProspects(userId);
    console.log(`Processing ${prospects.length} active prospects for user ${user.email}`);

    const daysBetweenFollowups = config.daysBetweenFollowups || 4;
    const numberOfTouchpoints = config.numberOfTouchpoints || 4;
    
    // Track if we checked for responses and found none
    let checkedForResponses = false;
    let foundNewResponses = false;

    for (const prospect of prospects) {
      result.processed++;

      try {
        console.log(`\n📊 Processing prospect: ${prospect.contactName} (${prospect.contactEmail})`);
        console.log(`   - Touchpoints sent: ${prospect.touchpointsSent}`);
        console.log(`   - Last contact: ${prospect.lastContactDate}`);
        console.log(`   - Status: ${prospect.status}`);
        
        // Case 1: No emails sent yet - send initial
        if (!prospect.touchpointsSent || prospect.touchpointsSent === 0) {
          console.log(`   ✅ Sending INITIAL email (no touchpoints sent yet)`);
          await sendInitialEmail(user, prospect);
          result.emailsSent++;
          continue;
        }

        // Case 2: Check if we should send follow-up
        if (prospect.touchpointsSent < numberOfTouchpoints) {
          const daysSinceLastContact = getDaysSince(prospect.lastContactDate);
          console.log(`   - Days since last contact: ${daysSinceLastContact}`);
          console.log(`   - Days between followups (config): ${daysBetweenFollowups}`);
          
          if (daysSinceLastContact >= daysBetweenFollowups) {
            console.log(`   ✅ Sending FOLLOW-UP email (enough days passed)`);
            await sendFollowUpEmail(user, prospect, config);
            result.emailsSent++;
            continue;
          } else {
            console.log(`   ⏳ Skipping: Not enough days passed yet (need ${daysBetweenFollowups - daysSinceLastContact} more days)`);
          }
        } else {
          console.log(`   ⏹️  Skipping: Already sent all ${numberOfTouchpoints} touchpoints`);
        }

        // Case 3: Check for new responses to analyze (check even if sequence finished or not interested)
        if (prospect.threadId && !prospect.status?.includes('Meeting Scheduled')) {
          checkedForResponses = true;
          const responseCheck = await checkForNewResponse(user, prospect);
          
          // If user replied manually, stop the sequence
          if (responseCheck.isManualReply) {
            console.log(`   🛑 Manual reply detected - stopping sequence for ${prospect.contactEmail}`);
            await storage.updateProspect(prospect.id, {
              status: '🛑 Sequence Ended - Manual Reply',
              sendSequence: false
            });
            emitProspectStatusChange(userId, prospect.id, '🛑 Sequence Ended - Manual Reply');
            await storage.createActivityLog({
              userId: user.id,
              prospectId: prospect.id,
              action: 'Sequence Stopped (Manual Reply)',
              detail: 'Sequence stopped because user replied manually to this prospect'
            });
            continue;
          }
          
          if (responseCheck.hasNewResponse) {
            foundNewResponses = true;
            const wasInterested = await analyzeProspectResponse(user, prospect);
            result.responsesAnalyzed++;
            
            // If interested, schedule meeting immediately and stop sequences for same company
            if (wasInterested) {
              // Refresh prospect data from database to get updated suggestedDays/suggestedTime
              const updatedProspect = await storage.getProspect(prospect.id);
              if (updatedProspect) {
                // Get the sequence configuration for this prospect
                const sequence = updatedProspect.sequenceId 
                  ? await storage.getSequence(updatedProspect.sequenceId)
                  : null;
                
                await scheduleProspectMeeting(user, updatedProspect, config, sequence);
                result.meetingsScheduled++;
                
                // Stop sequences for other prospects from the same company
                if (updatedProspect.companyName) {
                  await stopSequencesForSameCompany(user.id, updatedProspect.companyName, updatedProspect.id);
                }
              }
            }
            // Skip marking as "Sequence Finished" if we processed a response
            continue;
          }
        }

        // Case 4: Sequence finished (only if no response was received)
        if (prospect.touchpointsSent >= numberOfTouchpoints && (prospect.status === 'following_up' || prospect.status === 'Following up')) {
          await storage.updateProspect(prospect.id, {
            status: '🚫 Sequence Finished',
            sendSequence: false
          });
          // Emit WebSocket update
          emitProspectStatusChange(userId, prospect.id, '🚫 Sequence Finished');
        }

      } catch (error: any) {
        console.error(`Error processing prospect ${prospect.id}:`, error);
        result.errors.push(`${prospect.contactEmail}: ${error.message}`);
      }
    }

    // Check if no new responses were detected
    if (checkedForResponses && !foundNewResponses && result.emailsSent === 0 && result.responsesAnalyzed === 0 && result.meetingsScheduled === 0) {
      result.noNewResponses = true;
      result.message = 'No new responses detected for these prospects in your email inbox. Please wait a few seconds and try again.';
    }

    // Log activity
    await storage.createActivityLog({
      userId,
      action: 'Agent Run Completed',
      detail: `Processed ${result.processed} prospects, sent ${result.emailsSent} emails, analyzed ${result.responsesAnalyzed} responses, scheduled ${result.meetingsScheduled} meetings`
    });

    console.log('Agent run completed:', result);
    return result;

  } catch (error: any) {
    console.error('Agent run failed:', error);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Helper function to create smooth status transitions for dopaminic UX
 */
async function transitionThroughStatuses(
  userId: string,
  prospectId: string,
  statuses: { status: string; duration: number }[]
) {
  for (let i = 0; i < statuses.length; i++) {
    const { status, duration } = statuses[i];
    
    // Update status
    await storage.updateProspect(prospectId, { status });
    emitProspectStatusChange(userId, prospectId, status);
    
    // Wait for duration (except for the last status which stays)
    if (i < statuses.length - 1) {
      await new Promise(resolve => setTimeout(resolve, duration));
    }
  }
}

/**
 * Send initial email to prospect
 */
async function sendInitialEmail(user: any, prospect: any) {
  // Get the sequence for this prospect
  const sequence = prospect.sequenceId 
    ? await storage.getSequence(prospect.sequenceId)
    : await storage.getDefaultSequence(user.id);
  
  if (!sequence) {
    throw new Error('No sequence found for prospect');
  }

  // Get template from the prospect's specific sequence
  const template = await storage.getTemplateBySequenceAndName(sequence.id, 'Initial');
  if (!template) {
    throw new Error('Initial template not found in sequence');
  }

  const subject = replaceTemplateVariables(template.subject, {
    externalCid: prospect.externalCid || '',
    contactName: prospect.contactName,
    companyName: prospect.companyName || '',
    contactTitle: prospect.contactTitle || '',
    industry: prospect.industry || '',
    yourName: user.name
  });

  const body = replaceTemplateVariables(template.body, {
    externalCid: prospect.externalCid || '',
    contactName: prospect.contactName,
    companyName: prospect.companyName || '',
    contactTitle: prospect.contactTitle || '',
    industry: prospect.industry || '',
    yourName: user.name
  });

  const htmlBody = body.replace(/\n/g, '<br>');
  
  // Start status transition: Drafting → Sending → Following up
  // Start with drafting state
  await storage.updateProspect(prospect.id, { status: '📝 Drafting next touch' });
  emitProspectStatusChange(user.id, prospect.id, '📝 Drafting next touch');
  
  // Wait a moment for dopaminic effect
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Move to sending state
  await storage.updateProspect(prospect.id, { status: '📤 Sending next touch' });
  emitProspectStatusChange(user.id, prospect.id, '📤 Sending next touch');
  
  // Send the actual email
  const result = await sendEmail(
    user.googleAccessToken,
    prospect.contactEmail,
    subject,
    htmlBody,
    undefined,
    user.googleRefreshToken,
    user.id,
    undefined,
    undefined,
    prospect.id, // Add prospectId for pixel tracking
    user.name || '' // Sender name for "From" header
  );

  const threadLink = `https://mail.google.com/mail/u/0/#thread/${result.threadId}`;

  // Wait a moment before final state
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Final state: Following up
  await storage.updateProspect(prospect.id, {
    status: 'Following up',
    threadId: result.threadId,
    threadLink: threadLink,
    touchpointsSent: 1,
    lastContactDate: new Date(),
    lastMessageId: result.messageId // Save Message-ID for threading
  });

  // Emit WebSocket update for real-time UI refresh
  emitProspectUpdate(user.id, prospect.id);
  emitProspectStatusChange(user.id, prospect.id, 'Following up');

  await storage.createActivityLog({
    userId: user.id,
    prospectId: prospect.id,
    action: 'Initial Email Sent (Auto)',
    detail: `Email sent to ${prospect.contactEmail} using ${sequence.name} sequence`
  });
}

/**
 * Get template name for touchpoint number
 * Initial = 1, Second Touch = 2, Third Touch = 3, Fourth Touch = 4, Fifth Touch = 5, etc.
 */
function getTemplateNameForTouchpoint(touchpointNumber: number): string {
  const names = ['Initial', 'Second Touch', 'Third Touch', 'Fourth Touch', 'Fifth Touch', 'Sixth Touch', 'Seventh Touch', 'Eighth Touch'];
  return names[touchpointNumber - 1] || `Touch ${touchpointNumber}`;
}

/**
 * Send follow-up email
 */
async function sendFollowUpEmail(user: any, prospect: any, config: any) {
  // Get the sequence for this prospect
  const sequence = prospect.sequenceId 
    ? await storage.getSequence(prospect.sequenceId)
    : await storage.getDefaultSequence(user.id);
  
  if (!sequence) {
    throw new Error('No sequence found for prospect');
  }

  const nextTouchpoint = (prospect.touchpointsSent || 0) + 1;
  const templateName = getTemplateNameForTouchpoint(nextTouchpoint);
  
  // Get template from the prospect's specific sequence
  const template = await storage.getTemplateBySequenceAndName(sequence.id, templateName);
  
  if (!template) {
    throw new Error(`${templateName} template not found in sequence`);
  }

  const body = replaceTemplateVariables(template.body, {
    externalCid: prospect.externalCid || '',
    contactName: prospect.contactName,
    companyName: prospect.companyName || '',
    contactTitle: prospect.contactTitle || '',
    industry: prospect.industry || '',
    yourName: user.name
  });

  // For follow-ups, we need to use the SAME subject as the initial email
  // Get the Initial template's subject from the same sequence and use it for threading
  const initialTemplate = await storage.getTemplateBySequenceAndName(sequence.id, 'Initial');
  if (!initialTemplate) {
    throw new Error('Initial template not found in sequence');
  }
  
  const subject = replaceTemplateVariables(initialTemplate.subject, {
    externalCid: prospect.externalCid || '',
    contactName: prospect.contactName,
    companyName: prospect.companyName || '',
    contactTitle: prospect.contactTitle || '',
    industry: prospect.industry || '',
    yourName: user.name
  });

  const htmlBody = body.replace(/\n/g, '<br>');
  
  // Start status transition: Drafting → Sending → Following up
  // Start with drafting state
  await storage.updateProspect(prospect.id, { status: '📝 Drafting next touch' });
  emitProspectStatusChange(user.id, prospect.id, '📝 Drafting next touch');
  
  // Wait a moment for dopaminic effect
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Move to sending state
  await storage.updateProspect(prospect.id, { status: '📤 Sending next touch' });
  emitProspectStatusChange(user.id, prospect.id, '📤 Sending next touch');
  
  // Use previous Message-ID for threading
  const result = await sendEmail(
    user.googleAccessToken,
    prospect.contactEmail,
    subject, // SAME subject as initial email for threading
    htmlBody,
    prospect.threadId,
    user.googleRefreshToken,
    user.id,
    prospect.lastMessageId, // In-Reply-To header
    prospect.lastMessageId,  // References header
    prospect.id, // Add prospectId for pixel tracking
    user.name || '' // Sender name for "From" header
  );

  // Wait a moment before final state
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Final state: Following up
  await storage.updateProspect(prospect.id, {
    status: 'Following up',
    touchpointsSent: nextTouchpoint,
    lastContactDate: new Date(),
    lastMessageId: result.messageId // Update with new Message-ID
  });

  // Emit WebSocket update for real-time UI refresh
  emitProspectUpdate(user.id, prospect.id);
  emitProspectStatusChange(user.id, prospect.id, 'Following up');

  await storage.createActivityLog({
    userId: user.id,
    prospectId: prospect.id,
    action: `Follow-up #${nextTouchpoint} Sent (Auto)`,
    detail: `Follow-up sent to ${prospect.contactEmail} using ${sequence.name} sequence`
  });
}

/**
 * Check if there's a new response in the thread
 * Returns: { hasNewResponse: boolean, isManualReply: boolean }
 */
async function checkForNewResponse(user: any, prospect: any): Promise<{ hasNewResponse: boolean; isManualReply: boolean }> {
  try {
    const messages = await getThreadMessages(
      user.googleAccessToken,
      prospect.threadId,
      user.googleRefreshToken,
      user.id
    );

    if (messages.length === 0) return { hasNewResponse: false, isManualReply: false };

    // Get the last message
    const lastMessage = messages[messages.length - 1];
    const from = lastMessage.payload?.headers?.find((h: any) => 
      h.name.toLowerCase() === 'from'
    )?.value || '';

    // Check if last message is from the user (manual reply)
    const userEmail = user.email?.toLowerCase() || '';
    const isFromUser = from.toLowerCase().includes(userEmail);
    
    if (isFromUser) {
      console.log(`Last message is from user (manual reply): ${from}`);
      return { hasNewResponse: true, isManualReply: true };
    }

    // Check if last message is from prospect (not from us)
    const isFromProspect = from.toLowerCase().includes(prospect.contactEmail.toLowerCase());
    
    if (!isFromProspect) {
      console.log(`Last message is not from prospect ${prospect.contactEmail}, it's from: ${from}`);
      return { hasNewResponse: false, isManualReply: false };
    }

    // Check if we've already processed this response by looking at the prospect status
    // Allow processing if status is "following_up", "Sequence Finished", or "Not Interested"
    // Only skip if status indicates already scheduled or clearly processed (Interested, Meeting Scheduled, etc.)
    const currentStatus = prospect.status;
    const alreadyProcessedStatuses = ['✅ Interested - Schedule!', '✅ Meeting Scheduled'];
    
    if (alreadyProcessedStatuses.some(s => currentStatus?.includes(s))) {
      console.log(`Response already processed for prospect ${prospect.contactEmail}, current status: ${currentStatus}`);
      return { hasNewResponse: false, isManualReply: false };
    }

    console.log(`Found new response from prospect ${prospect.contactEmail}`);
    return { hasNewResponse: true, isManualReply: false };

  } catch (error) {
    console.error('Error checking for new response:', error);
    return { hasNewResponse: false, isManualReply: false };
  }
}

/**
 * Analyze prospect's response with AI
 */
async function analyzeProspectResponse(user: any, prospect: any): Promise<boolean> {
  console.log(`Analyzing response from prospect ${prospect.contactEmail}`);
  
  const messages = await getThreadMessages(
    user.googleAccessToken,
    prospect.threadId,
    user.googleRefreshToken,
    user.id
  );

  if (messages.length === 0) {
    console.log('No messages found in thread');
    return false;
  }

  const lastMessage = messages[messages.length - 1];
  const from = lastMessage.payload?.headers?.find((h: any) => 
    h.name.toLowerCase() === 'from'
  )?.value || '';

  console.log(`Last message from: ${from}`);

  // Check for bounce
  if (from.toLowerCase().includes('mailer-daemon') || from.toLowerCase().includes('postmaster')) {
    console.log('Bounce detected');
    await storage.updateProspect(prospect.id, { 
      status: 'Bounce - Invalid Email',
      sendSequence: false
    });
    await storage.createActivityLog({
      userId: user.id,
      prospectId: prospect.id,
      action: 'Bounce Detected (Auto)',
      detail: 'Automatic bounce message detected'
    });
    return false;
  }

  const body = await getMessageBody(lastMessage);
  console.log(`Response body (raw): ${body.substring(0, 200)}...`);
  
  // Clean the email body to extract ONLY the prospect's actual response
  const cleanedBody = cleanEmailForAI(body);
  console.log(`Response body (cleaned): ${cleanedBody}`);
  
  const classification = await classifyResponse(cleanedBody);
  console.log(`AI Classification: ${classification.category}`);

  let newStatus = '';
  let isInterested = false;
  
  switch (classification.category) {
    case 'INTERESTED':
      newStatus = '✅ Interested - Schedule!';
      isInterested = true;
      break;
    case 'NOT_INTERESTED':
      newStatus = '❌ Not Interested';
      await storage.updateProspect(prospect.id, { sendSequence: false });
      break;
    case 'REFERRAL':
      // Pause the sequence and let the user follow up manually
      newStatus = classification.referredEmail
        ? `🤝 Referred to ${classification.referredEmail}`
        : '🤝 Referral (Email not found)';
      await storage.updateProspect(prospect.id, { sendSequence: false });
      break;
    case 'BOUNCE':
      newStatus = 'Bounce - Invalid Email';
      await storage.updateProspect(prospect.id, { sendSequence: false });
      break;
    case 'WRONG_EMAIL':
      newStatus = '🤷‍♂️ Wrong Email';
      await storage.updateProspect(prospect.id, { sendSequence: false });
      break;
    case 'OUT_OF_OFFICE':
      newStatus = 'Contact is OOO, manual FUP';
      await storage.updateProspect(prospect.id, { sendSequence: false });
      break;
    case 'GENERAL_QUESTION':
      newStatus = '❓ General Question';
      await storage.updateProspect(prospect.id, { sendSequence: false });
      break;
    case 'REVIEW_ANSWER':
      newStatus = '🔍 Review Answer from Prospect';
      await storage.updateProspect(prospect.id, { sendSequence: false });
      break;
  }

  await storage.updateProspect(prospect.id, {
    status: newStatus,
    suggestedDays: classification.suggestedDays?.join(', '),
    suggestedTime: classification.suggestedTime,
    suggestedTimezone: classification.suggestedTimezone,
    suggestedWeek: classification.suggestedWeek,
    repliedAt: new Date() // Track when prospect replied
  });
  
  // Emit WebSocket update
  emitProspectStatusChange(user.id, prospect.id, newStatus);

  await storage.createActivityLog({
    userId: user.id,
    prospectId: prospect.id,
    action: 'Response Analyzed (Auto)',
    detail: `Classification: ${classification.category}`
  });

  return isInterested;
}

/**
 * Schedule meeting with interested prospect
 */
async function scheduleProspectMeeting(user: any, prospect: any, config: any, sequence: any) {
  try {
    console.log(`\n🚀 === STARTING MEETING SCHEDULING PROCESS ===`);
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`👥 Prospect: ${prospect.contactName} (${prospect.contactEmail})`);
    
    // Usar configuración del usuario (o default a Ciudad de México)
    const workStartHour = parseInt(config.searchStartTime?.split(':')[0] || '9');
    const workEndHour = parseInt(config.searchEndTime?.split(':')[0] || '17');
    const timezone = config.timezone || 'America/Mexico_City';
    const workingDays = config.workingDays?.split(',') || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    console.log(`⚙️ Configuration:`);
    console.log(`   🌍 Timezone: ${timezone}`);
    console.log(`   🕐 Working hours: ${workStartHour}:00 - ${workEndHour}:00`);
    console.log(`   📅 Working days: ${workingDays.join(', ')}`);

    // Buscar desde mañana (24 horas desde ahora)
    const searchStartDate = new Date();
    searchStartDate.setHours(searchStartDate.getHours() + 24);
    
    const searchEndDate = new Date(searchStartDate);
    searchEndDate.setDate(searchEndDate.getDate() + 30);  // Buscar próximos 30 días

    console.log(`📅 Search window: ${searchStartDate.toISOString()} to ${searchEndDate.toISOString()}`);

    // Obtener slots disponibles
    const availableSlots = await getAvailableSlots(
      user.googleAccessToken,
      searchStartDate,
      searchEndDate,
      workStartHour,
      workEndHour,
      timezone,
      user.googleRefreshToken,
      workingDays
    );

    console.log(`📊 Total available slots found: ${availableSlots.length}`);

    if (availableSlots.length === 0) {
      throw new Error('No available slots found in the next 30 days');
    }

    // Parsear preferencias del prospecto
    const preferredDays = prospect.suggestedDays ? 
      prospect.suggestedDays.split(',').map((d: string) => d.trim().toLowerCase()) : 
      undefined;
    
    const preferredTime = prospect.suggestedTime || undefined;
    const preferredTimezone = prospect.suggestedTimezone || undefined; // Timezone mencionado por prospecto
    
    console.log(`🎯 Prospect preferences:`, {
      days: preferredDays || 'none',
      time: preferredTime || 'none',
      timezone: preferredTimezone || 'none (will use user timezone)'
    });
    
    // Encontrar mejor slot (con conversión automática si el prospecto mencionó otro timezone)
    const selectedSlot = findNextAvailableSlot(
      availableSlots,
      preferredDays,
      preferredTime,
      undefined,
      timezone,
      preferredTimezone // Pasar timezone mencionado por prospecto
    );
    
    if (!selectedSlot) {
      throw new Error('Could not find a suitable slot');
    }

    console.log(`✅ Selected slot (UTC): ${selectedSlot.toISOString()}`);
    console.log(`✅ Selected slot (${timezone}): ${selectedSlot.toLocaleString('es-MX', { timeZone: timezone })}`);

    const endTime = new Date(selectedSlot.getTime() + 30 * 60000);  // 30 minutos después

    // Obtener título y descripción de la reunión
    const meetingTitle = sequence?.meetingTitle || config.meetingTitle || '${companyName} & ${yourName}';
    const meetingDescription = sequence?.meetingDescription || config.meetingDescription || '';

    const title = replaceTemplateVariables(meetingTitle, {
      externalCid: prospect.externalCid || '',
      contactName: prospect.contactName,
      companyName: prospect.companyName || '',
      contactTitle: prospect.contactTitle || '',
      industry: prospect.industry || '',
      yourName: user.name
    });

    const description = replaceTemplateVariables(meetingDescription, {
      externalCid: prospect.externalCid || '',
      contactName: prospect.contactName,
      companyName: prospect.companyName || '',
      contactTitle: prospect.contactTitle || '',
      industry: prospect.industry || '',
      yourName: user.name
    });

    // Programar la reunión
    const meetingResult = await scheduleMeeting({
      accessToken: user.googleAccessToken,
      refreshToken: user.googleRefreshToken,
      attendeeEmail: prospect.contactEmail,
      title: title,
      description: description,
      startTime: selectedSlot,
      endTime: endTime,
      userTimezone: timezone
    });

    console.log(`🎉 Meeting scheduled successfully!`);
    console.log(`🔗 Meet link: ${meetingResult.meetLink}`);
    console.log(`🔗 Calendar link: ${meetingResult.htmlLink}`);

    // Actualizar estado del prospecto
    await storage.updateProspect(prospect.id, {
      status: '✅ Meeting Scheduled 🗓️',
      sendSequence: false,
      meetingTime: selectedSlot
    });
    
    // Emitir actualizaciones por WebSocket
    emitProspectStatusChange(user.id, prospect.id, '✅ Meeting Scheduled 🗓️');
    emitMeetingScheduled(user.id, prospect.id, {
      meetingTime: selectedSlot,
      meetLink: meetingResult.meetLink,
      contactEmail: prospect.contactEmail
    });

    // Registrar actividad
    await storage.createActivityLog({
      userId: user.id,
      prospectId: prospect.id,
      action: 'Meeting Scheduled (Auto)',
      detail: `Meeting created at ${selectedSlot.toLocaleString('es-MX', { timeZone: timezone })}. Google Calendar sent invitation to ${prospect.contactEmail}.`
    });

    console.log(`✅ === MEETING SCHEDULING COMPLETED ===\n`);

  } catch (error: any) {
    console.error('❌ === MEETING SCHEDULING FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    await storage.updateProspect(prospect.id, {
      status: `❌ Scheduling Error: ${error.message}`
    });
  }
}

/**
 * Stop sequences for other prospects from the same company
 * Called when a prospect from a company responds with interest
 */
async function stopSequencesForSameCompany(userId: string, companyName: string, excludeProspectId: string) {
  try {
    console.log(`\n🏢 Stopping sequences for other prospects from company: ${companyName}`);
    
    // Get all prospects from the same user and company (excluding the one that responded)
    const allProspects = await storage.getProspectsByUser(userId);
    const sameCompanyProspects = allProspects.filter(p => 
      p.companyName && 
      p.companyName.toLowerCase() === companyName.toLowerCase() &&
      p.id !== excludeProspectId &&
      p.sendSequence === true // Only stop active sequences
    );
    
    console.log(`   Found ${sameCompanyProspects.length} other prospects from ${companyName} with active sequences`);
    
    // Stop sequences for each prospect
    for (const prospect of sameCompanyProspects) {
      await storage.updateProspect(prospect.id, {
        status: '🏢 Sequence Ended - Company Contacted',
        sendSequence: false
      });
      
      emitProspectStatusChange(userId, prospect.id, '🏢 Sequence Ended - Company Contacted');
      
      await storage.createActivityLog({
        userId,
        prospectId: prospect.id,
        action: 'Sequence Stopped (Company Contacted)',
        detail: `Sequence stopped because another prospect from ${companyName} responded with interest`
      });
      
      console.log(`   ✅ Stopped sequence for ${prospect.contactName} (${prospect.contactEmail})`);
    }
    
    console.log(`✅ Stopped sequences for ${sameCompanyProspects.length} prospects from ${companyName}\n`);
    
  } catch (error) {
    console.error('Error stopping sequences for same company:', error);
  }
}

/**
 * Get days since a date
 */
function getDaysSince(date: Date | string | null | undefined): number {
  if (!date) return 999;
  const lastDate = new Date(date);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - lastDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Start the automated agent loop
 */
export function startAgentLoop(userId: string, frequencyHours: number = 2) {
  const intervalMs = frequencyHours * 60 * 60 * 1000;
  
  console.log(`Starting agent loop for user ${userId} - runs every ${frequencyHours} hours`);
  
  // Run immediately on start
  runAgent(userId).catch(err => {
    console.error('Agent run error:', err);
  });

  // Then run on interval
  const intervalId = setInterval(() => {
    runAgent(userId).catch(err => {
      console.error('Agent run error:', err);
    });
  }, intervalMs);

  return intervalId;
}

