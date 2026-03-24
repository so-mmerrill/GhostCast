import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateRequestModal } from './CreateRequestModal';
import { EditRequestModal } from './EditRequestModal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RequestStatus, Role } from '@ghostcast/shared';
import { useAuth } from '@/features/auth/AuthProvider';

type ColumnId = 'title' | 'status' | 'requester' | 'createdAt';

interface ColumnConfig {
  id: ColumnId;
  label: string;
}

const COLUMNS: ColumnConfig[] = [
  { id: 'title', label: 'Title' },
  { id: 'status', label: 'Status' },
  { id: 'requester', label: 'Requester' },
  { id: 'createdAt', label: 'Created Date' },
];

interface Requester {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ProjectType {
  id: string;
  name: string;
  abbreviation: string | null;
  color: string;
}

interface Request {
  id: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  requesterId: string;
  requester: Requester;
  projectType: ProjectType | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface PaginatedData {
  data: Request[];
  meta: PaginationMeta;
}

interface ApiResponse {
  data: PaginatedData;
}

const STATUS_BADGE_VARIANTS: Record<RequestStatus, 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline'> = {
  [RequestStatus.UNSCHEDULED]: 'warning',
  [RequestStatus.SCHEDULED]: 'success',
  [RequestStatus.FORECAST]: 'info',
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.UNSCHEDULED]: 'Unscheduled',
  [RequestStatus.SCHEDULED]: 'Scheduled',
  [RequestStatus.FORECAST]: 'Forecast',
};

interface SortIconProps {
  columnId: ColumnId;
  sortBy: ColumnId | null;
  sortDirection: 'asc' | 'desc';
}

function SortIcon({ columnId, sortBy, sortDirection }: Readonly<SortIconProps>) {
  if (sortBy !== columnId) {
    return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
  }
  return sortDirection === 'asc' ? (
    <ArrowUp className="ml-2 h-4 w-4" />
  ) : (
    <ArrowDown className="ml-2 h-4 w-4" />
  );
}

interface RequestsTableProps {
  onNewRequest?: () => void;
}

