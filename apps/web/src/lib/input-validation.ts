import { VALIDATION } from '@ghostcast/shared';

// Regex for allowed characters: letters, numbers, spaces, and common punctuation
const ALLOWED_CHARS_REGEX = /[^a-zA-Z0-9\s.,!?'"\-:;()@#&*/+=%$]/g;

/**
 * Sanitizes input by removing disallowed characters and enforcing max length.
 * Allows: letters, numbers, spaces, and common punctuation (.,!?'"-:;()@#&*\/+=%$)
 */
export function sanitizeInput(value: string, maxLength: number): string {
  return value.replace(ALLOWED_CHARS_REGEX, '').slice(0, maxLength);
}

/**
 * Sanitizes a title field (max 200 characters)
 */
export function sanitizeTitle(value: string): string {
  return sanitizeInput(value, VALIDATION.TITLE_MAX_LENGTH);
}

/**
 * Sanitizes a description field (max 5000 characters)
 */
export function sanitizeDescription(value: string): string {
  return sanitizeInput(value, VALIDATION.DESCRIPTION_MAX_LENGTH);
}

/**
 * Sanitizes a name field (max 100 characters)
 */
export function sanitizeName(value: string): string {
  return sanitizeInput(value, VALIDATION.NAME_MAX_LENGTH);
}

/**
 * Sanitizes an email field (max 255 characters)
 * Note: Email has specific format validation via type="email"
 */
export function sanitizeEmail(value: string): string {
  return sanitizeInput(value, VALIDATION.EMAIL_MAX_LENGTH);
}

/**
 * Sanitizes a URL field - only enforces max length, allows URL characters
 */
export function sanitizeUrl(value: string, maxLength: number = 2000): string {
  return value.slice(0, maxLength);
}

export { VALIDATION } from '@ghostcast/shared';
