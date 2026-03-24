import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface LlmSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface Settings {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const MODEL_OPTIONS = [
  { label: 'Sonnet-4.5', value: 'bedrock-claude-4-5-sonnet' },
  { label: 'Haiku-3.5', value: 'bedrock-claude-3-5-haiku' },
  { label: 'Deepseek-r1', value: 'bedrock-deepseek-r1' },
  { label: 'OSS-120b', value: 'bedrock-openai-gpt-oss-120b' },
  { label: 'Coder-30b', value: 'bedrock-qwen3-coder-30b' },
  { label: 'Maverick-17b', value: 'bedrock-llama4-maverick-17b-instruct' },  
];

export function LlmSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: Readonly<LlmSettingsDialogProps>) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4');

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-settings', 'openai-llm'],
    queryFn: async () => {
      const response = await api.get<{ data: Settings }>(
        '/user-settings/openai-llm'
      );
      return response.data;
    },
    enabled: open,
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      // Don't update apiKey if it's masked
      if (settings.apiKey && settings.apiKey !== '***configured***') {
        setApiKey(settings.apiKey);
      }
      if (settings.baseUrl) setBaseUrl(settings.baseUrl);
      if (settings.model) setModel(settings.model);
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (newSettings: Settings) => {
      await api.put('/user-settings/openai-llm', { settings: newSettings });
    },
    onSuccess: () => {
      toast({ title: 'Settings saved successfully' });
      queryClient.invalidateQueries({
        queryKey: ['user-settings', 'openai-llm'],
      });
      // Invalidate quip-status so AI Import button updates when AI is configured
      queryClient.invalidateQueries({
        queryKey: ['quip-status'],
      });
      onSaved?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to save settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    const newSettings: Settings = {
      baseUrl,
      model,
    };

    // Only include API key if user entered a new one
    if (apiKey && apiKey !== '') {
      newSettings.apiKey = apiKey;
    }

    saveMutation.mutate(newSettings);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Assistant Settings</DialogTitle>
          <DialogDescription>
            Configure your OpenAI API settings. Your API key is stored securely
            and encrypted.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={
                  settings?.apiKey === '***configured***'
                    ? 'Leave blank to keep current key'
                    : 'sk-...'
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your OpenAI API key. Get one at{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  platform.openai.com
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseUrl">API Base URL</Label>
              <Input
                id="baseUrl"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Change this only if using a custom OpenAI-compatible endpoint.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
