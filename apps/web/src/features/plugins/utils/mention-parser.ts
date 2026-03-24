import { Member } from '@ghostcast/shared';

export interface ParsedMessage {
  cleanMessage: string;
  mentionedMemberIds: string[];
  mentionedMemberNames: string[];
}

export interface ParsedRequestMessage {
  cleanMessage: string;
  mentionedRequestIds: string[];
  mentionedRequestTitles: string[];
}

export interface RequestForMention {
  id: string;
  title: string;
}

/**
 * Parse @member mentions from a message.
 * Supports formats:
 * - @FirstName LastName
 * - @"First Name Last Name" (for names with special chars)
 * - @firstName (partial match)
 */
export function parseMemberMentions(
  message: string,
  availableMembers: Member[]
): ParsedMessage {
  const mentionedMemberIds: string[] = [];
  const mentionedMemberNames: string[] = [];

  // Pattern for @mentions: @word or @"quoted name" or @FirstName LastName
  const mentionPattern = /@(?:"([^"]+)"|(\w+(?:\s+\w+)?))/g;

  let cleanMessage = message;
  let match;

  while ((match = mentionPattern.exec(message)) !== null) {
    const mentionName = (match[1] || match[2]).toLowerCase().trim();

    // Find matching member
    const member = availableMembers.find((m) => {
      const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
      const firstName = m.firstName.toLowerCase();
      const lastName = m.lastName.toLowerCase();

      return (
        fullName === mentionName ||
        fullName.startsWith(mentionName) ||
        firstName === mentionName ||
        lastName === mentionName
      );
    });

    if (member && !mentionedMemberIds.includes(member.id)) {
      mentionedMemberIds.push(member.id);
      mentionedMemberNames.push(`${member.firstName} ${member.lastName}`);
    }

    // Remove the mention from the clean message
    cleanMessage = cleanMessage.replace(match[0], '').trim();
  }

  // Clean up extra whitespace
  cleanMessage = cleanMessage.replace(/\s+/g, ' ').trim(); // NOSONAR - replaceAll requires ES2021+

  return {
    cleanMessage: cleanMessage || message,
    mentionedMemberIds,
    mentionedMemberNames,
  };
}

/**
 * Parse #request mentions from a message.
 * Supports formats:
 * - #RequestTitle
 * - #"Request Title With Spaces"
 */
export function parseRequestMentions(
  message: string,
  availableRequests: RequestForMention[]
): ParsedRequestMessage {
  const mentionedRequestIds: string[] = [];
  const mentionedRequestTitles: string[] = [];

  // Pattern for #mentions: #word or #"quoted title"
  const mentionPattern = /#(?:"([^"]+)"|(\w+(?:\s+\w+)?))/g;

  let cleanMessage = message;
  let match;

  while ((match = mentionPattern.exec(message)) !== null) {
    const mentionTitle = (match[1] || match[2]).toLowerCase().trim();

    // Find matching request
    const request = availableRequests.find((r) => {
      const title = r.title.toLowerCase();
      return (
        title === mentionTitle ||
        title.startsWith(mentionTitle) ||
        title.includes(mentionTitle)
      );
    });

    if (request && !mentionedRequestIds.includes(request.id)) {
      mentionedRequestIds.push(request.id);
      mentionedRequestTitles.push(request.title);
    }

    // Remove the mention from the clean message
    cleanMessage = cleanMessage.replace(match[0], '').trim();
  }

  // Clean up extra whitespace
  cleanMessage = cleanMessage.replace(/\s+/g, ' ').trim(); // NOSONAR - replaceAll requires ES2021+

  return {
    cleanMessage: cleanMessage || message,
    mentionedRequestIds,
    mentionedRequestTitles,
  };
}