export function RequestsTable({ onNewRequest }: Readonly<RequestsTableProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const canDeleteRequests = hasRole(Role.SCHEDULER);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(40);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnId, boolean>>({
    title: true,
    status: true,
    requester: true,
    createdAt: true,
  });
  const [sortBy, setSortBy] = useState<ColumnId | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editRequestId, setEditRequestId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deleteRequestId, setDeleteRequestId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length + 1; // +1 for actions column

  const { data, isLoading, error } = useQuery({
    queryKey: ['requests', page, pageSize, debouncedSearch, statusFilter, sortBy, sortDirection],
    queryFn: () =>
      api.get<ApiResponse>('/requests', {
        page: String(page),
        pageSize: String(pageSize),
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(sortBy && { sortBy, sortOrder: sortDirection }),
      }),
  });

  const handleSort = (columnId: ColumnId) => {
    if (sortBy === columnId) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(columnId);
      setSortDirection('asc');
    }
    setPage(1);
  };


  const handleDuplicate = async (requestId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicatingId(requestId);
    try {
      const response = await api.post<{ data: { id: string } }>(`/requests/${requestId}/duplicate`);
      const newId = response.data.id;
      toast({
        title: 'Request duplicated',
        description: 'A copy of the request has been created.',
      });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      setEditRequestId(newId);
    } catch (error) {
      toast({
        title: 'Failed to duplicate request',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteRequestId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/requests/${deleteRequestId}`);
      toast({
        title: 'Request deleted',
        description: 'The request has been deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      setDeleteRequestId(null);
    } catch (error) {
      toast({
        title: 'Failed to delete request',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const requests = data?.data?.data ?? [];
  const paginationMeta = data?.data?.meta;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderTableBody = () => {
    if (isLoading) {
      return (
        <TableRow>
          <TableCell colSpan={visibleColumnCount} className="h-64 text-center">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading requests...</span>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    if (requests.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={visibleColumnCount}
            className="h-64 text-center text-muted-foreground"
          >
            No requests found
          </TableCell>
        </TableRow>
      );
    }

    return requests.map((request) => (
      <TableRow
        key={request.id}
        className="cursor-pointer transition-colors hover:bg-muted/50"
        onClick={() => setEditRequestId(request.id)}
      >
        {visibleColumns.title && (
          <TableCell>
            <p className="font-medium">
              {request.title}
              {request.projectType?.abbreviation && (
                <span className="text-muted-foreground"> - {request.projectType.abbreviation}</span>
              )}
            </p>
          </TableCell>
        )}
        {visibleColumns.status && (
          <TableCell>
            <Badge variant={STATUS_BADGE_VARIANTS[request.status]}>
              {STATUS_LABELS[request.status]}
            </Badge>
          </TableCell>
        )}
        {visibleColumns.requester && (
          <TableCell>
            <div>
              <p className="font-medium">
                {request.requester.firstName} {request.requester.lastName}
              </p>
              <p className="text-sm text-muted-foreground">
                {request.requester.email}
              </p>
            </div>
          </TableCell>
        )}
        {visibleColumns.createdAt && (
          <TableCell className="text-muted-foreground">
            {formatDate(request.createdAt)}
          </TableCell>
        )}
        <TableCell className="w-20">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => handleDuplicate(request.id, e)}
              disabled={duplicatingId === request.id}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {canDeleteRequests && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteRequestId(request.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    ));
  };

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">
        <p>Failed to load requests. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setTimeout(() => {
                setDebouncedSearch(e.target.value);
                setPage(1);
              }, 300);
            }}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as RequestStatus | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value={RequestStatus.UNSCHEDULED}>Unscheduled</SelectItem>
              <SelectItem value={RequestStatus.SCHEDULED}>Scheduled</SelectItem>
              <SelectItem value={RequestStatus.FORECAST}>Forecast</SelectItem>
            </SelectContent>
          </Select>

          {/* Column Visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={visibleColumns[column.id]}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((prev) => ({ ...prev, [column.id]: checked }))
                  }
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {visibleColumns.title && (
                <TableHead
                  className="cursor-pointer select-none hover:bg-muted/80"
                  onClick={() => handleSort('title')}
                >
                  <div className="flex items-center">
                    Title
                    <SortIcon columnId="title" sortBy={sortBy} sortDirection={sortDirection} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.status && (
                <TableHead
                  className="cursor-pointer select-none hover:bg-muted/80"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Status
                    <SortIcon columnId="status" sortBy={sortBy} sortDirection={sortDirection} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.requester && (
                <TableHead
                  className="cursor-pointer select-none hover:bg-muted/80"
                  onClick={() => handleSort('requester')}
                >
                  <div className="flex items-center">
                    Requester
                    <SortIcon columnId="requester" sortBy={sortBy} sortDirection={sortDirection} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.createdAt && (
                <TableHead
                  className="cursor-pointer select-none hover:bg-muted/80"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center">
                    Created Date
                    <SortIcon columnId="createdAt" sortBy={sortBy} sortDirection={sortDirection} />
                  </div>
                </TableHead>
              )}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderTableBody()}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {paginationMeta && paginationMeta.totalPages > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, paginationMeta.total)} of {paginationMeta.total}{' '}
            requests
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
                  <SelectItem value="40">40</SelectItem>
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

      {/* Create Request Modal - only render if not externally controlled */}
      {!onNewRequest && (
        <CreateRequestModal
          open={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
        />
      )}

      {/* Edit Request Modal */}
      <EditRequestModal
        open={editRequestId !== null}
        onOpenChange={(open) => {
          if (!open) setEditRequestId(null);
        }}
        requestId={editRequestId}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteRequestId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRequestId(null);
        }}
        title="Delete request"
        description="Are you sure you want to delete this request? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
