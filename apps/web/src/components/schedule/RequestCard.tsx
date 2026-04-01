import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock4, CalendarCheck, TrendingUp, Highlighter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { RequestStatus } from '@ghostcast/shared';
import { api } from '@/lib/api';
import { updateRequestStatusInCache, updateRequestStatusInPaginatedCache } from '@/lib/schedule-cache';
import { useToast } from '@/hooks/use-toast';

// Parse date string as local date to avoid timezone offset issues
const parseLocalDate = (dateStr: string): Date => {
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
};

interface ProjectType {
  id: string;
  name: string;
  abbreviation?: string | null;
  color: string;
}

interface AssignedMember {
  id: string;
  name: string;
}

export interface RequestCardData {
  id: string;
  title: string;
  clientName: string | null;
  projectType: ProjectType | null;
  requestedStartDate: string | null;
  executionWeeks: number;
  preparationWeeks: number;
  reportingWeeks: number;
  requiredMembersCount: number;
  assignedMembers?: AssignedMember[];
  requesterName?: string | null;
  status: RequestStatus;
}

interface RequestCardProps {
  request: RequestCardData;
  onClick?: () => void;
  isSelected?: boolean;
  /** Icon actions that plugins can inject into the card's action tray */
  actions?: React.ReactNode;
  /** Callback to highlight all assignments on the schedule for this request */
  onHighlight?: () => void;
  /** Whether this request's assignments are currently highlighted */
  isHighlighted?: boolean;
}

const STATUS_OPTIONS = [
  { value: RequestStatus.UNSCHEDULED, label: 'Unscheduled', icon: Clock4, color: 'text-foreground' },
  { value: RequestStatus.FORECAST, label: 'Forecast', icon: TrendingUp, color: 'text-yellow-400' },
  { value: RequestStatus.SCHEDULED, label: 'Scheduled', icon: CalendarCheck, color: 'text-emerald-500' },
];

export function RequestCard({ request, onClick, isSelected, actions, onHighlight, isHighlighted }: Readonly<RequestCardProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: RequestStatus) => {
      return api.put(`/requests/${request.id}`, { status: newStatus });
    },
    onSuccess: (_data, newStatus) => {
      // Update only linked assignments in the schedule cache (no full calendar refetch)
      updateRequestStatusInCache(queryClient, request.id, newStatus);
      // Move the request card between status sections (remove from old, refetch target only)
      updateRequestStatusInPaginatedCache(queryClient, request.id, newStatus);
      toast({
        title: 'Status updated',
        description: 'Request status has been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update status',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  const handleStatusChange = (newStatus: RequestStatus) => {
    if (newStatus !== request.status) {
      updateStatusMutation.mutate(newStatus);
    }
  };

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === request.status);

  const formatDuration = () => {
    const parts = [];
    if (request.preparationWeeks > 0) {
      parts.push(`Prep ${request.preparationWeeks}w`);
    }
    if (request.executionWeeks > 0) {
      parts.push(`Exec ${request.executionWeeks}w`);
    }
    if (request.reportingWeeks > 0) {
      parts.push(`Rpt ${request.reportingWeeks}w`);
    }
    return parts.join(' / ');
  };

  const getMembersText = () => {
    if (request.assignedMembers && request.assignedMembers.length > 0) {
      return request.assignedMembers.map((m) => m.name).join(', ');
    }
    const count = request.requiredMembersCount;
    const plural = count === 1 ? '' : 's';
    return `${count} member${plural}`;
  };

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-card p-3 transition-colors',
        onClick && 'cursor-pointer hover:bg-accent/50',
        isSelected && 'ring-2 ring-primary'
      )}
    >
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          className="absolute inset-0 z-0 w-full h-full rounded-lg bg-transparent p-0 border-0 cursor-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${request.title}`}
        />
      )}
      {/* Row 1: Project Type bubble, Project Name, Status Icon */}
      <div className="pointer-events-none relative flex items-center gap-2 mb-1">
        {request.projectType && (
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: request.projectType.color }}
          />
        )}
        <span className="text-sm font-medium truncate flex-1">
          {request.title}
          {request.projectType?.abbreviation && ` - ${request.projectType.abbreviation}`}
        </span>
        {onHighlight && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'pointer-events-auto h-6 w-6 shrink-0 hover:bg-muted',
              isHighlighted && 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onHighlight();
            }}
            title={isHighlighted ? 'Clear highlight' : 'Highlight assignments'}
          >
            <Highlighter className="h-4 w-4" />
          </Button>
        )}
        {currentStatus && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-6 w-6 shrink-0 hover:bg-muted"
              >
                <currentStatus.icon className={cn('h-4 w-4', currentStatus.color)} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Change Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STATUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isCurrentStatus = option.value === request.status;
                return (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => handleStatusChange(option.value)}
                    disabled={isCurrentStatus || updateStatusMutation.isPending}
                    className={cn(isCurrentStatus && 'bg-muted')}
                  >
                    <Icon className={cn('h-4 w-4 mr-2', option.color)} />
                    {option.label}
                    {isCurrentStatus && <span className="ml-auto text-xs text-muted-foreground">(current)</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Row 2: Requester */}
      {request.requesterName && (
        <div className="pointer-events-none relative text-xs text-muted-foreground mb-1">
          Requester - {request.requesterName}
        </div>
      )}

      {/* Row 3: Client - Requested Date */}
      <div className="pointer-events-none relative text-xs text-muted-foreground mb-1">
        {[
          request.clientName,
          request.requestedStartDate && format(parseLocalDate(request.requestedStartDate), 'MMM d'),
        ]
          .filter(Boolean)
          .join(' - ')}
      </div>

      {/* Row 3: Requested Members */}
      <div className="pointer-events-none relative text-xs text-muted-foreground mb-1">
        {getMembersText()}
      </div>

      {/* Row 4: Duration - Action Tray */}
      <div className="pointer-events-none relative flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDuration()}</span>
        {actions && (
          <div className="pointer-events-auto flex items-center gap-1">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
