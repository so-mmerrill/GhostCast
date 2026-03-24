import { useState, useEffect, memo } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssignmentStatus, RequestStatus, REQUEST_STATUS_COLORS, AssignmentSelection } from '@ghostcast/shared';
import { CellPresenceIndicator } from './CellPresenceIndicator';
import palmTreeBlack from '@/assets/palm_tree_black.png';
import palmTreeWhite from '@/assets/palm_tree_white.png';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
}

interface Formatter {
  id: string;
  name: string;
  isBold: boolean;
  prefix: string | null;
  suffix: string | null;
}

interface Assignment {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  status: AssignmentStatus;
  request?: {
    id: string;
    status: string;
  } | null;
  projectType: {
    id: string;
    name: string;
    abbreviation?: string | null;
    color: string;
  };
  members: Array<{ member: Member }>;
  formatters?: Array<{ formatter: Formatter }>;
  metadata?: Record<string, unknown>;
}

interface AssignmentSpan {
  assignment: Assignment;
  startIndex: number;
  endIndex: number;
  leftPx: number;
  widthPx: number;
  startsBeforeVisible: boolean;
  endsAfterVisible: boolean;
  lane: number;
  totalLanes: number;
}

export interface DragData {
  assignmentId: string;
  assignment: Assignment;
  sourceMemberId: string;
  sourceStartIndex?: number;  // Original start index in weekdays array
  sourceEndIndex?: number;    // Original end index in weekdays array
}

// Helper to check if system is in dark mode
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (globalThis.window === undefined) return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

// Helper function to check if assignment is a holiday
function isHolidayAssignment(assignment: Assignment): boolean {
  return assignment.metadata?.isHoliday === true;
}

// Helper function to check if assignment is locked
function isLockedAssignment(assignment: Assignment): boolean {
  return assignment.metadata?.isLocked === true;
}

// Helper function to format assignment title based on formatters
// Order: [Prefix] Project Name - [Project Type Abbreviation] [Formatter Suffixes]
function formatAssignmentTitle(assignment: Assignment): { displayTitle: string; isBold: boolean } {
  const formatters = assignment.formatters || [];
  let displayTitle = assignment.title;
  let isBold = false;

  // 1. Apply prefixes before project name
  for (const { formatter } of formatters) {
    if (formatter.prefix) {
      displayTitle = `${formatter.prefix} ${displayTitle}`;
    }
    if (formatter.isBold) {
      isBold = true;
    }
  }

  // 2. Add project type abbreviation after project name
  if (assignment.projectType.abbreviation) {
    displayTitle = `${displayTitle} - ${assignment.projectType.abbreviation}`;
  }

  // 3. Apply formatter suffixes last (after abbreviation)
  for (const { formatter } of formatters) {
    if (formatter.suffix) {
      displayTitle = `${displayTitle} ${formatter.suffix}`;
    }
  }

  return { displayTitle, isBold };
}

// Helper function to determine assignment styling based on request status
function getAssignmentStyle(assignment: Assignment): { background: string; border: string | null; textColor: string } {
  // If no linked request, check metadata.displayStatus or default to SCHEDULED (project color)
  if (!assignment.request) {
    const displayStatus = assignment.metadata?.displayStatus as string | undefined;

    // If displayStatus is UNSCHEDULED, use unscheduled styling
    if (displayStatus === 'UNSCHEDULED') {
      return { background: '#FFFFFF', border: '#000000', textColor: 'black' };
    }

    // If displayStatus is FORECAST, use forecast styling
    if (displayStatus === 'FORECAST') {
      return { background: '#FEF08A', border: '#000000', textColor: 'black' };
    }

    // Default to SCHEDULED - use project type color
    return { background: assignment.projectType.color, border: null, textColor: 'white' };
  }

  // If request is Scheduled, use project type color
  if (assignment.request.status === RequestStatus.SCHEDULED) {
    return { background: assignment.projectType.color, border: null, textColor: 'white' };
  }

  // Otherwise use the request status styling
  const statusStyle = REQUEST_STATUS_COLORS[assignment.request.status as keyof typeof REQUEST_STATUS_COLORS];
  if (statusStyle) {
    return {
      background: statusStyle.background,
      border: statusStyle.border,
      textColor: statusStyle.background === '#FFFFFF' || statusStyle.background === '#FEF08A' ? 'black' : 'white'
    };
  }

  return { background: assignment.projectType.color, border: null, textColor: 'white' };
}

