import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { upsertAssignmentInCache } from '@/lib/schedule-cache';
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
import { Loader2, User, Tag, Check, FileText, Users, ChevronsUpDown, X, Building2, Minus, Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RequestStatus } from '@ghostcast/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { sanitizeInput, VALIDATION } from '@/lib/input-validation';

interface ProjectType {
  id: string;
  name: string;
  abbreviation?: string | null;
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

interface RequestForDropdown {
  id: string;
  title: string;
  clientName: string | null;
  projectTypeId: string | null;
  projectType: ProjectType | null;
  status: RequestStatus;
}

interface AvailableMember {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
}

interface CreateAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStartDate: Date;
  initialEndDate: Date;
  initialMemberId: string;
  initialMemberName: string;
  onSuccess?: () => void;
  isMultiMemberMode?: boolean;
  availableMembers?: AvailableMember[];
}

const wheelAttached = new WeakSet<HTMLElement>();

export function CreateAssignmentModal({
  open,
  onOpenChange,
  initialStartDate,
  initialEndDate,
  initialMemberId,
  initialMemberName,
  onSuccess,
  isMultiMemberMode = false,
  availableMembers = [],
}: Readonly<CreateAssignmentModalProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectTypeId, setProjectTypeId] = useState('');
  const [startDate, setStartDate] = useState(format(initialStartDate, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(initialEndDate, 'yyyy-MM-dd'));
  const [selectedFormatterIds, setSelectedFormatterIds] = useState<string[]>([]);
  const [selectedProjectRoleIds, setSelectedProjectRoleIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('manual');
  const [displayStatus, setDisplayStatus] = useState<string>('SCHEDULED');
  const [isLocked, setIsLocked] = useState(false);

  // Multi-member selection state
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersSearch, setMembersSearch] = useState('');

  // react-remove-scroll (used by Radix Dialog) preventDefaults wheel events
  // outside its subtree, which kills scrolling on portaled Popover content.
  // Bypass it with a native non-passive listener that scrolls the list manually.
  const attachPopoverListWheel = (el: HTMLDivElement | null) => {
    if (!el || wheelAttached.has(el)) return;
    wheelAttached.add(el);
    el.addEventListener(
      'wheel',
      (e) => {
        el.scrollTop += e.deltaY;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      },
      { passive: false },
    );
  };

  // Derive departments from available members for department-based selection
  const departments = useMemo(() => {
    const deptMap = new Map<string, AvailableMember[]>();
    for (const member of availableMembers) {
      const dept = member.department;
      if (!dept) continue;
      const group = deptMap.get(dept) || [];
      group.push(member);
      deptMap.set(dept, group);
    }
    return Array.from(deptMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, deptMembers]) => ({ name, members: deptMembers }));
  }, [availableMembers]);

  const renderSelectionIcon = (allSelected: boolean, someSelected: boolean) => {
    if (allSelected) {
      return <Check className="mr-2 h-4 w-4 opacity-100" />;
    }
    if (someSelected) {
      return <Minus className="mr-2 h-4 w-4 opacity-70" />;
    }
    return <Check className="mr-2 h-4 w-4 opacity-0" />;
  };

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

  const handleRemoveMember = (e: React.MouseEvent, memberId: string) => {
    e.stopPropagation();
    setSelectedMemberIds((prev) => prev.filter((id) => id !== memberId));
  };

  const handleMemberSelect = (memberId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedMemberIds((prev) => prev.filter((id) => id !== memberId));
    } else {
      setSelectedMemberIds((prev) => [...prev, memberId]);
    }
    setMembersSearch('');
  };

  const handleRemoveProjectRole = (e: React.MouseEvent, roleId: string) => {
    e.stopPropagation();
    setSelectedProjectRoleIds((prev) => prev.filter((id) => id !== roleId));
  };

  const handleProjectRoleSelect = (role: ProjectRole, isSelected: boolean) => {
    if (isSelected) {
      setSelectedProjectRoleIds((prev) => prev.filter((id) => id !== role.id));
    } else {
      setSelectedProjectRoleIds((prev) => [...prev, role.id]);
      // Auto-select associated formatters
      const associatedFormatterIds = role.formatters
        ?.map((f) => f.formatter?.id)
        .filter((id): id is string => !!id) || [];
      if (associatedFormatterIds.length > 0) {
        setSelectedFormatterIds((prev) => [
          ...prev,
          ...associatedFormatterIds.filter((id) => !prev.includes(id)),
        ]);
      }
    }
    setProjectRolesSearch('');
  };

  const handleRemoveFormatter = (e: React.MouseEvent, formatterId: string) => {
    e.stopPropagation();
    setSelectedFormatterIds((prev) => prev.filter((id) => id !== formatterId));
  };

  const handleFormatterSelect = (formatterId: string, isSelected: boolean) => {
    setSelectedFormatterIds((prev) =>
      isSelected
        ? prev.filter((id) => id !== formatterId)
        : [...prev, formatterId]
    );
    setFormattersSearch('');
  };

  // Searchable multi-select state
  const [titleOpen, setTitleOpen] = useState(false);
  const [projectTypesOpen, setProjectTypesOpen] = useState(false);
  const [projectTypesSearch, setProjectTypesSearch] = useState('');
  const [projectRolesOpen, setProjectRolesOpen] = useState(false);
  const [projectRolesSearch, setProjectRolesSearch] = useState('');
  const [formattersOpen, setFormattersOpen] = useState(false);
  const [formattersSearch, setFormattersSearch] = useState('');

  const statusLabels: Record<string, string> = {
    SCHEDULED: 'Scheduled',
    UNSCHEDULED: 'Unscheduled',
    FORECAST: 'Forecast',
  };

  // Sync date state when initial dates change (e.g. new cell selection)
  useEffect(() => {
    setStartDate(format(initialStartDate, 'yyyy-MM-dd'));
    setEndDate(format(initialEndDate, 'yyyy-MM-dd'));
  }, [initialStartDate, initialEndDate]);

  // Fetch project types (use large pageSize to get all)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projectTypesResponse, isLoading: loadingProjectTypes } = useQuery<any>({
    queryKey: ['project-types'],
    queryFn: () => api.get('/project-types', { pageSize: '1000' }),
  });

  // Fetch formatters (use large pageSize to get all)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: formattersResponse } = useQuery<any>({
    queryKey: ['formatters'],
    queryFn: () => api.get('/formatters', { pageSize: '1000' }),
  });

  // Fetch project roles (use large pageSize to get all)
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
    // Structure: { data: [...] }
    if (Array.isArray(projectTypesResponse.data)) return projectTypesResponse.data;
    // Structure: { data: { data: [...] } }
    if (projectTypesResponse.data?.data && Array.isArray(projectTypesResponse.data.data)) {
      return projectTypesResponse.data.data;
    }
    // Structure: direct array
    if (Array.isArray(projectTypesResponse)) return projectTypesResponse;
    return [];
  };
  const projectTypes = getProjectTypesArray().filter((pt: ProjectType) => pt.isActive);

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

  // Reset selections when modal opens
  useEffect(() => {
    if (open) {
      setSelectedFormatterIds([]);
      setSelectedProjectRoleIds([]);
      setSelectedRequestId('manual');
      setSelectedMemberIds([]);
      setDisplayStatus('SCHEDULED');
      setIsLocked(false);
    }
  }, [open]);

  // Handle request selection from dropdown
  const handleRequestSelect = (requestId: string) => {
    setSelectedRequestId(requestId);

    if (requestId === 'manual') {
      // Reset to manual entry
      setTitle('');
      setProjectTypeId('');
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

  const isValid = title.trim() !== '' && projectTypeId !== '' &&
    startDate !== '' && endDate !== '' && endDate >= startDate &&
    (!isMultiMemberMode || selectedMemberIds.length > 0);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setProjectTypeId('');
    setSelectedFormatterIds([]);
    setSelectedProjectRoleIds([]);
    setSelectedRequestId('manual');
    setSelectedMemberIds([]);
    setMembersSearch('');
    setStartDate(format(initialStartDate, 'yyyy-MM-dd'));
    setEndDate(format(initialEndDate, 'yyyy-MM-dd'));
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
        memberIds: isMultiMemberMode ? selectedMemberIds : [initialMemberId],
        formatterIds: selectedFormatterIds.length > 0 ? selectedFormatterIds : undefined,
        projectRoleIds: selectedProjectRoleIds.length > 0 ? selectedProjectRoleIds : undefined,
        requestId: selectedRequestId === 'manual' ? undefined : selectedRequestId,
        ...(selectedRequestId === 'manual' ? { displayStatus } : {}),
        metadata: {
          ...(isLocked ? { isLocked: true } : {}),
        },
      };

      // The POST response includes the full assignment (wrapped by TransformInterceptor)
      const response = await api.post<{ data: { id: string; startDate: string; endDate: string; [key: string]: unknown } }>('/assignments', payload);
      // Update schedule cache directly from the response — no extra round-trip
      if (response?.data) {
        upsertAssignmentInCache(queryClient, response.data);
      }

      toast({
        title: 'Assignment created',
        description: isMultiMemberMode
          ? `"${title}" has been scheduled for ${selectedMemberIds.length} member(s).`
          : `"${title}" has been scheduled successfully.`,
      });
      // Invalidate the request cache so RequestDetailModal shows the new assignment
      if (selectedRequestId !== 'manual') {
        queryClient.invalidateQueries({ queryKey: ['request', selectedRequestId] });
      }
      handleClose(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Failed to create assignment',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md overflow-hidden max-h-[85vh] flex flex-col">
        <DialogHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <DialogTitle>Create Assignment</DialogTitle>
            <DialogDescription>
              Create a new assignment for the selected dates.
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 min-w-0">
          <div className="space-y-4 flex-1 overflow-y-auto pr-1 pl-1">
          {/* Assignment Details */}
          <div className="space-y-2">
            <Label>Assignment Details</Label>
            <div className="rounded-md border bg-muted/50 p-3 space-y-3">
              {!isMultiMemberMode && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{initialMemberName}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-startDate">Start Date *</Label>
                  <Input
                    id="create-startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="h-10 w-full [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert [&::-webkit-calendar-picker-indicator]:dark:opacity-70"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-endDate">End Date *</Label>
                  <Input
                    id="create-endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    required
                    className="h-10 w-full [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert [&::-webkit-calendar-picker-indicator]:dark:opacity-70"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Member Multi-Select (column selection mode) */}
          {isMultiMemberMode && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Members *
              </Label>
              <Popover open={membersOpen} onOpenChange={setMembersOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={membersOpen}
                    className="w-full justify-between font-normal h-auto min-h-10 overflow-hidden"
                    type="button"
                  >
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0 max-h-24 overflow-y-auto">
                      {selectedMemberIds.length > 0 ? (
                        selectedMemberIds.map((memberId) => {
                          const member = availableMembers.find((m) => m.id === memberId);
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
                                onClick={(e) => handleRemoveMember(e, memberId)}
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
                      placeholder="Search members..."
                      value={membersSearch}
                      onValueChange={setMembersSearch}
                    />
                    <CommandList className="px-1">
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
                                    {renderSelectionIcon(allSelected, someSelected)}
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
                        {availableMembers
                          .filter((member) => {
                            const search = membersSearch.toLowerCase();
                            const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
                            return fullName.includes(search) ||
                              (member.department?.toLowerCase().includes(search) ?? false);
                          })
                          .map((member, index) => {
                            const isSelected = selectedMemberIds.includes(member.id);
                            const isFirstFiltered = index === 0 && membersSearch.length > 0;
                            return (
                              <CommandItem
                                key={member.id}
                                value={member.id}
                                onSelect={() => handleMemberSelect(member.id, isSelected)}
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
          )}

          {/* Title Field with Request Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Popover open={titleOpen} onOpenChange={setTitleOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={titleOpen}
                  className="w-full justify-between font-normal h-auto min-h-10 overflow-hidden"
                  type="button"
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
                        setProjectTypeId('');
                      }
                    }}
                  />
                  <CommandList className="px-1 max-h-60 overflow-y-auto scrollbar-on-hover" ref={attachPopoverListWheel}>
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
                                {req.projectType?.abbreviation && (
                                  <span className="text-xs text-muted-foreground">
                                    - {req.projectType.abbreviation}
                                  </span>
                                )}
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
              <Select value={displayStatus} onValueChange={setDisplayStatus}>
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

          {/* Project Type Selector - Searchable */}
          <div className="space-y-2">
            <Label htmlFor="projectType">Project Type *</Label>
            <Popover open={projectTypesOpen} onOpenChange={setProjectTypesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={projectTypesOpen}
                  className="w-full justify-between font-normal h-10 overflow-hidden"
                  type="button"
                >
                  {projectTypeId ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: projectTypes.find((pt) => pt.id === projectTypeId)?.color }}
                      />
                      <span className="truncate">{projectTypes.find((pt) => pt.id === projectTypeId)?.name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {loadingProjectTypes ? 'Loading...' : 'Search and select project type...'}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search project types..."
                    value={projectTypesSearch}
                    onValueChange={setProjectTypesSearch}
                  />
                  <CommandList className="px-1 max-h-60 overflow-y-auto scrollbar-on-hover" ref={attachPopoverListWheel}>
                    <CommandEmpty>No project types found.</CommandEmpty>
                    <CommandGroup>
                      {projectTypes
                        .filter((pt) =>
                          pt.name.toLowerCase().includes(projectTypesSearch.toLowerCase())
                        )
                        .map((pt, index) => {
                          const isSelected = projectTypeId === pt.id;
                          const isFirstFiltered = index === 0 && projectTypesSearch.length > 0;
                          return (
                            <CommandItem
                              key={pt.id}
                              value={pt.id}
                              onSelect={() => {
                                setProjectTypeId(pt.id);
                                setProjectTypesSearch('');
                                setProjectTypesOpen(false);
                              }}
                              className={cn(isFirstFiltered && 'bg-accent')}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  isSelected ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-3 w-3 rounded-full shrink-0"
                                  style={{ backgroundColor: pt.color }}
                                />
                                <span>{pt.name}</span>
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
              <Popover open={projectRolesOpen} onOpenChange={setProjectRolesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={projectRolesOpen}
                    className="w-full justify-between font-normal h-10 overflow-hidden"
                    type="button"
                  >
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0 overflow-hidden">
                      {selectedProjectRoleIds.length > 0 ? (
                        selectedProjectRoleIds.map((roleId) => {
                          const role = projectRoles.find((r) => r.id === roleId);
                          if (!role) return null;
                          return (
                            <span
                              key={roleId}
                              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs max-w-[150px]"
                              style={role.color ? { borderColor: role.color } : undefined}
                            >
                              <span className="truncate">{role.name}</span>
                              <button
                                type="button"
                                onClick={(e) => handleRemoveProjectRole(e, roleId)}
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
                    <CommandList className="px-1 max-h-60 overflow-y-auto scrollbar-on-hover" ref={attachPopoverListWheel}>
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
                                onSelect={() => handleProjectRoleSelect(role, isSelected)}
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
              <Popover open={formattersOpen} onOpenChange={setFormattersOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={formattersOpen}
                    className="w-full justify-between font-normal h-10 overflow-hidden"
                    type="button"
                  >
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0 overflow-hidden">
                      {selectedFormatterIds.length > 0 ? (
                        selectedFormatterIds.map((formatterId) => {
                          const formatter = formatters.find((f) => f.id === formatterId);
                          if (!formatter) return null;
                          return (
                            <span
                              key={formatterId}
                              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs max-w-[150px]"
                            >
                              <span className={cn('truncate', formatter.isBold && 'font-bold')}>
                                {formatter.name}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleRemoveFormatter(e, formatterId)}
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
                    <CommandList className="px-1 max-h-60 overflow-y-auto scrollbar-on-hover" ref={attachPopoverListWheel}>
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
                                onSelect={() => handleFormatterSelect(formatter.id, isSelected)}
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
            <Label htmlFor="description">Description/Notes</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(sanitizeInput(e.target.value, VALIDATION.DESCRIPTION_MAX_LENGTH))}
              placeholder="Optional description"
              maxLength={VALIDATION.DESCRIPTION_MAX_LENGTH}
            />
          </div>

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
              Create Assignment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
