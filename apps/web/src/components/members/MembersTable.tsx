import { useState, useMemo, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  User,
  Users,
  Mail,
  Building2,
  Phone,
  Briefcase,
  Shield,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { MemberProfileModal } from './MemberProfileModal';
import type { Member } from '@/types/member';

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface PaginatedData {
  data: Member[];
  meta: PaginationMeta;
}

// API wraps all responses in { data: T, meta: { timestamp, requestId } }
interface ApiResponse {
  data: PaginatedData;
}

type SortField = 'name' | 'email' | 'department' | 'phone' | 'position' | 'manager' | 'skills' | 'roles' | 'employeeId' | 'status' | 'createdAt';
type SortOrder = 'asc' | 'desc';

interface ColumnDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Full Name', icon: User, defaultVisible: true },
  { id: 'position', label: 'Position', icon: Briefcase, defaultVisible: true },
  { id: 'department', label: 'Department', icon: Building2, defaultVisible: true },
  { id: 'email', label: 'Email', icon: Mail, defaultVisible: false },
  { id: 'phone', label: 'Phone', icon: Phone, defaultVisible: false },
  { id: 'manager', label: 'Manager', icon: Users, defaultVisible: true },
  { id: 'skills', label: 'Skills', icon: Briefcase, defaultVisible: true },
  { id: 'roles', label: 'Roles', icon: Shield, defaultVisible: true },
  { id: 'employeeId', label: 'Employee ID', icon: User, defaultVisible: false },
  { id: 'status', label: 'Status', icon: User, defaultVisible: false },
];

function SortIcon({ field, sortField, sortOrder }: { field: SortField; sortField: SortField; sortOrder: SortOrder }) {
  if (sortField !== field) return null;
  return sortOrder === 'asc' ? (
    <ChevronUp className="ml-1 h-4 w-4" />
  ) : (
    <ChevronDown className="ml-1 h-4 w-4" />
  );
}

