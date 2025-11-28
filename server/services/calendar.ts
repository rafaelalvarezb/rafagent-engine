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

  // Convertir workingDays de strings a números (0=Sunday, 1=Monday, ..., 6=Saturday)
  const dayNameToNumber: Record<string, number> = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6,
    'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
    'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6
  };
  
  const workingDayNumbers = workingDays && workingDays.length > 0
    ? workingDays.map(day => dayNameToNumber[day.toLowerCase()]).filter(n => n !== undefined)
    : [1, 2, 3, 4, 5]; // Default: Lunes-Viernes si no se especifica
  
  console.log(`📅 Working days configured: ${workingDays?.join(', ') || 'default (Mon-Fri)'}`);
  console.log(`📅 Working day numbers: ${workingDayNumbers.join(', ')}`);

  // Mínimo 24 horas desde ahora
  const minTime = new Date();
  minTime.setHours(minTime.getHours() + 24);
  
  console.log(`⏰ Minimum time (24h from now): ${minTime.toISOString()}`);
  console.log(`⏰ In ${timezone}: ${minTime.toLocaleString('es-MX', { timeZone: timezone })}`);

  // Iterar cada día en el rango
  let currentDate = new Date(startDate);
  
  while (currentDate < endDate) {
    // IMPORTANTE: Obtener día de la semana EN EL TIMEZONE DEL USUARIO, no en UTC
    // Crear una fecha en el timezone del usuario para obtener el día correcto
    const dateStr = currentDate.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
    const dateInTz = new Date(dateStr + 'T12:00:00'); // Usar mediodía para evitar cambios de día
    const dayOfWeek = dateInTz.getDay(); // 0=Sunday, 1=Monday...
    
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
      })} (day ${dayOfWeek})`);
      
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
 * Convierte una hora de un timezone a otro
 * Método correcto: usa el offset UTC de ambos timezones para calcular la diferencia
 * @param timeString - Hora en formato HH:MM (ej: "12:00")
 * @param fromTimezone - Timezone de origen (ej: "America/Argentina/Buenos_Aires")
 * @param toTimezone - Timezone de destino (ej: "America/Mexico_City")
 * @returns Hora convertida en formato HH:MM
 */
function convertTimeBetweenTimezones(
  timeString: string,
  fromTimezone: string,
  toTimezone: string
): string {
  try {
    // Parsear la hora (formato HH:MM)
    const [hours, minutes = 0] = timeString.split(':').map(Number);
    
    // Obtener fecha actual para calcular offsets
    const now = new Date();
    
    // Obtener el offset UTC de ambos timezones para una fecha específica
    // Usamos una fecha "hoy" para calcular el offset correcto (considera DST)
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    
    // Crear una fecha que representa "hoy a mediodía" en UTC
    const testDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
    
    // Obtener qué hora es esta fecha UTC en cada timezone
    const fromTzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: fromTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const toTzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: toTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    // Obtener la hora en cada timezone cuando es mediodía UTC
    const fromParts = fromTzFormatter.formatToParts(testDate);
    const toParts = toTzFormatter.formatToParts(testDate);
    
    const fromHour = parseInt(fromParts.find(p => p.type === 'hour')?.value || '12');
    const toHour = parseInt(toParts.find(p => p.type === 'hour')?.value || '12');
    
    // Calcular la diferencia: si mediodía UTC es 9 AM en Argentina y 6 AM en México
    // Argentina está 3 horas AHEAD de México
    // Entonces para convertir: horaMéxico = horaArgentina - 3
    const offsetHours = fromHour - toHour;
    
    // Aplicar la conversión: si son 12 PM en Argentina (GMT-3), son 9 AM en México (GMT-6)
    let convertedHour = hours - offsetHours;
    
    // Normalizar a rango 0-23
    while (convertedHour < 0) {
      convertedHour += 24;
    }
    while (convertedHour >= 24) {
      convertedHour -= 24;
    }
    
    const result = `${String(Math.floor(convertedHour)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    
    console.log(`🕐 Timezone conversion:`);
    console.log(`   ${timeString} ${fromTimezone} → ${result} ${toTimezone}`);
    console.log(`   Offset calculated: ${offsetHours} hours (when UTC noon = ${fromHour} in ${fromTimezone}, ${toHour} in ${toTimezone})`);
    
    return result;
  } catch (error) {
    console.error('❌ Error converting timezone:', error);
    return timeString; // Retornar original si falla
  }
}

