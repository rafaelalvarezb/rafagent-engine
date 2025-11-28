/**
 * Advanced timezone detection and management utilities
 * Handles automatic detection, manual selection, and intelligent conversions
 */

// Comprehensive list of timezones with their common names and IANA identifiers
export const TIMEZONE_DATABASE = {
  // Americas - North
  'America/New_York': {
    name: 'Eastern Time (US & Canada)',
    offset: -5, // EST (winter) / -4 (EDT summer)
    commonNames: ['eastern', 'est', 'edt', 'new york', 'miami', 'atlanta'],
    countries: ['US', 'CA']
  },
  'America/Chicago': {
    name: 'Central Time (US & Canada)',
    offset: -6, // CST (winter) / -5 (CDT summer)
    commonNames: ['central', 'cst', 'cdt', 'chicago', 'dallas', 'houston'],
    countries: ['US', 'CA']
  },
  'America/Denver': {
    name: 'Mountain Time (US & Canada)',
    offset: -7, // MST (winter) / -6 (MDT summer)
    commonNames: ['mountain', 'mst', 'mdt', 'denver', 'phoenix', 'salt lake city'],
    countries: ['US', 'CA']
  },
  'America/Los_Angeles': {
    name: 'Pacific Time (US & Canada)',
    offset: -8, // PST (winter) / -7 (PDT summer)
    commonNames: ['pacific', 'pst', 'pdt', 'los angeles', 'san francisco', 'seattle'],
    countries: ['US', 'CA']
  },
  'America/Mexico_City': {
    name: 'Central Time (Mexico)',
    offset: -6, // CST (no daylight saving in most of Mexico)
    commonNames: ['mexico', 'mexico city', 'cdmx', 'central mexico', 'cst'],
    countries: ['MX']
  },
  'America/Toronto': {
    name: 'Eastern Time (Canada)',
    offset: -5, // EST (winter) / -4 (EDT summer)
    commonNames: ['toronto', 'ottawa', 'montreal', 'canada eastern'],
    countries: ['CA']
  },
  'America/Vancouver': {
    name: 'Pacific Time (Canada)',
    offset: -8, // PST (winter) / -7 (PDT summer)
    commonNames: ['vancouver', 'canada pacific'],
    countries: ['CA']
  },

  // Americas - Central & South
  'America/Argentina/Buenos_Aires': {
    name: 'Argentina Time',
    offset: -3,
    commonNames: ['argentina', 'buenos aires', 'baires', 'art'],
    countries: ['AR']
  },
  'America/Sao_Paulo': {
    name: 'Brasilia Time',
    offset: -3,
    commonNames: ['brazil', 'brasil', 'sao paulo', 'rio de janeiro', 'brasilia', 'brt'],
    countries: ['BR']
  },
  'America/Santiago': {
    name: 'Chile Time',
    offset: -3,
    commonNames: ['chile', 'santiago', 'clt'],
    countries: ['CL']
  },
  'America/Bogota': {
    name: 'Colombia Time',
    offset: -5,
    commonNames: ['colombia', 'bogota', 'medellin', 'cot'],
    countries: ['CO']
  },
  'America/Lima': {
    name: 'Peru Time',
    offset: -5,
    commonNames: ['peru', 'lima', 'pet'],
    countries: ['PE']
  },
  'America/Caracas': {
    name: 'Venezuela Time',
    offset: -4,
    commonNames: ['venezuela', 'caracas', 'vet'],
    countries: ['VE']
  },

  // Europe
  'Europe/London': {
    name: 'Greenwich Mean Time',
    offset: 0, // GMT (winter) / +1 (BST summer)
    commonNames: ['london', 'uk', 'britain', 'gmt', 'bst', 'england'],
    countries: ['GB']
  },
  'Europe/Paris': {
    name: 'Central European Time',
    offset: 1, // CET (winter) / +2 (CEST summer)
    commonNames: ['paris', 'france', 'cet', 'cest', 'europe central'],
    countries: ['FR']
  },
  'Europe/Madrid': {
    name: 'Central European Time (Spain)',
    offset: 1, // CET (winter) / +2 (CEST summer)
    commonNames: ['madrid', 'spain', 'españa', 'barcelona'],
    countries: ['ES']
  },
  'Europe/Berlin': {
    name: 'Central European Time (Germany)',
    offset: 1, // CET (winter) / +2 (CEST summer)
    commonNames: ['berlin', 'germany', 'deutschland', 'munich'],
    countries: ['DE']
  },
  'Europe/Rome': {
    name: 'Central European Time (Italy)',
    offset: 1, // CET (winter) / +2 (CEST summer)
    commonNames: ['rome', 'italy', 'italia', 'milan'],
    countries: ['IT']
  },

  // Asia
  'Asia/Tokyo': {
    name: 'Japan Standard Time',
    offset: 9,
    commonNames: ['tokyo', 'japan', 'jst'],
    countries: ['JP']
  },
  'Asia/Shanghai': {
    name: 'China Standard Time',
    offset: 8,
    commonNames: ['shanghai', 'china', 'beijing', 'cst'],
    countries: ['CN']
  },
  'Asia/Kolkata': {
    name: 'India Standard Time',
    offset: 5.5,
    commonNames: ['india', 'mumbai', 'delhi', 'bangalore', 'ist'],
    countries: ['IN']
  },
  'Asia/Singapore': {
    name: 'Singapore Time',
    offset: 8,
    commonNames: ['singapore', 'sgt'],
    countries: ['SG']
  },

  // Australia
  'Australia/Sydney': {
    name: 'Australian Eastern Time',
    offset: 10, // AEST (winter) / +11 (AEDT summer)
    commonNames: ['sydney', 'australia', 'melbourne', 'aest', 'aedt'],
    countries: ['AU']
  }
};

