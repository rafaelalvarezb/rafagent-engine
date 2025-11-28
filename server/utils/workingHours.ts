/**
 * Utility functions for working hours management
 */

export interface WorkingHours {
  startTime: string; // Format: "HH:MM" (24-hour)
  endTime: string;   // Format: "HH:MM" (24-hour)
  timezone: string;  // IANA timezone
  workingDays: string[]; // Array of day names: ['monday', 'tuesday', etc.]
}

/**
 * Check if current time is within working hours
 */
export function isWithinWorkingHours(workingHours: WorkingHours): boolean {
  const now = new Date();
  const userTimezone = workingHours.timezone || 'America/Mexico_City';

  // Convert current time to user's timezone
  const userTime = new Date(now.toLocaleString("en-US", { timeZone: userTimezone }));

  // Check if it's a working day
  const dayOfWeek = userTime.getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDayName = dayNames[dayOfWeek];
  
  if (!workingHours.workingDays || !workingHours.workingDays.includes(currentDayName)) {
    return false; // Not a working day
  }

  const currentHour = userTime.getHours();
  const currentMinute = userTime.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  // Parse working hours
  const [startHour, startMinute] = workingHours.startTime.split(':').map(Number);
  const [endHour, endMinute] = workingHours.endTime.split(':').map(Number);

  const startTimeInMinutes = startHour * 60 + startMinute;
  const endTimeInMinutes = endHour * 60 + endMinute;

  return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
}

/**
 * Get next working hour timestamp
 */
export function getNextWorkingHour(workingHours: WorkingHours): Date {
  const now = new Date();
  const userTimezone = workingHours.timezone || 'America/Mexico_City';
  
  // Convert current time to user's timezone
  const userTime = new Date(now.toLocaleString("en-US", { timeZone: userTimezone }));
  
  // Parse working hours
  const [startHour, startMinute] = workingHours.startTime.split(':').map(Number);
  
  // Create next working hour date
  const nextWorkingHour = new Date(userTime);
  nextWorkingHour.setHours(startHour, startMinute, 0, 0);
  
  // If it's weekend, set for next Monday
  const dayOfWeek = userTime.getDay();
  if (dayOfWeek === 0) { // Sunday
    nextWorkingHour.setDate(nextWorkingHour.getDate() + 1); // Monday
  } else if (dayOfWeek === 6) { // Saturday
    nextWorkingHour.setDate(nextWorkingHour.getDate() + 2); // Monday
  } else if (userTime.getHours() >= startHour) {
    // If it's already past working hours today, set for tomorrow
    nextWorkingHour.setDate(nextWorkingHour.getDate() + 1);
  }
  
  return nextWorkingHour;
}

/**
 * Debug function to check working hours status
 */
export function debugWorkingHours(workingHours: WorkingHours): any {
  const now = new Date();
  const userTimezone = workingHours.timezone || 'America/Mexico_City';
  
  // Convert current time to user's timezone
  const userTime = new Date(now.toLocaleString("en-US", { timeZone: userTimezone }));
  const dayOfWeek = userTime.getDay();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  return {
    currentTime: userTime.toISOString(),
    timezone: userTimezone,
    dayOfWeek: dayOfWeek,
    dayName: dayNames[dayOfWeek],
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    workingHours: workingHours,
    isWithinWorkingHours: isWithinWorkingHours(workingHours)
  };
}

/**
 * Get working hours from user config
 */
export function getWorkingHoursFromConfig(userConfig: any): WorkingHours {
  const workingDays = userConfig.workingDays 
    ? (typeof userConfig.workingDays === 'string' 
        ? userConfig.workingDays.split(',').map((day: string) => day.trim())
        : userConfig.workingDays)
    : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  return {
    startTime: userConfig.searchStartTime || '09:00',
    endTime: userConfig.searchEndTime || '17:00',
    timezone: userConfig.timezone || 'America/Mexico_City',
    workingDays: workingDays
  };
}
