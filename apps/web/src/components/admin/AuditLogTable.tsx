import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import {
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  User as UserIcon,
  Activity,
  Database,
  Globe,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface AuditUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  user: AuditUser | null;
}

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface AuditLogResponse {
  data: AuditLog[];
  meta: PaginationMeta;
}

interface ApiResponse {
  data: AuditLogResponse;
}

interface UserListResponse {
  data: {
    data: AuditUser[];
    meta: PaginationMeta;
  };
}

interface AuditFilters {
  userId: string | null;
  action: string | null;
  entity: string | null;
  startDate: string | null;
  endDate: string | null;
  search: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  // CRUD operations
  CREATE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  VIEW: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
  // Authentication
  LOGIN: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  LOGOUT: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  // Integration/Plugin management
  INSTALL: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  UNINSTALL: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  ENABLE: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  DISABLE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  UPDATE_CONFIG: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  EXECUTE_ACTION: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  // Data operations
  SYNC: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  INGEST: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  DELETE_MAPPINGS: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  // LLM
  LLM_CHAT: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
};

export function AuditLogTable() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<AuditFilters>({
    userId: null,
    action: null,
    entity: null,
    startDate: null,
    endDate: null,
    search: null,
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Build query params
  const buildQueryParams = () => {
    const params: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    };

    if (filters.userId) params.userId = filters.userId;
    if (filters.action) params.action = filters.action;
    if (filters.entity) params.entity = filters.entity;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.search) params.search = filters.search;

    return params;
  };

  // Fetch audit logs
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', page, pageSize, filters],
    queryFn: () => api.get<ApiResponse>('/audit-logs', buildQueryParams()),
    refetchInterval: 5000,
  });

  // Fetch filter options
  const { data: actionsData } = useQuery({
    queryKey: ['audit-log-actions'],
    queryFn: () => api.get<{ data: string[] }>('/audit-logs/actions'),
  });

  const { data: entitiesData } = useQuery({
    queryKey: ['audit-log-entities'],
    queryFn: () => api.get<{ data: string[] }>('/audit-logs/entities'),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-for-audit-filter'],
    queryFn: () => api.get<UserListResponse>('/users', { pageSize: '100' }),
  });

  const auditLogs = data?.data?.data ?? [];
  const paginationMeta = data?.data?.meta;
  const actions = actionsData?.data ?? [];
  const entities = entitiesData?.data ?? [];
  const users = usersData?.data?.data ?? [];

  const hasActiveFilters =
    filters.userId ||
    filters.action ||
    filters.entity ||
    filters.startDate ||
    filters.endDate ||
    filters.search;

  const clearFilters = () => {
    setFilters({
      userId: null,
      action: null,
      entity: null,
      startDate: null,
      endDate: null,
      search: null,
    });
    setPage(1);
  };

  const toggleRowExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const SENSITIVE_FIELDS = ['newPassword', 'currentPassword'];

  const filterSensitiveFields = (obj: Record<string, unknown>): Record<string, unknown> => {
    return Object.fromEntries(
      Object.entries(obj).filter(([key]) => !SENSITIVE_FIELDS.includes(key))
    );
  };

  const getActionColor = (action: string) => {
    return ACTION_COLORS[action] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const formatUserName = (user: AuditUser | null) => {
    if (!user) return 'System';
    return `${user.firstName} ${user.lastName}`;
  };

  const renderTableBodyContent = () => {
    if (isLoading) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-64 text-center">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading audit logs...</span>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    if (auditLogs.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-64 text-center text-muted-foreground">
            No audit logs found
          </TableCell>
        </TableRow>
      );
    }

    return auditLogs.map((log) => (
      <>
        <TableRow
          key={log.id}
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => toggleRowExpanded(log.id)}
        >
          <TableCell>
            {expandedRows.has(log.id) ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </TableCell>
          <TableCell className="font-mono text-sm">
            {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
          </TableCell>
          <TableCell>{formatUserName(log.user)}</TableCell>
          <TableCell>
            <Badge className={getActionColor(log.action)}>{log.action}</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="outline">{log.entity}</Badge>
          </TableCell>
          <TableCell className="text-sm">
            {(log.metadata as { entityName?: string })?.entityName ||
              (log.entityId ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {log.entityId.slice(0, 8)}...
                </span>
              ) : '-')}
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">
            {log.ipAddress || '-'}
          </TableCell>
        </TableRow>
        {expandedRows.has(log.id) && (
          <TableRow key={`${log.id}-expanded`}>
            <TableCell colSpan={7} className="bg-muted/30 p-4">
              <div className="space-y-4">
                {/* Metadata */}
                {log.metadata && Object.keys(filterSensitiveFields(log.metadata)).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Metadata</h4>
                    <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-32">
                      {JSON.stringify(filterSensitiveFields(log.metadata), null, 2)}
                    </pre>
                  </div>
                )}

                {/* Old Value */}
                {log.oldValue && Object.keys(filterSensitiveFields(log.oldValue)).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">
                      Previous Value
                    </h4>
                    <pre className="text-xs bg-red-50 dark:bg-red-950/30 p-3 rounded border border-red-200 dark:border-red-900 overflow-auto max-h-32">
                      {JSON.stringify(filterSensitiveFields(log.oldValue), null, 2)}
                    </pre>
                  </div>
                )}

                {/* New Value */}
                {log.newValue && Object.keys(filterSensitiveFields(log.newValue)).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-green-600 dark:text-green-400">
                      New Value
                    </h4>
                    <pre className="text-xs bg-green-50 dark:bg-green-950/30 p-3 rounded border border-green-200 dark:border-green-900 overflow-auto max-h-32">
                      {JSON.stringify(filterSensitiveFields(log.newValue), null, 2)}
                    </pre>
                  </div>
                )}

                {/* User Agent */}
                {log.userAgent && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">User Agent</h4>
                    <p className="text-xs text-muted-foreground break-all">
                      {log.userAgent}
                    </p>
                  </div>
                )}

                {/* Full Entity ID */}
                {log.entityId && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">Full Entity ID</h4>
                    <p className="text-xs font-mono text-muted-foreground">
                      {log.entityId}
                    </p>
                  </div>
                )}
              </div>
            </TableCell>
          </TableRow>
        )}
      </>
    ));
  };

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">
        <p>Failed to load audit logs. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search and Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search logs..."
              value={filters.search || ''}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, search: e.target.value || null }));
                setPage(1);
              }}
              className="w-[200px] pl-8 sm:w-[250px]"
            />
            {filters.search && (
              <button
                onClick={() => {
                  setFilters((prev) => ({ ...prev, search: null }));
                  setPage(1);
                }}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                    !
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filters</h4>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear all
                    </Button>
                  )}
                </div>

                {/* User Filter */}
                <div className="space-y-2">
                  <label htmlFor="user-filter" className="text-sm font-medium">User</label>
                  <Select
                    value={filters.userId || 'all'}
                    onValueChange={(v) =>
                      setFilters((prev) => ({ ...prev, userId: v === 'all' ? null : v }))
                    }
                  >
                    <SelectTrigger id="user-filter">
                      <SelectValue placeholder="All users" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All users</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.firstName} {user.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Filter */}
                <div className="space-y-2">
                  <label htmlFor="action-filter" className="text-sm font-medium">Action</label>
                  <Select
                    value={filters.action || 'all'}
                    onValueChange={(v) =>
                      setFilters((prev) => ({ ...prev, action: v === 'all' ? null : v }))
                    }
                  >
                    <SelectTrigger id="action-filter">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actions</SelectItem>
                      {actions.map((action) => (
                        <SelectItem key={action} value={action}>
                          {action}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Entity Filter */}
                <div className="space-y-2">
                  <label htmlFor="entity-filter" className="text-sm font-medium">Entity</label>
                  <Select
                    value={filters.entity || 'all'}
                    onValueChange={(v) =>
                      setFilters((prev) => ({ ...prev, entity: v === 'all' ? null : v }))
                    }
                  >
                    <SelectTrigger id="entity-filter">
                      <SelectValue placeholder="All entities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All entities</SelectItem>
                      {entities.map((entity) => (
                        <SelectItem key={entity} value={entity}>
                          {entity}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Date Range</legend>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={filters.startDate || ''}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          startDate: e.target.value || null,
                        }))
                      }
                      className="flex-1"
                      aria-label="Start date"
                    />
                    <Input
                      type="date"
                      value={filters.endDate || ''}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          endDate: e.target.value || null,
                        }))
                      }
                      className="flex-1"
                      aria-label="End date"
                    />
                  </div>
                </fieldset>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Results count */}
        {paginationMeta && (
          <div className="text-sm text-muted-foreground">
            {paginationMeta.total} total entries
          </div>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {filters.userId && (
            <Badge variant="secondary" className="gap-1">
              User: {users.find((u) => u.id === filters.userId)?.firstName || filters.userId}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setFilters((prev) => ({ ...prev, userId: null }))}
              />
            </Badge>
          )}
          {filters.action && (
            <Badge variant="secondary" className="gap-1">
              Action: {filters.action}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setFilters((prev) => ({ ...prev, action: null }))}
              />
            </Badge>
          )}
          {filters.entity && (
            <Badge variant="secondary" className="gap-1">
              Entity: {filters.entity}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setFilters((prev) => ({ ...prev, entity: null }))}
              />
            </Badge>
          )}
          {filters.startDate && (
            <Badge variant="secondary" className="gap-1">
              From: {filters.startDate}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setFilters((prev) => ({ ...prev, startDate: null }))}
              />
            </Badge>
          )}
          {filters.endDate && (
            <Badge variant="secondary" className="gap-1">
              To: {filters.endDate}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setFilters((prev) => ({ ...prev, endDate: null }))}
              />
            </Badge>
          )}
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {filters.search}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setFilters((prev) => ({ ...prev, search: null }))}
              />
            </Badge>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10"></TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Timestamp
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  <UserIcon className="h-4 w-4" />
                  User
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  <Activity className="h-4 w-4" />
                  Action
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  <Database className="h-4 w-4" />
                  Entity
                </div>
              </TableHead>
              <TableHead>Target</TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  <Globe className="h-4 w-4" />
                  IP Address
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderTableBodyContent()}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {paginationMeta && paginationMeta.totalPages > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, paginationMeta.total)} of {paginationMeta.total} entries
          </div>

          <div className="flex items-center gap-4">
            {/* Page Size */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page Navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                <ChevronLeft className="h-4 w-4 -ml-2" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm">
                Page {page} of {paginationMeta.totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(page + 1)}
                disabled={page === paginationMeta.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(paginationMeta.totalPages)}
                disabled={page === paginationMeta.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
                <ChevronRight className="h-4 w-4 -ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
