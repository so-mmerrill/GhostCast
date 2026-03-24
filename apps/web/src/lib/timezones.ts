// Get all IANA timezones supported by the browser
export const TIMEZONES: string[] = (() => {
  try {
    // supportedValuesOf is available in modern browsers but not in older TS lib types
    const intl = Intl as { supportedValuesOf?: (key: string) => string[] };
    if (intl.supportedValuesOf) {
      return intl.supportedValuesOf('timeZone');
    }
    throw new Error('Not supported');
  } catch {
    // Fallback for older browsers
    return [
      'Africa/Cairo',
      'Africa/Johannesburg',
      'Africa/Lagos',
      'Africa/Nairobi',
      'America/Anchorage',
      'America/Argentina/Buenos_Aires',
      'America/Bogota',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Mexico_City',
      'America/New_York',
      'America/Phoenix',
      'America/Sao_Paulo',
      'America/Toronto',
      'America/Vancouver',
      'Asia/Bangkok',
      'Asia/Colombo',
      'Asia/Dubai',
      'Asia/Hong_Kong',
      'Asia/Jakarta',
      'Asia/Jerusalem',
      'Asia/Karachi',
      'Asia/Kolkata',
      'Asia/Kuala_Lumpur',
      'Asia/Manila',
      'Asia/Seoul',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Taipei',
      'Asia/Tokyo',
      'Australia/Melbourne',
      'Australia/Perth',
      'Australia/Sydney',
      'Europe/Amsterdam',
      'Europe/Athens',
      'Europe/Berlin',
      'Europe/Brussels',
      'Europe/Dublin',
      'Europe/Helsinki',
      'Europe/Istanbul',
      'Europe/Lisbon',
      'Europe/London',
      'Europe/Madrid',
      'Europe/Moscow',
      'Europe/Paris',
      'Europe/Rome',
      'Europe/Stockholm',
      'Europe/Vienna',
      'Europe/Warsaw',
      'Europe/Zurich',
      'Pacific/Auckland',
      'Pacific/Fiji',
      'Pacific/Honolulu',
      'UTC',
    ];
  }
})();

// Common timezone abbreviation mappings to IANA timezones
const TIMEZONE_ABBREVIATIONS: Record<string, string[]> = {
  EST: ['America/New_York', 'America/Detroit', 'America/Indiana/Indianapolis'],
  EDT: ['America/New_York', 'America/Detroit', 'America/Indiana/Indianapolis'],
  CST: ['America/Chicago', 'America/Mexico_City'],
  CDT: ['America/Chicago'],
  MST: ['America/Denver', 'America/Phoenix'],
  MDT: ['America/Denver'],
  PST: ['America/Los_Angeles', 'America/Vancouver'],
  PDT: ['America/Los_Angeles', 'America/Vancouver'],
  AST: ['America/Halifax', 'America/Puerto_Rico'],
  ADT: ['America/Halifax'],
  HST: ['Pacific/Honolulu'],
  AKST: ['America/Anchorage'],
  AKDT: ['America/Anchorage'],
  GMT: ['Europe/London', 'UTC'],
  BST: ['Europe/London'],
  UTC: ['UTC'],
  CET: ['Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid'],
  CEST: ['Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid'],
  EET: ['Europe/Athens', 'Europe/Helsinki', 'Europe/Istanbul'],
  EEST: ['Europe/Athens', 'Europe/Helsinki'],
  IST: ['Asia/Kolkata', 'Europe/Dublin'],
  JST: ['Asia/Tokyo'],
  KST: ['Asia/Seoul'],
  CST_CHINA: ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei'],
  SGT: ['Asia/Singapore'],
  AEST: ['Australia/Sydney', 'Australia/Melbourne'],
  AEDT: ['Australia/Sydney', 'Australia/Melbourne'],
  AWST: ['Australia/Perth'],
  NZST: ['Pacific/Auckland'],
  NZDT: ['Pacific/Auckland'],
};

// Get timezone abbreviation for a given timezone
export function getTimezoneAbbreviation(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(now);
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

// Check if a timezone matches a search query (including abbreviations)
export function timezoneMatchesSearch(tz: string, search: string): boolean {
  const searchLower = search.toLowerCase();
  const searchUpper = search.toUpperCase();

  // Check if the timezone name matches
  if (tz.toLowerCase().includes(searchLower)) {
    return true;
  }

  // Check if the display name matches (with underscores replaced)
  if (tz.replaceAll('_', ' ').toLowerCase().includes(searchLower)) {
    return true;
  }

  // Check if searching by abbreviation
  if (TIMEZONE_ABBREVIATIONS[searchUpper]?.includes(tz)) {
    return true;
  }

  // Check if the timezone's current abbreviation matches
  const abbr = getTimezoneAbbreviation(tz);
  if (abbr?.toLowerCase().includes(searchLower)) {
    return true;
  }

  return false;
}

// Format timezone for display (e.g., "America/New_York" -> "America/New York (EST)")
export function formatTimezone(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(now);
    const abbr = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const displayName = tz.replaceAll('_', ' ');
    return abbr ? `${displayName} (${abbr})` : displayName;
  } catch {
    return tz.replaceAll('_', ' ');
  }
}
