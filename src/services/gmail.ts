import { google } from 'googleapis';
import { getOAuth2Client, getOAuth2ClientWithRefresh } from '../auth';

/**
 * Get Gmail client with user's OAuth credentials
 * @param accessToken - User's access token
 * @param refreshToken - User's refresh token (optional, for auto-refresh)
 */
export async function getGmailClient(accessToken: string, refreshToken?: string, userId?: string) {
  const auth = await getOAuth2ClientWithRefresh(accessToken, refreshToken, userId);
  return google.gmail({ version: 'v1', auth });
}

export async function getGmailSignature(accessToken: string, refreshToken?: string, userId?: string): Promise<string> {
  try {
    const gmail = await getGmailClient(accessToken, refreshToken, userId);
    const response = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const primaryAlias = response.data.sendAs?.find(a => a.isPrimary);
    const signature = primaryAlias?.signature || "";
    return signature;
  } catch (e) {
    console.error('Error getting Gmail signature:', e);
    return "";
  }
}

export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string,
  threadId?: string,
  refreshToken?: string,
  userId?: string,
  inReplyTo?: string,
  references?: string,
  prospectId?: string // For pixel tracking
): Promise<{ threadId: string; messageId: string }> {
  const gmail = await getGmailClient(accessToken, refreshToken, userId);
  
  let signature = "";
  try {
    signature = await getGmailSignature(accessToken, refreshToken, userId);
  } catch (error) {
    console.log('Could not get Gmail signature, proceeding without it:', error);
    signature = "";
  }
  
  // Ensure signature is always a string
  if (!signature || typeof signature !== 'string') {
    signature = "";
  }
  
  // Convert line breaks to HTML formatting
  let formattedBody = htmlBody
    .replace(/\r\n/g, '\n')                    // Normalize line endings
    .replace(/\r/g, '\n')                      // Normalize line endings
    .replace(/\n\n+/g, '</p><p style="margin: 0 0 16px 0; line-height: 1.5;">')  // Multiple line breaks become paragraph breaks
    .replace(/\n/g, '<br>')                    // Single line breaks become <br>
    .trim();                                   // Remove leading/trailing whitespace
  
  // Wrap in paragraph tags if not already wrapped
  if (!formattedBody.startsWith('<p')) {
    formattedBody = `<p style="margin: 0 0 16px 0; line-height: 1.5;">${formattedBody}</p>`;
  }
  
  // Debug logging (commented out - email formatting is working)
  // console.log('Original body:', htmlBody);
  // console.log('Formatted body:', formattedBody);
  
  // Add pixel tracking if prospectId is provided
  // Always use Railway URL for pixel tracking in production
  const baseUrl = 'https://rafagent-engine-production.up.railway.app';
  
  const pixelTracking = prospectId 
    ? `<img src="${baseUrl}/api/pixel/${prospectId}" width="1" height="1" style="display:none;" />`
    : '';
  
  // DEBUG: Log pixel tracking
  console.log('🔍 Pixel Tracking Debug:');
  console.log('  prospectId:', prospectId);
  console.log('  BASE_URL:', process.env.BASE_URL);
  console.log('  pixelTracking:', pixelTracking);
  
  const fullHtmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 13px; color: #202124; line-height: 1.5;">
      ${formattedBody}
    </div>
    <br>
    ${signature || ''}
    ${pixelTracking}
  `;
  
  // DEBUG: Log if pixel is in final HTML
  console.log('  pixel in fullHtmlBody?', fullHtmlBody.includes('<img src='));

  // Encode subject using RFC 2047 (MIME encoded-word syntax) for non-ASCII characters
  // This is the standard way to handle special characters in email headers
  const encodedSubject = /[\u0080-\uFFFF]/.test(subject)
    ? `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
    : subject;

  const headers = [
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `To: ${to}`,
    `Subject: ${encodedSubject}`
  ];

  // CRITICAL FIX: Add threading headers PROPERLY to ensure all emails stay in same thread
  // This mimics the Google Sheets MVP behavior
  if (threadId) {
    // When we have a threadId, we MUST retrieve the original message's Message-ID
    // and use it for proper threading
    try {
      const thread = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'Subject']
      });
      
      const messages = thread.data.messages || [];
      if (messages.length > 0) {
        // Get the FIRST message's Message-ID (the initial email)
        const firstMessage = messages[0];
        const firstMessageId = firstMessage.payload?.headers?.find(
          h => h.name?.toLowerCase() === 'message-id'
        )?.value;
        
        // Build References header with ALL previous Message-IDs
        const allMessageIds: string[] = [];
        for (const msg of messages) {
          const msgId = msg.payload?.headers?.find(
            h => h.name?.toLowerCase() === 'message-id'
          )?.value;
          if (msgId) {
            allMessageIds.push(msgId);
          }
        }
        
        // In-Reply-To should be the LAST message in the thread
        const lastMessageId = allMessageIds[allMessageIds.length - 1];
        
        if (lastMessageId) {
          headers.push(`In-Reply-To: ${lastMessageId}`);
        }
        
        // References should contain ALL previous Message-IDs
        if (allMessageIds.length > 0) {
          headers.push(`References: ${allMessageIds.join(' ')}`);
        }
      }
    } catch (error) {
      console.error('Error retrieving thread for proper threading:', error);
      // Fallback to the old method if retrieval fails
      if (inReplyTo) {
        headers.push(`In-Reply-To: ${inReplyTo}`);
      }
      if (references) {
        headers.push(`References: ${references}`);
      }
    }
  } else {
    // For initial emails, use provided headers if any
    if (inReplyTo) {
      headers.push(`In-Reply-To: ${inReplyTo}`);
    }
    if (references) {
      headers.push(`References: ${references}`);
    }
  }

  headers.push('');
  headers.push(fullHtmlBody);

  const message = headers.join('\n');

  const encodedMessage = Buffer.from(message, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendParams: any = {
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    }
  };

  // CRITICAL: Always include threadId when doing follow-ups
  if (threadId) {
    sendParams.requestBody.threadId = threadId;
  }

  const result = await gmail.users.messages.send(sendParams);
  
  // Get the actual Message-ID header for email threading
  let actualMessageId = '';
  if (result.data.id) {
    try {
      const sentMessage = await gmail.users.messages.get({
        userId: 'me',
        id: result.data.id,
        format: 'metadata',
        metadataHeaders: ['Message-ID']
      });
      
      const messageIdHeader = sentMessage.data.payload?.headers?.find(
        h => h.name?.toLowerCase() === 'message-id'
      );
      actualMessageId = messageIdHeader?.value || '';
    } catch (error) {
      console.error('Could not retrieve Message-ID:', error);
    }
  }
  
  return {
    threadId: result.data.threadId || '',
    messageId: actualMessageId
  };
}