/**
 * Mapea nombres comunes de timezones a IANA identifiers
 */
function mapTimezoneNameToIANA(timezoneName: string): string | null {
  const nameLower = timezoneName.toLowerCase().trim();
  
  const timezoneMap: Record<string, string> = {
    // Argentina
    'argentina': 'America/Argentina/Buenos_Aires',
    'hora argentina': 'America/Argentina/Buenos_Aires',
    'buenos aires': 'America/Argentina/Buenos_Aires',
    'art': 'America/Argentina/Buenos_Aires',
    
    // Mexico
    'mexico': 'America/Mexico_City',
    'méxico': 'America/Mexico_City',
    'hora mexicana': 'America/Mexico_City',
    'ciudad de méxico': 'America/Mexico_City',
    'cdmx': 'America/Mexico_City',
    
    // US timezones
    'est': 'America/New_York',
    'edt': 'America/New_York',
    'eastern': 'America/New_York',
    'cst': 'America/Chicago',
    'cdt': 'America/Chicago',
    'central': 'America/Chicago',
    'pst': 'America/Los_Angeles',
    'pdt': 'America/Los_Angeles',
    'pacific': 'America/Los_Angeles',
    
    // Europe
    'gmt': 'Europe/London',
    'cet': 'Europe/Paris',
    'cest': 'Europe/Paris',
    
    // Brazil
    'brasil': 'America/Sao_Paulo',
    'brazil': 'America/Sao_Paulo',
    'sao paulo': 'America/Sao_Paulo',
    
    // Colombia
    'colombia': 'America/Bogota',
    
    // Peru
    'peru': 'America/Lima',
    'perú': 'America/Lima',
    
    // Chile
    'chile': 'America/Santiago',
  };
  
  // Buscar coincidencia exacta o parcial
  for (const [key, iana] of Object.entries(timezoneMap)) {
    if (nameLower === key || nameLower.includes(key) || key.includes(nameLower)) {
      return iana;
    }
  }
  
  // Si no se encuentra, intentar usar directamente (puede ser un IANA válido)
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezoneName });
    return timezoneName;
  } catch {
    return null;
  }
}

/**
 * Encuentra el siguiente slot disponible según preferencias
 * PRIORIZA el día y hora especificados por el prospecto siempre que respeten el gap de 24h
 */
