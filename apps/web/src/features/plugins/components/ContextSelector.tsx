import { LLM_CONTEXT_CONFIGS, LlmContextKey } from '@ghostcast/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLlmChatStore } from '@/stores/llm-chat-store';
import { cn } from '@/lib/utils';

interface ContextSelectorProps {
  variant?: 'default' | 'header';
}

export function ContextSelector({ variant = 'default' }: Readonly<ContextSelectorProps>) {
  const { selectedContext, setContext } = useLlmChatStore();

  const contextOptions = Object.values(LLM_CONTEXT_CONFIGS);
  const isHeader = variant === 'header';

  return (
    <Select
      value={selectedContext}
      onValueChange={(value) => setContext(value as LlmContextKey)}
    >
      <SelectTrigger
        className={cn(
          'h-7 w-[180px] text-xs',
          isHeader &&
            'bg-white/20 border-white/30 text-white hover:bg-white/30 focus:ring-white/50'
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {contextOptions.map((config) => (
          <SelectItem key={config.key} value={config.key} title={config.description}>
            {config.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
