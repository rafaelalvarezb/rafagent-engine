import { google } from 'googleapis';
import { getOAuth2Client } from '../auth';

/**
 * ✨ CALENDAR SERVICE - VERSIÓN DEFINITIVA ✨
 * 
 * SOLUCIÓN AL PROBLEMA DE TIMEZONE:
 * 
 * Google Calendar API espera:
 * - dateTime: Fecha/hora LOCAL (sin Z, sin offset)
 * - timeZone: El timezone como string separado
 * 
 * INCORRECTO ❌:
 * { dateTime: "2025-10-30T09:00:00Z", timeZone: "America/Mexico_City" }
 * 
 * CORRECTO ✅:
 * { dateTime: "2025-10-30T09:00:00", timeZone: "America/Mexico_City" }
 */

export function getCalendarClient(accessToken: string, refreshToken?: string) {
  const auth = getOAuth2Client(accessToken, refreshToken);
  return google.calendar({ version: 'v3', auth });
}

interface ScheduleMeetingParams {
  attendeeEmail: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  accessToken: string;
  refreshToken?: string;
  userTimezone?: string;
}

/**
 * Convierte un Date object a formato local para Google Calendar
 * Ejemplo: "2025-10-30T09:00:00" (sin Z, sin offset)
 */
function formatDateForGoogleCalendar(date: Date, timezone: string): string {
  // Obtener los componentes de la fecha en el timezone específico
  const year = date.toLocaleString('en-US', { timeZone: timezone, year: 'numeric' });
  const month = date.toLocaleString('en-US', { timeZone: timezone, month: '2-digit' });
  const day = date.toLocaleString('en-US', { timeZone: timezone, day: '2-digit' });
  const hour = date.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false });
  const minute = date.toLocaleString('en-US', { timeZone: timezone, minute: '2-digit' });
  const second = date.toLocaleString('en-US', { timeZone: timezone, second: '2-digit' });
  
  // Formato: YYYY-MM-DDTHH:MM:SS (sin Z ni offset)
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

/**
 * Programa una reunión en Google Calendar
 */