export function findNextAvailableSlot(
  availableSlots: Date[],
  preferredDays?: string[],
  preferredTime?: string,
  preferredWeek?: string,
  userTimezone?: string,
  preferredTimezone?: string // Timezone mencionado por el prospecto
): Date | null {
  const timezone = userTimezone || 'America/Mexico_City';
  
  console.log(`\n🔍 === FINDING BEST SLOT ===`);
  console.log(`📊 Total slots: ${availableSlots.length}`);
  console.log(`📅 Preferred days: ${preferredDays?.join(', ') || 'none'}`);
  console.log(`🕐 Preferred time: ${preferredTime || 'none'}`);
  
  // Si el prospecto mencionó un timezone diferente, convertir la hora
  let convertedTime = preferredTime;
  if (preferredTimezone && preferredTime) {
    const mappedTimezone = mapTimezoneNameToIANA(preferredTimezone);
    if (mappedTimezone && mappedTimezone !== timezone) {
      console.log(`🌍 Converting time from ${preferredTimezone} (${mappedTimezone}) to ${timezone}`);
      const originalTime = preferredTime;
      convertedTime = convertTimeBetweenTimezones(preferredTime, mappedTimezone, timezone);
      console.log(`   ${originalTime} ${preferredTimezone} → ${convertedTime} ${timezone}`);
    } else {
      console.log(`⚠️ Could not map timezone "${preferredTimezone}", using time as-is`);
    }
  }
  
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

  // Helper: obtener hora y minuto de un slot en el timezone del usuario
  const getSlotTime = (slot: Date): { hour: number; minute: number } => {
    const hour = parseInt(slot.toLocaleString('en-US', { 
      timeZone: timezone,
      hour: '2-digit',
      hour12: false
    }));
    const minute = parseInt(slot.toLocaleString('en-US', { 
      timeZone: timezone,
      minute: '2-digit'
    }));
    return { hour, minute };
  };

  // Helper: obtener día de la semana de un slot en el timezone del usuario
  const getSlotDay = (slot: Date): number => {
    // Obtener el día de la semana en el timezone del usuario
    // Usar toLocaleString para obtener el día correcto según el timezone
    const dayName = slot.toLocaleString('en-US', { 
      timeZone: timezone,
      weekday: 'long'
    }).toLowerCase();
    
    // Mapear nombre del día a número (0=Sunday, 1=Monday, ..., 6=Saturday)
    const dayMap: Record<string, number> = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };
    
    return dayMap[dayName] ?? slot.getDay(); // Fallback a UTC si falla
  };

  // CASO 1: Sin preferencias - primer slot (ya respeta gap de 24h)
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
  // PRIORIDAD: Buscar PRIMERO en el día especificado
  if (preferredDays && preferredDays.length > 0 && !preferredTime) {
    const preferredDayNumbers = preferredDays
      .map(d => dayMap[d.toLowerCase()])
      .filter(n => n !== undefined);
    
    console.log(`🗓️ Looking for: ${preferredDays.join(', ')} (${preferredDayNumbers.join(', ')})`);
    
    // Filtrar slots del día preferido
    const preferredDaySlots = sortedSlots.filter(slot => {
      const slotDay = getSlotDay(slot);
      return preferredDayNumbers.includes(slotDay);
    });
    
    if (preferredDaySlots.length > 0) {
      // Usar el primer slot disponible en el día preferido
      const dayMatch = preferredDaySlots[0];
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
      // Si no hay slots en el día preferido, buscar al día siguiente
      console.log(`⚠️ No slots on preferred day, looking for next day`);
      
      // Si no hay slots en el día preferido, buscar el siguiente día disponible
      // (el primer slot disponible que respete el gap de 24h)
      console.log(`⚠️ No slots found on preferred day, using first available`);
      return sortedSlots[0];
    }
  }

  // CASO 3: Día Y hora preferidos
  if (preferredDays && preferredDays.length > 0 && (convertedTime || preferredTime)) {
    const timeToUse = convertedTime || preferredTime;
    const [targetHours, targetMinutes] = timeToUse!.split(':').map(Number);
    const preferredDayNumbers = preferredDays
      .map(d => dayMap[d.toLowerCase()])
      .filter(n => n !== undefined);
    
    console.log(`🕐 Looking for: ${preferredDays.join(', ')} at ${targetHours}:${String(targetMinutes || 0).padStart(2, '0')} (${timezone})`);
    
    // PASO 1: Filtrar slots del día preferido
    const preferredDaySlots = sortedSlots.filter(slot => {
      const slotDay = getSlotDay(slot);
      return preferredDayNumbers.includes(slotDay);
    });
    
    if (preferredDaySlots.length === 0) {
      // Si no hay slots en el día preferido, buscar al día siguiente (primer slot disponible)
      console.log(`⚠️ No slots on preferred day, looking for next day`);
      console.log(`✅ Using first available slot (next day):`);
      const firstSlot = sortedSlots[0];
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
    
    // PASO 2: Buscar hora exacta en el día preferido
    const exactTimeMatch = preferredDaySlots.find(slot => {
      const { hour, minute } = getSlotTime(slot);
      return hour === targetHours && minute === (targetMinutes || 0);
    });
    
    if (exactTimeMatch) {
      console.log(`✅ Found exact time match:`);
      console.log(`   ${exactTimeMatch.toLocaleString('es-MX', { 
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`);
      return exactTimeMatch;
    }
    
    // PASO 3: Buscar +30min, luego +1h, etc. en el mismo día
    console.log(`⚠️ Exact time not available, looking for alternatives (+30min, +1h, etc.)`);
    
    // Buscar slots después de la hora preferida en el mismo día
    const afterTimeSlots = preferredDaySlots.filter(slot => {
      const { hour, minute } = getSlotTime(slot);
      if (hour > targetHours) return true;
      if (hour === targetHours && minute >= (targetMinutes || 0)) return true;
      return false;
    });
    
    if (afterTimeSlots.length > 0) {
      // Ordenar por hora y tomar el más cercano
      afterTimeSlots.sort((a, b) => {
        const timeA = getSlotTime(a);
        const timeB = getSlotTime(b);
        if (timeA.hour !== timeB.hour) return timeA.hour - timeB.hour;
        return timeA.minute - timeB.minute;
      });
      
      const closestSlot = afterTimeSlots[0];
      console.log(`✅ Found closest slot after preferred time:`);
      console.log(`   ${closestSlot.toLocaleString('es-MX', { 
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`);
      return closestSlot;
    }
    
    // PASO 4: Si no encuentra nada en el día preferido, buscar al día siguiente
    console.log(`⚠️ No slots after preferred time on preferred day, looking for next day`);
    
    // Buscar el siguiente día disponible (primer slot cronológicamente después del último slot del día preferido)
    // Si hay slots en el día preferido, buscar después del último; si no, buscar cualquier slot después
    let nextDaySlot: Date | undefined;
    
    if (preferredDaySlots.length > 0) {
      // Si hay slots en el día preferido, buscar el primer slot DESPUÉS del último slot del día preferido
      const lastPreferredSlot = preferredDaySlots[preferredDaySlots.length - 1];
      nextDaySlot = sortedSlots.find(slot => 
        slot.getTime() > lastPreferredSlot.getTime() && 
        !preferredDaySlots.includes(slot)
      );
    } else {
      // Si no hay slots en el día preferido, buscar el primer slot disponible
      nextDaySlot = sortedSlots[0];
    }
    
    if (nextDaySlot) {
      console.log(`✅ Found slot on next day:`);
      console.log(`   ${nextDaySlot.toLocaleString('es-MX', { 
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`);
      return nextDaySlot;
    }
    
    // Si aún no encuentra, usar el primer slot del día preferido (aunque sea antes de la hora)
    // Esto es mejor que no agendar nada
    if (preferredDaySlots.length > 0) {
      console.log(`⚠️ Using first available slot on preferred day (before preferred time):`);
      const firstSlot = preferredDaySlots[0];
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
    
    // Fallback final
    console.log(`⚠️ No slots found on preferred day, using first available`);
    return sortedSlots[0];
  }

  // CASO 4: Solo hora preferida (sin día específico)
  if (convertedTime || preferredTime) {
    const timeToUse = convertedTime || preferredTime;
    const [targetHours, targetMinutes] = timeToUse!.split(':').map(Number);
    console.log(`🕐 Looking for time: ${targetHours}:${String(targetMinutes || 0).padStart(2, '0')} (${timezone})`);
    
    // Buscar slot en o después de la hora preferida
    const timeMatch = sortedSlots.find(slot => {
      const { hour, minute } = getSlotTime(slot);
      if (hour > targetHours) return true;
      if (hour === targetHours && minute >= (targetMinutes || 0)) return true;
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
      return sortedSlots[0];
    }
  }

  // Fallback
  return sortedSlots[0];
}
