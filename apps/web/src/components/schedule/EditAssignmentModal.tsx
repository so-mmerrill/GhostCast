import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { refreshScheduleCache } from '@/lib/schedule-cache';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Loader2, Tag, Check, FileText, Users, ChevronsUpDown, X, Building2, Minus, Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RequestStatus } from '@ghostcast/shared';
import { sanitizeInput, VALIDATION } from '@/lib/input-validation';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
}

interface ProjectType {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
}

interface Formatter {
  id: string;
  name: string;
  isBold: boolean;
  prefix: string | null;
  suffix: string | null;
  isActive: boolean;
}

// Formatter type as it comes from the assignment
interface AssignmentFormatter {
  id: string;
  name: string;
  isBold: boolean;
  prefix: string | null;
  suffix: string | null;
}

interface ProjectRoleFormatter {
  formatter?: Formatter;
}

interface ProjectRole {
  id: string;
  name: string;
  color?: string | null;
  isActive: boolean;
  formatters?: ProjectRoleFormatter[];
}

interface AssignmentProjectRole {
  projectRole: {
    id: string;
    name: string;
  };
}

interface RequestForDropdown {
  id: string;
  title: string;
  clientName: string | null;
  projectTypeId: string | null;
  projectType: ProjectType | null;
  status: RequestStatus;
}

interface Assignment {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  requestId?: string | null;
  projectType: {
    id: string;
    name: string;
    color: string;
  };
  members: Array<{ member: Member }>;
  formatters?: Array<{ formatter: AssignmentFormatter }>;
  projectRoles?: AssignmentProjectRole[];
  metadata?: Record<string, unknown>;
}

interface EditAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Assignment;
  onSuccess?: () => void;
}

