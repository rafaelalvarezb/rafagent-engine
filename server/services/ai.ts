const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface ClassificationResult {
  category: 'INTERESTED' | 'NOT_INTERESTED' | 'REFERRAL' | 'WRONG_EMAIL' | 'OUT_OF_OFFICE' | 'GENERAL_QUESTION' | 'BOUNCE' | 'REVIEW_ANSWER';
  suggestedDays?: string[];
  suggestedTime?: string;
  suggestedWeek?: string;
  referredEmail?: string;
}

export async function callGeminiApi(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    console.error('❌ Gemini API Key is missing from environment variables');
    throw new Error("Gemini API Key is missing from environment variables.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Gemini API error (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      console.error('❌ Gemini API returned empty or invalid response:', data);
      throw new Error("The AI response was empty or invalid.");
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error: any) {
    console.error('❌ Error calling Gemini API:', error);
    throw error;
  }
}

export async function classifyResponse(emailBody: string): Promise<ClassificationResult> {
  const classificationPrompt = `
You are analyzing a customer's email reply to determine their interest in scheduling a meeting.

⚠️ CRITICAL RULES - READ CAREFULLY:

1. **IGNORE email headers/metadata** - Lines starting with "El jue", "On Thu", timestamps (like "10:43"), quoted text (">"), email addresses in angle brackets, etc. These are NOT the customer's words.

2. **ONLY analyze the customer's actual written message** - The first few lines of new text they typed.

3. **DO NOT extract dates/times from email metadata** - Only extract if the customer explicitly wrote them in their message.

4. **If NO day/time is mentioned** - Output ONLY the category (like "INTERESTED"), nothing else.

CATEGORY DEFINITIONS:
- INTERESTED: Clear interest in meeting/call (e.g., "yes, let's talk", "I'm interested", "claro, platiquemos")
- NOT_INTERESTED: Clear rejection (e.g., "not interested", "not a good fit", "no thanks")
- REFERRAL: Mentions someone else to contact (e.g., "talk to my colleague", "contact John instead")
- WRONG_EMAIL: Wrong person/email (e.g., "wrong person", "I don't work there")
- OUT_OF_OFFICE: OOO messages (e.g., "out of office", "vacation", "away until")
- GENERAL_QUESTION: Questions seeking info (e.g., "what is this about?", "tell me more")
- BOUNCE: Email delivery failures (e.g., "undeliverable", "mailbox full")
- REVIEW_ANSWER: Unclear/ambiguous responses that don't fit other categories

DAY/TIME EXTRACTION (ONLY if customer explicitly wrote them):
- Extract days in ENGLISH lowercase (monday, tuesday, wednesday, thursday, friday, saturday, sunday)
- Convert ANY language: "viernes"→friday, "lunes"→monday, "jueves"→thursday, "miércoles"→wednesday
- Convert time to 24-hour HH:MM: "3pm"→15:00, "10am"→10:00, "1pm"→13:00

EXACT Output Format:
- Line 1: The category in uppercase
- Line 2+ (ONLY if customer mentioned): DAYS:friday, TIME:15:00, etc.

EXAMPLES:

Example 1 - NO PREFERENCES:
Customer message: "Claro, platiquemos"
Correct output:
INTERESTED

Example 2 - NO PREFERENCES (ignore metadata):
Customer message: "Claro, platiquemos

El jue, 30 oct 2025 a las 10:43, <email@gmail.com> escribió:"
Correct output:
INTERESTED
(DO NOT output DAYS:thursday or TIME:10:43 - those are from the metadata!)

Example 3 - DAY PREFERENCE:
Customer message: "Podemos el lunes?"
Correct output:
INTERESTED
DAYS:monday

Example 4 - DAY AND TIME PREFERENCE:
Customer message: "Podemos el lunes a la 1 pm?"
Correct output:
INTERESTED
DAYS:monday
TIME:13:00

Example 5 - TIME ONLY:
Customer message: "Sí, a las 3pm está bien"
Correct output:
INTERESTED
TIME:15:00

Example 6 - ANOTHER NO PREFERENCE:
Customer message: "Sure, let's chat"
Correct output:
INTERESTED

Email to analyze:
---
${emailBody}
---
  `.trim();

  const aiResponse = await callGeminiApi(classificationPrompt);
  console.log(`🤖 Raw AI Response:\n${aiResponse}`);
  
  const lines = aiResponse.trim().split('\n');
  
  // Clean the first line to extract just the category
  const firstLine = lines[0].trim();
  const category = firstLine.includes(':') ? firstLine.split(':')[1].trim() : firstLine;
  
  const result: ClassificationResult = {
    category: category as any
  };

  lines.forEach(line => {
    // Clean "Line X:" prefix if present
    const cleanedLine = line.replace(/^Line \d+:\s*/i, '').trim();
    
    if (cleanedLine.startsWith('DAYS:')) {
      result.suggestedDays = cleanedLine.replace('DAYS:', '').trim().split(',').map(d => d.trim());
    }
    if (cleanedLine.startsWith('TIME:')) {
      result.suggestedTime = cleanedLine.replace('TIME:', '').trim();
    }
    if (cleanedLine.startsWith('TIMEZONE:')) {
      result.suggestedTimezone = cleanedLine.replace('TIMEZONE:', '').trim();
    }
    if (cleanedLine.startsWith('WEEK:')) {
      result.suggestedWeek = cleanedLine.replace('WEEK:', '').trim();
    }
    if (cleanedLine.startsWith('EMAIL:')) {
      result.referredEmail = cleanedLine.replace('EMAIL:', '').trim();
    }
  });

  console.log(`✅ Extracted data:`, {
    category: result.category,
    suggestedDays: result.suggestedDays,
    suggestedTime: result.suggestedTime,
    suggestedTimezone: result.suggestedTimezone,
    suggestedWeek: result.suggestedWeek,
    referredEmail: result.referredEmail
  });

  return result;
}

// Extract first name from full name
function extractFirstName(fullName: string): string {
  if (!fullName) return '';
  // Split by space and take first part
  return fullName.trim().split(/\s+/)[0];
}

export function replaceTemplateVariables(
  text: string,
  variables: {
    externalCid?: string;
    contactName?: string;
    companyName?: string;
    contactTitle?: string;
    industry?: string;
    yourName?: string;
  }
): string {
  if (!text) return "";
  
  // Extract first name from contactName (in case it contains full name)
  const firstName = extractFirstName(variables.contactName || "");
  
  return text
    .replace(/\$\{externalCID\}/g, variables.externalCid || "")
    .replace(/\$\{contactName\}/g, firstName)
    .replace(/\$\{companyName\}/g, variables.companyName || "")
    .replace(/\$\{contactTitle\}/g, variables.contactTitle || "")
    .replace(/\$\{industry\}/g, variables.industry || "")
    .replace(/\$\{yourName\}/g, variables.yourName || "");
}
