import { create } from 'zustand';
import { LlmContextKey } from '@ghostcast/shared';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface LlmChatState {
  messages: Message[];
  selectedContext: LlmContextKey;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  setContext: (context: LlmContextKey) => void;
}

export const useLlmChatStore = create<LlmChatState>((set) => ({
  messages: [],
  selectedContext: 'basic',

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  clearMessages: () => set({ messages: [] }),

  setContext: (context) => set({ selectedContext: context }),
}));
