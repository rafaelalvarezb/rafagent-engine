/**
 * Timezone conversion utilities
 */

// Map of common timezone names to UTC offsets (in hours)
const TIMEZONE_OFFSETS: Record<string, number> = {
  // Americas
  'argentina': -3,
  'buenos aires': -3,
  'america/argentina/buenos_aires': -3,
  'brazil': -3,
  'brasilia': -3,
  'america/sao_paulo': -3,
  'chile': -3,
  'santiago': -3,
  'america/santiago': -3,
  'colombia': -5,
  'bogota': -5,
  'america/bogota': -5,
  'peru': -5,
  'lima': -5,
  'america/lima': -5,
  'ecuador': -5,
  'quito': -5,
  'america/guayaquil': -5,
  'venezuela': -4,
  'caracas': -4,
  'america/caracas': -4,
  'mexico': -6,
  'mexico city': -6,
  'cdmx': -6,
  'america/mexico_city': -6,
  'central time': -6,
  'cst': -6,
  'eastern time': -5,
  'est': -5,
  'america/new_york': -5,
  'pacific time': -8,
  'pst': -8,
  'america/los_angeles': -8,
  'mountain time': -7,
  'mst': -7,
  'america/denver': -7,
  
  // Europe
  'spain': 1,
  'madrid': 1,
  'europe/madrid': 1,
  'france': 1,
  'paris': 1,
  'europe/paris': 1,
  'germany': 1,
  'berlin': 1,
  'europe/berlin': 1,
  'italy': 1,
  'rome': 1,
  'europe/rome': 1,
  'uk': 0,
  'london': 0,
  'europe/london': 0,
  'gmt': 0,
  'utc': 0,
  
  // Asia
  'india': 5.5,
  'mumbai': 5.5,
  'delhi': 5.5,
  'asia/kolkata': 5.5,
  'china': 8,
  'beijing': 8,
  'shanghai': 8,
  'asia/shanghai': 8,
  'japan': 9,
  'tokyo': 9,
  'asia/tokyo': 9,
  'singapore': 8,
  'asia/singapore': 8,
  'hong kong': 8,
  'asia/hong_kong': 8,
  
  // Australia
  'australia': 10,
  'sydney': 10,
  'melbourne': 10,
  'australia/sydney': 10,
};

/**
 * Get timezone offset in hours from timezone name
 * @param timezone - Timezone name (e.g., "Argentina", "PST", "Mexico")
 * @returns Offset in hours from UTC
 */
export function getTimezoneOffset(timezone: string): number {
  const normalizedTimezone = timezone.toLowerCase().trim();
  return TIMEZONE_OFFSETS[normalizedTimezone] || 0;
}

/**
 * Convert time from one timezone to another
 * @param time - Time in HH:MM format (e.g., "15:00")
 * @param fromTimezone - Source timezone (e.g., "Argentina")
 * @param toTimezone - Target timezone (e.g., "Mexico")
 * @returns Converted time in HH:MM format
 */
export function convertTimezone(
  time: string,
  fromTimezone: string,
  toTimezone: string
): string {
  const [hours, minutes] = time.split(':').map(Number);
  
  const fromOffset = getTimezoneOffset(fromTimezone);
  const toOffset = getTimezoneOffset(toTimezone);
  
  // Calculate the difference
  const offsetDiff = toOffset - fromOffset;
  
  // Apply the offset
  let newHours = hours + offsetDiff;
  
  // Handle day overflow (we'll just wrap around 24 hours)
  if (newHours < 0) {
    newHours += 24;
  } else if (newHours >= 24) {
    newHours -= 24;
  }
  
  return `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Get day adjustment when converting timezones
 * Returns -1 if time shifts to previous day, 0 if same day, 1 if next day
 */
export function getTimezoneDayAdjustment(
  time: string,
  fromTimezone: string,
  toTimezone: string
): number {
  const [hours] = time.split(':').map(Number);
  
  const fromOffset = getTimezoneOffset(fromTimezone);
  const toOffset = getTimezoneOffset(toTimezone);
  
  const offsetDiff = toOffset - fromOffset;
  const newHours = hours + offsetDiff;
  
  if (newHours < 0) {
    return -1; // Previous day
  } else if (newHours >= 24) {
    return 1; // Next day
  }
  
  return 0; // Same day
}

