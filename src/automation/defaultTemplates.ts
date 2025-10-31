/**
 * Default email templates created for new users
 */

import { storage } from '../storage';

// IMPORTANT: All templates in a sequence MUST use the SAME subject line
// Gmail threads emails based on subject + References headers
// The "Re:" prefix is added automatically by Gmail when replying in a thread
export const DEFAULT_TEMPLATES = [
  {
    templateName: 'Initial',
    subject: '${contactName}, esta es una idea para ${companyName} más allá del retail',
    body: 'Buen día ${contactName}, cómo estás?\n\nTe mando mensajito porque vi que ya en ${companyName} tienen su tienda de shopify desde hace un rato y me pareció importante ponerme en contacto contigo.\n\nEstoy apoyando a varias marcas que ya venden fuerte en retail (entre ellas Everlast México) a vender 3 veces más en su propio ecommerce, mientras cuido la utilidad neta de su operación.\n\nMe encantaría compartirte en 15 minutos lo que estamos haciendo con Jaime Dichi de Everlast para multiplicar sus ventas. Si gustas por una breve videollamada o te paso a saludar a tus oficinas.\n\n¿Te queda bien platicar en estos días?\n\nQuedo atento, abrazo enorme\n\n\n${yourName}',
    isActive: true
  },
  {
    templateName: 'Second Touch',
    subject: '[Same as Initial Email]', // Auto-filled from Initial Email for threading
    body: 'Qué tal ${contactName}, cómo va todo?\n\nSolo quería hacer seguimiento a mi correo anterior.\n\nSi me interesa platicar y compartirte lo que hacemos con las marcas que venden en retail, para impulsar las ventas de su propio ecommerce. Y explorar si sería algo que les interesaría a ustedes en ${companyName}\n\nQuedo atento, abrazo',
    isActive: true
  },
  {
    templateName: 'Third Touch',
    subject: '[Same as Initial Email]', // Auto-filled from Initial Email for threading
    body: 'Hola ${contactName}, espero que estés bien. No he recibido respuesta de tu parte.\n\nComo te comentaba, he podido apoyar a marcas como la tuya para hacer de su ecommerce propio un canal relevante vs lo que venden en Liverpool, Suburbia, Sears, etc. (canal de retail tradicional).\n\nMe parece importante que platiquemos. Tienes 15 minutos esta semana para una breve llamada?',
    isActive: true
  },
  {
    templateName: 'Fourth Touch',
    subject: '[Same as Initial Email]', // Auto-filled from Initial Email for threading
    body: 'Hola ${contactName},\n\nTe escribo por ultima vez para dar seguimiento. Entiendo perfectamente si este no es el mejor momento o no es una prioridad. Si en el futuro cambias de opinión, no dudes en contactarme.\n\nSerá un gusto saludarte. Mucho éxito',
    isActive: true
  }
];

/**
 * Create default templates for a new user
 */
export async function createDefaultTemplates(userId: string): Promise<void> {
  console.log(`Creating default templates for user ${userId}`);
  
  // First, create a default "Standard Sequence"
  let standardSequence;
  try {
    const existingSequences = await storage.getSequencesByUser(userId);
    standardSequence = existingSequences.find(s => s.isDefault);
    
    if (!standardSequence) {
      standardSequence = await storage.createSequence({
        userId,
        name: 'Standard Sequence',
        isDefault: true,
        meetingTitle: '${companyName} & Google',
        meetingDescription: 'Looking forward to our conversation!',
        reminderEnabled: false, // Disabled
        reminderTiming: '24h',
        reminderSubject: 'Reminder: Meeting Tomorrow',
        reminderBody: 'Hi ${contactName},\n\nThis is a friendly reminder about our meeting scheduled for tomorrow.\n\nLooking forward to speaking with you!\n\nBest,\n${yourName}'
      });
      console.log(`Created Standard Sequence for user ${userId}`);
    }
  } catch (error) {
    console.error(`Error creating Standard Sequence:`, error);
    return;
  }
  
  // Then create templates linked to this sequence
  for (let i = 0; i < DEFAULT_TEMPLATES.length; i++) {
    const template = DEFAULT_TEMPLATES[i];
    try {
      await storage.createTemplate({
        ...template,
        userId,
        sequenceId: standardSequence.id,
        orderIndex: i
      });
    } catch (error) {
      console.error(`Error creating template ${template.templateName}:`, error);
    }
  }
  
  console.log(`Created ${DEFAULT_TEMPLATES.length} default templates for user ${userId}`);
}

/**
 * Create default user configuration
 * @param userId - User ID
 * @param detectedTimezone - Optional detected timezone from browser (e.g., 'America/New_York')
 */
export async function createDefaultUserConfig(userId: string, detectedTimezone?: string): Promise<void> {
  console.log(`Creating default config for user ${userId}`);
  
  // Try to use detected timezone, otherwise fallback to Mexico City
  let timezone = 'America/Mexico_City';
  
  if (detectedTimezone) {
    // Validate that the detected timezone is in our database
    try {
      const { isValidTimezone } = await import('../utils/timezoneDetection');
      if (isValidTimezone(detectedTimezone)) {
        timezone = detectedTimezone;
        console.log(`✅ Using detected timezone: ${timezone}`);
      } else {
        console.log(`⚠️ Invalid detected timezone: ${detectedTimezone}, using default`);
      }
    } catch (error) {
      console.log(`⚠️ Error validating timezone, using default:`, error);
    }
  } else {
    console.log(`⚠️ No timezone detected, using default: ${timezone}`);
  }
  
  try {
    await storage.createUserConfig({
      userId,
      daysBetweenFollowups: 3,
      numberOfTouchpoints: 4,
      meetingTitle: '\${companyName} & \${yourName} - Discovery Call',
      meetingDescription: 'Looking forward to our conversation!',
      searchStartTime: '09:00',
      searchEndTime: '17:00',
      agentFrequencyHours: 0.5, // 30 minutes default
      workingDays: 'monday,tuesday,wednesday,thursday,friday',
      timezone: timezone
    });
    
    console.log(`Created default config for user ${userId} with timezone: ${timezone}`);
  } catch (error) {
    console.error(`Error creating default config:`, error);
  }
}

