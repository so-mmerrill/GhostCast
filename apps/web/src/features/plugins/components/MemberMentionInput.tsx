import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { Member } from '@ghostcast/shared';
import { cn } from '@/lib/utils';
import { RequestForMention } from '../utils/mention-parser';
import { User, FileText } from 'lucide-react';

interface MemberMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

type SuggestionType = 'member' | 'request';

interface Suggestion {
  type: SuggestionType;
  id: string;
  displayName: string;
  subtitle?: string;
}

export function MemberMentionInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  disabled,
  className,
}: Readonly<MemberMentionInputProps>) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionType, setMentionType] = useState<SuggestionType>('member');
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch members for autocomplete
  const { data: membersData } = useQuery({
    queryKey: ['members', 'autocomplete'],
    queryFn: async () => {
      const response = await api.get<{ data: { data: Member[] } }>('/members', {
        pageSize: '1000',
      });
      return response.data?.data || [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch requests for autocomplete
  const { data: requestsData } = useQuery({
    queryKey: ['requests', 'autocomplete'],
    queryFn: async () => {
      const response = await api.get<{ data: { data: RequestForMention[] } }>('/requests', {
        pageSize: '100',
      });
      return response.data?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const members: Member[] = membersData || [];
  const requests: RequestForMention[] = requestsData || [];

  // Build unified suggestions based on mention type and query
  const suggestions: Suggestion[] = (() => {
    if (!mentionQuery) return [];

    const query = mentionQuery.toLowerCase();

    if (mentionType === 'member') {
      return members
        .filter((m: Member) => {
          const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
          const firstName = m.firstName.toLowerCase();
          const lastName = m.lastName.toLowerCase();
          return (
            fullName.includes(query) ||
            firstName.includes(query) ||
            lastName.includes(query)
          );
        })
        .slice(0, 5)
        .map((m): Suggestion => ({
          type: 'member',
          id: m.id,
          displayName: `${m.firstName} ${m.lastName}`,
          subtitle: m.department || undefined,
        }));
    } else {
      return requests
        .filter((r) => r.title.toLowerCase().includes(query))
        .slice(0, 5)
        .map((r): Suggestion => ({
          type: 'request',
          id: r.id,
          displayName: r.title,
        }));
    }
  })();

  // Detect when user types @ or #
  useEffect(() => {
    // Check for @ (member mention)
    const lastAtIndex = value.lastIndexOf('@');
    const lastHashIndex = value.lastIndexOf('#');

    // Determine which trigger came last
    if (lastAtIndex > lastHashIndex && lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1);
      if (!textAfterAt.includes('"') || textAfterAt.split('"').length < 3) {
        const words = textAfterAt.split(' ');
        if (words.length <= 2) {
          setMentionQuery(textAfterAt);
          setMentionType('member');
          setShowSuggestions(true);
          setSuggestionIndex(0);
          return;
        }
      }
    } else if (lastHashIndex > lastAtIndex && lastHashIndex !== -1) {
      const textAfterHash = value.slice(lastHashIndex + 1);
      if (!textAfterHash.includes('"') || textAfterHash.split('"').length < 3) {
        const words = textAfterHash.split(' ');
        if (words.length <= 3) {
          setMentionQuery(textAfterHash);
          setMentionType('request');
          setShowSuggestions(true);
          setSuggestionIndex(0);
          return;
        }
      }
    }

    setShowSuggestions(false);
    setMentionQuery('');
  }, [value]);

  const insertSuggestion = (suggestion: Suggestion) => {
    const triggerChar = suggestion.type === 'member' ? '@' : '#';
    const lastTriggerIndex = suggestion.type === 'member'
      ? value.lastIndexOf('@')
      : value.lastIndexOf('#');

    const beforeMention = value.slice(0, lastTriggerIndex);
    // Always use quotes for request mentions; for member mentions, only when needed
    const needsQuotes = suggestion.type === 'request' || /[^\w]/.test(suggestion.displayName);
    const mentionText = needsQuotes
      ? `${triggerChar}"${suggestion.displayName}"`
      : `${triggerChar}${suggestion.displayName}`;

    onChange(`${beforeMention}${mentionText} `);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && suggestions[suggestionIndex])) {
        e.preventDefault();
        insertSuggestion(suggestions[suggestionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }
    onKeyDown(e);
  };

  return (
    <div className="relative flex-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
      />

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-md border bg-popover shadow-md z-50 max-h-[200px] overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              type="button"
              key={`${suggestion.type}-${suggestion.id}`}
              tabIndex={-1}
              className={cn(
                'w-full px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center gap-2 text-left',
                index === suggestionIndex && 'bg-accent'
              )}
              onMouseDown={() => insertSuggestion(suggestion)}
              onMouseEnter={() => setSuggestionIndex(index)}
            >
              {suggestion.type === 'member' ? (
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-medium truncate">{suggestion.displayName}</div>
                {suggestion.subtitle && (
                  <div className="text-xs text-muted-foreground truncate">
                    {suggestion.subtitle}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Export the members query for use in LlmChatPanel
export function useMembersForMentions() {
  return useQuery({
    queryKey: ['members', 'autocomplete'],
    queryFn: async (): Promise<Member[]> => {
      const response = await api.get<{ data: { data: Member[] } }>('/members', {
        pageSize: '1000',
      });
      return response.data?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Export the requests query for use in LlmChatPanel
export function useRequestsForMentions() {
  return useQuery({
    queryKey: ['requests', 'autocomplete'],
    queryFn: async (): Promise<RequestForMention[]> => {
      const response = await api.get<{ data: { data: RequestForMention[] } }>('/requests', {
        pageSize: '100',
      });
      return response.data?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
