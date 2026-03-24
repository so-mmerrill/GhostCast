import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { QuipConfigStatus } from '@ghostcast/shared';

/**
 * Hook to check if the current user has QUIP configured and available.
 * Used by CreateRequestModal to conditionally show the import button.
 */
export function useQuipIntegration() {
  const { data, isLoading } = useQuery<QuipConfigStatus>({
    queryKey: ['quip-status'],
    queryFn: async () => {
      const response = await api.get<{ data: QuipConfigStatus }>('/quip/status');
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    isQuipAvailable: data?.configured ?? false,
    isLoading,
  };
}