export function MembersTable() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(40);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [hiddenInScheduleFilter, setHiddenInScheduleFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id))
  );
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch members with server-side filtering
  const { data, isLoading, isFetching, isPlaceholderData, error } = useQuery({
    queryKey: ['members', page, pageSize, debouncedSearch, departmentFilter, statusFilter, hiddenInScheduleFilter, sortField, sortOrder],
    queryFn: () =>
      api.get<ApiResponse>('/members', {
        page: String(page),
        pageSize: String(pageSize),
        sortBy: sortField,
        sortOrder,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(departmentFilter && { department: departmentFilter }),
        ...(statusFilter !== 'all' && { memberStatus: statusFilter }),
        ...(hiddenInScheduleFilter !== 'all' && { scheduleVisibility: hiddenInScheduleFilter }),
      }),
    placeholderData: keepPreviousData,
  });

  // Extract nested data (API wraps responses in { data: { data, meta } })
  const members = data?.data?.data ?? [];
  const paginationMeta = data?.data?.meta;

  // Get unique departments for filtering
  const departments = useMemo(() => {
    if (!members.length) return [];
    const depts = new Set(
      members.map((m) => m.department).filter((d): d is string => Boolean(d))
    );
    return Array.from(depts).sort((a, b) => a.localeCompare(b));
  }, [members]);

  const toggleColumn = (columnId: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const getInitials = (firstName: string, lastName: string) =>
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500',
      'bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-400 dark:to-emerald-500',
      'bg-gradient-to-br from-violet-500 to-violet-600 dark:from-violet-400 dark:to-violet-500',
      'bg-gradient-to-br from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500',
      'bg-gradient-to-br from-rose-500 to-rose-600 dark:from-rose-400 dark:to-rose-500',
      'bg-gradient-to-br from-cyan-500 to-cyan-600 dark:from-cyan-400 dark:to-cyan-500',
      'bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-400 dark:to-indigo-500',
      'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 dark:from-fuchsia-400 dark:to-fuchsia-500',
    ];
    const hash = name.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
    return colors[hash % colors.length];
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setDepartmentFilter(null);
    setStatusFilter('all');
    setHiddenInScheduleFilter('all');
    setPage(1);
  };

  const hasActiveFilters = departmentFilter || statusFilter !== 'all' || hiddenInScheduleFilter !== 'all' || search;

  // Show subtle loading indicator when refetching with placeholder data
  const showRefetchIndicator = isFetching && isPlaceholderData;

  const renderSkeletonRows = () => {
    return ['sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6', 'sk7', 'sk8'].map((id, idx) => (
      <TableRow key={id}>
        {visibleColumns.has('name') && (
          <TableCell>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${100 + (idx % 3) * 20}px` }} />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </TableCell>
        )}
        {visibleColumns.has('position') && (
          <TableCell>
            <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${80 + (idx % 4) * 15}px` }} />
          </TableCell>
        )}
        {visibleColumns.has('department') && (
          <TableCell>
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
          </TableCell>
        )}
        {visibleColumns.has('email') && (
          <TableCell>
            <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${140 + (idx % 3) * 20}px` }} />
          </TableCell>
        )}
        {visibleColumns.has('phone') && (
          <TableCell>
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </TableCell>
        )}
        {visibleColumns.has('manager') && (
          <TableCell>
            <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${90 + (idx % 3) * 15}px` }} />
          </TableCell>
        )}
        {visibleColumns.has('skills') && (
          <TableCell>
            <div className="flex gap-1">
              <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          </TableCell>
        )}
        {visibleColumns.has('roles') && (
          <TableCell>
            <div className="flex gap-1">
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          </TableCell>
        )}
        {visibleColumns.has('employeeId') && (
          <TableCell>
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </TableCell>
        )}
        {visibleColumns.has('status') && (
          <TableCell>
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
          </TableCell>
        )}
      </TableRow>
    ));
  };

  const renderTableRows = () => {
    // Show skeleton on initial load (no cached data)
    if (isLoading && !data) {
      return renderSkeletonRows();
    }

    if (members.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={visibleColumns.size}
            className="h-64 text-center text-muted-foreground"
          >
            No members found
          </TableCell>
        </TableRow>
      );
    }

    return members.map((member) => (
      <TableRow
        key={member.id}
        className="group cursor-pointer transition-colors hover:bg-muted/50"
        onClick={() => {
          setSelectedMember(member);
          setIsProfileModalOpen(true);
        }}
      >
        {visibleColumns.has('name') && (
          <TableCell>
            <div className="flex items-center gap-3">
              <Avatar
                className={cn(
                  'h-10 w-10 ring-2 ring-background shadow-sm',
                  getAvatarColor(`${member.firstName} ${member.lastName}`)
                )}
              >
                <AvatarFallback className="bg-transparent text-white text-sm font-semibold tracking-wide">
                  {getInitials(member.firstName, member.lastName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {member.firstName} {member.lastName}
                </p>
                {member.employeeId && (
                  <p className="text-xs text-muted-foreground">
                    #{member.employeeId}
                  </p>
                )}
              </div>
            </div>
          </TableCell>
        )}
        {visibleColumns.has('position') && (
          <TableCell>
            {member.position || (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        )}
        {visibleColumns.has('department') && (
          <TableCell>
            {member.department ? (
              <Badge variant="outline">{member.department}</Badge>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        )}
        {visibleColumns.has('email') && (
          <TableCell>
            {member.email ? (
              <a
                href={`mailto:${member.email}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {member.email}
              </a>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        )}
        {visibleColumns.has('phone') && (
          <TableCell>
            {member.phone || (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        )}
        {visibleColumns.has('manager') && (
          <TableCell>
            {member.manager ? (
              <span>{member.manager.firstName} {member.manager.lastName}</span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        )}
        {visibleColumns.has('skills') && (
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {member.skills.length > 0 ? (
                <>
                  {member.skills.slice(0, 3).map((ms) => (
                    <Badge
                      key={ms.id}
                      variant="info"
                      className="text-xs"
                    >
                      {ms.skill.name}
                    </Badge>
                  ))}
                  {member.skills.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{member.skills.length - 3}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground text-sm">
                  No skills
                </span>
              )}
            </div>
          </TableCell>
        )}
        {visibleColumns.has('roles') && (
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {(member.projectRoles || []).length > 0 ? (
                <>
                  {(member.projectRoles || []).slice(0, 3).map((mr) => (
                    <Badge
                      key={mr.id}
                      variant="outline"
                      className="text-xs"
                    >
                      {mr.projectRole.color && (
                        <span
                          className="mr-1 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: mr.projectRole.color }}
                        />
                      )}
                      {mr.projectRole.name}
                    </Badge>
                  ))}
                  {(member.projectRoles || []).length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{(member.projectRoles || []).length - 3}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground text-sm">
                  No roles
                </span>
              )}
            </div>
          </TableCell>
        )}
        {visibleColumns.has('employeeId') && (
          <TableCell>
            {member.employeeId || (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        )}
        {visibleColumns.has('status') && (
          <TableCell>
            <Badge
              variant={member.isActive ? 'success' : 'secondary'}
            >
              {member.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </TableCell>
        )}
      </TableRow>
    ));
  };

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">
        <p>Failed to load members. Please try again.</p>
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
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters & Column Selector */}
        <div className="flex items-center gap-2">
          {/* Department Filter */}
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
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filters</h4>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear all
                    </Button>
                  )}
                </div>

                {/* Department */}
                <div className="space-y-2">
                  <Label htmlFor="department-filter">Department</Label>
                  <Select
                    value={departmentFilter || 'all'}
                    onValueChange={(v) => { setDepartmentFilter(v === 'all' ? null : v); setPage(1); }}
                  >
                    <SelectTrigger id="department-filter">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <Label htmlFor="status-filter">Status</Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}
                  >
                    <SelectTrigger id="status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hidden in Schedule */}
                <div className="space-y-2">
                  <Label htmlFor="schedule-visibility-filter">Schedule Visibility</Label>
                  <Select
                    value={hiddenInScheduleFilter}
                    onValueChange={(v) => { setHiddenInScheduleFilter(v as typeof hiddenInScheduleFilter); setPage(1); }}
                  >
                    <SelectTrigger id="schedule-visibility-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="visible">Visible in schedule</SelectItem>
                      <SelectItem value="hidden">Hidden in schedule</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Column Visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Columns3 className="h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_COLUMNS.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={visibleColumns.has(column.id)}
                  onCheckedChange={() => toggleColumn(column.id)}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {search && (
            <Badge variant="secondary" className="gap-1">
              Search: {search}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  setSearch('');
                  setDebouncedSearch('');
                }}
              />
            </Badge>
          )}
          {departmentFilter && (
            <Badge variant="secondary" className="gap-1">
              Department: {departmentFilter}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setDepartmentFilter(null)}
              />
            </Badge>
          )}
          {statusFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Status: {statusFilter}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setStatusFilter('all')}
              />
            </Badge>
          )}
          {hiddenInScheduleFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Schedule: {hiddenInScheduleFilter === 'hidden' ? 'hidden' : 'visible'}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setHiddenInScheduleFilter('all')}
              />
            </Badge>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card relative">
        {/* Subtle loading indicator when refetching with cached data */}
        {showRefetchIndicator && (
          <div className="absolute top-0 left-0 right-0 z-10 h-0.5 bg-primary/20 overflow-hidden">
            <div className="h-full w-1/3 bg-primary" style={{ animation: 'shimmer 1s ease-in-out infinite' }} />
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {visibleColumns.has('name') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Full Name
                    <SortIcon field="name" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('position') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('position')}
                >
                  <div className="flex items-center">
                    Position
                    <SortIcon field="position" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('department') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('department')}
                >
                  <div className="flex items-center">
                    Department
                    <SortIcon field="department" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('email') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center">
                    Email
                    <SortIcon field="email" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('phone') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('phone')}
                >
                  <div className="flex items-center">
                    Phone
                    <SortIcon field="phone" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('manager') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('manager')}
                >
                  <div className="flex items-center">
                    Manager
                    <SortIcon field="manager" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('skills') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('skills')}
                >
                  <div className="flex items-center">
                    Skills
                    <SortIcon field="skills" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('roles') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('roles')}
                >
                  <div className="flex items-center">
                    Roles
                    <SortIcon field="roles" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('employeeId') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('employeeId')}
                >
                  <div className="flex items-center">
                    Employee ID
                    <SortIcon field="employeeId" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.has('status') && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Status
                    <SortIcon field="status" sortField={sortField} sortOrder={sortOrder} />
                  </div>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderTableRows()}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {paginationMeta && (
        <div className="flex flex-col gap-4 pb-4 pr-16 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {paginationMeta.total === 0 ? 0 : (page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, paginationMeta.total)} of {paginationMeta.total}{' '}
            members
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

      {/* Member Profile Modal */}
      <MemberProfileModal
        member={selectedMember}
        open={isProfileModalOpen}
        onOpenChange={setIsProfileModalOpen}
        onMemberDeleted={() => setSelectedMember(null)}
      />
    </div>
  );
}
