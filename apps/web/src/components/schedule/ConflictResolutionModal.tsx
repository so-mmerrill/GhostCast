import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Scissors, Trash2 } from 'lucide-react';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
}

interface Assignment {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  projectType: {
    id: string;
    name: string;
    color: string;
  };
  members: Array<{ member: Member }>;
}

// Parse a date string (YYYY-MM-DD or ISO) as a local date without timezone conversion
function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface ConflictResolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droppedAssignment: Assignment;
  targetMemberName: string;
  conflictingAssignments: Assignment[];
  gaps: Array<{ startDate: Date; endDate: Date }>;
  onScheduleAround: () => void;
  onOverwrite: () => void;
  isLoading: boolean;
}

export function ConflictResolutionModal({
  open,
  onOpenChange,
  droppedAssignment,
  targetMemberName,
  conflictingAssignments,
  gaps,
  onScheduleAround,
  onOverwrite,
  isLoading,
}: Readonly<ConflictResolutionModalProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Scheduling Conflict
          </DialogTitle>
          <DialogDescription>
            &ldquo;{droppedAssignment.title}&rdquo; overlaps with existing assignments for{' '}
            <span className="font-medium text-foreground">{targetMemberName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropped assignment info */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: droppedAssignment.projectType.color }}
              />
              <span className="font-medium text-sm">{droppedAssignment.title}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {format(parseLocalDate(droppedAssignment.startDate), 'MMM d, yyyy')} &ndash;{' '}
              {format(parseLocalDate(droppedAssignment.endDate), 'MMM d, yyyy')}
            </div>
          </div>

          {/* Conflicting assignments */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              Conflicting Assignments ({conflictingAssignments.length})
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {conflictingAssignments.map((a) => (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: a.projectType.color }}
                    />
                    <span className="font-medium text-sm">{a.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(parseLocalDate(a.startDate), 'MMM d, yyyy')} &ndash;{' '}
                    {format(parseLocalDate(a.endDate), 'MMM d, yyyy')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available gaps */}
          {gaps.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Available Time Slots</h4>
              <div className="space-y-1 text-sm">
                {gaps.map((gap) => (
                  <div
                    key={`${gap.startDate.getTime()}-${gap.endDate.getTime()}`}
                    className="flex items-center gap-2 text-muted-foreground p-2 rounded bg-green-50 dark:bg-green-950/30"
                  >
                    <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    {format(gap.startDate, 'MMM d, yyyy')} &ndash;{' '}
                    {format(gap.endDate, 'MMM d, yyyy')}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          {gaps.length > 0 && (
            <Button
              variant="secondary"
              onClick={onScheduleAround}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Scissors className="mr-2 h-4 w-4" />
              )}
              Schedule Around
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={onOverwrite}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Overwrite ({conflictingAssignments.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
