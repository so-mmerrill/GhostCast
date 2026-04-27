import { useState, useMemo, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RequestStatus, Role } from '@ghostcast/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasMinimumRole } from '@/lib/route-permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Search,
  Loader2,
  Clock,
  CalendarCheck,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RequestCard, RequestCardData } from './RequestCard';
import { RequestDetailModal } from './RequestDetailModal';

const PAGE_SIZE = 20;

interface RequestMember {
  memberId: string;
  member: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface ProjectType {
  id: string;
  name: string;
  color: string;
}

interface RequestFromApi {
  id: string;
  title: string;
  clientName: string | null;
  projectType: ProjectType | null;
  requestedStartDate: string | null;
  executionWeeks: number;
  preparationWeeks: number;
  reportingWeeks: number;
  requiredMemberCount: number;
  requiredMembers: RequestMember[];
  requester?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  status: RequestStatus;
}

interface RequestsPanelProps {
  isStandalone?: boolean;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onHighlightRequest?: (requestId: string) => void;
  highlightedRequestId?: string | null;
  monthsToLoad?: Array<{ startDate: string; endDate: string }>;
}

interface PaginatedResponse {
  data: RequestFromApi[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// Transform API response to RequestCardData
function transformRequest(req: RequestFromApi): RequestCardData {
  return {
    id: req.id,
    title: req.title,
    clientName: req.clientName,
    projectType: req.projectType,
    requestedStartDate: req.requestedStartDate,
    executionWeeks: req.executionWeeks || 0,
    preparationWeeks: req.preparationWeeks || 0,
    reportingWeeks: req.reportingWeeks || 0,
    requiredMembersCount: req.requiredMemberCount || 0,
    assignedMembers: req.requiredMembers?.map((rm) => ({
      id: rm.member.id,
      name: `${rm.member.firstName} ${rm.member.lastName}`,
    })),
    requesterName: req.requester ? `${req.requester.firstName} ${req.requester.lastName}` : null,
    status: req.status,
  };
}

// Extracted component to render section content and eliminate nested ternaries
interface RequestSectionContentProps {
  isLoading: boolean;
  requests: RequestCardData[];
  emptyMessage: string;
  total: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  onRequestClick: (id: string) => void;
  onHighlightRequest?: (id: string) => void;
  highlightedRequestId?: string | null;
}

function RequestSectionContent({
  isLoading,
  requests,
  emptyMessage,
  total,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  onRequestClick,
  onHighlightRequest,
  highlightedRequestId,
}: Readonly<RequestSectionContentProps>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((req) => (
        <RequestCard
          key={req.id}
          request={req}
          onClick={() => onRequestClick(req.id)}
          onHighlight={onHighlightRequest ? () => onHighlightRequest(req.id) : undefined}
          isHighlighted={highlightedRequestId === req.id}
        />
      ))}
      {hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onFetchNextPage}
          disabled={isFetchingNextPage}
          className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          {isFetchingNextPage ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : null}
          Load more ({requests.length} of {total})
        </Button>
      )}
    </div>
  );
}

// Normalize various API response shapes into PaginatedResponse
function normalizeResponse(
  response: PaginatedResponse | { data: PaginatedResponse } | RequestFromApi[] | { data: PaginatedResponse | RequestFromApi[] }
): PaginatedResponse {
  const responseData = response as { data?: PaginatedResponse | RequestFromApi[] } | PaginatedResponse | RequestFromApi[];

  if ('data' in responseData && responseData.data) {
    const innerData = responseData.data;
    if ('data' in innerData && 'meta' in innerData) {
      return innerData;
    }
    if (Array.isArray(innerData)) {
      return {
        data: innerData,
        meta: { total: innerData.length, page: 1, pageSize: innerData.length, totalPages: 1 },
      };
    }
  }
  if (Array.isArray(responseData)) {
    return {
      data: responseData,
      meta: { total: responseData.length, page: 1, pageSize: responseData.length, totalPages: 1 },
    };
  }
  return { data: [], meta: { total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 } };
}

// Custom hook for paginated requests by status (used for UNSCHEDULED/FORECAST, and SCHEDULED fallback)
function usePaginatedRequests(
  status: RequestStatus,
  search: string,
  enabled: boolean = true
) {
  return useInfiniteQuery<PaginatedResponse>({
    queryKey: ['requests-paginated', status, search],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await api.get<PaginatedResponse | { data: PaginatedResponse } | RequestFromApi[]>('/requests', {
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
        status,
        ...(search && { search }),
      });
      return normalizeResponse(response);
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled,
  });
}

const SCHEDULED_MONTH_PAGE_SIZE = 100;

