import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PaginatedResponse } from '@ghostcast/shared';

interface UseDataManagementOptions {
  endpoint: string;
  queryKey: string;
}

interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export function useDataManagement<T extends { id: string }>({
  endpoint,
  queryKey,
}: UseDataManagementOptions) {
  const queryClient = useQueryClient();

  // List query with pagination
  const useList = (params: PaginationParams = {}) => {
    const { page = 1, pageSize = 20, search } = params;
    const queryParams: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    };
    if (search) {
      queryParams.search = search;
    }

    return useQuery({
      queryKey: [queryKey, page, pageSize, search],
      queryFn: () => api.get<PaginatedResponse<T>>(endpoint, queryParams),
    });
  };

  // Single item query
  const useItem = (id: string | null) => {
    return useQuery({
      queryKey: [queryKey, id],
      queryFn: () => api.get<T>(`${endpoint}/${id}`),
      enabled: !!id,
    });
  };

  // Create mutation
  const useCreate = () => {
    return useMutation({
      mutationFn: (data: Partial<T>) => api.post<T>(endpoint, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      },
    });
  };

  // Update mutation
  const useUpdate = () => {
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: Partial<T> }) =>
        api.put<T>(`${endpoint}/${id}`, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      },
    });
  };

  // Delete mutation
  const useDelete = () => {
    return useMutation({
      mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      },
    });
  };

  return {
    useList,
    useItem,
    useCreate,
    useUpdate,
    useDelete,
  };
}