export function EditAssignmentModal({
  open,
  onOpenChange,
  assignment,
  onSuccess,
}: Readonly<EditAssignmentModalProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectTypeId, setProjectTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedFormatterIds, setSelectedFormatterIds] = useState<string[]>([]);
  const [selectedProjectRoleIds, setSelectedProjectRoleIds] = useState<string[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('manual');
  const [displayStatus, setDisplayStatus] = useState<string>('SCHEDULED');
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Title/request dropdown state
  const [titleOpen, setTitleOpen] = useState(false);

  // Searchable multi-select state
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersSearch, setMembersSearch] = useState('');
  const [projectRolesOpen, setProjectRolesOpen] = useState(false);
  const [projectRolesSearch, setProjectRolesSearch] = useState('');
  const [formattersOpen, setFormattersOpen] = useState(false);
  const [formattersSearch, setFormattersSearch] = useState('');

  const removeMember = (memberId: string) => {
    setSelectedMemberIds((prev) => prev.filter((id) => id !== memberId));
  };

  const removeProjectRole = (roleId: string) => {
    setSelectedProjectRoleIds((prev) => prev.filter((id) => id !== roleId));
  };

  const toggleProjectRole = (roleId: string, projectRolesList: ProjectRole[]) => {
    const isRemoving = selectedProjectRoleIds.includes(roleId);
    setSelectedProjectRoleIds((prev) =>
      isRemoving ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );

    // When adding a project role, auto-select its associated formatters
    if (!isRemoving) {
      const role = projectRolesList.find((r) => r.id === roleId);
      const associatedFormatterIds = role?.formatters
        ?.map((f) => f.formatter?.id)
        .filter((id): id is string => !!id) || [];

      if (associatedFormatterIds.length > 0) {
        setSelectedFormatterIds((prev) => {
          const newIds = associatedFormatterIds.filter((id) => !prev.includes(id));
          return newIds.length > 0 ? [...prev, ...newIds] : prev;
        });
      }
    }

    setProjectRolesSearch('');
  };

  const removeFormatter = (formatterId: string) => {
    setSelectedFormatterIds((prev) => prev.filter((id) => id !== formatterId));
  };

  const toggleFormatter = (formatterId: string) => {
    setSelectedFormatterIds((prev) =>
      prev.includes(formatterId) ? prev.filter((id) => id !== formatterId) : [...prev, formatterId]
    );
    setFormattersSearch('');
  };

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
    setMembersSearch('');
  };

  const statusLabels: Record<string, string> = {
    SCHEDULED: 'Scheduled',
    UNSCHEDULED: 'Unscheduled',
    FORECAST: 'Forecast',
  };

  // Fetch project types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projectTypesResponse, isLoading: loadingProjectTypes } = useQuery<any>({
    queryKey: ['project-types'],
    queryFn: () => api.get('/project-types', { pageSize: '1000' }),
  });

  // Fetch all members (no pagination)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membersResponse } = useQuery<any>({
    queryKey: ['members-all'],
    queryFn: () => api.get('/members', { pageSize: '1000' }),
  });

  // Fetch formatters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: formattersResponse } = useQuery<any>({
    queryKey: ['formatters'],
    queryFn: () => api.get('/formatters', { pageSize: '1000' }),
  });

  // Fetch project roles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projectRolesResponse } = useQuery<any>({
    queryKey: ['project-roles'],
    queryFn: () => api.get('/project-roles', { pageSize: '1000' }),
  });

  // Fetch unscheduled requests for dropdown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: requestsResponse } = useQuery<any>({
    queryKey: ['requests-for-assignment'],
    queryFn: () => api.get('/requests', { pageSize: '100' }),
  });

  // Handle multiple possible response structures
  const getProjectTypesArray = (): ProjectType[] => {
    if (!projectTypesResponse) return [];
    if (Array.isArray(projectTypesResponse.data)) return projectTypesResponse.data;
    if (projectTypesResponse.data?.data && Array.isArray(projectTypesResponse.data.data)) {
      return projectTypesResponse.data.data;
    }
    if (Array.isArray(projectTypesResponse)) return projectTypesResponse;
    return [];
  };
  const projectTypes = getProjectTypesArray().filter((pt: ProjectType) => pt.isActive);

  const getMembersArray = (): Member[] => {
    if (!membersResponse) return [];
    if (Array.isArray(membersResponse.data)) return membersResponse.data;
    if (membersResponse.data?.data && Array.isArray(membersResponse.data.data)) {
      return membersResponse.data.data;
    }
    if (Array.isArray(membersResponse)) return membersResponse;
    return [];
  };
  const members = getMembersArray();

  // Derive departments from members for department-based selection
  const departments = useMemo(() => {
    const deptMap = new Map<string, Member[]>();
    for (const member of members) {
      const dept = member.department;
      if (!dept) continue;
      const group = deptMap.get(dept) || [];
      group.push(member);
      deptMap.set(dept, group);
    }
    return Array.from(deptMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, deptMembers]) => ({ name, members: deptMembers }));
  }, [members]);

  const handleDepartmentToggle = (departmentName: string) => {
    const dept = departments.find(d => d.name === departmentName);
    if (!dept) return;
    const deptMemberIds = dept.members.map(m => m.id);
    const allSelected = deptMemberIds.every(id => selectedMemberIds.includes(id));
    if (allSelected) {
      setSelectedMemberIds(prev => prev.filter(id => !deptMemberIds.includes(id)));
    } else {
      setSelectedMemberIds(prev => [...prev, ...deptMemberIds.filter(id => !prev.includes(id))]);
    }
    setMembersSearch('');
  };

  const getFormattersArray = (): Formatter[] => {
    if (!formattersResponse) return [];
    if (Array.isArray(formattersResponse.data)) return formattersResponse.data;
    if (formattersResponse.data?.data && Array.isArray(formattersResponse.data.data)) {
      return formattersResponse.data.data;
    }
    if (Array.isArray(formattersResponse)) return formattersResponse;
    return [];
  };
  const formatters = getFormattersArray().filter((f: Formatter) => f.isActive);

  const getProjectRolesArray = (): ProjectRole[] => {
    if (!projectRolesResponse) return [];
    if (Array.isArray(projectRolesResponse.data)) return projectRolesResponse.data;
    if (projectRolesResponse.data?.data && Array.isArray(projectRolesResponse.data.data)) {
      return projectRolesResponse.data.data;
    }
    if (Array.isArray(projectRolesResponse)) return projectRolesResponse;
    return [];
  };
  const projectRoles = getProjectRolesArray().filter((pr: ProjectRole) => pr.isActive);

  const getRequestsArray = (): RequestForDropdown[] => {
    if (!requestsResponse) return [];
    if (Array.isArray(requestsResponse.data?.data)) return requestsResponse.data.data;
    if (Array.isArray(requestsResponse.data)) return requestsResponse.data;
    if (Array.isArray(requestsResponse)) return requestsResponse;
    return [];
  };
  // Filter for unscheduled requests only
  const unscheduledRequests = getRequestsArray().filter(
    (r) => r.status === RequestStatus.UNSCHEDULED
  );

  // Handle request selection from dropdown
  const handleRequestSelect = (requestId: string) => {
    setSelectedRequestId(requestId);

    if (requestId === 'manual') {
      return;
    }

    // Find the selected request and auto-fill fields
    const request = unscheduledRequests.find((r) => r.id === requestId);
    if (request) {
      setTitle(request.title);
      if (request.projectTypeId) {
        setProjectTypeId(request.projectTypeId);
      }
    }
  };

  // Pre-populate form when modal opens or assignment changes
  useEffect(() => {
    if (open && assignment) {
      setTitle(assignment.title);
      setDescription(assignment.description || '');
      setProjectTypeId(assignment.projectType.id);

      // Parse dates - extract just the date portion
      const startDatePart = assignment.startDate.split('T')[0];
      const endDatePart = assignment.endDate.split('T')[0];
      setStartDate(startDatePart);
      setEndDate(endDatePart);

      // Set member IDs
      setSelectedMemberIds(assignment.members.map(m => m.member.id));

      // Set formatter IDs
      setSelectedFormatterIds(assignment.formatters?.map(f => f.formatter.id) || []);

      // Set project role IDs
      setSelectedProjectRoleIds(assignment.projectRoles?.map(pr => pr.projectRole.id) || []);

      // Set request link
      setSelectedRequestId(assignment.requestId || 'manual');

      // Set display status from metadata
      setDisplayStatus((assignment.metadata?.displayStatus as string) || 'SCHEDULED');

      // Set lock state
      setIsLocked(assignment.metadata?.isLocked === true);
    }
  }, [open, assignment]);

  const isValid =
    title.trim() !== '' &&
    projectTypeId !== '' &&
    startDate !== '' &&
    endDate !== '' &&
    selectedMemberIds.length > 0 &&
    new Date(endDate) >= new Date(startDate);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setProjectTypeId('');
    setStartDate('');
    setEndDate('');
    setSelectedMemberIds([]);
    setSelectedFormatterIds([]);
    setSelectedProjectRoleIds([]);
    setSelectedRequestId('manual');
    setDisplayStatus('SCHEDULED');
    setIsLocked(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        startDate,
        endDate,
        projectTypeId,
        memberIds: selectedMemberIds,
        formatterIds: selectedFormatterIds,
        projectRoleIds: selectedProjectRoleIds,
        requestId: selectedRequestId === 'manual' ? null : selectedRequestId,
        metadata: {
          ...(selectedRequestId === 'manual' ? { displayStatus } : {}),
          isLocked,
        },
      };

      await api.put(`/assignments/${assignment.id}`, payload);

      toast({
        title: 'Assignment updated',
        description: `"${title}" has been updated successfully.`,
      });

      // Optimistically update the assignment in all schedule query caches
      // so the UI reflects changes immediately (avoids race with DB commit)
      interface ScheduleCacheData {
        data: {
          assignments: Array<{
            id: string;
            title: string;
            description?: string | null;
            startDate: string;
            endDate: string;
            metadata?: Record<string, unknown>;
            [key: string]: unknown;
          }>;
          members: unknown[];
          dateRange: { startDate: string; endDate: string };
        };
      }
      const scheduleEntries = queryClient.getQueriesData<ScheduleCacheData>({
        queryKey: ['schedule'],
      });
      for (const [queryKey, cachedData] of scheduleEntries) {
        if (!cachedData) continue;
        const idx = cachedData.data.assignments.findIndex((a) => a.id === assignment.id);
        if (idx === -1) continue;
        const existing = cachedData.data.assignments[idx];
        const updated = {
          ...existing,
          title: payload.title,
          description: payload.description ?? null,
          startDate: payload.startDate,
          endDate: payload.endDate,
          metadata: { ...existing.metadata, ...payload.metadata },
        };
        const newAssignments = [...cachedData.data.assignments];
        newAssignments[idx] = updated;
        queryClient.setQueryData(queryKey, {
          ...cachedData,
          data: { ...cachedData.data, assignments: newAssignments },
        });
      }

      // Also refresh from server for relational fields (members, projectType, formatters)
      const dateRanges: Array<{ startDate: string; endDate: string }> = [
        { startDate: payload.startDate, endDate: payload.endDate },
      ];
      const oldStart = assignment.startDate.split('T')[0];
      const oldEnd = assignment.endDate.split('T')[0];
      if (payload.startDate !== oldStart || payload.endDate !== oldEnd) {
        dateRanges.push({ startDate: oldStart, endDate: oldEnd });
      }
      // Delay the server refresh slightly to avoid racing the DB commit
      setTimeout(() => refreshScheduleCache(queryClient, dateRanges), 500);
      // Invalidate request caches so RequestDetailModal reflects changes
      if (selectedRequestId !== 'manual') {
        queryClient.invalidateQueries({ queryKey: ['request', selectedRequestId] });
      }
      if (assignment.requestId && assignment.requestId !== selectedRequestId) {
        queryClient.invalidateQueries({ queryKey: ['request', assignment.requestId] });
      }
      handleClose(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Failed to update assignment',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <DialogTitle>Edit Assignment</DialogTitle>
            <DialogDescription>
              Modify the assignment details below.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => setIsLocked(!isLocked)}
            className={cn(
              "shrink-0 flex items-center justify-center rounded-md border p-1.5 transition-colors",
              isLocked
                ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
                : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
            )}
            aria-label={isLocked ? 'Unlock assignment' : 'Lock assignment'}
            title={isLocked ? 'Unlock assignment' : 'Lock assignment'}
          >
            {isLocked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          </button>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="space-y-4 flex-1 overflow-y-auto pl-1 pr-1">
          {/* Title Field with Request Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title *</Label>
            <Popover open={isLocked ? false : titleOpen} onOpenChange={setTitleOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={titleOpen}
                  className="w-full justify-between font-normal h-auto min-h-10 overflow-hidden"
                  type="button"
                  disabled={isLocked}
                >
                  <span className={cn('min-w-0 max-h-16 overflow-y-auto text-left', !title && 'text-muted-foreground')}>
                    {title || 'Type or select from requests...'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type a title or search requests..."
                    value={title}
                    onValueChange={(value) => {
                      setTitle(sanitizeInput(value, VALIDATION.TITLE_MAX_LENGTH));
                      if (selectedRequestId !== 'manual') {
                        setSelectedRequestId('manual');
                      }
                    }}
                  />
                  <CommandList className="px-1 max-h-60 overflow-y-auto">
                    {title && (
                      <CommandGroup heading="Custom">
                        <CommandItem
                          value="use-custom"
                          onSelect={() => {
                            setSelectedRequestId('manual');
                            setTitleOpen(false);
                          }}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Use "{title}"
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {unscheduledRequests.length > 0 && (
                      <CommandGroup heading="Unscheduled Requests">
                        {unscheduledRequests
                          .filter((req) =>
                            req.title.toLowerCase().includes(title.toLowerCase())
                          )
                          .map((req) => (
                            <CommandItem
                              key={req.id}
                              value={req.id}
                              onSelect={() => {
                                handleRequestSelect(req.id);
                                setTitleOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedRequestId === req.id ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex items-center gap-2">
                                {req.projectType && (
                                  <div
                                    className="h-2.5 w-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: req.projectType.color }}
                                  />
                                )}
                                <span className="truncate">{req.title}</span>
                                {req.clientName && (
                                  <span className="text-xs text-muted-foreground">
                                    ({req.clientName})
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedRequestId !== 'manual' && (
              <p className="text-xs text-muted-foreground">
                Linked to request. <button type="button" className="underline hover:text-foreground" onClick={() => { setSelectedRequestId('manual'); }}>Clear link</button>
              </p>
            )}
          </div>

          {/* Status Selector (only for unlinked assignments) */}
          {selectedRequestId === 'manual' && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={displayStatus} onValueChange={setDisplayStatus} disabled={isLocked}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(RequestStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Project Type Selector */}
          <div className="space-y-2">
            <Label htmlFor="edit-projectType">Project Type *</Label>
            <Select value={projectTypeId} onValueChange={setProjectTypeId} disabled={isLocked}>
              <SelectTrigger>
                <SelectValue placeholder={loadingProjectTypes ? 'Loading...' : 'Select project type'} />
              </SelectTrigger>
              <SelectContent>
                {projectTypes.map((pt) => (
                  <SelectItem key={pt.id} value={pt.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: pt.color }}
                      />
                      {pt.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-startDate">Start Date *</Label>
              <Input
                id="edit-startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                disabled={isLocked}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-endDate">End Date *</Label>
              <Input
                id="edit-endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                required
                disabled={isLocked}
              />
            </div>
          </div>

          {/* Member Selector - Searchable Multi-select */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members *
            </Label>
            <Popover open={isLocked ? false : membersOpen} onOpenChange={setMembersOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={membersOpen}
                  className="w-full justify-between font-normal h-auto min-h-10 overflow-hidden"
                  type="button"
                  disabled={isLocked}
                >
                  <div className="flex flex-wrap gap-1 flex-1 min-w-0 max-h-24 overflow-y-auto">
                    {selectedMemberIds.length > 0 ? (
                      selectedMemberIds.map((memberId) => {
                        const member = members.find((m) => m.id === memberId);
                        if (!member) return null;
                        return (
                          <span
                            key={memberId}
                            className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs max-w-[150px]"
                          >
                            <span className="truncate">
                              {member.firstName} {member.lastName}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeMember(memberId);
                              }}
                              className="hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-muted-foreground">Search and select members...</span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search members or departments..."
                    value={membersSearch}
                    onValueChange={setMembersSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No members or departments found.</CommandEmpty>
                    {departments.some(dept =>
                      dept.name.toLowerCase().includes(membersSearch.toLowerCase())
                    ) && (
                      <>
                        <CommandGroup heading="Departments">
                          {departments
                            .filter(dept =>
                              dept.name.toLowerCase().includes(membersSearch.toLowerCase())
                            )
                            .map((dept) => {
                              const deptMemberIds = dept.members.map(m => m.id);
                              const selectedCount = deptMemberIds.filter(id => selectedMemberIds.includes(id)).length;
                              const allSelected = selectedCount === deptMemberIds.length;
                              const someSelected = selectedCount > 0 && !allSelected;
                              return (
                                <CommandItem
                                  key={`dept-${dept.name}`}
                                  value={`dept-${dept.name}`}
                                  onSelect={() => handleDepartmentToggle(dept.name)}
                                >
                                  {(() => {
                                    if (allSelected) return <Check className="mr-2 h-4 w-4 opacity-100" />;
                                    if (someSelected) return <Minus className="mr-2 h-4 w-4 opacity-70" />;
                                    return <Check className="mr-2 h-4 w-4 opacity-0" />;
                                  })()}
                                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                                  <div className="flex flex-col">
                                    <span>{dept.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {dept.members.length} member{dept.members.length === 1 ? '' : 's'}
                                      {someSelected && ` (${selectedCount} selected)`}
                                    </span>
                                  </div>
                                </CommandItem>
                              );
                            })}
                        </CommandGroup>
                        <CommandSeparator />
                      </>
                    )}
                    <CommandGroup heading="Members">
                      {members
                        .filter((member) => {
                          const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
                          const search = membersSearch.toLowerCase();
                          return (
                            fullName.includes(search) ||
                            (member.department?.toLowerCase().includes(search) ?? false)
                          );
                        })
                        .map((member, index) => {
                          const isSelected = selectedMemberIds.includes(member.id);
                          const isFirstFiltered = index === 0 && membersSearch.length > 0;
                          return (
                            <CommandItem
                              key={member.id}
                              value={member.id}
                              onSelect={() => toggleMember(member.id)}
                              className={cn(isFirstFiltered && 'bg-accent')}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  isSelected ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{member.firstName} {member.lastName}</span>
                                {member.department && (
                                  <span className="text-xs text-muted-foreground">
                                    {member.department}
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Project Roles - Searchable Multi-select */}
          {projectRoles.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Project Roles
              </Label>
              <Popover open={isLocked ? false : projectRolesOpen} onOpenChange={setProjectRolesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={projectRolesOpen}
                    className="w-full justify-between font-normal h-10"
                    disabled={isLocked}
                  >
                    <div className="flex flex-wrap gap-1 flex-1 overflow-hidden">
                      {selectedProjectRoleIds.length > 0 ? (
                        selectedProjectRoleIds.map((roleId) => {
                          const role = projectRoles.find((r) => r.id === roleId);
                          if (!role) return null;
                          return (
                            <span
                              key={roleId}
                              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs"
                              style={role.color ? { borderColor: role.color } : undefined}
                            >
                              {role.name}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeProjectRole(roleId);
                                }}
                                className="hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-muted-foreground">Search and select roles...</span>
                      )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search roles..."
                      value={projectRolesSearch}
                      onValueChange={setProjectRolesSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No roles found.</CommandEmpty>
                      <CommandGroup>
                        {projectRoles
                          .filter((role) =>
                            role.name.toLowerCase().includes(projectRolesSearch.toLowerCase())
                          )
                          .map((role, index) => {
                            const isSelected = selectedProjectRoleIds.includes(role.id);
                            const isFirstFiltered = index === 0 && projectRolesSearch.length > 0;
                            return (
                              <CommandItem
                                key={role.id}
                                value={role.id}
                                onSelect={() => toggleProjectRole(role.id, projectRoles)}
                                className={cn(isFirstFiltered && 'bg-accent')}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    isSelected ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span
                                  className="flex items-center gap-2"
                                  style={role.color ? { color: role.color } : undefined}
                                >
                                  {role.name}
                                </span>
                              </CommandItem>
                            );
                          })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Formatters - Searchable Multi-select */}
          {formatters.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Formatters
              </Label>
              <Popover open={isLocked ? false : formattersOpen} onOpenChange={setFormattersOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={formattersOpen}
                    className="w-full justify-between font-normal h-10"
                    disabled={isLocked}
                  >
                    <div className="flex flex-wrap gap-1 flex-1 overflow-hidden">
                      {selectedFormatterIds.length > 0 ? (
                        selectedFormatterIds.map((formatterId) => {
                          const formatter = formatters.find((f) => f.id === formatterId);
                          if (!formatter) return null;
                          return (
                            <span
                              key={formatterId}
                              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs"
                            >
                              <span className={formatter.isBold ? 'font-bold' : ''}>
                                {formatter.name}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFormatter(formatterId);
                                }}
                                className="hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-muted-foreground">Search and select formatters...</span>
                      )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search formatters..."
                      value={formattersSearch}
                      onValueChange={setFormattersSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No formatters found.</CommandEmpty>
                      <CommandGroup>
                        {formatters
                          .filter((formatter) =>
                            formatter.name.toLowerCase().includes(formattersSearch.toLowerCase())
                          )
                          .map((formatter, index) => {
                            const isSelected = selectedFormatterIds.includes(formatter.id);
                            const isFirstFiltered = index === 0 && formattersSearch.length > 0;
                            return (
                              <CommandItem
                                key={formatter.id}
                                value={formatter.id}
                                onSelect={() => toggleFormatter(formatter.id)}
                                className={cn(isFirstFiltered && 'bg-accent')}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    isSelected ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span className={formatter.isBold ? 'font-bold' : ''}>
                                  {formatter.prefix && `${formatter.prefix} `}
                                  {formatter.name}
                                  {formatter.suffix && ` ${formatter.suffix}`}
                                </span>
                              </CommandItem>
                            );
                          })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Description Field - moved to bottom */}
          <div className="space-y-2">
            <Label htmlFor="edit-description">Notes</Label>
            <Input
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(sanitizeInput(e.target.value, VALIDATION.DESCRIPTION_MAX_LENGTH))}
              placeholder="Optional description"
              maxLength={VALIDATION.DESCRIPTION_MAX_LENGTH}
              disabled={isLocked}
            />
          </div>

          {/* Date validation message */}
          {startDate && endDate && new Date(endDate) < new Date(startDate) && (
            <p className="text-sm text-destructive">End date must be on or after start date.</p>
          )}
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
