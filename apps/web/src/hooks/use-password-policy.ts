import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PasswordPolicy } from '@ghostcast/shared';

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSpecial: false,
};

export function usePasswordPolicy() {
  const { data, isLoading } = useQuery({
    queryKey: ['password-policy'],
    queryFn: async () => {
      const response = await api.get<{ data: PasswordPolicy }>('/auth/password-policy');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  return {
    policy: data ?? DEFAULT_POLICY,
    isLoading,
  };
}