// Helper to compute border radius based on visibility
function computeBorderRadius(startsBeforeVisible: boolean, endsAfterVisible: boolean) {
  return {
    borderTopLeftRadius: startsBeforeVisible ? 0 : 4,
    borderBottomLeftRadius: startsBeforeVisible ? 0 : 4,
    borderTopRightRadius: endsAfterVisible ? 0 : 4,
    borderBottomRightRadius: endsAfterVisible ? 0 : 4,
  };
}

// Helper to compute tooltip title
function computeTooltipTitle(
  isHoliday: boolean,
  assignment: Assignment,
  displayTitle: string
): string {
  if (isHoliday) {
    return `${assignment.description || 'Holiday'} - Drag to reassign`;
  }
  const typeLabel = assignment.projectType.abbreviation || assignment.projectType.name;
  return `${displayTitle} (${typeLabel}) - Drag to reassign`;
}

// Helper to compute z-index based on interaction state
function computeZIndex(isDragging: boolean, isSelected: boolean): number {
  if (isDragging) return 20;
  if (isSelected) return 10;
  return 5;
}

// Helper to compute opacity based on interaction state
function computeOpacity(isDragging: boolean, isCut: boolean): number {
  if (isDragging || isCut) return 0.5;
  return 1;
}

// Helper to compute box shadow based on selection state
function computeBoxShadow(
  isSelected: boolean,
  isHighlighted: boolean,
  presenceColor: string | undefined
): string | undefined {
  if (isSelected) return 'inset 0 0 0 2px hsl(var(--destructive))';
  if (isHighlighted) return '0 0 0 2px #eab308, 0 0 8px rgba(234, 179, 8, 0.5)';
  if (presenceColor) return `inset 0 0 0 2px ${presenceColor}`;
  return undefined;
}

// Helper to compute border style
function computeBorderStyle(border: string | null): string | undefined {
  return border ? `2px solid ${border}` : undefined;
}

// Helper to get presence color from users array
function getPresenceColor(presenceUsers: AssignmentSelection[]): string | undefined {
  return presenceUsers.length > 0 ? presenceUsers[0]?.user.color : undefined;
}

interface DraggableSpanBarProps {
  span: AssignmentSpan;
  rowHeight: number;
  memberId: string;
  onClick: (assignment: Assignment) => void;
  onDoubleClick?: (assignment: Assignment) => void;
  isSelected: boolean;
  isHighlighted?: boolean;
  onDragStart: (data: DragData) => void;
  onDragEnd: () => void;
  isCut?: boolean;
  /** Users who have this assignment selected */
  presenceUsers?: AssignmentSelection[];
  /** Zoom level for scaling presence indicators */
  zoomLevel?: number;
}

