import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useLlmChatStore } from '@/stores/llm-chat-store';
import { LLM_CONTEXT_CONFIGS } from '@ghostcast/shared';
import { ContextSelector } from '../components/ContextSelector';
import {
  MemberMentionInput,
  useMembersForMentions,
  useRequestsForMentions,
} from '../components/MemberMentionInput';
import { parseMemberMentions, parseRequestMentions } from '../utils/mention-parser';

interface LlmChatPanelProps {
  readonly onClose: () => void;
}

export function LlmChatPanelHeader() {
  return <ContextSelector variant="header" />;
}

export function LlmChatPanel({ onClose: _onClose }: LlmChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    addMessage,
    selectedContext,
  } = useLlmChatStore();

  // Fetch members for @mention parsing
  const { data: membersData } = useMembersForMentions();
  const members = membersData || [];

  // Fetch requests for #mention parsing
  const { data: requestsData } = useRequestsForMentions();
  const requests = requestsData || [];

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (data: {
      message: string;
      mentionedMemberIds: string[];
      mentionedRequestIds: string[];
    }) => {
      // Filter out messages with empty content and ensure all content is a string
      const chatMessages = messages
        .filter((m) => m.content && typeof m.content === 'string')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));
      chatMessages.push({ role: 'user' as const, content: data.message });

      const result = await api.post<{ data: { data: { response: string } } }>(
        '/llm-chat/completion',
        {
          messages: chatMessages,
          pageContext: {
            pathname: globalThis.location.pathname,
            pageTitle: document.title,
          },
          contextOverride: selectedContext,
          mentionedMemberIds: data.mentionedMemberIds,
          mentionedRequestIds: data.mentionedRequestIds,
        }
      );
      return result.data.data.response;
    },
    onSuccess: (response) => {
      if (!response || typeof response !== 'string') {
        return;
      }
      addMessage({
        id: Date.now().toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      });
    },
    onError: (error: Error) => {
      addMessage({
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date(),
      });
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || chatMutation.isPending) return;

    // Parse @mentions from input
    const { cleanMessage: messageAfterMembers, mentionedMemberIds } = parseMemberMentions(
      input,
      members
    );

    // Parse #mentions from the message (after member parsing)
    const { cleanMessage, mentionedRequestIds } = parseRequestMentions(
      messageAfterMembers,
      requests
    );

    // Add user message (showing original with mentions for display)
    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    });

    // Send to API with parsed data
    chatMutation.mutate({
      message: cleanMessage,
      mentionedMemberIds,
      mentionedRequestIds,
    });

    setInput('');
  }, [input, chatMutation, addMessage, members, requests]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentContextConfig = LLM_CONTEXT_CONFIGS[selectedContext];

  return (
    <div className="flex h-full flex-col -m-4">
      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>How can I help you today?</p>
            <p className="text-xs mt-1">
              Context: {currentContextConfig.label}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Use @name for members, #title for requests
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'max-w-[85%] rounded-lg px-3 py-2 text-sm',
              msg.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'mr-auto bg-muted dark:bg-zinc-700'
            )}
          >
            {msg.role === 'user' ? (
              <div className="whitespace-pre-wrap">{msg.content}</div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-code:bg-zinc-200 dark:prose-code:bg-zinc-600 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-zinc-200 dark:prose-pre:bg-zinc-600 prose-pre:p-2 prose-pre:rounded">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted dark:bg-zinc-700 px-3 py-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t dark:border-zinc-600 p-3">
        <div className="flex gap-2">
          <MemberMentionInput
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything... (@name, #request)"
            disabled={chatMutation.isPending}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