/**
 * Detect user's timezone automatically from browser
 * @returns IANA timezone identifier (e.g., 'America/Mexico_City')
 */
export function detectUserTimezone(): string {
  try {
    // Get timezone from browser
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Validate that it's a known timezone
    if (TIMEZONE_DATABASE[detectedTimezone as keyof typeof TIMEZONE_DATABASE]) {
      return detectedTimezone;
    }
    
    // Fallback to UTC if detection fails
    return 'UTC';
  } catch (error) {
    console.warn('Timezone detection failed:', error);
    return 'America/Mexico_City'; // Safe fallback
  }
}

/**
 * Get timezone information by IANA identifier
 * @param timezone - IANA timezone identifier
 * @returns Timezone information or null if not found
 */
export function getTimezoneInfo(timezone: string) {
  return TIMEZONE_DATABASE[timezone as keyof typeof TIMEZONE_DATABASE] || null;
}

/**
 * Search timezones by common name or country
 * @param query - Search query (e.g., "mexico", "eastern", "spain")
 * @returns Array of matching timezones
 */
export function searchTimezones(query: string): Array<{id: string, info: any}> {
  const normalizedQuery = query.toLowerCase().trim();
  const results: Array<{id: string, info: any}> = [];
  
  for (const [id, info] of Object.entries(TIMEZONE_DATABASE)) {
    // Check common names
    const nameMatch = info.commonNames.some(name => 
      name.includes(normalizedQuery) || normalizedQuery.includes(name)
    );
    
    // Check country codes
    const countryMatch = info.countries.some(country => 
      country.toLowerCase().includes(normalizedQuery)
    );
    
    // Check timezone ID
    const idMatch = id.toLowerCase().includes(normalizedQuery);
    
    if (nameMatch || countryMatch || idMatch) {
      results.push({ id, info });
    }
  }
  
  return results;
}

/**
 * Get all timezones grouped by region
 * @returns Timezones grouped by region
 */
export function getTimezonesByRegion() {
  const regions = {
    'North America': [] as Array<{id: string, info: any}>,
    'Central & South America': [] as Array<{id: string, info: any}>,
    'Europe': [] as Array<{id: string, info: any}>,
    'Asia': [] as Array<{id: string, info: any}>,
    'Australia': [] as Array<{id: string, info: any}>
  };
  
  for (const [id, info] of Object.entries(TIMEZONE_DATABASE)) {
    if (id.startsWith('America/New_York') || id.startsWith('America/Chicago') || 
        id.startsWith('America/Denver') || id.startsWith('America/Los_Angeles') ||
        id.startsWith('America/Mexico_City') || id.startsWith('America/Toronto') ||
        id.startsWith('America/Vancouver')) {
      regions['North America'].push({ id, info });
    } else if (id.startsWith('America/Argentina') || id.startsWith('America/Sao_Paulo') ||
               id.startsWith('America/Santiago') || id.startsWith('America/Bogota') ||
               id.startsWith('America/Lima') || id.startsWith('America/Caracas')) {
      regions['Central & South America'].push({ id, info });
    } else if (id.startsWith('Europe/')) {
      regions['Europe'].push({ id, info });
    } else if (id.startsWith('Asia/')) {
      regions['Asia'].push({ id, info });
    } else if (id.startsWith('Australia/')) {
      regions['Australia'].push({ id, info });
    }
  }
  
  return regions;
}

/**
 * Convert time between timezones with proper handling of daylight saving
 * @param date - Date object
 * @param fromTimezone - Source timezone
 * @param toTimezone - Target timezone
 * @returns Converted date
 */
export function convertTimezoneWithDST(date: Date, fromTimezone: string, toTimezone: string): Date {
  try {
    // Create a date in the source timezone
    const sourceDate = new Date(date.toLocaleString("en-US", { timeZone: fromTimezone }));
    
    // Convert to target timezone
    const targetDate = new Date(sourceDate.toLocaleString("en-US", { timeZone: toTimezone }));
    
    return targetDate;
  } catch (error) {
    console.error('Timezone conversion error:', error);
    return date; // Return original date if conversion fails
  }
}

/**
 * Get current time in a specific timezone
 * @param timezone - Target timezone
 * @returns Current time in the specified timezone
 */
export function getCurrentTimeInTimezone(timezone: string): Date {
  const now = new Date();
  return convertTimezoneWithDST(now, 'UTC', timezone);
}

/**
 * Format time for display in a specific timezone
 * @param date - Date to format
 * @param timezone - Target timezone
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted time string
 */
export function formatTimeInTimezone(
  date: Date, 
  timezone: string, 
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }
): string {
  return new Intl.DateTimeFormat('en-CA', {
    ...options,
    timeZone: timezone
  }).format(date);
}

/**
 * Validate if a timezone string is valid
 * @param timezone - Timezone to validate
 * @returns True if valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}
