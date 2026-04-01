import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PaginatedResponse<T> {
  data: {
    data: T[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  };
}

interface UsePaginatedSearchOptions {
  endpoint: string;
  queryKey: string;
  pageSize?: number;
  extraParams?: Record<string, string>;
  enabled?: boolean;
}

/**
 * Hook for server-side paginated search on dropdown/combobox data.
 * Debounces the search input and fetches results from the API.
 */
export function usePaginatedSearch<T extends { id: string }>({
  endpoint,
  queryKey,
  pageSize = 50,
  extraParams,
  enabled = true,
}: UsePaginatedSearchOptions) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const { data: response, isLoading } = useQuery<PaginatedResponse<T>>({
    queryKey: [queryKey, debouncedSearch, pageSize, extraParams],
    queryFn: () =>
      api.get(endpoint, {
        pageSize: String(pageSize),
        ...(debouncedSearch && { search: debouncedSearch }),
        ...extraParams,
      }),
    enabled,
  });

  const items: T[] = (() => {
    if (!response) return [];
    // Handle nested response: { data: { data: T[] } }
    const d = response as unknown as Record<string, unknown>;
    if (d.data && typeof d.data === 'object') {
      const inner = d.data as Record<string, unknown>;
      if (Array.isArray(inner.data)) return inner.data as T[];
      if (Array.isArray(inner)) return inner as unknown as T[];
    }
    if (Array.isArray(d.data)) return d.data as unknown as T[];
    return [];
  })();

  return {
    items,
    search,
    setSearch,
    isLoading,
  };
}