function DraggableSpanBarInner({
  span,
  rowHeight,
  memberId,
  onClick,
  onDoubleClick,
  isSelected,
  isHighlighted = false,
  onDragStart,
  onDragEnd,
  isCut = false,
  presenceUsers = [],
  zoomLevel = 1,
}: Readonly<DraggableSpanBarProps>) {
  const [isDragging, setIsDragging] = useState(false);
  const isDarkMode = useIsDarkMode();
  const { assignment, leftPx, widthPx, lane, totalLanes, startsBeforeVisible, endsAfterVisible } =
    span;
  const { displayTitle, isBold } = formatAssignmentTitle(assignment);
  const style = getAssignmentStyle(assignment);
  const isHoliday = isHolidayAssignment(assignment);

  // Calculate height based on available space and number of lanes
  const padding = 2;
  const availableHeight = rowHeight - padding * 2;
  const barHeight = Math.max(availableHeight / totalLanes - 1, 16);
  const topOffset = padding + lane * (barHeight + 1);

  // Presence highlight color
  const presenceColor = getPresenceColor(presenceUsers);

  const isLocked = isLockedAssignment(assignment);
  const dragCursor = isDragging ? 'cursor-grabbing' : 'cursor-grab';
  const cursorClass = isLocked ? 'cursor-default' : dragCursor;

  const handleDragStart = (e: React.DragEvent) => {
    if (isLockedAssignment(assignment)) return;
    const dragData: DragData = {
      assignmentId: assignment.id,
      assignment,
      sourceMemberId: memberId,
      sourceStartIndex: span.startIndex,
      sourceEndIndex: span.endIndex,
    };

    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';

    // Create a custom drag image
    const dragElement = e.currentTarget.querySelector('.span-bar-content') as HTMLElement;
    if (dragElement) {
      e.dataTransfer.setDragImage(dragElement, 10, barHeight / 2);
    }

    setIsDragging(true);
    onDragStart(dragData);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd();
  };

  return (
    <button
      type="button"
      className={cn(
        'absolute border-0 bg-transparent p-0 text-left',
        cursorClass
      )}
      style={{
        left: leftPx,
        width: widthPx,
        top: 0,
        height: rowHeight,
        zIndex: computeZIndex(isDragging, isSelected),
        opacity: computeOpacity(isDragging, isCut),
      }}
      draggable={!isLockedAssignment(assignment)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onClick(assignment);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(assignment);
      }}
    >
      <div
        className="span-bar-content relative flex items-center justify-center overflow-hidden text-xs"
        style={{
          position: 'absolute',
          left: 0,
          width: '100%',
          top: topOffset,
          height: barHeight,
          backgroundColor: style.background,
          color: style.textColor,
          border: computeBorderStyle(style.border),
          ...computeBorderRadius(startsBeforeVisible, endsAfterVisible),
          boxShadow: computeBoxShadow(isSelected, isHighlighted, presenceColor),
          fontWeight: isBold ? 700 : 500,
        }}
        title={computeTooltipTitle(isHoliday, assignment, displayTitle)}
      >
        {isLocked && !isHoliday && (
          <Lock className="shrink-0 h-3 w-3 ml-1 opacity-60" />
        )}
        {isHoliday ? (
          <img
            src={isDarkMode ? palmTreeWhite : palmTreeBlack}
            alt={assignment.description || 'Holiday'}
            className="h-4 w-4"
            style={{ filter: 'none' }}
          />
        ) : (
          <span className="truncate px-2">{displayTitle}</span>
        )}
        {presenceUsers.length > 0 && (
          <CellPresenceIndicator
            selections={presenceUsers.map((s) => ({
              userId: s.userId,
              user: s.user,
              selectedDays: [],
              selectedMemberId: s.memberId,
              timestamp: s.timestamp,
            }))}
            zoomLevel={zoomLevel}
          />
        )}
      </div>
    </button>
  );
}

// Custom comparator: span object is recreated each render, so compare key fields
export const DraggableSpanBar = memo(DraggableSpanBarInner, (prev, next) => {
  if (prev.span.assignment !== next.span.assignment) return false;
  if (prev.span.leftPx !== next.span.leftPx) return false;
  if (prev.span.widthPx !== next.span.widthPx) return false;
  if (prev.span.lane !== next.span.lane) return false;
  if (prev.span.totalLanes !== next.span.totalLanes) return false;
  if (prev.rowHeight !== next.rowHeight) return false;
  if (prev.memberId !== next.memberId) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isHighlighted !== next.isHighlighted) return false;
  if (prev.isCut !== next.isCut) return false;
  if (prev.zoomLevel !== next.zoomLevel) return false;
  if (prev.onClick !== next.onClick) return false;
  if (prev.onDoubleClick !== next.onDoubleClick) return false;
  if (prev.onDragStart !== next.onDragStart) return false;
  if (prev.onDragEnd !== next.onDragEnd) return false;
  if (prev.presenceUsers !== next.presenceUsers) return false;
  return true;
});
