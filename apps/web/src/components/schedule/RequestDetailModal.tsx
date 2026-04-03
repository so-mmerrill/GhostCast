import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, eachDayOfInterval } from 'date-fns';
import { useUndoRedoStore, UndoableAction } from '@/stores/undo-redo-store';
import {
  Calendar,
  Clock,
  Building2,
  MapPin,
  User,
  Users,
  ExternalLink,
  Clock4,
  CalendarCheck,
  TrendingUp,
  Trash2,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  RequestStatus,
  ProjectTypeFieldConfig,
  ConfigurableRequestField,
  resolveValueTemplate,
} from '@ghostcast/shared';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
}

interface AssignmentMember {
  id: string;
  memberId: string;
  member: Member;
}

interface ProjectRole {
  id: string;
  name: string;
  color?: string | null;
}

interface AssignmentProjectRole {
  id: string;
  projectRoleId: string;
  projectRole: ProjectRole;
}

interface Assignment {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  members: AssignmentMember[];
  projectRoles?: AssignmentProjectRole[];
}

interface ProjectType {
  id: string;
  name: string;
  color: string;
  fieldConfig?: ProjectTypeFieldConfig | null;
}

interface RequestData {
  id: string;
  title: string;
  description?: string | null;
  status: RequestStatus;
  projectId?: string | null;
  kantataId?: string | null;
  clientName?: string | null;
  projectType?: ProjectType | null;
  requestedStartDate?: string | null;
  requestedEndDate?: string | null;
  executionWeeks: number;
  preparationWeeks: number;
  reportingWeeks: number;
  travelRequired: boolean;
  travelLocation?: string | null;
  timezone?: string | null;
  urlLink?: string | null;
  location?: string | null;
  format?: string | null;
  requester?: { id: string; firstName: string; lastName: string } | null;
  assignments?: Assignment[];
  createdAt: string;
  updatedAt: string;
}

interface RequestDetailModalProps {
  readonly requestId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const STATUS_CONFIG = {
  [RequestStatus.UNSCHEDULED]: {
    icon: Clock4,
    color: 'text-black dark:text-white',
    bgColor: 'bg-white dark:bg-zinc-800 border border-black dark:border-white',
    label: 'Unscheduled',
  },
  [RequestStatus.FORECAST]: {
    icon: TrendingUp,
    color: 'text-black dark:text-black',
    bgColor: 'bg-[#FEF08A] dark:bg-[#FEF08A] border border-black dark:border-black text-black dark:text-black',
    label: 'Forecast',
  },
  [RequestStatus.SCHEDULED]: {
    icon: CalendarCheck,
    color: 'text-white',
    bgColor: '', // Will use project type color
    label: 'Scheduled',
  },
  [RequestStatus.CANCELLED]: {
    icon: Ban,
    color: 'text-white',
    bgColor: 'bg-red-500 dark:bg-red-600 border border-red-600 dark:border-red-500',
    label: 'Cancelled',
  },
};

// Parse date string as local date to avoid timezone offset issues
const parseLocalDate = (dateStr: string): Date => {
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Helper to find projectTypeId from schedule cache
const findProjectTypeIdInScheduleCache = (
  scheduleQueries: [unknown, { data?: { assignments?: Array<{ id: string; projectType?: { id: string } }> } } | undefined][],
  assignmentId: string
): string | undefined => {
  for (const [, scheduleData] of scheduleQueries) {
    const scheduleAssignment = scheduleData?.data?.assignments?.find(a => a.id === assignmentId);
    if (scheduleAssignment?.projectType?.id) {
      return scheduleAssignment.projectType.id;
    }
  }
  return undefined;
};

// Helper to create an undo action for assignment deletion
const createDeleteAssignmentUndoAction = (
  assignment: Assignment,
  projectTypeId: string,
  requestId: string | null
): UndoableAction => ({
  type: 'DELETE_ASSIGNMENT',
  payload: {
    title: assignment.title,
    startDate: assignment.startDate,
    endDate: assignment.endDate,
    projectTypeId,
    memberIds: assignment.members.map(m => m.member.id),
    requestId: requestId || undefined,
    projectRoleIds: assignment.projectRoles?.map(pr => pr.projectRole.id),
  },
  timestamp: Date.now(),
});

const formatDate = (dateString: string) => {
  return format(parseLocalDate(dateString), 'MMM d, yyyy');
};

const formatDateShort = (dateString: string) => {
  return format(parseLocalDate(dateString), 'MMM d');
};

// Extract role group prefix for grouping similar roles
// e.g. "AT:RTO - Student" -> "AT:RTO", "Pentester" -> "Pentester"
const getRoleGroupPrefix = (roleName: string): string => {
  const dashIndex = roleName.indexOf(' - ');
  return dashIndex > 0 ? roleName.substring(0, dashIndex) : roleName;
};

function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-muted-foreground">Loading request details...</div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-muted-foreground">Request not found</div>
    </div>
  );
}