export async function scheduleMeeting(params: ScheduleMeetingParams): Promise<any> {
  try {
    const calendar = getCalendarClient(params.accessToken, params.refreshToken);
    const timezone = params.userTimezone || 'America/Mexico_City';
    
    console.log(`\n🗓️ === SCHEDULING MEETING ===`);
    console.log(`📧 Attendee: ${params.attendeeEmail}`);
    console.log(`🌍 Timezone: ${timezone}`);
    console.log(`📅 Start (UTC): ${params.startTime.toISOString()}`);
    console.log(`📅 End (UTC): ${params.endTime.toISOString()}`);
    
    // Convertir a formato local
    const startLocal = formatDateForGoogleCalendar(params.startTime, timezone);
    const endLocal = formatDateForGoogleCalendar(params.endTime, timezone);
    
    console.log(`📅 Start (Local): ${startLocal}`);
    console.log(`📅 End (Local): ${endLocal}`);
    
    const event = {
      summary: params.title,
      description: params.description,
      start: {
        dateTime: startLocal,
        timeZone: timezone,
      },
      end: {
        dateTime: endLocal,
        timeZone: timezone,
      },
      attendees: [{ email: params.attendeeEmail }],
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      sendUpdates: 'all' as const
    };

    console.log(`📤 Sending to Google Calendar:`, JSON.stringify(event, null, 2));

    const result = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: event,
    });

    const meetLink = result.data.conferenceData?.entryPoints?.[0]?.uri || 
                     result.data.hangoutLink || 
                     null;

    console.log(`✅ Meeting created successfully!`);
    console.log(`🔗 Calendar link: ${result.data.htmlLink}`);
    console.log(`🔗 Meet link: ${meetLink}`);

    return { ...result.data, meetLink };
  } catch (error: any) {
    console.error('❌ Error scheduling meeting:', error.message);
    if (error.response?.data) {
      console.error('📄 API Error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Crea un Date object para un día/hora específico en un timezone
 * Retorna el Date en UTC pero representando la hora local correcta
 */
function createDateInTimezone(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  // Crear string de fecha local
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const hourStr = String(hour).padStart(2, '0');
  const minuteStr = String(minute).padStart(2, '0');
  
  const dateStr = `${year}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}:00`;
  
  // Convertir a Date usando el timezone
  const localDate = new Date(dateStr);
  const utcDate = new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(localDate.toLocaleString('en-US', { timeZone: timezone }));
  const offset = utcDate.getTime() - tzDate.getTime();
  
  return new Date(localDate.getTime() + offset);
}

/**
 * Obtiene slots disponibles en el calendario
 */
export async function getAvailableSlots(
  accessToken: string,
  startDate: Date,
  endDate: Date,
  workStartHour: number,
  workEndHour: number,
  timezone: string = 'America/Mexico_City',
  refreshToken?: string,
  workingDays?: string[]
): Promise<Date[]> {
  const calendar = getCalendarClient(accessToken, refreshToken);
  
  console.log(`\n🔍 === GETTING AVAILABLE SLOTS ===`);
  console.log(`📅 Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`🕐 Hours: ${workStartHour}:00 - ${workEndHour}:00`);
  console.log(`🌍 Timezone: ${timezone}`);
  
  // Obtener eventos ocupados
  const events = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const busySlots = (events.data.items || []).map(event => ({
    start: new Date(event.start?.dateTime || event.start?.date || ''),
    end: new Date(event.end?.dateTime || event.end?.date || ''),
  }));

  console.log(`📊 Found ${busySlots.length} busy events`);

  const availableSlots: Date[] = [];
  const workingDayNumbers = [1, 2, 3, 4, 5]; // Lunes-Viernes
  
  // Mínimo 24 horas desde ahora
  const minTime = new Date();
  minTime.setHours(minTime.getHours() + 24);
  
  console.log(`⏰ Minimum time (24h from now): ${minTime.toISOString()}`);
  console.log(`⏰ In ${timezone}: ${minTime.toLocaleString('es-MX', { timeZone: timezone })}`);

  // Iterar cada día en el rango
  let currentDate = new Date(startDate);
  
  while (currentDate < endDate) {
    const dayOfWeek = currentDate.getDay();
    
    // Solo días laborables
    if (workingDayNumbers.includes(dayOfWeek)) {
      // Obtener año/mes/día en el timezone del usuario
      const year = parseInt(currentDate.toLocaleString('en-US', { timeZone: timezone, year: 'numeric' }));
      const month = parseInt(currentDate.toLocaleString('en-US', { timeZone: timezone, month: 'numeric' }));
      const day = parseInt(currentDate.toLocaleString('en-US', { timeZone: timezone, day: 'numeric' }));
      
      console.log(`\n📅 Checking ${currentDate.toLocaleDateString('es-MX', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        timeZone: timezone 
      })}`);
      
      // Generar slots de 30 minutos
      for (let hour = workStartHour; hour < workEndHour; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          // Crear fecha en el timezone del usuario
          const slotStart = createDateInTimezone(year, month, day, hour, minute, timezone);
          const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
          
          // Verificar que sea futuro (24h mínimo)
          if (slotStart < minTime) {
            continue;
          }
          
          // Verificar conflictos
          const isConflict = busySlots.some(busy => {
            return slotStart < busy.end && slotEnd > busy.start;
          });
          
          if (!isConflict) {
            availableSlots.push(slotStart);
            console.log(`   ✅ ${hour}:${String(minute).padStart(2, '0')} available`);
          } else {
            console.log(`   ❌ ${hour}:${String(minute).padStart(2, '0')} busy`);
          }
        }
      }
    } else {
      console.log(`⏭️ Skipping ${currentDate.toLocaleDateString('es-MX', { weekday: 'long', timeZone: timezone })} (weekend)`);
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`\n📊 Total slots available: ${availableSlots.length}`);
  if (availableSlots.length > 0) {
    console.log(`🕐 First 5 slots:`);
    availableSlots.slice(0, 5).forEach((slot, i) => {
      console.log(`   ${i + 1}. ${slot.toLocaleString('es-MX', { 
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`);
    });
  }
  
  return availableSlots;
}

/**
 * Encuentra el siguiente slot disponible según preferencias
 */
export function findNextAvailableSlot(
  availableSlots: Date[],
  preferredDays?: string[],
  preferredTime?: string,
  preferredWeek?: string,
  userTimezone?: string
): Date | null {
  const timezone = userTimezone || 'America/Mexico_City';
  
  console.log(`\n🔍 === FINDING BEST SLOT ===`);
  console.log(`📊 Total slots: ${availableSlots.length}`);
  console.log(`📅 Preferred days: ${preferredDays?.join(', ') || 'none'}`);
  console.log(`🕐 Preferred time: ${preferredTime || 'none'}`);
  
  if (availableSlots.length === 0) {
    console.log(`❌ No slots available`);
    return null;
  }

  // Ordenar slots por fecha
  const sortedSlots = [...availableSlots].sort((a, b) => a.getTime() - b.getTime());

  const dayMap: Record<string, number> = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6,
    'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
    'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6
  };

  // CASO 1: Sin preferencias - primer slot
  if (!preferredDays && !preferredTime) {
    const firstSlot = sortedSlots[0];
    console.log(`✅ No preferences - using first slot:`);
    console.log(`   ${firstSlot.toLocaleString('es-MX', { 
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`);
    return firstSlot;
  }

  // CASO 2: Solo día preferido (sin hora específica)
  if (preferredDays && preferredDays.length > 0 && !preferredTime) {
    const preferredDayNumbers = preferredDays
      .map(d => dayMap[d.toLowerCase()])
      .filter(n => n !== undefined);
    
    console.log(`🗓️ Looking for: ${preferredDays.join(', ')} (${preferredDayNumbers.join(', ')})`);
    
    const dayMatch = sortedSlots.find(slot => {
      const slotDay = slot.getDay();
      return preferredDayNumbers.includes(slotDay);
    });
    
    if (dayMatch) {
      console.log(`✅ Found slot on preferred day:`);
      console.log(`   ${dayMatch.toLocaleString('es-MX', { 
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`);
      return dayMatch;
    } else {
      console.log(`⚠️ No slots on preferred day, using first available`);
      return sortedSlots[0];
    }
  }

  // CASO 3: Hora preferida (y tal vez día también)
  if (preferredTime) {
    const [hours, minutes] = preferredTime.split(':').map(Number);
    console.log(`🕐 Looking for time: ${hours}:${String(minutes || 0).padStart(2, '0')}`);
    
    let candidateSlots = sortedSlots;
    
    // Filtrar por día si se especificó
    if (preferredDays && preferredDays.length > 0) {
      const preferredDayNumbers = preferredDays
        .map(d => dayMap[d.toLowerCase()])
        .filter(n => n !== undefined);
      
      candidateSlots = sortedSlots.filter(slot => {
        const slotDay = slot.getDay();
        return preferredDayNumbers.includes(slotDay);
      });
      
      if (candidateSlots.length === 0) {
        console.log(`⚠️ No slots on preferred day, searching all days`);
        candidateSlots = sortedSlots;
      }
    }
    
    // Buscar slot en o después de la hora preferida
    const timeMatch = candidateSlots.find(slot => {
      const slotHour = parseInt(slot.toLocaleString('en-US', { 
        timeZone: timezone,
        hour: '2-digit',
        hour12: false
      }));
      const slotMinute = parseInt(slot.toLocaleString('en-US', { 
        timeZone: timezone,
        minute: '2-digit'
      }));
      
      if (slotHour > hours) return true;
      if (slotHour === hours && slotMinute >= (minutes || 0)) return true;
      return false;
    });
    
    if (timeMatch) {
      console.log(`✅ Found slot at/after preferred time:`);
      console.log(`   ${timeMatch.toLocaleString('es-MX', { 
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`);
      return timeMatch;
    } else {
      console.log(`⚠️ No slots at/after preferred time, using first available`);
      return candidateSlots[0] || sortedSlots[0];
    }
  }

  // Fallback
  return sortedSlots[0];
}