export async function getThreadMessages(accessToken: string, threadId: string, refreshToken?: string, userId?: string) {
  const gmail = await getGmailClient(accessToken, refreshToken, userId);
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  });

  return thread.data.messages || [];
}

export async function getMessageBody(message: any): Promise<string> {
  if (message.payload.body.data) {
    return Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  }
  
  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }
  
  return '';
}

/**
 * Clean email body for AI analysis - extract ONLY the prospect's actual response
 * Removes email headers, quoted text, and thread metadata
 */
export function cleanEmailForAI(emailBody: string): string {
  // Split by lines
  const lines = emailBody.split('\n');
  const cleanedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Stop when we hit email thread headers (in any language)
    // Spanish: "El jue", "El lun", "El mar", "El mié", "El vie", "El sáb", "El dom"
    // English: "On Mon", "On Tue", "On Wed", "On Thu", "On Fri", "On Sat", "On Sun"
    if (
      line.startsWith('El jue') || 
      line.startsWith('El lun') || 
      line.startsWith('El mar') || 
      line.startsWith('El mié') || 
      line.startsWith('El vie') || 
      line.startsWith('El sáb') || 
      line.startsWith('El dom') ||
      line.startsWith('On Mon') || 
      line.startsWith('On Tue') || 
      line.startsWith('On Wed') || 
      line.startsWith('On Thu') || 
      line.startsWith('On Fri') || 
      line.startsWith('On Sat') || 
      line.startsWith('On Sun') ||
      line.includes('escribió:') ||
      line.includes('wrote:')
    ) {
      // Stop here - everything after is email thread metadata
      break;
    }
    
    // Skip quoted lines (lines starting with ">")
    if (line.startsWith('>')) {
      continue;
    }
    
    // Skip empty lines at the start
    if (cleanedLines.length === 0 && line === '') {
      continue;
    }
    
    // Add this line
    cleanedLines.push(lines[i]); // Keep original formatting (with original spacing)
  }
  
  // Join and trim
  const result = cleanedLines.join('\n').trim();
  
  console.log(`🧹 Email cleaning:`)
  console.log(`   Original length: ${emailBody.length} chars`);
  console.log(`   Cleaned length: ${result.length} chars`);
  console.log(`   Cleaned text: "${result}"`);
  
  return result;
}