// Per-month loading for SCHEDULED requests — one query per visible month
function useScheduledRequestsByMonth(
  monthsToLoad: Array<{ startDate: string; endDate: string }>,
  search: string
) {
  return useQueries({
    queries: monthsToLoad.map(month => ({
      queryKey: ['requests-paginated', 'scheduled-monthly', month.startDate, month.endDate, search],
      queryFn: async () => {
        const response = await api.get<PaginatedResponse | { data: PaginatedResponse } | RequestFromApi[]>('/requests', {
          page: '1',
          pageSize: String(SCHEDULED_MONTH_PAGE_SIZE),
          status: RequestStatus.SCHEDULED,
          scheduledWithinStartDate: month.startDate,
          scheduledWithinEndDate: month.endDate,
          ...(search && { search }),
        });
        return normalizeResponse(response);
      },
      staleTime: 5 * 60 * 1000,
    })),
  });
}

// Combines per-month and fallback scheduled queries into a single interface
function useScheduledRequests(
  monthsToLoad: Array<{ startDate: string; endDate: string }> | undefined,
  search: string
) {
  const hasMonthlyLoading = !!monthsToLoad && monthsToLoad.length > 0;

  const monthQueries = useScheduledRequestsByMonth(
    hasMonthlyLoading ? monthsToLoad : [],
    search
  );
  const fallbackQuery = usePaginatedRequests(
    RequestStatus.SCHEDULED,
    search,
    !hasMonthlyLoading
  );

  const monthDataVersion = monthQueries.map(q => q.dataUpdatedAt).join(',');
  const monthResults = useMemo(() => {
    const requestMap = new Map<string, RequestCardData>();
    for (const query of monthQueries) {
      if (!query.data) continue;
      for (const req of query.data.data) {
        requestMap.set(req.id, transformRequest(req));
      }
    }
    return Array.from(requestMap.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthDataVersion]);

  if (hasMonthlyLoading) {
    return {
      requests: monthResults,
      total: monthResults.length,
      isLoading: monthQueries.every(q => q.isLoading),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: () => {},
    };
  }

  return {
    requests: fallbackQuery.data?.pages.flatMap((page) => page.data.map(transformRequest)) ?? [],
    total: fallbackQuery.data?.pages[0]?.meta.total ?? 0,
    isLoading: fallbackQuery.isLoading,
    hasNextPage: fallbackQuery.hasNextPage,
    isFetchingNextPage: fallbackQuery.isFetchingNextPage,
    fetchNextPage: () => fallbackQuery.fetchNextPage(),
  };
}

export function RequestsPanel({
  isStandalone = false,
  isCollapsed = false,
  onCollapsedChange,
  onHighlightRequest,
  highlightedRequestId,
  monthsToLoad,
}: Readonly<RequestsPanelProps>) {
  const { user } = useAuth();
  const canSeeUnconfirmed = !!user && hasMinimumRole(user.role, Role.REQUESTER);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleRequestClick = useCallback((requestId: string) => {
    setSelectedRequestId(requestId);
    setModalOpen(true);
  }, []);

  // UNSCHEDULED and FORECAST: simple paginated queries (no date range dependency)
  // Disabled for MEMBER role — they're only allowed to see SCHEDULED items.
  const unscheduledQuery = usePaginatedRequests(RequestStatus.UNSCHEDULED, debouncedSearch, canSeeUnconfirmed);
  const forecastQuery = usePaginatedRequests(RequestStatus.FORECAST, debouncedSearch, canSeeUnconfirmed);

  // SCHEDULED: per-month queries when embedded, fallback to paginated in standalone
  const scheduled = useScheduledRequests(monthsToLoad, debouncedSearch);

  // Transform paginated data to flat arrays
  const unscheduledRequests = useMemo(
    () => unscheduledQuery.data?.pages.flatMap((page) => page.data.map(transformRequest)) ?? [],
    [unscheduledQuery.data]
  );
  const forecastRequests = useMemo(
    () => forecastQuery.data?.pages.flatMap((page) => page.data.map(transformRequest)) ?? [],
    [forecastQuery.data]
  );

  // Get totals
  const unscheduledTotal = unscheduledQuery.data?.pages[0]?.meta.total ?? 0;
  const forecastTotal = forecastQuery.data?.pages[0]?.meta.total ?? 0;

  const isLoading =
    scheduled.isLoading &&
    (!canSeeUnconfirmed || (unscheduledQuery.isLoading && forecastQuery.isLoading));

  // Pop-out handler
  const handlePopout = () => {
    window.open(
      '/requests-panel',
      'requests-panel',
      'width=800,height=800,menubar=no,toolbar=no'
    );
  };

  // Toggle collapse (only for embedded mode)
  const toggleCollapse = () => {
    onCollapsedChange?.(!isCollapsed);
  };

  // Toggle section collapse
  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Collapsed state (embedded only)
  if (!isStandalone && isCollapsed) {
    return (
      <div className="flex flex-col items-center w-10 border-r bg-gradient-to-b from-violet-500/10 to-transparent">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapse}
          className="h-8 w-8 mt-2 shrink-0 hover:bg-violet-500/20"
          title="Expand requests panel"
        >
          <ChevronRight className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </Button>
        <div className="flex-1 flex items-center justify-center">
          <span
            className="text-xs font-medium text-violet-600/70 dark:text-violet-400/70"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
            }}
          >
            Requests Panel
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col border-r transition-all duration-300',
        isStandalone ? 'w-full h-full bg-background' : 'w-[280px] bg-gradient-to-b from-violet-500/5 to-transparent'
      )}
    >
      {/* Header */}
      <div className="relative flex items-center justify-center px-3 py-2.5 border-b bg-gradient-to-r from-violet-500/10 via-violet-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/20">
            <FileText className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <span className="text-sm font-semibold">Requests Panel</span>
        </div>
        <div className="absolute right-2 flex items-center gap-1">
          {/* Pop-out button - hidden below lg, hidden from MEMBER (route is gated) */}
          {canSeeUnconfirmed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePopout}
              className="hidden lg:flex h-7 w-7 hover:bg-violet-500/20"
              title="Pop out to new window"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isStandalone && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapse}
              className="h-7 w-7 hover:bg-violet-500/20"
              title="Collapse panel"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-violet-500/70" />
          <Input
            placeholder="Search requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm focus-visible:ring-violet-500/50"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {canSeeUnconfirmed && (
              <>
                {/* Unscheduled Section */}
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => toggleSection('unscheduled')}
                    className="flex items-center gap-1.5 text-xs font-medium mb-2 px-1 w-full hover:bg-muted/50 rounded py-1 -my-1 transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-muted-foreground transition-transform',
                        collapsedSections.unscheduled && '-rotate-90'
                      )}
                    />
                    <Clock className="h-3.5 w-3.5 text-foreground" />
                    <span className="text-foreground">Unscheduled</span>
                    <span className="text-muted-foreground">({unscheduledTotal})</span>
                  </button>
                  {!collapsedSections.unscheduled && (
                    <RequestSectionContent
                      isLoading={unscheduledQuery.isLoading}
                      requests={unscheduledRequests}
                      emptyMessage="No unscheduled requests"
                      total={unscheduledTotal}
                      hasNextPage={unscheduledQuery.hasNextPage}
                      isFetchingNextPage={unscheduledQuery.isFetchingNextPage}
                      onFetchNextPage={() => unscheduledQuery.fetchNextPage()}
                      onRequestClick={handleRequestClick}
                      onHighlightRequest={onHighlightRequest}
                      highlightedRequestId={highlightedRequestId}
                    />
                  )}
                </div>

                {/* Divider */}
                <hr className="my-2 mx-2 border-border" />

                {/* Forecast Section */}
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => toggleSection('forecast')}
                    className="flex items-center gap-1.5 text-xs font-medium mb-2 px-1 w-full hover:bg-muted/50 rounded py-1 -my-1 transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-muted-foreground transition-transform',
                        collapsedSections.forecast && '-rotate-90'
                      )}
                    />
                    <TrendingUp className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="text-yellow-500 dark:text-yellow-400">Forecast</span>
                    <span className="text-muted-foreground">({forecastTotal})</span>
                  </button>
                  {!collapsedSections.forecast && (
                    <RequestSectionContent
                      isLoading={forecastQuery.isLoading}
                      requests={forecastRequests}
                      emptyMessage="No forecast requests"
                      total={forecastTotal}
                      hasNextPage={forecastQuery.hasNextPage}
                      isFetchingNextPage={forecastQuery.isFetchingNextPage}
                      onFetchNextPage={() => forecastQuery.fetchNextPage()}
                      onRequestClick={handleRequestClick}
                      onHighlightRequest={onHighlightRequest}
                      highlightedRequestId={highlightedRequestId}
                    />
                  )}
                </div>

                {/* Divider */}
                <hr className="my-2 mx-2 border-border" />
              </>
            )}

            {/* Scheduled Section */}
            <div className="p-2">
              <button
                type="button"
                onClick={() => toggleSection('scheduled')}
                className="flex items-center gap-1.5 text-xs font-medium mb-2 px-1 w-full hover:bg-muted/50 rounded py-1 -my-1 transition-colors"
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform',
                    collapsedSections.scheduled && '-rotate-90'
                  )}
                />
                <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Scheduled</span>
                <span className="text-muted-foreground">({scheduled.total})</span>
              </button>
              {!collapsedSections.scheduled && (
                <RequestSectionContent
                  isLoading={scheduled.isLoading}
                  requests={scheduled.requests}
                  emptyMessage="No scheduled requests"
                  total={scheduled.total}
                  hasNextPage={scheduled.hasNextPage}
                  isFetchingNextPage={scheduled.isFetchingNextPage}
                  onFetchNextPage={scheduled.fetchNextPage}
                  onRequestClick={handleRequestClick}
                  onHighlightRequest={onHighlightRequest}
                  highlightedRequestId={highlightedRequestId}
                />
              )}
            </div>
          </>
        )}
      </div>

      <RequestDetailModal
        requestId={selectedRequestId}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