function EmptyAssignmentsState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Users className="h-12 w-12 mb-3 opacity-20" />
      <p className="text-sm">No members assigned yet</p>
      <p className="text-xs mt-1">
        Assignments will appear here once created
      </p>
    </div>
  );
}

export function RequestDetailModal({
  requestId,
  open,
  onOpenChange,
}: RequestDetailModalProps) {
  const queryClient = useQueryClient();
  const { pushUndo } = useUndoRedoStore();

  const { data: response, isLoading } = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => api.get<{ data: RequestData }>(`/requests/${requestId}`),
    enabled: !!requestId && open,
  });

  const removeAssignmentsMutation = useMutation({
    mutationFn: () => api.delete(`/requests/${requestId}/assignments`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['request', requestId] });

      const previousData = queryClient.getQueryData<{ data: RequestData }>(['request', requestId]);

      if (!previousData?.data?.assignments) {
        return { previousData };
      }

      const scheduleQueries = queryClient.getQueriesData<{ data: { assignments: Array<{ id: string; projectType?: { id: string } }> } }>({ queryKey: ['schedule'] });

      // Record each assignment for undo before clearing
      for (const assignment of previousData.data.assignments) {
        const projectTypeId = previousData.data.projectType?.id
          ?? findProjectTypeIdInScheduleCache(scheduleQueries, assignment.id);

        if (projectTypeId) {
          pushUndo(createDeleteAssignmentUndoAction(assignment, projectTypeId, requestId));
        }
      }

      // Optimistically clear all assignments
      queryClient.setQueryData<{ data: RequestData }>(['request', requestId], {
        ...previousData,
        data: {
          ...previousData.data,
          assignments: [],
        },
      });

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['request', requestId], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['requests-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'] });
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: (assignmentId: string) => api.delete(`/assignments/${assignmentId}`),
    onMutate: async (assignmentId: string) => {
      await queryClient.cancelQueries({ queryKey: ['request', requestId] });

      const previousData = queryClient.getQueryData<{ data: RequestData }>(['request', requestId]);

      if (!previousData?.data) {
        return { previousData };
      }

      const assignment = previousData.data.assignments?.find(a => a.id === assignmentId);

      if (assignment) {
        const scheduleQueries = queryClient.getQueriesData<{ data: { assignments: Array<{ id: string; projectType?: { id: string } }> } }>({ queryKey: ['schedule'] });
        const projectTypeId = previousData.data.projectType?.id
          ?? findProjectTypeIdInScheduleCache(scheduleQueries, assignmentId);

        if (projectTypeId) {
          pushUndo(createDeleteAssignmentUndoAction(assignment, projectTypeId, requestId));
        }
      }

      // Optimistically remove the assignment
      queryClient.setQueryData<{ data: RequestData }>(['request', requestId], {
        ...previousData,
        data: {
          ...previousData.data,
          assignments: previousData.data.assignments?.filter(a => a.id !== assignmentId),
        },
      });

      return { previousData };
    },
    onError: (_err, _assignmentId, context) => {
      // Roll back on error
      if (context?.previousData) {
        queryClient.setQueryData(['request', requestId], context.previousData);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ['request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['requests-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'] });
    },
  });

  const requestData = response?.data;

  if (!requestId) return null;

  const isFieldVisible = (fieldName: ConfigurableRequestField): boolean => {
    if (!requestData?.projectType?.fieldConfig) return true;
    const settings = requestData.projectType.fieldConfig[fieldName];
    return settings?.visible ?? true;
  };

  // Map configurable field names to their corresponding RequestData keys
  // Fields without a mapping (or with non-string values) are safely ignored by getResolvedValue
  const FIELD_TO_DATA_KEY: Partial<Record<ConfigurableRequestField, keyof RequestData>> = {
    jiraId: 'projectId',
    kantataId: 'kantataId',
    clientName: 'clientName',
    urlLink: 'urlLink',
    timezone: 'timezone',
    format: 'format',
    location: 'location',
    description: 'description',
  };

  const getResolvedValue = (fieldName: ConfigurableRequestField): string | null => {
    if (!requestData?.projectType?.fieldConfig) return null;
    const settings = requestData.projectType.fieldConfig[fieldName];
    if (!settings?.valueTemplate) return null;

    const dataKey = FIELD_TO_DATA_KEY[fieldName];
    if (!dataKey) return null;

    const value = requestData[dataKey];
    if (!value || typeof value !== 'string') return null;

    return resolveValueTemplate(settings.valueTemplate, value);
  };

  const statusConfig = requestData ? STATUS_CONFIG[requestData.status] : null;
  const StatusIcon = statusConfig?.icon;

  // Count how many distinct members each role group has (for sorting)
  const roleGroupMemberCounts = new Map<string, Set<string>>();
  requestData?.assignments?.forEach((assignment) => {
    const roles = assignment.projectRoles?.map((apr) => apr.projectRole) ?? [];
    roles.forEach((role) => {
      const groupPrefix = getRoleGroupPrefix(role.name);
      if (!roleGroupMemberCounts.has(groupPrefix)) {
        roleGroupMemberCounts.set(groupPrefix, new Set());
      }
      const memberSet = roleGroupMemberCounts.get(groupPrefix)!;
      assignment.members.forEach((am) => memberSet.add(am.member.id));
    });
  });

  // Group all assignments by member so each member gets one card
  const memberMap = new Map<string, {
    memberId: string;
    member: Member;
    entries: Array<{
      assignmentId: string;
      startDate: string;
      endDate: string;
      assignmentTitle: string;
      projectRoles: ProjectRole[];
    }>;
    sortPriority: number;
    primaryRoleGroup: string;
  }>();

  requestData?.assignments?.forEach((assignment) => {
    const roles = assignment.projectRoles?.map((apr) => apr.projectRole) ?? [];
    assignment.members.forEach((am) => {
      if (!memberMap.has(am.member.id)) {
        memberMap.set(am.member.id, {
          memberId: am.member.id,
          member: am.member,
          entries: [],
          sortPriority: Infinity,
          primaryRoleGroup: '',
        });
      }
      const card = memberMap.get(am.member.id)!;
      card.entries.push({
        assignmentId: assignment.id,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        assignmentTitle: assignment.title,
        projectRoles: roles,
      });

      // Track sort priority: minimum role group member count across all roles
      roles.forEach((role) => {
        const groupPrefix = getRoleGroupPrefix(role.name);
        const count = roleGroupMemberCounts.get(groupPrefix)?.size ?? Infinity;
        if (count < card.sortPriority) {
          card.sortPriority = count;
          card.primaryRoleGroup = groupPrefix;
        }
      });
    });
  });

  // Sort: role group (fewest members first), then alphabetically by name
  const groupedMemberCards = Array.from(memberMap.values());
  groupedMemberCards.sort((a, b) => {
    // Group similar roles together first
    const groupCompare = a.primaryRoleGroup.localeCompare(b.primaryRoleGroup);
    if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
    if (groupCompare !== 0) return groupCompare;
    const nameA = `${a.member.lastName} ${a.member.firstName}`;
    const nameB = `${b.member.lastName} ${b.member.firstName}`;
    return nameA.localeCompare(nameB);
  });

  // Sort entries within each card by start date
  groupedMemberCards.forEach((card) => {
    card.entries.sort(
      (a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
    );
  });

  const formatDuration = () => {
    const parts = [];
    if (requestData?.preparationWeeks && requestData.preparationWeeks > 0) {
      parts.push(`Prep ${requestData.preparationWeeks}w`);
    }
    if (requestData?.executionWeeks && requestData.executionWeeks > 0) {
      parts.push(`Exec ${requestData.executionWeeks}w`);
    }
    if (requestData?.reportingWeeks && requestData.reportingWeeks > 0) {
      parts.push(`Rpt ${requestData.reportingWeeks}w`);
    }
    return parts.join(' / ') || 'No duration set';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{requestData?.title || 'Request Details'}</DialogTitle>
          <DialogDescription>View request details and assigned members</DialogDescription>
        </DialogHeader>

        {isLoading && <LoadingState />}
        {!isLoading && !requestData && <NotFoundState />}
        {!isLoading && requestData && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-3 pb-4 border-b shrink-0">
              {requestData.projectType && (
                <div
                  className="w-4 h-4 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: requestData.projectType.color }}
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold truncate">{requestData.title}</h2>
                {requestData.projectType && (
                  <p className="text-sm text-muted-foreground">
                    {requestData.projectType.name}
                  </p>
                )}
              </div>
              {statusConfig && StatusIcon && (
                <Badge
                  variant="secondary"
                  className={cn('gap-1.5 shrink-0 min-w-[115px] justify-center mr-2', statusConfig.bgColor)}
                  style={
                    requestData.status === RequestStatus.SCHEDULED && requestData.projectType
                      ? { backgroundColor: requestData.projectType.color }
                      : undefined
                  }
                >
                  <StatusIcon className={cn('h-3.5 w-3.5', statusConfig.color)} />
                  {statusConfig.label}
                </Badge>
              )}
            </div>

            {/* Description Section */}
            <div className="py-4 border-b shrink-0 space-y-3">
              {/* Key Details Row */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {requestData.requester && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{requestData.requester.firstName} {requestData.requester.lastName}</span>
                  </div>
                )}
                {isFieldVisible('clientName') && requestData.clientName && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {getResolvedValue('clientName') ? (
                      <a href={getResolvedValue('clientName')!} target="_blank" rel="noopener noreferrer"
                         className="text-blue-600 hover:underline dark:text-blue-400">
                        {requestData.clientName}
                      </a>
                    ) : (
                      <span>{requestData.clientName}</span>
                    )}
                  </div>
                )}
                {isFieldVisible('jiraId') && requestData.projectId && (
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    {getResolvedValue('jiraId') ? (
                      <a href={getResolvedValue('jiraId')!} target="_blank" rel="noopener noreferrer"
                         className="text-blue-600 hover:underline dark:text-blue-400">
                        {requestData.projectId}
                      </a>
                    ) : (
                      <span>{requestData.projectId}</span>
                    )}
                  </div>
                )}
                {isFieldVisible('kantataId') && requestData.kantataId && (
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    {getResolvedValue('kantataId') ? (
                      <a href={getResolvedValue('kantataId')!} target="_blank" rel="noopener noreferrer"
                         className="text-blue-600 hover:underline dark:text-blue-400">
                        {requestData.kantataId}
                      </a>
                    ) : (
                      <span>{requestData.kantataId}</span>
                    )}
                  </div>
                )}
                {isFieldVisible('requestedStartDate') && requestData.requestedStartDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {formatDate(requestData.requestedStartDate)}
                      {isFieldVisible('requestedEndDate') &&
                        requestData.requestedEndDate &&
                        ` - ${formatDate(requestData.requestedEndDate)}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDuration()}</span>
                </div>
                {isFieldVisible('location') && requestData.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {getResolvedValue('location') ? (
                      <a href={getResolvedValue('location')!} target="_blank" rel="noopener noreferrer"
                         className="text-blue-600 hover:underline dark:text-blue-400">
                        {requestData.location}
                      </a>
                    ) : (
                      <span>{requestData.location}</span>
                    )}
                  </div>
                )}
                {isFieldVisible('urlLink') && requestData.urlLink && (
                  <a
                    href={getResolvedValue('urlLink') || requestData.urlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:underline dark:text-blue-400"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Project Link</span>
                  </a>
                )}
              </div>

              {/* Description */}
              {isFieldVisible('description') && requestData.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {requestData.description}
                </p>
              )}
            </div>

            {/* Assigned Members Section */}
            <div className="flex-1 overflow-y-auto py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Assigned Members
                </h3>
                {groupedMemberCards.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeAssignmentsMutation.mutate()}
                    disabled={removeAssignmentsMutation.isPending}
                  >
                    {removeAssignmentsMutation.isPending ? 'Removing...' : 'Remove Assignments'}
                  </Button>
                )}
              </div>

              {groupedMemberCards.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groupedMemberCards.map((card) => (
                    <div
                      key={card.memberId}
                      className="rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="font-medium mb-2">
                        {card.member.firstName} {card.member.lastName}
                      </div>
                      <div className="space-y-2">
                        {card.entries.map((entry, entryIdx) => {
                          const days = eachDayOfInterval({
                            start: parseLocalDate(entry.startDate),
                            end: parseLocalDate(entry.endDate),
                          });
                          const weekdays = days.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
                          const totalDays = weekdays.length;

                          return (
                            <div key={entry.assignmentId} className="group relative">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-0 right-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => removeAssignmentMutation.mutate(entry.assignmentId)}
                                disabled={removeAssignmentMutation.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                              {entry.projectRoles.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {entry.projectRoles.map((role) => (
                                    <span
                                      key={role.id}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                                      style={{
                                        backgroundColor: role.color ? `${role.color}20` : '#6b728020',
                                        color: role.color ?? '#6b7280',
                                      }}
                                    >
                                      {role.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="text-sm text-muted-foreground mt-0.5">
                                {formatDateShort(entry.startDate)} - {formatDateShort(entry.endDate)}
                                <span className="ml-1 text-xs">
                                  ({totalDays} day{totalDays === 1 ? '' : 's'})
                                </span>
                              </div>
                              {entryIdx < card.entries.length - 1 && (
                                <div className="border-b mt-2" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyAssignmentsState />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
