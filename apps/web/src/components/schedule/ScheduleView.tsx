import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect, memo, CSSProperties } from 'react';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWeekend,
  isToday,
  getMonth,
  startOfWeek,
  isSameMonth,
  differenceInDays,
} from 'date-fns';
import { api } from '@/lib/api';
import { MoreVertical, ChevronDown, ChevronRight, Plus, X, Pencil, Clock4, TrendingUp, CalendarCheck } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CreateAssignmentModal } from './CreateAssignmentModal';
import { EditAssignmentModal } from './EditAssignmentModal';
import { RequestsPanel } from './RequestsPanel';
import { RequestDetailModal } from './RequestDetailModal';
import { ScheduleMemberProfileModal } from './ScheduleMemberProfileModal';
import { DraggableSpanBar, DragData } from './DraggableSpanBar';
import { ConflictResolutionModal } from './ConflictResolutionModal';
import { CellPresenceIndicator } from './CellPresenceIndicator';
import { cn } from '@/lib/utils';
import { useCellPresence } from '@/hooks/use-cell-presence';
import { useScheduleUndoRedo } from '@/hooks/use-schedule-undo-redo';
import { useUndoRedoStore } from '@/stores/undo-redo-store';
import { useScheduleViewStore } from '@/stores/schedule-view-store';
import { CellSelection, AssignmentSelection, DisplayStatus, RequestStatus, Role, generateRequestColors, generateClientColors } from '@ghostcast/shared';
import type { ColorMode, MemberSortBy, DepartmentSortBy } from '@/stores/schedule-view-store';
import { useAuth } from '@/features/auth/AuthProvider';
import { refreshScheduleCache, findAssignmentDatesInCache, findAssignmentMemberIdsInCache, removeAssignmentFromCache, updateRequestStatusInCache, updateRequestStatusInPaginatedCache } from '@/lib/schedule-cache';
import { useResolvedScheduleFilter } from '@/hooks/use-resolved-schedule-filter';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
}

interface CalendarMember extends Member {
  position: string | null;
  managerId: string | null;
  metadata?: {
    hideFromSchedule?: boolean;
  };
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
  displayStatus: DisplayStatus;
  requestId?: string | null;
  request?: {
    id: string;
    status: string;
    clientName?: string | null;
  } | null;
  projectType: {
    id: string;
    name: string;
    abbreviation?: string | null;
    color: string;
  };
  members: Array<{ member: Member }>;
  formatters?: Array<{ formatter: Formatter }>;
  projectRoles?: Array<{ projectRole: { id: string; name: string } }>;
  metadata?: Record<string, unknown>;
}

// Helper function to check if assignment is locked
function isLockedAssignment(assignment: Assignment): boolean {
  return assignment.metadata?.isLocked === true;
}

interface ScheduleData {
  data: {
    assignments: Assignment[];
    members: CalendarMember[];
    dateRange: {
      startDate: string;
      endDate: string;
    };
  };
}

interface MonthGroup {
  month: number;
  year: number;
  label: string;
  dayCount: number;
  startIndex: number;
}

interface WeekGroup {
  startDate: number;
  endDate: number;
  dayCount: number;
  startIndex: number;
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

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F'];
const BASE_COL_WIDTH = 40;
const DEFAULT_memberColWidth = 212; // w-48 = 12rem = 192px
const MIN_MEMBER_COL_WIDTH = 150;
const MAX_MEMBER_COL_WIDTH = 400;

// Helper to sort members hierarchically by manager with department sections
interface HierarchicalMember extends CalendarMember {
  indentLevel: number;
  hasDirectReports: boolean;
}

interface DepartmentHeader {
  type: 'department';
  department: string;
}

interface MemberRow extends HierarchicalMember {
  type: 'member';
}

type MemberListItem = DepartmentHeader | MemberRow;

function sortMembersHierarchically(
  members: CalendarMember[],
  collapsedManagerIds: Set<string>,
  collapsedDepartments: Set<string>,
  memberSortBy: MemberSortBy = 'name',
  departmentSortBy: DepartmentSortBy = 'alpha',
): MemberListItem[] {
  const memberMap = new Map<string, CalendarMember>();
  const childrenMap = new Map<string, CalendarMember[]>();

  // Build maps for quick lookup
  for (const member of members) {
    memberMap.set(member.id, member);
    if (member.managerId) {
      const children = childrenMap.get(member.managerId) || [];
      children.push(member);
      childrenMap.set(member.managerId, children);
    }
  }

  // Find top-level members (managers or those without a manager in the list)
  const topLevel: CalendarMember[] = [];
  for (const member of members) {
    // A member is top-level if they have no manager or their manager isn't in the list
    if (!member.managerId || !memberMap.has(member.managerId)) {
      topLevel.push(member);
    }
  }

  // Helper to check if a member has direct reports
  const hasDirects = (member: CalendarMember) => (childrenMap.get(member.id) || []).length > 0;

  // Group top-level members by department
  const departmentGroups = new Map<string, CalendarMember[]>();
  for (const member of topLevel) {
    const dept = member.department || 'Other';
    const group = departmentGroups.get(dept) || [];
    group.push(member);
    departmentGroups.set(dept, group);
  }

  // Count all members per department (including nested reports, not just top-level)
  const departmentTotalCounts = new Map<string, number>();
  for (const member of members) {
    const dept = member.department || 'Other';
    departmentTotalCounts.set(dept, (departmentTotalCounts.get(dept) ?? 0) + 1);
  }

  // Sort departments based on departmentSortBy, always keeping "Other" last
  const sortedDepartments = Array.from(departmentGroups.keys()).sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    switch (departmentSortBy) {
      case 'alpha-desc':
        return b.localeCompare(a);
      case 'member-count-desc': {
        const aCount = departmentTotalCounts.get(a) ?? 0;
        const bCount = departmentTotalCounts.get(b) ?? 0;
        return bCount - aCount || a.localeCompare(b);
      }
      case 'member-count-asc': {
        const aCount = departmentTotalCounts.get(a) ?? 0;
        const bCount = departmentTotalCounts.get(b) ?? 0;
        return aCount - bCount || a.localeCompare(b);
      }
      case 'alpha':
      default:
        return a.localeCompare(b);
    }
  });

  // Member comparator based on memberSortBy
  const compareMember = (a: CalendarMember, b: CalendarMember) => {
    const aHasDirects = hasDirects(a);
    const bHasDirects = hasDirects(b);
    // Members without directs come first
    if (aHasDirects !== bHasDirects) return aHasDirects ? 1 : -1;

    if (memberSortBy === 'position') {
      // Sort by position, nulls last, then by name as tiebreaker
      if (a.position && !b.position) return -1;
      if (!a.position && b.position) return 1;
      if (a.position && b.position) {
        const posCmp = a.position.localeCompare(b.position);
        if (posCmp !== 0) return posCmp;
      }
    }
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
  };

  // Recursively add members with their reports
  const result: MemberListItem[] = [];

  function addMemberWithReports(member: CalendarMember, indentLevel: number) {
    const reports = childrenMap.get(member.id) || [];
    const hasDirectReports = reports.length > 0;

    result.push({ type: 'member', ...member, indentLevel, hasDirectReports });

    // If this manager is collapsed, don't add their reports
    if (collapsedManagerIds.has(member.id)) {
      return;
    }

    reports.sort(compareMember);

    for (const report of reports) {
      addMemberWithReports(report, indentLevel + 1);
    }
  }

  // Add members grouped by department with section headers
  for (const dept of sortedDepartments) {
    const deptMembers = departmentGroups.get(dept) || [];

    // Add department header
    result.push({ type: 'department', department: dept });

    // Skip members if department is collapsed
    if (collapsedDepartments.has(dept)) {
      continue;
    }

    deptMembers.sort(compareMember);

    for (const member of deptMembers) {
      addMemberWithReports(member, 0);
    }
  }

  return result;
}

// Parse a date string (YYYY-MM-DD or ISO) as a local date without timezone conversion
function parseLocalDate(dateStr: string): Date {
  // If it's an ISO string with time, extract just the date part
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Compare two dates by their date portion only (ignoring time)
function isSameDateOrAfter(date: Date, compareDate: Date): boolean {
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const d2 = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());
  return d1 >= d2;
}

function isSameDateOrBefore(date: Date, compareDate: Date): boolean {
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const d2 = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());
  return d1 <= d2;
}

// Calculate gaps between conflicting assignments within a date range
function calculateScheduleGaps(
  droppedStart: Date,
  droppedEnd: Date,
  conflicting: Assignment[]
): Array<{ startDate: Date; endDate: Date }> {
  const gaps: Array<{ startDate: Date; endDate: Date }> = [];
  const sorted = [...conflicting].sort((a, b) =>
    parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
  );

  let currentStart = droppedStart;

  for (const conflict of sorted) {
    const conflictStart = parseLocalDate(conflict.startDate);
    const conflictEnd = parseLocalDate(conflict.endDate);

    if (currentStart < conflictStart) {
      const gapEnd = new Date(conflictStart);
      gapEnd.setDate(gapEnd.getDate() - 1);
      while (gapEnd.getDay() === 0 || gapEnd.getDay() === 6) {
        gapEnd.setDate(gapEnd.getDate() - 1);
      }
      if (currentStart <= gapEnd) {
        gaps.push({ startDate: currentStart, endDate: gapEnd });
      }
    }

    const nextDay = new Date(conflictEnd);
    nextDay.setDate(nextDay.getDate() + 1);
    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
      nextDay.setDate(nextDay.getDate() + 1);
    }
    if (nextDay > currentStart) {
      currentStart = nextDay;
    }
  }

  if (currentStart <= droppedEnd) {
    gaps.push({ startDate: currentStart, endDate: droppedEnd });
  }

  return gaps.filter((gap) => {
    const gapDays = eachDayOfInterval({ start: gap.startDate, end: gap.endDate });
    return gapDays.some((d) => d.getDay() !== 0 && d.getDay() !== 6);
  });
}

// Assign lane positions to spans using a greedy algorithm
function assignLanesToSpans(spans: Omit<AssignmentSpan, 'lane' | 'totalLanes'>[]): AssignmentSpan[] {
  const laneEndIndices: number[] = [];
  const result: AssignmentSpan[] = [];

  for (const span of spans) {
    let assignedLane = -1;
    for (let i = 0; i < laneEndIndices.length; i++) {
      if (laneEndIndices[i] < span.startIndex) {
        assignedLane = i;
        laneEndIndices[i] = span.endIndex;
        break;
      }
    }

    if (assignedLane === -1) {
      assignedLane = laneEndIndices.length;
      laneEndIndices.push(span.endIndex);
    }

    result.push({ ...span, lane: assignedLane, totalLanes: 0 });
  }

  const maxLanes = laneEndIndices.length;
  return result.map((span) => ({ ...span, totalLanes: maxLanes }));
}

interface SelectionBoxRange {
  start: number;
  end: number;
}

function computeContiguousRanges(indices: number[]): SelectionBoxRange[] {
  if (indices.length === 0) return [];
  const ranges: SelectionBoxRange[] = [];
  let rangeStart = indices[0];
  let rangeEnd = indices[0];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === rangeEnd + 1) {
      rangeEnd = indices[i];
    } else {
      ranges.push({ start: rangeStart, end: rangeEnd });
      rangeStart = indices[i];
      rangeEnd = indices[i];
    }
  }
  ranges.push({ start: rangeStart, end: rangeEnd });
  return ranges;
}

function computeSelectionBoxRanges(params: {
  isMemberSelected: boolean;
  isColumnSelection: boolean;
  isThisMemberDragged: boolean;
  selectedDays: Set<string>;
  weekdayKeys: string[];
  visibleStart: number;
  visibleEnd: number;
}): SelectionBoxRange[] {
  const {
    isMemberSelected,
    isColumnSelection,
    isThisMemberDragged,
    selectedDays,
    weekdayKeys,
    visibleStart,
    visibleEnd,
  } = params;

  if (isMemberSelected) {
    return [{ start: visibleStart, end: visibleEnd }];
  }

  const inColumnMode = (isColumnSelection || isThisMemberDragged) && selectedDays.size > 0;
  if (!inColumnMode) return [];

  const selectedIndices: number[] = [];
  for (let i = 0; i < weekdayKeys.length; i++) {
    if (selectedDays.has(weekdayKeys[i])) selectedIndices.push(i);
  }

  return computeContiguousRanges(selectedIndices).filter(
    (r) => r.end >= visibleStart && r.start <= visibleEnd
  );
}

// --- MemberRow: extracted + memoized to isolate re-renders per row ---
interface MemberRowProps {
  memberId: string;
  itemIndex: number;
  weekdays: Date[];
  weekdayKeys: string[];
  totalColumns: number;
  colWidth: number;
  rowHeight: number;
  zoomLevel: number;
  spans: AssignmentSpan[];
  visibleStart: number;
  visibleEnd: number;
  selectedDays: Set<string>;
  selectedMemberForDrag: string | null;
  selectedMembers: Set<string>;
  selectedAssignmentId: string | null;
  highlightedAssignmentIds: Set<string>;
  clipboardMode: 'copy' | 'cut' | null;
  clipboardAssignmentId: string | null;
  isDropTarget: boolean;
  cellPresenceMap: Map<string, CellSelection[]>;
  cellHighlightMap: Map<string, CellSelection[]>;
  assignmentPresenceMap: Map<string, AssignmentSelection[]>;
  onCellMouseDown: (memberId: string, index: number) => void;
  onCellMouseEnter: (memberId: string, index: number) => void;
  onMouseUp: () => void;
  onAssignmentClick: (assignment: Assignment, memberId: string) => void;
  onAssignmentDoubleClick: (assignment: Assignment) => void;
  onDragStart: (data: DragData) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, memberId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, memberId: string) => void;
  colorMode: ColorMode;
  requestColorMap: Map<string, string>;
  clientColorMap: Map<string, string>;
}

const MemberRow = memo(function MemberRow({
  memberId,
  itemIndex,
  weekdays,
  weekdayKeys,
  totalColumns,
  colWidth,
  rowHeight,
  zoomLevel,
  spans,
  visibleStart,
  visibleEnd,
  selectedDays,
  selectedMemberForDrag,
  selectedMembers,
  selectedAssignmentId,
  highlightedAssignmentIds,
  clipboardMode,
  clipboardAssignmentId,
  isDropTarget,
  cellPresenceMap,
  cellHighlightMap,
  assignmentPresenceMap,
  onCellMouseDown,
  onCellMouseEnter,
  onMouseUp,
  onAssignmentClick,
  onAssignmentDoubleClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  colorMode,
  requestColorMap,
  clientColorMap,
}: Readonly<MemberRowProps>) {
  // Event delegation: single handler on the row reads data-day-index from target
  const handleRowMouseDown = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-day-index]');
    if (!el) return;
    const index = Number((el as HTMLElement).dataset.dayIndex);
    if (!Number.isNaN(index)) onCellMouseDown(memberId, index);
  }, [memberId, onCellMouseDown]);

  const handleRowMouseEnter = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-day-index]');
    if (!el) return;
    const index = Number((el as HTMLElement).dataset.dayIndex);
    if (!Number.isNaN(index)) onCellMouseEnter(memberId, index);
  }, [memberId, onCellMouseEnter]);

  const handleSpanClick = useCallback((a: Assignment) => {
    onAssignmentClick(a, memberId);
  }, [memberId, onAssignmentClick]);

  const handleSpanDoubleClick = useCallback((a: Assignment) => {
    onAssignmentDoubleClick(a);
  }, [onAssignmentDoubleClick]);

  const handleRowDragOver = useCallback((e: React.DragEvent) => {
    onDragOver(e, memberId);
  }, [memberId, onDragOver]);

  const handleRowDrop = useCallback((e: React.DragEvent) => {
    onDrop(e, memberId);
  }, [memberId, onDrop]);

  const isMemberSelected = selectedMembers.has(memberId);
  const isThisMemberDragged = selectedMemberForDrag === memberId;
  const isColumnSelection = selectedMemberForDrag === null && selectedDays.size > 0;

  // Only render spans whose pixel range overlaps the visible viewport
  const visibleLeftPx = visibleStart * colWidth;
  const visibleRightPx = (visibleEnd + 1) * colWidth;
  const visibleSpans = spans.filter(
    (s) => s.leftPx + s.widthPx > visibleLeftPx && s.leftPx < visibleRightPx
  );

  const selectionBoxRanges = computeSelectionBoxRanges({
    isMemberSelected,
    isColumnSelection,
    isThisMemberDragged,
    selectedDays,
    weekdayKeys,
    visibleStart,
    visibleEnd,
  });

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={cn(
        'relative border-b border-foreground/20',
        isDropTarget && 'bg-primary/10 ring-2 ring-primary/50 ring-inset'
      )}
      style={{
        gridRow: 4 + itemIndex,
        gridColumn: `1 / span ${totalColumns}`,
        position: 'relative',
        width: totalColumns * colWidth,
        height: rowHeight,
      }}
      onDragOver={handleRowDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleRowDrop}
      onMouseDown={handleRowMouseDown}
      onMouseMove={handleRowMouseEnter}
      onMouseUp={onMouseUp}
    >
      {/* Day cells — only visible range rendered */}
      {weekdays.slice(visibleStart, visibleEnd + 1).map((day, i) => {
        const index = visibleStart + i;
        const isMonthStart = index > 0 && !isSameMonth(day, weekdays[index - 1]);
        const dayOfWeek = day.getDay();
        const isWeekStart = dayOfWeek === 1 && index > 0 && !isMonthStart;
        const dayKey = weekdayKeys[index];
        const isDaySelected =
          (isColumnSelection && selectedDays.has(dayKey)) ||
          (isThisMemberDragged && selectedDays.has(dayKey));
        const isSelected = isDaySelected || isMemberSelected;

        let boxShadow: string | undefined;
        if (isMonthStart) {
          boxShadow = 'inset 2px 0 0 0 hsl(var(--foreground))';
        } else if (isWeekStart) {
          boxShadow = 'inset 2px 0 0 0 hsl(var(--foreground) / 0.3)';
        }

        const cellKey = `${memberId}-${dayKey}`;
        const cellPresence = cellPresenceMap.get(cellKey);
        const cellHighlight = cellHighlightMap.get(cellKey);
        const highlightColor = cellHighlight?.[0]?.user.color;

        let combinedBoxShadow = boxShadow;
        if (highlightColor) {
          const highlightShadow = `inset 0 0 0 2px ${highlightColor}`;
          combinedBoxShadow = boxShadow ? `${boxShadow}, ${highlightShadow}` : highlightShadow;
        }

        return (
          <div
            role="gridcell"
            tabIndex={-1}
            key={cellKey}
            data-day-index={index}
            className={cn(
              'absolute flex flex-col cursor-pointer border-b border-r border-foreground/20 transition-all select-none focus:outline-none',
              isToday(day) && !isSelected && 'bg-primary/5',
              isSelected && 'bg-primary/20'
            )}
            style={{
              left: index * colWidth,
              width: colWidth,
              height: rowHeight,
              boxShadow: combinedBoxShadow,
            }}
          >
            {cellPresence && cellPresence.length > 0 && (
              <CellPresenceIndicator selections={cellPresence} zoomLevel={zoomLevel} />
            )}
          </div>
        );
      })}

      {/* Span overlays — only visible spans rendered */}
      {visibleSpans.map((span) => (
        <DraggableSpanBar
          key={span.assignment.id}
          span={span}
          rowHeight={rowHeight}
          memberId={memberId}
          onClick={handleSpanClick}
          onDoubleClick={handleSpanDoubleClick}
          isSelected={selectedAssignmentId === span.assignment.id}
          isHighlighted={highlightedAssignmentIds.has(span.assignment.id)}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          isCut={clipboardMode === 'cut' && clipboardAssignmentId === span.assignment.id}
          presenceUsers={assignmentPresenceMap.get(span.assignment.id)}
          zoomLevel={zoomLevel}
          colorMode={colorMode}
          requestColorMap={requestColorMap}
          clientColorMap={clientColorMap}
        />
      ))}

      {/* Row/column selection box rendered on top of spans */}
      {selectionBoxRanges.map((range) => (
        <div
          key={`sel-box-${range.start}-${range.end}`}
          className="absolute pointer-events-none border-2 border-primary/60 bg-primary/10 rounded-sm"
          style={{
            left: range.start * colWidth,
            width: (range.end - range.start + 1) * colWidth,
            top: 0,
            height: rowHeight,
            zIndex: 15,
          }}
        />
      ))}
    </div>
  );
}, (prev: Readonly<MemberRowProps>, next: Readonly<MemberRowProps>) => {
  // Custom comparator: skip expensive selectedDays comparison when this member isn't affected
  if (prev.memberId !== next.memberId) return false;
  if (prev.itemIndex !== next.itemIndex) return false;
  if (prev.colWidth !== next.colWidth) return false;
  if (prev.rowHeight !== next.rowHeight) return false;
  if (prev.zoomLevel !== next.zoomLevel) return false;
  if (prev.spans !== next.spans) return false;
  if (prev.visibleStart !== next.visibleStart) return false;
  if (prev.visibleEnd !== next.visibleEnd) return false;
  if (prev.isDropTarget !== next.isDropTarget) return false;
  if (prev.selectedAssignmentId !== next.selectedAssignmentId) return false;
  if (prev.clipboardMode !== next.clipboardMode) return false;
  if (prev.clipboardAssignmentId !== next.clipboardAssignmentId) return false;
  if (prev.cellPresenceMap !== next.cellPresenceMap) return false;
  if (prev.cellHighlightMap !== next.cellHighlightMap) return false;
  if (prev.assignmentPresenceMap !== next.assignmentPresenceMap) return false;
  if (prev.colorMode !== next.colorMode) return false;
  if (prev.requestColorMap !== next.requestColorMap) return false;
  if (prev.clientColorMap !== next.clientColorMap) return false;
  if (prev.highlightedAssignmentIds !== next.highlightedAssignmentIds) return false;

  // Only compare selectedDays/selectedMembers if this member could be affected
  const prevAffected = prev.selectedMemberForDrag === prev.memberId || prev.selectedMemberForDrag === null;
  const nextAffected = next.selectedMemberForDrag === next.memberId || next.selectedMemberForDrag === null;
  if (prevAffected || nextAffected) {
    if (prev.selectedDays !== next.selectedDays) return false;
    if (prev.selectedMemberForDrag !== next.selectedMemberForDrag) return false;
  }
  if (prev.selectedMembers !== next.selectedMembers) {
    const prevSelected = prev.selectedMembers.has(prev.memberId);
    const nextSelected = next.selectedMembers.has(next.memberId);
    if (prevSelected !== nextSelected) return false;
  }

  // Stable callbacks - compare by reference
  if (prev.onCellMouseDown !== next.onCellMouseDown) return false;
  if (prev.onCellMouseEnter !== next.onCellMouseEnter) return false;
  if (prev.onMouseUp !== next.onMouseUp) return false;
  if (prev.onAssignmentClick !== next.onAssignmentClick) return false;
  if (prev.onAssignmentDoubleClick !== next.onAssignmentDoubleClick) return false;
  if (prev.onDragStart !== next.onDragStart) return false;
  if (prev.onDragEnd !== next.onDragEnd) return false;
  if (prev.onDragOver !== next.onDragOver) return false;
  if (prev.onDragLeave !== next.onDragLeave) return false;
  if (prev.onDrop !== next.onDrop) return false;

  return true;
});

interface ScheduleViewProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export function ScheduleView({ zoomLevel, onZoomIn, onZoomOut, onZoomReset }: Readonly<ScheduleViewProps>) {
  const { hasRole, user, updateProfile } = useAuth();
  const canModifyAssignments = hasRole(Role.SCHEDULER);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [isMembersCollapsed, setIsMembersCollapsed] = useState(true);
  const {
    isRequestsPanelCollapsed,
    setIsRequestsPanelCollapsed,
    collapsedDepartments: storedCollapsedDepts,
    setCollapsedDepartments: setStoredCollapsedDepts,
    colorMode,
    memberSortBy,
    setMemberSortBy,
    departmentSortBy,
    setDepartmentSortBy,
    initSortFromPreferences,
  } = useScheduleViewStore();

  const handleMemberSortChange = (value: string) => {
    const sort = value as MemberSortBy;
    setMemberSortBy(sort);
    updateProfile({ preferences: { ...(user?.preferences), scheduleMemberSortBy: sort } });
  };

  const handleDepartmentSortChange = (value: string) => {
    const sort = value as DepartmentSortBy;
    setDepartmentSortBy(sort);
    updateProfile({ preferences: { ...(user?.preferences), scheduleDepartmentSortBy: sort } });
  };
  const collapsedDepartments = useMemo(() => new Set(storedCollapsedDepts), [storedCollapsedDepts]);
  const [collapsedManagerIds, setCollapsedManagerIds] = useState<Set<string>>(new Set());
  const [memberColWidth, setMemberColWidth] = useState(DEFAULT_memberColWidth);
  const [isResizingColumn, setIsResizingColumn] = useState(false);

  // Initialize sort preferences from user's DB preferences on load
  useEffect(() => {
    if (user?.preferences) {
      initSortFromPreferences(user.preferences);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Grid ref with callback to trigger effect re-runs when grid mounts
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gridMounted, setGridMounted] = useState(false);
  const gridCallbackRef = useCallback((node: HTMLDivElement | null) => {
    gridRef.current = node;
    setGridMounted(!!node);
  }, []);

  // Zoom derived values
  const colWidth = Math.round(BASE_COL_WIDTH * zoomLevel);
  const collapsedRowHeight = Math.round(32 * zoomLevel);
  const expandedRowHeight = Math.max(Math.round(56 * zoomLevel), 32);
  const deptHeaderHeight = Math.round(32 * zoomLevel);
  const zoomedRowHeight = isMembersCollapsed ? collapsedRowHeight : expandedRowHeight;

  // Cell presence for collaborative selection display
  const scheduleRoomId = useMemo(() => {
    return `schedule:main`;
  }, []);

  const {
    otherSelections,
    otherAssignmentSelections,
    broadcastSelection,
    clearSelection: clearPresence,
    broadcastAssignmentSelection,
    clearAssignmentSelection: clearAssignmentPresence,
  } = useCellPresence({
    scheduleRoomId,
    enabled: true,
  });

  // Undo/redo for assignment changes
  const { recordDeletion, recordUpdate, recordCreation, undo } = useScheduleUndoRedo();
  // Subscribe directly to undoStack to ensure re-render when stack changes from other components
  const canUndo = useUndoRedoStore((state) => state.undoStack.length > 0);

  // Auto-collapse requests panel on small screens
  useEffect(() => {
    const mediaQuery = globalThis.matchMedia('(max-width: 767px)'); // Below md breakpoint

    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setIsRequestsPanelCollapsed(true);
      }
    };

    // Check initial state
    handleMediaChange(mediaQuery);

    // Listen for changes
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  // Zoom: Ctrl+Scroll wheel
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const scrollXRatio = el.scrollWidth > el.clientWidth
        ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth
        : 0;
      const scrollYRatio = el.scrollHeight > el.clientHeight
        ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight
        : 0;

      if (e.deltaY < 0) {
        onZoomIn();
      } else {
        onZoomOut();
      }

      requestAnimationFrame(() => {
        el.scrollLeft = scrollXRatio * el.scrollWidth - el.clientWidth / 2;
        el.scrollTop = scrollYRatio * el.scrollHeight - el.clientHeight / 2;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [onZoomIn, onZoomOut, gridMounted]);

  // Zoom: Keyboard shortcuts (Ctrl+Plus, Ctrl+Minus, Ctrl+0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          onZoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          onZoomOut();
        } else if (e.key === '0') {
          e.preventDefault();
          onZoomReset();
        }
      }
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [onZoomIn, onZoomOut, onZoomReset]);

  // Column resize handling
  const resizeStartXRef = useRef<number>(0);
  const resizeStartWidthRef = useRef<number>(0);

  useEffect(() => {
    if (!isResizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartXRef.current;
      const newWidth = Math.min(
        MAX_MEMBER_COL_WIDTH,
        Math.max(MIN_MEMBER_COL_WIDTH, resizeStartWidthRef.current + delta)
      );
      setMemberColWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingColumn(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingColumn]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = memberColWidth;
    setIsResizingColumn(true);
  }, [memberColWidth]);

  // Drag selection state for member row cells
  const [isDragging, setIsDragging] = useState(false);
  const [selectedMemberForDrag, setSelectedMemberForDrag] = useState<string | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);

  // Header hover state (for showing column selection "+" button)
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const headerHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHeaderMouseEnter = useCallback(() => {
    if (headerHoverTimeoutRef.current) {
      clearTimeout(headerHoverTimeoutRef.current);
      headerHoverTimeoutRef.current = null;
    }
    setIsHeaderHovered(true);
  }, []);
  const onHeaderMouseLeave = useCallback(() => {
    headerHoverTimeoutRef.current = globalThis.setTimeout(() => {
      setIsHeaderHovered(false);
    }, 50);
  }, []);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMemberProfileModal, setShowMemberProfileModal] = useState(false);
  const [selectedMemberForProfile, setSelectedMemberForProfile] = useState<string | null>(null);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const [requestDetailId, setRequestDetailId] = useState<string | null>(null);
  const [showRequestDetailModal, setShowRequestDetailModal] = useState(false);

  // Selected assignment state (for delete button - click to select)
  // In span mode: single assignment selection
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedAssignmentMemberId, setSelectedAssignmentMemberId] = useState<string | null>(null);

  // Highlight request's assignments state (for highlighter button in RequestCard)
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);

  // Drag-and-drop state for Select mode
  const [draggedAssignment, setDraggedAssignment] = useState<DragData | null>(null);
  const [dropTargetMemberId, setDropTargetMemberId] = useState<string | null>(null);

  // Week highlighting state during drag (for week-to-week moves)
  const [dragTargetDayIndex, setDragTargetDayIndex] = useState<number | null>(null);

  // Clipboard state for copy/cut/paste
  const [clipboardAssignment, setClipboardAssignment] = useState<Assignment | null>(null);
  const [clipboardSourceMemberId, setClipboardSourceMemberId] = useState<string | null>(null);
  const [clipboardMode, setClipboardMode] = useState<'copy' | 'cut' | null>(null);

  // Conflict modal state
  const [conflictModalState, setConflictModalState] = useState<{
    open: boolean;
    droppedAssignment: Assignment | null;
    sourceMemberId: string | null;
    targetMemberId: string | null;
    targetMemberName: string;
    conflictingAssignments: Assignment[];
    gaps: Array<{ startDate: Date; endDate: Date }>;
    // For week-to-week moves: store new dates
    newStartDate?: string;
    newEndDate?: string;
  } | null>(null);
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);

  // Delete mutation
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: string) => api.delete(`/assignments/${assignmentId}`),
    onMutate: (assignmentId: string) => {
      // Optimistically remove from cache immediately
      removeAssignmentFromCache(queryClient, assignmentId);
      setSelectedAssignment(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
      setIsDeleting(false);
    },
    onError: () => {
      // Refetch to restore the assignment if delete failed
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      setIsDeleting(false);
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { startDate?: string; endDate?: string; memberIds?: string[] } }) =>
      api.put(`/assignments/${id}`, data),
    onMutate: ({ id, data }) => {
      const oldDates = findAssignmentDatesInCache(queryClient, id);
      const oldMemberIds = findAssignmentMemberIdsInCache(queryClient, id);
      const newDates = (data.startDate && data.endDate)
        ? { startDate: data.startDate, endDate: data.endDate }
        : null;
      return { oldDates, newDates, oldMemberIds, newMemberIds: data.memberIds };
    },
    onSuccess: (_data, _vars, context) => {
      const ranges: Array<{ startDate: string; endDate: string }> = [];
      if (context?.oldDates) ranges.push(context.oldDates);
      if (context?.newDates) ranges.push(context.newDates);
      const affectedMemberIds = [...new Set([
        ...(context?.oldMemberIds || []),
        ...(context?.newMemberIds || []),
      ])];
      if (ranges.length > 0) {
        refreshScheduleCache(queryClient, ranges, affectedMemberIds.length > 0 ? affectedMemberIds : undefined);
      } else {
        queryClient.invalidateQueries({ queryKey: ['schedule'] });
      }
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['request'] });
      setIsDeleting(false);
      setSelectedAssignment(null);
    },
    onError: () => {
      setIsDeleting(false);
    },
  });

  // Create mutation for splitting assignments and copy-paste
  const createAssignmentMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      startDate: string;
      endDate: string;
      projectTypeId: string;
      memberIds: string[];
      requestId?: string;
      formatterIds?: string[];
      projectRoleIds?: string[];
    }) => api.post('/assignments', data),
    onSuccess: (_data, variables) => {
      refreshScheduleCache(queryClient, [{ startDate: variables.startDate, endDate: variables.endDate }], variables.memberIds);
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['request'] });
    },
  });

  // Mutation for updating assignment display status (for non-request assignments)
  const updateDisplayStatusMutation = useMutation({
    mutationFn: ({ id, displayStatus }: { id: string; displayStatus: DisplayStatus }) =>
      api.put(`/assignments/${id}`, { displayStatus }),
    onSuccess: (_data, variables) => {
      setShowStatusPopover(false);
      // Optimistically update the selected assignment
      if (selectedAssignment?.id === variables.id) {
        setSelectedAssignment({
          ...selectedAssignment,
          displayStatus: variables.displayStatus,
        });
      }
      // Optimistically update the assignment in all schedule query caches
      const scheduleEntries = queryClient.getQueriesData<{ data: { assignments: Assignment[]; members: unknown[]; dateRange: { startDate: string; endDate: string } } }>({
        queryKey: ['schedule'],
      });
      for (const [queryKey, cachedData] of scheduleEntries) {
        if (!cachedData) continue;
        const idx = cachedData.data.assignments.findIndex((a) => a.id === variables.id);
        if (idx === -1) continue;
        const updated = { ...cachedData.data.assignments[idx], displayStatus: variables.displayStatus };
        const newAssignments = [...cachedData.data.assignments];
        newAssignments[idx] = updated;
        queryClient.setQueryData(queryKey, {
          ...cachedData,
          data: { ...cachedData.data, assignments: newAssignments },
        });
      }
    },
  });

  // Mutation for updating request status from keyboard shortcut
  const updateRequestStatusMutation = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: RequestStatus }) =>
      api.put(`/requests/${requestId}`, { status }),
    onSuccess: (_data, variables) => {
      // Update only linked assignments in the schedule cache (no full calendar refetch)
      updateRequestStatusInCache(queryClient, variables.requestId, variables.status);
      // Update selected assignment state so the UI reflects immediately
      if (selectedAssignment?.requestId === variables.requestId && selectedAssignment?.request) {
        setSelectedAssignment({
          ...selectedAssignment,
          request: { ...selectedAssignment.request, status: variables.status },
        });
      }
      // Update request status directly in paginated caches (no network requests)
      updateRequestStatusInPaginatedCache(queryClient, variables.requestId, variables.status);
    },
  });

  // Handle click on assignment to select it
  const handleAssignmentClick = useCallback(
    (assignment: Assignment | null, _day: Date | null, memberId?: string) => {
      // Toggle single assignment selection
      if (selectedAssignment?.id === assignment?.id) {
        setSelectedAssignment(null);
        setSelectedAssignmentMemberId(null);
        clearAssignmentPresence();
      } else {
        setSelectedAssignment(assignment);
        setSelectedAssignmentMemberId(memberId || null);
        // Clear any cell selection when selecting an assignment
        setSelectedDays(new Set());
        setSelectedMemberForDrag(null);
        clearPresence();
        // Broadcast assignment selection to other users
        if (assignment) {
          broadcastAssignmentSelection(assignment.id, memberId || null);
        }
      }
    },
    [selectedAssignment, broadcastAssignmentSelection, clearAssignmentPresence]
  );

  // Stable callback for MemberRow: (assignment, memberId) signature
  const handleAssignmentClickForRow = useCallback(
    (assignment: Assignment, memberId: string) => {
      handleAssignmentClick(assignment, null, memberId);
    },
    [handleAssignmentClick]
  );

  // Double-click on assignment: open request detail modal for linked requests
  const handleAssignmentDoubleClick = useCallback(
    (assignment: Assignment) => {
      if (assignment.requestId) {
        setRequestDetailId(assignment.requestId);
        setShowRequestDetailModal(true);
      }
    },
    []
  );

  // Clear assignment selection
  const clearAssignmentSelection = useCallback(() => {
    setSelectedAssignment(null);
    setSelectedAssignmentMemberId(null);
    clearAssignmentPresence();
  }, [clearAssignmentPresence]);

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const toggleWeekSelection = (startIndex: number, dayCount: number) => {
    const weekDayKeys = weekdayKeys.slice(startIndex, startIndex + dayCount);

    // Clear member selection to indicate column selection mode (all members)
    setSelectedMemberForDrag(null);

    setSelectedDays((prev) => {
      const newSet = new Set(prev);
      const allSelected = weekDayKeys.every((key) => newSet.has(key));

      if (allSelected) {
        // Deselect all days in the week
        weekDayKeys.forEach((key) => newSet.delete(key));
      } else {
        // Select all days in the week
        weekDayKeys.forEach((key) => newSet.add(key));
      }
      return newSet;
    });
  };

  // Persistent schedule view state
  const {
    lastViewedMonth,
    savedMonthsBefore,
    savedMonthsAfter,
    setLastViewedMonth,
    setSavedRange,
  } = useScheduleViewStore();

  // Infinite scroll month range (restore from store if available)
  const [monthsBefore, setMonthsBefore] = useState(savedMonthsBefore ?? 1);
  const [monthsAfter, setMonthsAfter] = useState(savedMonthsAfter ?? 1);
  const baseMonth = useMemo(() => startOfMonth(new Date()), []);
  const rangeStart = useMemo(() => subMonths(baseMonth, monthsBefore), [baseMonth, monthsBefore]);
  const rangeEnd = useMemo(() => endOfMonth(addMonths(baseMonth, monthsAfter)), [baseMonth, monthsAfter]);

  // Use date-only strings to avoid timezone issues (must match format used when creating assignments)
  const startDateStr = format(rangeStart, 'yyyy-MM-dd');
  const endDateStr = format(rangeEnd, 'yyyy-MM-dd');

  // Generate per-month query params for optimistic scroll loading
  const monthsToLoad = useMemo(() => {
    const months: Array<{ startDate: string; endDate: string }> = [];
    for (let i = -monthsBefore; i <= monthsAfter; i++) {
      const m = addMonths(baseMonth, i);
      months.push({
        startDate: format(startOfMonth(m), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(m), 'yyyy-MM-dd'),
      });
    }
    return months;
  }, [baseMonth, monthsBefore, monthsAfter]);

  // MEMBERs can only see SCHEDULED assignments; the server ignores this flag for them,
  // but we send false to keep the request honest about intent.
  const includeUnscheduledAndForecasts = user?.role !== Role.MEMBER;

  // Per-user MEMBER schedule visibility filter (no-op for non-MEMBER or mode === ALL)
  const scheduleFilter = useResolvedScheduleFilter();
  const memberIdsParam = scheduleFilter.filtered ? scheduleFilter.memberIds.join(',') : null;
  const skipFetch = scheduleFilter.filtered && scheduleFilter.memberIds.length === 0;

  // Fetch each month independently so new months load without refetching existing ones
  const monthQueries = useQueries({
    queries: monthsToLoad.map(month => ({
      queryKey: ['schedule', month.startDate, month.endDate, includeUnscheduledAndForecasts, memberIdsParam],
      queryFn: () =>
        api.get<ScheduleData>('/assignments/calendar', {
          startDate: month.startDate,
          endDate: month.endDate,
          includeUnscheduledAndForecasts: String(includeUnscheduledAndForecasts),
          ...(memberIdsParam ? { memberIds: memberIdsParam } : {}),
        }),
      staleTime: 5 * 60 * 1000,
      enabled: !skipFetch,
    })),
  });

  // Stable dependency: only recompute merge when actual query data changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryDataVersion = monthQueries.map(q => q.dataUpdatedAt).join(',');

  // Merge all month data into a single dataset (deduplicated)
  const data: ScheduleData | undefined = useMemo(() => {
    const assignmentMap = new Map<string, Assignment>();
    const memberMap = new Map<string, CalendarMember>();
    let hasAnyData = false;

    for (const query of monthQueries) {
      if (!query.data?.data) continue;
      hasAnyData = true;
      for (const assignment of query.data.data.assignments) {
        assignmentMap.set(assignment.id, assignment);
      }
      for (const member of query.data.data.members) {
        memberMap.set(member.id, member);
      }
    }

    if (!hasAnyData) return undefined;

    return {
      data: {
        assignments: Array.from(assignmentMap.values()),
        members: Array.from(memberMap.values()),
        dateRange: { startDate: startDateStr, endDate: endDateStr },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDataVersion, startDateStr, endDateStr]);

  const isLoading = monthQueries.every(q => q.isLoading);
  const isFetching = monthQueries.some(q => q.isFetching);

  // Compute set of highlighted assignment IDs (for highlighter feature)
  const highlightedAssignmentIds = useMemo(() => {
    if (!highlightedRequestId || !data?.data.assignments) return new Set<string>();
    return new Set(
      data.data.assignments
        .filter((a) => a.requestId === highlightedRequestId)
        .map((a) => a.id)
    );
  }, [highlightedRequestId, data?.data.assignments]);

  // Compute unique request color map for 'request' color mode
  const requestColorMap = useMemo(() => {
    if (colorMode !== 'assignment' || !data?.data.assignments) return new Map<string, string>();
    const requestIds = Array.from(
      new Set(
        data.data.assignments
          .map((a) => a.requestId ?? a.request?.id)
          .filter((id): id is string => !!id)
      )
    );
    return generateRequestColors(requestIds);
  }, [colorMode, data?.data.assignments]);

  // Compute unique client color map for 'client' color mode
  const clientColorMap = useMemo(() => {
    if (colorMode !== 'client' || !data?.data.assignments) return new Map<string, string>();
    const clientNames = Array.from(
      new Set(
        data.data.assignments
          .map((a) => a.request?.clientName)
          .filter((name): name is string => !!name)
      )
    );
    return generateClientColors(clientNames);
  }, [colorMode, data?.data.assignments]);

  // Handler to toggle highlight for a request's assignments
  const handleHighlightRequest = useCallback((requestId: string) => {
    setHighlightedRequestId((prev) => (prev === requestId ? null : requestId));
  }, []);

  // Get all weekdays in the loaded range
  const weekdays = useMemo(() => {
    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
    return days.filter((day) => !isWeekend(day));
  }, [rangeStart, rangeEnd]);

  // Pre-computed day keys in yyyy-MM-dd format (timezone-safe, matches API format)
  const weekdayKeys = useMemo(() => weekdays.map(d => format(d, 'yyyy-MM-dd')), [weekdays]);

  // Reverse lookup: day key string -> weekday index (eliminates O(n) findIndex calls)
  const weekdayKeyToIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < weekdayKeys.length; i++) {
      map.set(weekdayKeys[i], i);
    }
    return map;
  }, [weekdayKeys]);

  // Infinite scroll: refs for scroll management
  const scrollLoadCooldownRef = useRef(false);
  const isLoadingLeftRef = useRef(false);
  const prevWeekdayCountRef = useRef(0);
  const hasInitialScrollRef = useRef(false);

  // Load more months when scrolling near edges
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (scrollLoadCooldownRef.current) return;

      const threshold = colWidth * 10;

      // Near right edge - load next month
      if (el.scrollLeft + el.clientWidth > el.scrollWidth - threshold) {
        if (monthsAfter < 12) {
          scrollLoadCooldownRef.current = true;
          setMonthsAfter(prev => prev + 1);
          setTimeout(() => { scrollLoadCooldownRef.current = false; }, 250);
        }
      }

      // Near left edge - load previous month
      if (el.scrollLeft < threshold) {
        if (monthsBefore < 12) {
          scrollLoadCooldownRef.current = true;
          isLoadingLeftRef.current = true;
          prevWeekdayCountRef.current = weekdays.length;
          setMonthsBefore(prev => prev + 1);
          setTimeout(() => { scrollLoadCooldownRef.current = false; }, 250);
        }
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [colWidth, monthsAfter, monthsBefore, weekdays.length, gridMounted]);

  // Track which month is visible at the center of the viewport
  useEffect(() => {
    const el = gridRef.current;
    if (!el || weekdays.length === 0) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const centerX = el.scrollLeft + el.clientWidth / 2 - memberColWidth;
        const dayIndex = Math.floor(centerX / colWidth);
        const clampedIndex = Math.max(0, Math.min(dayIndex, weekdays.length - 1));
        const centerDate = weekdays[clampedIndex];
        if (centerDate) {
          setLastViewedMonth(format(startOfMonth(centerDate), 'yyyy-MM-dd'));
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [weekdays, colWidth, memberColWidth, setLastViewedMonth]);

  // Column virtualization: track which columns are visible in the viewport
  const COLUMN_OVERSCAN = 15;
  const [visibleColStart, setVisibleColStart] = useState(0);
  const [visibleColEnd, setVisibleColEnd] = useState(50);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || weekdays.length === 0) return;

    const updateVisibleRange = () => {
      const scrollLeft = el.scrollLeft;
      const viewportWidth = el.clientWidth;
      const start = Math.max(0, Math.floor(scrollLeft / colWidth) - COLUMN_OVERSCAN);
      const end = Math.min(weekdays.length - 1, Math.ceil((scrollLeft + viewportWidth) / colWidth) + COLUMN_OVERSCAN);
      setVisibleColStart(start);
      setVisibleColEnd(end);
    };

    updateVisibleRange();
    el.addEventListener('scroll', updateVisibleRange, { passive: true });
    return () => el.removeEventListener('scroll', updateVisibleRange);
  }, [colWidth, weekdays.length, gridMounted]);

  // Save month range to store on unmount
  useEffect(() => {
    return () => {
      setSavedRange(monthsBefore, monthsAfter);
    };
  }, [monthsBefore, monthsAfter, setSavedRange]);

  // Preserve scroll position when prepending months (left scroll)
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el || !isLoadingLeftRef.current || prevWeekdayCountRef.current === 0) return;

    const addedDays = weekdays.length - prevWeekdayCountRef.current;
    if (addedDays > 0) {
      el.scrollLeft += addedDays * colWidth;
    }
    isLoadingLeftRef.current = false;
    prevWeekdayCountRef.current = 0;
  }, [weekdays.length, colWidth]);

  // Scroll to saved month (or current month) on initial load
  useLayoutEffect(() => {
    if (hasInitialScrollRef.current || weekdays.length === 0) return;
    const el = gridRef.current;
    if (!el) return;

    let targetMonth: { month: number; year: number };

    if (lastViewedMonth) {
      const [year, month] = lastViewedMonth.split('-').map(Number);
      targetMonth = { month: month - 1, year };
    } else {
      const now = new Date();
      targetMonth = { month: now.getMonth(), year: now.getFullYear() };
    }

    const idx = weekdays.findIndex(d =>
      d.getMonth() === targetMonth.month &&
      d.getFullYear() === targetMonth.year
    );

    if (idx > 0) {
      el.scrollLeft = idx * colWidth;
    }
    hasInitialScrollRef.current = true;
  }, [weekdays, colWidth, gridMounted, lastViewedMonth]);

  // Sort members hierarchically by manager (filtering out hidden members)
  const sortedMemberItems = useMemo(() => {
    if (!data?.data.members) return [];
    // Filter out members marked as hidden from schedule
    const visibleMembers = data.data.members.filter(
      (member) => !member.metadata?.hideFromSchedule
    );
    return sortMembersHierarchically(visibleMembers, collapsedManagerIds, collapsedDepartments, memberSortBy, departmentSortBy);
  }, [data?.data.members, collapsedManagerIds, collapsedDepartments, memberSortBy, departmentSortBy]);

  // Memoized lookup for other users' presence indicators (bubble on last/rightmost cell only)
  // and selection highlights (all selected cells)
  const { cellPresenceMap, cellHighlightMap } = useMemo(() => {
    const presenceMap = new Map<string, CellSelection[]>();
    const highlightMap = new Map<string, CellSelection[]>();

    const addToMap = (map: Map<string, CellSelection[]>, key: string, selection: CellSelection) => {
      const existing = map.get(key) ?? [];
      existing.push(selection);
      map.set(key, existing);
    };

    const firstMemberItem = sortedMemberItems.find(i => i.type === 'member');
    const memberItems = sortedMemberItems.filter(i => i.type === 'member');

    const processColumnMode = (selection: CellSelection, dayIso: string, isLastDay: boolean) => {
      for (const item of memberItems) {
        const cellKey = `${item.id}-${dayIso}`;
        addToMap(highlightMap, cellKey, selection);
        if (isLastDay && item === firstMemberItem) {
          addToMap(presenceMap, cellKey, selection);
        }
      }
    };

    const processRowMode = (selection: CellSelection, dayIso: string, isLastDay: boolean) => {
      const cellKey = `${selection.selectedMemberId}-${dayIso}`;
      addToMap(highlightMap, cellKey, selection);
      if (isLastDay) {
        addToMap(presenceMap, cellKey, selection);
      }
    };

    for (const selection of otherSelections.values()) {
      const sortedDays = [...selection.selectedDays].sort((a, b) => a.localeCompare(b));
      const lastDayIso = sortedDays.at(-1);

      for (const dayIso of selection.selectedDays) {
        const isLastDay = dayIso === lastDayIso;
        if (selection.selectedMemberId === null) {
          processColumnMode(selection, dayIso, isLastDay);
        } else {
          processRowMode(selection, dayIso, isLastDay);
        }
      }
    }

    return { cellPresenceMap: presenceMap, cellHighlightMap: highlightMap };
  }, [otherSelections, sortedMemberItems]);

  // Memoized lookup for other users' assignment selections
  const assignmentPresenceMap = useMemo(() => {
    const presenceMap = new Map<string, AssignmentSelection[]>();

    for (const selection of otherAssignmentSelections.values()) {
      const existing = presenceMap.get(selection.assignmentId) ?? [];
      existing.push(selection);
      presenceMap.set(selection.assignmentId, existing);
    }

    return presenceMap;
  }, [otherAssignmentSelections]);

  // Toggle manager collapse state
  const toggleManagerCollapse = useCallback((managerId: string) => {
    setCollapsedManagerIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(managerId)) {
        newSet.delete(managerId);
      } else {
        newSet.add(managerId);
      }
      return newSet;
    });
  }, []);

  // Toggle department collapse state
  const toggleDepartmentCollapse = useCallback((department: string) => {
    const newSet = new Set(collapsedDepartments);
    if (newSet.has(department)) {
      newSet.delete(department);
    } else {
      newSet.add(department);
    }
    setStoredCollapsedDepts([...newSet]);
  }, [collapsedDepartments, setStoredCollapsedDepts]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (!selectedAssignment) return;
    if (isLockedAssignment(selectedAssignment)) return;
    setIsDeleting(true);
    recordDeletion(selectedAssignment);
    deleteAssignmentMutation.mutate(selectedAssignment.id);
  }, [selectedAssignment, deleteAssignmentMutation, recordDeletion]);

  // Compute selected date range for modal
  const selectedDateRange = useMemo(() => {
    if (selectedDays.size === 0) return null;

    const dates = Array.from(selectedDays).map((d) => parseLocalDate(d));
    dates.sort((a, b) => a.getTime() - b.getTime());

    return {
      startDate: dates[0],
      endDate: dates.at(-1)!,
    };
  }, [selectedDays]);

  // Get selected member info for modal
  const selectedMember = useMemo(() => {
    if (!selectedMemberForDrag || !data?.data.members) return null;
    return data.data.members.find((m) => m.id === selectedMemberForDrag) || null;
  }, [selectedMemberForDrag, data?.data.members]);

  // Check if any assignments exist in the selected cells
  const hasAssignmentsInSelection = useMemo(() => {
    if (!selectedMemberForDrag || selectedDays.size === 0 || !data?.data.assignments) {
      return false;
    }

    // Check each selected day for assignments
    for (const dayStr of selectedDays) {
      const day = parseLocalDate(dayStr);
      const assignments = data.data.assignments.filter((assignment) => {
        const start = parseLocalDate(assignment.startDate);
        const end = parseLocalDate(assignment.endDate);
        const isMemberAssigned = assignment.members.some((m) => m.member.id === selectedMemberForDrag);
        return isMemberAssigned && isSameDateOrAfter(day, start) && isSameDateOrBefore(day, end);
      });
      if (assignments.length > 0) return true;
    }
    return false;
  }, [selectedMemberForDrag, selectedDays, data?.data.assignments]);

  // Calculate position for the "+" button
  const selectionButtonPosition = useMemo(() => {
    if (!selectedMemberForDrag || selectedDays.size === 0 || sortedMemberItems.length === 0 || hasAssignmentsInSelection) {
      return null;
    }

    // Convert selectedDays to indices
    const selectedIndices = Array.from(selectedDays)
      .map((dayKey) => weekdayKeyToIndex.get(dayKey) ?? -1)
      .filter((idx) => idx !== -1);

    if (selectedIndices.length === 0) return null;

    const maxIndex = Math.max(...selectedIndices);
    // Find the item index in sortedMemberItems (includes department headers)
    const itemIndex = sortedMemberItems.findIndex((item) => item.type === 'member' && item.id === selectedMemberForDrag);
    if (itemIndex === -1) return null;

    const headerHeight = 104; // 6.5rem = 104px
    // Calculate top position by summing heights of all rows before this one
    let topOffset = headerHeight;
    for (let i = 0; i < itemIndex; i++) {
      const item = sortedMemberItems[i];
      topOffset += item.type === 'department' ? deptHeaderHeight : zoomedRowHeight;
    }

    return {
      left: memberColWidth + (maxIndex + 1) * colWidth, // Position at right edge of rightmost cell
      top: topOffset - 4, // Position at top of cell
    };
  }, [selectedDays, selectedMemberForDrag, weekdayKeyToIndex, sortedMemberItems, isMembersCollapsed, hasAssignmentsInSelection, deptHeaderHeight, zoomedRowHeight, colWidth]);

  // Calculate position for the "+" button when in column selection mode (header click)
  const columnSelectionMaxDayIndex = useMemo(() => {
    if (selectedMemberForDrag !== null || selectedDays.size === 0) return -1;
    const selectedIndices = Array.from(selectedDays)
      .map((dayKey) => weekdayKeyToIndex.get(dayKey) ?? -1)
      .filter((idx) => idx !== -1);
    if (selectedIndices.length === 0) return -1;
    return Math.max(...selectedIndices);
  }, [selectedDays, selectedMemberForDrag, weekdayKeyToIndex]);

  // Drag selection handlers for member row cells
  const handleCellMouseDown = useCallback((memberId: string, dayIndex: number) => {
    // Clear any selected assignment when starting a new cell selection
    clearAssignmentSelection();
    setIsDragging(true);
    setSelectedMemberForDrag(memberId);
    dragStartIndexRef.current = dayIndex;
    // Clear previous selection and start fresh with this member and day
    const newSelection = new Set([weekdayKeys[dayIndex]]);
    setSelectedDays(newSelection);
    // Broadcast selection to other users
    broadcastSelection(newSelection, memberId);
  }, [weekdayKeys, clearAssignmentSelection, broadcastSelection]);

  const handleCellMouseEnter = useCallback((memberId: string, dayIndex: number) => {
    // Only continue drag if we're dragging and on the same member row
    if (!isDragging || dragStartIndexRef.current === null || memberId !== selectedMemberForDrag) return;

    const startIdx = Math.min(dragStartIndexRef.current, dayIndex);
    const endIdx = Math.max(dragStartIndexRef.current, dayIndex);

    const newSelection = new Set<string>();
    for (let i = startIdx; i <= endIdx; i++) {
      newSelection.add(weekdayKeys[i]);
    }
    setSelectedDays(newSelection);
    // Broadcast updated selection to other users
    broadcastSelection(newSelection, selectedMemberForDrag);
  }, [isDragging, weekdayKeys, selectedMemberForDrag, broadcastSelection]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Clear all selection
  const clearSelection = useCallback(() => {
    setSelectedDays(new Set());
    setSelectedMemberForDrag(null);
    setIsDragging(false);
    // Clear presence for other users
    clearPresence();
  }, [clearPresence]);

  // Copy handler - copy selected assignment to clipboard
  const handleCopy = useCallback(() => {
    if (!selectedAssignment || !selectedAssignmentMemberId) return;
    setClipboardAssignment(selectedAssignment);
    setClipboardSourceMemberId(selectedAssignmentMemberId);
    setClipboardMode('copy');
  }, [selectedAssignment, selectedAssignmentMemberId]);

  // Cut handler - cut selected assignment to clipboard
  const handleCut = useCallback(() => {
    if (!selectedAssignment || !selectedAssignmentMemberId) return;
    setClipboardAssignment(selectedAssignment);
    setClipboardSourceMemberId(selectedAssignmentMemberId);
    setClipboardMode('cut');
  }, [selectedAssignment, selectedAssignmentMemberId]);

  // Right-click to deselect all
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    clearSelection();
    clearAssignmentSelection();
  }, [clearSelection, clearAssignmentSelection]);

  // Handler for clicking on day header to select that column for all members
  const handleDayHeaderClick = useCallback((dayIndex: number) => {
    const dayKey = weekdayKeys[dayIndex];

    // Clear member selection to indicate column selection mode (all members)
    setSelectedMemberForDrag(null);

    // Toggle the day in the selection
    setSelectedDays((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dayKey)) {
        newSet.delete(dayKey);
      } else {
        newSet.add(dayKey);
      }
      return newSet;
    });
  }, [weekdayKeys]);

  // Global mouse up listener to handle mouse release outside calendar
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    globalThis.addEventListener('mouseup', handleGlobalMouseUp);
    return () => globalThis.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);


  // Detect conflicts when dropping an assignment on a new member
  const detectConflicts = useCallback(
    (droppedAssignment: Assignment, targetMemberId: string) => {
      if (!data?.data.assignments) {
        return { hasConflict: false, conflictingAssignments: [] as Assignment[], gaps: [] as Array<{ startDate: Date; endDate: Date }> };
      }

      const droppedStart = parseLocalDate(droppedAssignment.startDate);
      const droppedEnd = parseLocalDate(droppedAssignment.endDate);

      const conflicting = data.data.assignments.filter((assignment) => {
        if (assignment.id === droppedAssignment.id) return false;
        const isMemberAssigned = assignment.members.some((m) => m.member.id === targetMemberId);
        if (!isMemberAssigned) return false;
        const start = parseLocalDate(assignment.startDate);
        const end = parseLocalDate(assignment.endDate);
        return isSameDateOrBefore(start, droppedEnd) && isSameDateOrAfter(end, droppedStart);
      });

      if (conflicting.length === 0) {
        return {
          hasConflict: false,
          conflictingAssignments: [] as Assignment[],
          gaps: [{ startDate: droppedStart, endDate: droppedEnd }],
        };
      }

      return {
        hasConflict: true,
        conflictingAssignments: conflicting,
        gaps: calculateScheduleGaps(droppedStart, droppedEnd, conflicting),
      };
    },
    [data?.data.assignments]
  );

  // Execute reassignment with optional date changes (for week-to-week moves)
  const executeReassignmentWithDates = useCallback(
    (
      assignment: Assignment,
      sourceMemberId: string,
      targetMemberId: string,
      newStartDate?: string,
      newEndDate?: string
    ) => {
      // Record the original state for undo
      recordUpdate(assignment);

      const currentMemberIds = assignment.members.map((m) => m.member.id);
      const newMemberIds = currentMemberIds
        .filter((id) => id !== sourceMemberId)
        .concat(targetMemberId);

      const uniqueMemberIds = [...new Set(newMemberIds)];

      const updateData: { memberIds: string[]; startDate?: string; endDate?: string } = {
        memberIds: uniqueMemberIds,
      };

      if (newStartDate) updateData.startDate = newStartDate;
      if (newEndDate) updateData.endDate = newEndDate;

      updateAssignmentMutation.mutate({
        id: assignment.id,
        data: updateData,
      });
    },
    [updateAssignmentMutation, recordUpdate]
  );

  // Handle assignment drop with optional date changes (for week-to-week moves)
  const handleAssignmentDropWithDates = useCallback(
    (
      assignment: Assignment,
      sourceMemberId: string,
      targetMemberId: string,
      newStartDate?: string,
      newEndDate?: string
    ) => {
      // Create a modified assignment with new dates for conflict detection
      const modifiedAssignment = newStartDate && newEndDate
        ? { ...assignment, startDate: newStartDate, endDate: newEndDate }
        : assignment;

      const conflictInfo = detectConflicts(modifiedAssignment, targetMemberId);

      if (conflictInfo.hasConflict) {
        // Show conflict resolution modal with date change context
        const targetMember = data?.data.members.find((m) => m.id === targetMemberId);
        setConflictModalState({
          open: true,
          droppedAssignment: modifiedAssignment, // Use modified assignment for display
          sourceMemberId,
          targetMemberId,
          targetMemberName: targetMember ? `${targetMember.firstName} ${targetMember.lastName}` : 'Unknown',
          conflictingAssignments: conflictInfo.conflictingAssignments,
          gaps: conflictInfo.gaps,
          // Store date changes for conflict resolution handlers
          newStartDate,
          newEndDate,
        });
      } else {
        // No conflict - directly reassign with date changes
        executeReassignmentWithDates(assignment, sourceMemberId, targetMemberId, newStartDate, newEndDate);
      }
    },
    [detectConflicts, executeReassignmentWithDates, data?.data.members]
  );

  // Paste handler - paste clipboard assignment to selected cell's week/member
  // If an assignment is selected, deletes it and pastes in its place
  // Automatically overwrites other conflicting assignments without prompting
  const handlePaste = useCallback(async () => {
    if (!clipboardAssignment || !clipboardSourceMemberId) return;

    // Determine target member, target dates, and any assignment being replaced
    let targetMemberId: string;
    let newStartDate: string;
    let newEndDate: string;
    let assignmentToReplace: Assignment | null = null;

    if (selectedMemberForDrag && selectedDays.size > 0) {
      // Paste onto selected cells: use the exact selected date range
      targetMemberId = selectedMemberForDrag;
      const selectedDaysSorted = Array.from(selectedDays)
        .map(d => parseLocalDate(d))
        .sort((a, b) => a.getTime() - b.getTime());
      newStartDate = format(selectedDaysSorted[0], 'yyyy-MM-dd');
      newEndDate = format(selectedDaysSorted[selectedDaysSorted.length - 1], 'yyyy-MM-dd');
    } else if (selectedAssignment && selectedAssignmentMemberId) {
      // Paste onto a selected assignment: replace it in place
      targetMemberId = selectedAssignmentMemberId;
      newStartDate = selectedAssignment.startDate;
      newEndDate = selectedAssignment.endDate;
      assignmentToReplace = selectedAssignment;
    } else {
      return;
    }

    // Helper to find target member from data
    const findTargetMember = (): Member | undefined => {
      return data?.data.members.find((m) => m.id === targetMemberId);
    };

    // Delete the selected assignment being replaced, plus any other conflicts
    const pastedAssignment = { ...clipboardAssignment, startDate: newStartDate, endDate: newEndDate };
    const conflictInfo = detectConflicts(pastedAssignment, targetMemberId);
    const assignmentsToDelete = [
      ...(assignmentToReplace ? [assignmentToReplace] : []),
      ...(conflictInfo.hasConflict
        ? conflictInfo.conflictingAssignments.filter((a) => a.id !== assignmentToReplace?.id)
        : []),
    ];
    if (assignmentsToDelete.length > 0) {
      try {
        await Promise.all(
          assignmentsToDelete.map((a) => {
            recordDeletion(a);
            return deleteAssignmentMutation.mutateAsync(a.id);
          })
        );
      } catch {
        // Error handled by mutation
        return;
      }
    }

    if (clipboardMode === 'cut') {
      // Move: reassign the assignment directly (recordUpdate is called inside)
      executeReassignmentWithDates(
        clipboardAssignment,
        clipboardSourceMemberId,
        targetMemberId,
        newStartDate,
        newEndDate
      );
      // Clear clipboard after cut-paste
      setClipboardAssignment(null);
      setClipboardSourceMemberId(null);
      setClipboardMode(null);

      // Select the moved assignment with updated dates and target member
      const targetMember = findTargetMember();
      if (targetMember) {
        const movedAssignment: Assignment = {
          ...clipboardAssignment,
          startDate: newStartDate,
          endDate: newEndDate,
          members: [{ member: targetMember }],
        };
        setSelectedAssignment(movedAssignment);
        setSelectedAssignmentMemberId(targetMemberId);
      }
    } else {
      // Copy: Create new assignment with same properties (including request link, formatters, and project roles)
      try {
        const response = await createAssignmentMutation.mutateAsync({
          title: clipboardAssignment.title,
          startDate: newStartDate,
          endDate: newEndDate,
          projectTypeId: clipboardAssignment.projectType.id,
          memberIds: [targetMemberId],
          requestId: clipboardAssignment.requestId || undefined,
          formatterIds: clipboardAssignment.formatters?.map(f => f.formatter.id),
          projectRoleIds: clipboardAssignment.projectRoles?.map(pr => pr.projectRole.id),
        });
        // Record creation for undo
        const createdAssignment = response as { data?: { id?: string } };
        if (createdAssignment?.data?.id) {
          recordCreation(createdAssignment.data.id);

          // Select the newly created assignment
          const targetMember = findTargetMember();
          if (targetMember) {
            const newAssignment: Assignment = {
              ...clipboardAssignment,
              id: createdAssignment.data.id,
              startDate: newStartDate,
              endDate: newEndDate,
              members: [{ member: targetMember }],
            };
            setSelectedAssignment(newAssignment);
            setSelectedAssignmentMemberId(targetMemberId);
          }
        }
      } catch {
        // Error handled by mutation
      }
    }

    // Clear cell selection after paste (assignment is now selected instead)
    setSelectedDays(new Set());
    setSelectedMemberForDrag(null);
    setIsDragging(false);
    clearPresence();
  }, [clipboardAssignment, clipboardSourceMemberId, clipboardMode, selectedAssignment, selectedAssignmentMemberId, selectedMemberForDrag, selectedDays, detectConflicts, deleteAssignmentMutation, recordDeletion, executeReassignmentWithDates, createAssignmentMutation, clearPresence, recordCreation, data?.data.members]);

  // Handle Alt/Option+1/2/3 to change status of linked request or assignment display status
  const handleStatusShortcut = useCallback((code: string): boolean => {
    if (!selectedAssignment || !canModifyAssignments) return false;

    if (selectedAssignment.requestId) {
      const requestStatusMap: Record<string, RequestStatus> = {
        'Digit1': RequestStatus.SCHEDULED,
        'Digit2': RequestStatus.FORECAST,
        'Digit3': RequestStatus.UNSCHEDULED,
      };
      const status = requestStatusMap[code];
      if (!status) return false;
      updateRequestStatusMutation.mutate({ requestId: selectedAssignment.requestId, status });
    } else {
      const displayStatusMap: Record<string, DisplayStatus> = {
        'Digit1': DisplayStatus.SCHEDULED,
        'Digit2': DisplayStatus.FORECAST,
        'Digit3': DisplayStatus.UNSCHEDULED,
      };
      const status = displayStatusMap[code];
      if (!status) return false;
      updateDisplayStatusMutation.mutate({ id: selectedAssignment.id, displayStatus: status });
    }
    return true;
  }, [selectedAssignment, canModifyAssignments, updateRequestStatusMutation, updateDisplayStatusMutation]);

  // Handle Ctrl/Cmd keyboard shortcuts, returns true if handled
  const handleCtrlShortcut = useCallback((key: string): boolean => {
    const hasSelection = !!selectedAssignment && !!selectedAssignmentMemberId;
    const hasCellSelection = selectedDays.size > 0 && !!selectedMemberForDrag;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shortcuts: Record<string, { guard: boolean; action: () => any }> = {
      c: { guard: hasSelection, action: handleCopy },
      x: { guard: canModifyAssignments && hasSelection && (!selectedAssignment || !isLockedAssignment(selectedAssignment)), action: handleCut },
      v: { guard: canModifyAssignments && !!clipboardAssignment && (hasCellSelection || hasSelection), action: handlePaste },
      e: { guard: canModifyAssignments && !!selectedAssignment, action: () => setShowEditModal(true) },
      z: { guard: canUndo, action: undo },
      n: { guard: canModifyAssignments && hasCellSelection, action: () => setShowCreateModal(true) },
    };

    const shortcut = shortcuts[key];
    if (!shortcut?.guard) return false;
    shortcut.action();
    return true;
  }, [canModifyAssignments, selectedAssignment, selectedAssignmentMemberId, clipboardAssignment, selectedDays, selectedMemberForDrag, handleCopy, handleCut, handlePaste, canUndo, undo]);

  // Helper to scroll a cell into view
  const scrollCellIntoView = useCallback((memberId: string, dayIndex: number) => {
    const grid = gridRef.current;
    if (!grid) return;

    const stickyHeaderHeight = 104;
    const itemIndex = sortedMemberItems.findIndex((item) => item.type === 'member' && item.id === memberId);
    if (itemIndex === -1) return;

    let cellTop = stickyHeaderHeight;
    for (let i = 0; i < itemIndex; i++) {
      const item = sortedMemberItems[i];
      cellTop += item.type === 'department' ? deptHeaderHeight : zoomedRowHeight;
    }

    const cellLeft = dayIndex * colWidth;
    const cellRight = cellLeft + colWidth;
    const cellBottom = cellTop + zoomedRowHeight;

    const visibleLeft = grid.scrollLeft;
    const visibleRight = grid.scrollLeft + grid.clientWidth - memberColWidth;
    const visibleTop = grid.scrollTop + stickyHeaderHeight;
    const visibleBottom = grid.scrollTop + grid.clientHeight;

    if (cellLeft < visibleLeft) {
      grid.scrollLeft = cellLeft;
    } else if (cellRight > visibleRight) {
      grid.scrollLeft = cellRight - (grid.clientWidth - memberColWidth);
    }

    if (cellTop < visibleTop) {
      grid.scrollTop = cellTop - stickyHeaderHeight;
    } else if (cellBottom > visibleBottom) {
      grid.scrollTop = cellBottom - grid.clientHeight;
    }
  }, [sortedMemberItems, deptHeaderHeight, zoomedRowHeight, colWidth, memberColWidth]);

  // Helper to get assignment indices for a selected assignment
  const getAssignmentIndices = useCallback((assignment: Assignment) => {
    const assignmentStart = parseLocalDate(assignment.startDate);
    const assignmentEnd = parseLocalDate(assignment.endDate);
    const startIndex = weekdays.findIndex(d => isSameDateOrAfter(d, assignmentStart));
    let endIndex: number | null = null;
    for (let i = weekdays.length - 1; i >= 0; i--) {
      if (isSameDateOrBefore(weekdays[i], assignmentEnd)) {
        endIndex = i;
        break;
      }
    }
    return { startIndex, endIndex };
  }, [weekdays]);

  // Helper to select a cell or assignment at a given position
  const selectCellOrAssignmentAt = useCallback((memberId: string, dayIndex: number) => {
    const day = weekdays[dayIndex];
    const dayKey = weekdayKeys[dayIndex];
    if (!data?.data.assignments) {
      const newSelection = new Set([dayKey]);
      setSelectedDays(newSelection);
      setSelectedMemberForDrag(memberId);
      broadcastSelection(newSelection, memberId);
      setSelectedAssignment(null);
      setSelectedAssignmentMemberId(null);
      clearAssignmentPresence();
      scrollCellIntoView(memberId, dayIndex);
      return;
    }

    const assignments = data.data.assignments.filter((assignment) => {
      const start = parseLocalDate(assignment.startDate);
      const end = parseLocalDate(assignment.endDate);
      const isMemberAssigned = assignment.members.some((m) => m.member.id === memberId);
      return isMemberAssigned && isSameDateOrAfter(day, start) && isSameDateOrBefore(day, end);
    });

    if (assignments.length > 0) {
      const assignment = assignments[0];
      setSelectedAssignment(assignment);
      setSelectedAssignmentMemberId(memberId);
      broadcastAssignmentSelection(assignment.id, memberId);
      setSelectedDays(new Set());
      setSelectedMemberForDrag(null);
      clearPresence();
    } else {
      const newSelection = new Set([dayKey]);
      setSelectedDays(newSelection);
      setSelectedMemberForDrag(memberId);
      broadcastSelection(newSelection, memberId);
      setSelectedAssignment(null);
      setSelectedAssignmentMemberId(null);
      clearAssignmentPresence();
    }

    scrollCellIntoView(memberId, dayIndex);
  }, [weekdays, weekdayKeys, data?.data.assignments, broadcastSelection, broadcastAssignmentSelection, clearPresence, clearAssignmentPresence, scrollCellIntoView]);

  // Extend selection in a direction
  const extendSelection = useCallback((dayIndex: number, currentMemberId: string) => {
    const newDay = weekdayKeys[dayIndex];
    const newSelection = new Set(selectedDays);
    newSelection.add(newDay);
    setSelectedDays(newSelection);
    broadcastSelection(newSelection, currentMemberId);
  }, [weekdayKeys, selectedDays, broadcastSelection]);

  // Handle left arrow navigation
  const handleArrowLeft = useCallback((
    shiftKey: boolean,
    currentMemberId: string,
    currentDayIndex: number,
    assignmentStartIndex: number | null,
    leftmostDayIndex: number
  ) => {
    if (shiftKey && leftmostDayIndex > 0 && selectedDays.size > 0) {
      extendSelection(leftmostDayIndex - 1, currentMemberId);
      return;
    }
    if (shiftKey) return;
    const moveFromIndex = assignmentStartIndex ?? currentDayIndex;
    if (moveFromIndex > 0) {
      selectCellOrAssignmentAt(currentMemberId, moveFromIndex - 1);
    }
  }, [selectedDays.size, extendSelection, selectCellOrAssignmentAt]);

  // Handle right arrow navigation
  const handleArrowRight = useCallback((
    shiftKey: boolean,
    currentMemberId: string,
    currentDayIndex: number,
    assignmentEndIndex: number | null,
    rightmostDayIndex: number
  ) => {
    if (shiftKey && rightmostDayIndex < weekdays.length - 1 && selectedDays.size > 0) {
      extendSelection(rightmostDayIndex + 1, currentMemberId);
      return;
    }
    if (shiftKey) return;
    const moveFromIndex = assignmentEndIndex ?? currentDayIndex;
    if (moveFromIndex < weekdays.length - 1) {
      selectCellOrAssignmentAt(currentMemberId, moveFromIndex + 1);
    }
  }, [weekdays.length, selectedDays.size, extendSelection, selectCellOrAssignmentAt]);

  // Handle vertical arrow navigation
  const handleVerticalArrow = useCallback((
    direction: 'up' | 'down',
    memberItems: MemberRow[],
    currentMemberIndex: number,
    currentDayIndex: number
  ) => {
    if (direction === 'up' && currentMemberIndex > 0) {
      const newMember = memberItems[currentMemberIndex - 1];
      selectCellOrAssignmentAt(newMember.id, currentDayIndex);
    } else if (direction === 'down' && currentMemberIndex < memberItems.length - 1) {
      const newMember = memberItems[currentMemberIndex + 1];
      selectCellOrAssignmentAt(newMember.id, currentDayIndex);
    }
  }, [selectCellOrAssignmentAt]);

  // Get current navigation position for arrow key handling
  const getNavigationPosition = useCallback(() => {
    const selectedDaysArray = Array.from(selectedDays).sort((a, b) => a.localeCompare(b));
    const memberItems = sortedMemberItems.filter((item): item is MemberRow => item.type === 'member');

    if (memberItems.length === 0 || weekdays.length === 0) return null;

    // No selection - return first cell info
    if ((selectedDays.size === 0 || !selectedMemberForDrag) && !selectedAssignment) {
      return { memberItems, firstCellOnly: true };
    }

    let currentMemberIndex: number;
    let currentDayIndex: number;
    let assignmentStartIndex: number | null = null;
    let assignmentEndIndex: number | null = null;

    if (selectedAssignment && selectedAssignmentMemberId) {
      currentMemberIndex = memberItems.findIndex(item => item.id === selectedAssignmentMemberId);
      const indices = getAssignmentIndices(selectedAssignment);
      assignmentStartIndex = indices.startIndex;
      assignmentEndIndex = indices.endIndex;
      currentDayIndex = assignmentStartIndex === -1 ? 0 : assignmentStartIndex;
    } else {
      currentMemberIndex = memberItems.findIndex(item => item.id === selectedMemberForDrag);
      currentDayIndex = weekdayKeyToIndex.get(selectedDaysArray[0]) ?? -1;
    }

    if (currentMemberIndex === -1 || currentDayIndex === -1) return null;

    const leftmostDayIndex = selectedDaysArray.length > 0
      ? (weekdayKeyToIndex.get(selectedDaysArray[0]) ?? currentDayIndex)
      : currentDayIndex;
    const rightmostDayIndex = selectedDaysArray.length > 0
      ? (weekdayKeyToIndex.get(selectedDaysArray.at(-1)!) ?? currentDayIndex)
      : currentDayIndex;

    return {
      memberItems,
      currentMemberIndex,
      currentDayIndex,
      currentMemberId: memberItems[currentMemberIndex].id,
      assignmentStartIndex,
      assignmentEndIndex,
      leftmostDayIndex,
      rightmostDayIndex,
      firstCellOnly: false,
    };
  }, [selectedDays, sortedMemberItems, weekdays, weekdayKeyToIndex, selectedMemberForDrag, selectedAssignment, selectedAssignmentMemberId, getAssignmentIndices]);

  // Handle arrow key navigation
  const handleArrowNavigation = useCallback((key: string, shiftKey: boolean) => {
    const pos = getNavigationPosition();
    if (!pos) return;

    if (pos.firstCellOnly) {
      selectCellOrAssignmentAt(pos.memberItems[0].id, 0);
      return;
    }

    const memberItems = pos.memberItems;
    const currentMemberIndex = pos.currentMemberIndex!;
    const currentDayIndex = pos.currentDayIndex!;
    const currentMemberId = pos.currentMemberId!;
    const assignmentStartIndex = pos.assignmentStartIndex ?? null;
    const assignmentEndIndex = pos.assignmentEndIndex ?? null;
    const leftmostDayIndex = pos.leftmostDayIndex!;
    const rightmostDayIndex = pos.rightmostDayIndex!;

    switch (key) {
      case 'ArrowLeft':
        handleArrowLeft(shiftKey, currentMemberId, currentDayIndex, assignmentStartIndex, leftmostDayIndex);
        break;
      case 'ArrowRight':
        handleArrowRight(shiftKey, currentMemberId, currentDayIndex, assignmentEndIndex, rightmostDayIndex);
        break;
      case 'ArrowUp':
        handleVerticalArrow('up', memberItems, currentMemberIndex, currentDayIndex);
        break;
      case 'ArrowDown':
        handleVerticalArrow('down', memberItems, currentMemberIndex, currentDayIndex);
        break;
    }
  }, [getNavigationPosition, selectCellOrAssignmentAt, handleArrowLeft, handleArrowRight, handleVerticalArrow]);

  // Keyboard shortcuts for copy/cut/paste/edit/delete (select mode only)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModalOpen = showCreateModal || showEditModal || showMemberProfileModal || conflictModalState?.open;
      const activeElement = document.activeElement;
      const isTyping = activeElement instanceof HTMLInputElement ||
                       activeElement instanceof HTMLTextAreaElement ||
                       activeElement?.getAttribute('contenteditable') === 'true';

      if (isModalOpen || isTyping) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAssignment && canModifyAssignments && !isLockedAssignment(selectedAssignment)) {
        e.preventDefault();
        handleDelete();
        return;
      }


      if ((e.ctrlKey || e.metaKey) && handleCtrlShortcut(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }

      // Alt/Option+1/2/3: change status
      if (e.altKey && handleStatusShortcut(e.code)) {
        e.preventDefault();
        return;
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        handleArrowNavigation(e.key, e.shiftKey);
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [selectedAssignment, canModifyAssignments, handleDelete, handleCtrlShortcut, handleStatusShortcut, showCreateModal, showEditModal, showMemberProfileModal, conflictModalState?.open, handleArrowNavigation]);

  // Handle "Schedule Around" - split assignment into gaps
  const handleScheduleAround = useCallback(async () => {
    if (!conflictModalState?.droppedAssignment || !conflictModalState.sourceMemberId || !conflictModalState.targetMemberId) {
      return;
    }

    const { droppedAssignment, sourceMemberId, targetMemberId, gaps } = conflictModalState;

    if (gaps.length === 0) return;

    setIsProcessingDrop(true);

    try {
      // Get current memberIds without source, add target
      const baseMemberIds = droppedAssignment.members
        .map((m) => m.member.id)
        .filter((id) => id !== sourceMemberId);
      const newMemberIds = [...new Set([...baseMemberIds, targetMemberId])];

      if (gaps.length === 1) {
        // Single gap - just update the assignment dates and member
        await updateAssignmentMutation.mutateAsync({
          id: droppedAssignment.id,
          data: {
            startDate: format(gaps[0].startDate, 'yyyy-MM-dd'),
            endDate: format(gaps[0].endDate, 'yyyy-MM-dd'),
            memberIds: newMemberIds,
          },
        });
      } else {
        // Multiple gaps - update original for first gap, create new for others
        await updateAssignmentMutation.mutateAsync({
          id: droppedAssignment.id,
          data: {
            startDate: format(gaps[0].startDate, 'yyyy-MM-dd'),
            endDate: format(gaps[0].endDate, 'yyyy-MM-dd'),
            memberIds: newMemberIds,
          },
        });

        // Create additional assignments for remaining gaps
        for (let i = 1; i < gaps.length; i++) {
          await createAssignmentMutation.mutateAsync({
            title: droppedAssignment.title,
            startDate: format(gaps[i].startDate, 'yyyy-MM-dd'),
            endDate: format(gaps[i].endDate, 'yyyy-MM-dd'),
            projectTypeId: droppedAssignment.projectType.id,
            memberIds: newMemberIds,
            requestId: droppedAssignment.requestId || undefined,
          });
        }
      }

      setConflictModalState(null);
    } catch {
      // Error handling - mutation will show error
    } finally {
      setIsProcessingDrop(false);
    }
  }, [conflictModalState, updateAssignmentMutation, createAssignmentMutation]);

  // Handle "Overwrite" - delete conflicting assignments and reassign
  const handleOverwrite = useCallback(async () => {
    if (!conflictModalState?.droppedAssignment || !conflictModalState.sourceMemberId || !conflictModalState.targetMemberId) {
      return;
    }

    const { droppedAssignment, sourceMemberId, targetMemberId, conflictingAssignments, newStartDate, newEndDate } = conflictModalState;

    setIsProcessingDrop(true);

    try {
      // Delete all conflicting assignments
      await Promise.all(
        conflictingAssignments.map((a) => deleteAssignmentMutation.mutateAsync(a.id))
      );

      // Reassign the dropped assignment
      const currentMemberIds = droppedAssignment.members.map((m) => m.member.id);
      const newMemberIds = [...new Set(
        currentMemberIds.filter((id) => id !== sourceMemberId).concat(targetMemberId)
      )];

      // Build update data including any date changes from week-to-week move
      const updateData: { memberIds: string[]; startDate?: string; endDate?: string } = {
        memberIds: newMemberIds,
      };
      if (newStartDate) updateData.startDate = newStartDate;
      if (newEndDate) updateData.endDate = newEndDate;

      await updateAssignmentMutation.mutateAsync({
        id: droppedAssignment.id,
        data: updateData,
      });

      setConflictModalState(null);
    } catch {
      // Error handling - mutation will show error
    } finally {
      setIsProcessingDrop(false);
    }
  }, [conflictModalState, deleteAssignmentMutation, updateAssignmentMutation]);

  // Close conflict modal
  const closeConflictModal = useCallback(() => {
    setConflictModalState(null);
  }, []);

  // Drop zone handlers for Select mode drag-and-drop
  const handleDragOver = useCallback((e: React.DragEvent, memberId: string) => {
    if (!canModifyAssignments) return;
    e.preventDefault();
    if (!draggedAssignment) return;

    // Always allow drop (even on same member for week moves)
    setDropTargetMemberId(memberId);
    e.dataTransfer.dropEffect = 'move';

    // Calculate target day index for week highlighting
    const gridElement = gridRef.current;
    if (gridElement) {
      const gridRect = gridElement.getBoundingClientRect();
      const relativeX = e.clientX - gridRect.left + gridElement.scrollLeft - memberColWidth;
      const dayIndex = Math.floor(relativeX / colWidth);
      const clampedDayIndex = Math.max(0, Math.min(dayIndex, weekdays.length - 1));
      setDragTargetDayIndex(clampedDayIndex);
    }
  }, [canModifyAssignments, draggedAssignment, weekdays.length]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the row entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTargetMemberId(null);
      setDragTargetDayIndex(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetMemberId: string) => {
    if (!canModifyAssignments) return;
    e.preventDefault();
    setDropTargetMemberId(null);
    setDragTargetDayIndex(null);

    try {
      const dragData = JSON.parse(e.dataTransfer.getData('application/json')) as DragData;
      if (isLockedAssignment(dragData.assignment)) return;

      // Calculate target day index from drop position
      const gridElement = gridRef.current;
      let targetDayIndex: number | null = null;
      if (gridElement) {
        const gridRect = gridElement.getBoundingClientRect();
        const relativeX = e.clientX - gridRect.left + gridElement.scrollLeft - memberColWidth;
        const dayIndex = Math.floor(relativeX / colWidth);
        targetDayIndex = Math.max(0, Math.min(dayIndex, weekdays.length - 1));
      }

      // Calculate new dates if week changed
      let newStartDate: string | undefined;
      let newEndDate: string | undefined;

      if (targetDayIndex !== null && dragData.sourceStartIndex !== undefined) {
        const originalStart = parseLocalDate(dragData.assignment.startDate);
        const originalEnd = parseLocalDate(dragData.assignment.endDate);
        const duration = differenceInDays(originalEnd, originalStart);

        // Get the Monday of the source week and target week
        const sourceWeekMonday = startOfWeek(weekdays[dragData.sourceStartIndex], { weekStartsOn: 1 });
        const targetWeekMonday = startOfWeek(weekdays[targetDayIndex], { weekStartsOn: 1 });

        // Calculate week offset (in whole weeks)
        const weekOffset = differenceInDays(targetWeekMonday, sourceWeekMonday);

        if (weekOffset !== 0) {
          // Move the assignment by the week offset, preserving its day-of-week position
          const calcNewStart = new Date(originalStart);
          calcNewStart.setDate(calcNewStart.getDate() + weekOffset);

          const calcNewEnd = new Date(calcNewStart);
          calcNewEnd.setDate(calcNewEnd.getDate() + duration);

          newStartDate = format(calcNewStart, 'yyyy-MM-dd');
          newEndDate = format(calcNewEnd, 'yyyy-MM-dd');
        }
      }

      // Handle the drop - allow if member changed OR dates changed
      const memberChanged = dragData.sourceMemberId !== targetMemberId;
      const datesChanged = newStartDate !== undefined && newEndDate !== undefined;

      if (memberChanged || datesChanged) {
        handleAssignmentDropWithDates(
          dragData.assignment,
          dragData.sourceMemberId,
          targetMemberId,
          newStartDate,
          newEndDate
        );
      }
    } catch {
      // Invalid drag data, ignore
    }
  }, [canModifyAssignments, weekdays, handleAssignmentDropWithDates]);

  const handleDragStartCallback = useCallback((data: DragData) => {
    if (!canModifyAssignments) return;
    setDraggedAssignment(data);
    clearAssignmentSelection();
  }, [canModifyAssignments, clearAssignmentSelection]);

  const handleDragEndCallback = useCallback(() => {
    setDraggedAssignment(null);
    setDropTargetMemberId(null);
    setDragTargetDayIndex(null);
  }, []);

  // Group days by month for header row 1
  const monthGroups = useMemo(() => {
    const groups: MonthGroup[] = [];
    let currentMonth = -1;
    let currentYear = -1;
    let startIndex = 0;

    weekdays.forEach((day, index) => {
      const month = getMonth(day);
      const year = day.getFullYear();

      if (month !== currentMonth || year !== currentYear) {
        if (currentMonth !== -1) {
          groups.at(-1)!.dayCount = index - startIndex;
        }
        groups.push({
          month,
          year,
          label: format(day, 'MMMM yyyy'),
          dayCount: 0,
          startIndex: index,
        });
        currentMonth = month;
        currentYear = year;
        startIndex = index;
      }
    });

    // Set count for last group
    if (groups.length > 0) {
      groups.at(-1)!.dayCount = weekdays.length - groups.at(-1)!.startIndex;
    }

    return groups;
  }, [weekdays]);

  // Group days by week for header row 2
  const weekGroups = useMemo(() => {
    const groups: WeekGroup[] = [];
    let currentWeekStart: Date | null = null;
    let weekDays: Date[] = [];
    let startIndex = 0;

    weekdays.forEach((day, index) => {
      const weekStart = startOfWeek(day, { weekStartsOn: 1 });

      if (weekStart.getTime() === currentWeekStart?.getTime()) {
        weekDays.push(day);
      } else {
        if (weekDays.length > 0) {
          groups.push({
            startDate: weekDays[0].getDate(),
            endDate: weekDays.at(-1)!.getDate(),
            dayCount: weekDays.length,
            startIndex,
          });
        }
        currentWeekStart = weekStart;
        weekDays = [day];
        startIndex = index;
      }
    });

    // Add last week
    if (weekDays.length > 0) {
      groups.push({
        startDate: weekDays[0].getDate(),
        endDate: weekDays.at(-1)!.getDate(),
        dayCount: weekDays.length,
        startIndex,
      });
    }

    return groups;
  }, [weekdays]);

  // Calculate new dates when moving to a different week (preserving day-of-week)
  const calculateNewDatesForWeek = useCallback(
    (
      assignment: Assignment,
      targetDayIndex: number,
      sourceDayIndex: number
    ): { newStartDate: Date; newEndDate: Date } | null => {
      const originalStart = parseLocalDate(assignment.startDate);
      const originalEnd = parseLocalDate(assignment.endDate);

      // Calculate the offset in days (target - source)
      const dayOffset = targetDayIndex - sourceDayIndex;
      if (dayOffset === 0) return null; // No change

      // Calculate new dates by adding the day offset
      const newStartDate = new Date(originalStart);
      newStartDate.setDate(newStartDate.getDate() + dayOffset);

      const newEndDate = new Date(originalEnd);
      newEndDate.setDate(newEndDate.getDate() + dayOffset);

      return { newStartDate, newEndDate };
    },
    []
  );

  // Calculate which week indices would be highlighted for the moved assignment
  const getHighlightedWeeksForMove = useCallback(
    (assignment: Assignment, targetDayIndex: number, sourceDayIndex: number): Set<number> => {
      const highlighted = new Set<number>();

      const newDates = calculateNewDatesForWeek(assignment, targetDayIndex, sourceDayIndex);
      if (!newDates) return highlighted;

      const newStartTime = newDates.newStartDate.getTime();
      const newEndTime = newDates.newEndDate.getTime();

      // Find which weeks the new assignment would span
      for (let i = 0; i < weekGroups.length; i++) {
        const wg = weekGroups[i];
        const weekStartDay = weekdays[wg.startIndex];
        const weekEndDay = weekdays[wg.startIndex + wg.dayCount - 1];

        // Check if the new assignment overlaps this week
        if (newStartTime <= weekEndDay.getTime() && newEndTime >= weekStartDay.getTime()) {
          highlighted.add(i);
        }
      }

      return highlighted;
    },
    [calculateNewDatesForWeek, weekGroups, weekdays]
  );

  // Check if a day is the first of its month (for border)
  const isFirstOfMonth = (day: Date, index: number) => {
    if (index === 0) return false;
    const prevDay = weekdays[index - 1];
    return !isSameMonth(day, prevDay);
  };

  // Pre-compute spans for ALL members at once (avoids O(members × assignments) per render)
  const spansByMember = useMemo(() => {
    const result = new Map<string, AssignmentSpan[]>();
    if (!data?.data.assignments) return result;

    // Build member -> assignments index in a single pass
    const memberAssignmentsMap = new Map<string, Assignment[]>();
    for (const assignment of data.data.assignments) {
      for (const { member } of assignment.members) {
        const list = memberAssignmentsMap.get(member.id);
        if (list) {
          list.push(assignment);
        } else {
          memberAssignmentsMap.set(member.id, [assignment]);
        }
      }
    }

    // Calculate spans per member
    for (const [memberId, memberAssignments] of memberAssignmentsMap) {
      const spans: Omit<AssignmentSpan, 'lane' | 'totalLanes'>[] = [];

      for (const assignment of memberAssignments) {
        const assignmentStart = parseLocalDate(assignment.startDate);
        const assignmentEnd = parseLocalDate(assignment.endDate);

        // Find the first weekday on or after assignment start
        const startIndex = weekdays.findIndex((day) => isSameDateOrAfter(day, assignmentStart));
        if (startIndex === -1) continue;

        // Find the last weekday on or before assignment end
        let endIndex = -1;
        for (let i = weekdays.length - 1; i >= 0; i--) {
          if (isSameDateOrBefore(weekdays[i], assignmentEnd)) {
            endIndex = i;
            break;
          }
        }
        if (endIndex === -1 || endIndex < startIndex) continue;

        const startsBeforeVisible = !isSameDateOrAfter(assignmentStart, weekdays[0]);
        const endsAfterVisible = !isSameDateOrBefore(assignmentEnd, weekdays.at(-1)!);

        const leftPx = startIndex * colWidth;
        const widthPx = (endIndex - startIndex + 1) * colWidth;

        spans.push({
          assignment,
          startIndex,
          endIndex,
          leftPx,
          widthPx,
          startsBeforeVisible,
          endsAfterVisible,
        });
      }

      if (spans.length === 0) continue;

      // Sort by start index, then by length (shorter first for better packing)
      spans.sort((a, b) => {
        if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
        return (a.endIndex - a.startIndex) - (b.endIndex - b.startIndex);
      });

      result.set(memberId, assignLanesToSpans(spans));
    }

    return result;
  }, [data?.data.assignments, weekdays, colWidth]);

  const EMPTY_SPANS: AssignmentSpan[] = [];
  const getSpansForMember = useCallback(
    (memberId: string): AssignmentSpan[] => spansByMember.get(memberId) ?? EMPTY_SPANS,
    [spansByMember]
  );

  // Helper to calculate top offset for a member in the grid (accounting for department headers)
  const calculateMemberTopOffset = useCallback((memberId: string) => {
    const headerHeight = 104;
    const itemIndex = sortedMemberItems.findIndex((item) => item.type === 'member' && item.id === memberId);
    if (itemIndex === -1) return null;

    let topOffset = headerHeight;
    for (let i = 0; i < itemIndex; i++) {
      const item = sortedMemberItems[i];
      topOffset += item.type === 'department' ? deptHeaderHeight : zoomedRowHeight;
    }
    return topOffset;
  }, [sortedMemberItems, isMembersCollapsed, deptHeaderHeight, zoomedRowHeight]);

  // Position for action buttons in span mode (top right of span)
  const getSpanModeDeletePosition = useCallback(() => {
    if (!selectedAssignment || !selectedAssignmentMemberId || sortedMemberItems.length === 0) {
      return null;
    }
    const topOffset = calculateMemberTopOffset(selectedAssignmentMemberId);
    if (topOffset === null) return null;
    const spans = getSpansForMember(selectedAssignmentMemberId);
    const span = spans.find((s) => s.assignment.id === selectedAssignment.id);
    if (!span) return null;
    // Position at top right of span
    return { left: memberColWidth + span.leftPx + span.widthPx, top: topOffset - 4 };
  }, [selectedAssignment, selectedAssignmentMemberId, sortedMemberItems, calculateMemberTopOffset, getSpansForMember]);

  // Calculate position for the delete button (appears when assignment is clicked)
  const deleteButtonPosition = useMemo(() => {
    return getSpanModeDeletePosition();
  }, [getSpanModeDeletePosition]);

  // Calculate week headers with month boundary info
  const weekHeaderSpans = useMemo(() => {
    return weekGroups.map((week) => {
      const weekStartDay = weekdays[week.startIndex];
      const isNewMonth = week.startIndex > 0 && isFirstOfMonth(weekStartDay, week.startIndex);
      return {
        ...week,
        isNewMonth,
      };
    });
  }, [weekGroups, weekdays]);

  // Calculate which weeks are highlighted during drag (for week-to-week moves)
  const highlightedWeekIndices = useMemo(() => {
    if (!draggedAssignment || dragTargetDayIndex === null || draggedAssignment.sourceStartIndex === undefined) {
      return new Set<number>();
    }
    return getHighlightedWeeksForMove(
      draggedAssignment.assignment,
      dragTargetDayIndex,
      draggedAssignment.sourceStartIndex
    );
  }, [draggedAssignment, dragTargetDayIndex, getHighlightedWeeksForMove]);

  // Custom filter resolved to no visible members (e.g. no linked member and no selections).
  // Show a friendly notice instead of an empty grid.
  if (scheduleFilter.empty) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <h3 className="text-lg font-semibold">No visible members</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Your schedule visibility is set to a custom filter, but it currently includes no
            members. Ask an administrator to link your user to a member or to add departments or
            members to your visible set in User Management.
          </p>
        </div>
      </div>
    );
  }

  // Show skeleton loader only on initial load (no cached data available)
  if (isLoading && !data) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 overflow-hidden rounded-lg border border-border">
          {/* Skeleton for Requests Panel */}
          <div className="w-64 border-r bg-muted/30 p-4">
            <div className="h-6 w-24 animate-pulse rounded bg-muted mb-4" />
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded bg-muted" />
              <div className="h-16 animate-pulse rounded bg-muted" />
              <div className="h-16 animate-pulse rounded bg-muted" />
              <div className="h-16 animate-pulse rounded bg-muted" />
              <div className="h-16 animate-pulse rounded bg-muted" />
            </div>
          </div>
          {/* Skeleton for Schedule Grid */}
          <div className="flex-1 p-0">
            {/* Header skeleton */}
            <div className="flex border-b bg-muted/50">
              <div className="w-52 border-r p-4">
                <div className="h-5 w-28 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex-1 grid grid-cols-12">
                {['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12'].map((id) => (
                  <div key={id} className="border-r p-2">
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
            {/* Row skeletons */}
            <div className="divide-y">
              {['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10'].map((rowId, rowIdx) => (
                <div key={rowId} className="flex">
                  <div className="w-52 border-r p-3">
                    <div className="h-5 animate-pulse rounded bg-muted" style={{ width: `${65 + (rowIdx % 3) * 10}%` }} />
                  </div>
                  <div className="flex-1 grid grid-cols-12">
                    {['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12'].map((colId, colIdx) => (
                      <div key={`${rowId}-${colId}`} className="border-r p-2 h-10">
                        {(rowIdx + colIdx) % 4 === 0 && (
                          <div className="h-6 animate-pulse rounded bg-muted/60" style={{ width: `${50 + (colIdx % 3) * 15}%` }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show subtle loading indicator when refetching with placeholder data
  const showRefetchIndicator = isFetching && !isLoading;

  return (
    <div className="flex h-full flex-col">
      {/* Schedule Grid */}
      <div className="flex flex-1 overflow-hidden rounded-lg border border-border relative">
        {/* Subtle loading indicator when refetching with cached data */}
        {showRefetchIndicator && (
          <div className="absolute top-0 left-0 right-0 z-50 h-0.5 bg-primary/20 overflow-hidden">
            <div className="h-full w-1/3 bg-primary animate-[shimmer_1s_ease-in-out_infinite]" style={{ animation: 'shimmer 1s ease-in-out infinite' }} />
          </div>
        )}
        {/* Requests Panel */}
        <RequestsPanel
          isCollapsed={isRequestsPanelCollapsed}
          onCollapsedChange={setIsRequestsPanelCollapsed}
          onHighlightRequest={handleHighlightRequest}
          highlightedRequestId={highlightedRequestId}
          monthsToLoad={monthsToLoad}
        />

        {/* Single Scrollable Container for Member Column and Calendar Grid */}
        <div ref={gridCallbackRef} role="grid" tabIndex={0} className="relative flex-1 scrollbar-always-visible" onContextMenu={handleContextMenu}>
          <div className="flex min-h-full w-max">
            {/* Member Column - sticky left */}
            <div
              className="sticky left-0 z-30 flex flex-col flex-shrink-0 border-r bg-background"
              style={{ width: memberColWidth, minWidth: memberColWidth }}
            >
              {/* Column Header - sticky top, fixed height matching grid headers */}
              <div className="sticky top-0 z-40 flex h-[6.5rem] flex-shrink-0 flex-col border-b bg-muted px-4">
                {/* Team Members label + sort dropdown + collapse toggle */}
                <div className="flex flex-1 items-center justify-center gap-1">
                  <span className="text-sm font-semibold text-muted-foreground">Team Members</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="Options"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Department Order</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={departmentSortBy} onValueChange={handleDepartmentSortChange}>
                        <DropdownMenuRadioItem value="alpha">A → Z</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="alpha-desc">Z → A</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="member-count-desc">Most Members</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="member-count-asc">Fewest Members</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Member Order</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={memberSortBy} onValueChange={handleMemberSortChange}>
                        <DropdownMenuRadioItem value="name">By Name</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="position">By Position</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Display</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={isMembersCollapsed ? 'collapsed' : 'expanded'} onValueChange={(v) => setIsMembersCollapsed(v === 'collapsed')}>
                        <DropdownMenuRadioItem value="expanded">Show Position</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="collapsed">Hide Position</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {/* Member List - no internal scroll */}
              <div>
              {/* Member names with department sections */}
              {sortedMemberItems.map((item) => {
                // Department header row
                if (item.type === 'department') {
                  const isDeptCollapsed = collapsedDepartments.has(item.department);
                  return (
                    <div
                      key={`dept-${item.department}`}
                      className="flex items-center border-b bg-muted"
                      style={{ height: deptHeaderHeight }}
                    >
                      <div className="w-3 flex-shrink-0 border-r h-full" />
                      <button
                        onClick={() => toggleDepartmentCollapse(item.department)}
                        className="flex-1 flex items-center gap-2 px-2 text-left hover:bg-accent/50 transition-colors overflow-hidden min-w-0"
                      >
                        {isDeptCollapsed ? (
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                          {item.department}
                        </span>
                      </button>
                    </div>
                  );
                }

                // Member row
                const member = item;
                const isMemberSelected = selectedMembers.has(member.id);
                const indentPadding = member.indentLevel * 12; // 12px per indent level
                const isManagerCollapsed = collapsedManagerIds.has(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex items-center border-b transition-all bg-background"
                    style={{ height: zoomedRowHeight }}
                  >
                    {/* Row selector button */}
                    <button
                      onClick={() => toggleMemberSelection(member.id)}
                      className={cn(
                        'flex h-full w-3 flex-shrink-0 cursor-pointer items-center justify-center border-r transition-colors hover:bg-accent',
                        isMemberSelected && 'bg-primary/30'
                      )}
                      aria-label={`Select ${member.firstName} ${member.lastName}`}
                    />
                    {/* Member info with hierarchical indentation */}
                    <div
                      className="flex-1 flex items-center text-left hover:bg-accent/50 transition-colors cursor-pointer overflow-hidden min-w-0"
                      style={{ paddingLeft: 8 + indentPadding }}
                    >
                      {/* Collapse/expand chevron for managers with reports */}
                      {member.hasDirectReports ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleManagerCollapse(member.id);
                          }}
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded hover:bg-accent transition-colors"
                          aria-label={isManagerCollapsed ? 'Expand team' : 'Collapse team'}
                        >
                          {isManagerCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                      ) : (
                        <div className="w-5 flex-shrink-0" />
                      )}
                      <button
                        onClick={() => {
                          setSelectedMemberForProfile(member.id);
                          setShowMemberProfileModal(true);
                        }}
                        className="flex-1 text-left px-1 overflow-hidden"
                      >
                        <div className={cn(
                          'truncate',
                          zoomLevel < 0.75 ? 'text-xs leading-none' : 'text-sm',
                          member.indentLevel === 0 ? 'font-semibold' : 'font-medium'
                        )}>
                          {member.firstName} {member.lastName}
                        </div>
                        {!isMembersCollapsed && member.position && (
                          <div className={cn(
                            'text-muted-foreground truncate',
                            zoomLevel < 0.75 ? 'text-[10px] leading-none' : 'text-xs'
                          )}>{member.position}</div>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
              {sortedMemberItems.length > 0 && (
                <div
                  className="sticky bottom-0 border-t bg-background"
                  style={{ height: zoomedRowHeight }}
                  aria-hidden="true"
                />
              )}
              </div>
              {/* Column resize handle */}
              <button
                type="button"
                aria-label="Resize name column"
                onMouseDown={handleResizeStart}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setMemberColWidth((w: number) => Math.max(100, w - 10));
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    setMemberColWidth((w: number) => Math.min(400, w + 10));
                  }
                }}
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors focus:outline-none focus:bg-primary/50 border-0 p-0 bg-transparent"
                style={{ backgroundColor: isResizingColumn ? 'hsl(var(--primary) / 0.5)' : undefined }}
              />
            </div>

            {/* Calendar Grid */}
            <div
              className="grid min-h-full"
              style={{
                gridTemplateColumns: `repeat(${weekdays.length}, ${colWidth}px)`,
                gridTemplateRows: `32px 24px 48px ${sortedMemberItems.length > 0 ? sortedMemberItems.map(item => item.type === 'department' ? deptHeaderHeight + 'px' : zoomedRowHeight + 'px').join(' ') + ' ' + zoomedRowHeight + 'px' : ''} 1fr`,
                minWidth: 'max-content',
              } as CSSProperties}
            >
            {/* Row 1: Month Headers */}
            {monthGroups.map((group, idx) => (
              <div
                key={`${group.year}-${group.month}`}
                className="sticky top-0 z-20 flex h-8 items-center justify-center border-b bg-muted text-sm font-semibold"
                style={{
                  gridRow: 1,
                  gridColumn: `${group.startIndex + 1} / span ${group.dayCount}`,
                  boxShadow: idx > 0 ? 'inset 2px 0 0 0 hsl(var(--foreground))' : undefined,
                }}
              >
                {group.label}
              </div>
            ))}

            {/* Row 2: Week Ranges */}
            {weekHeaderSpans.map((week, idx) => {
              const weekDayKeys = weekdayKeys.slice(week.startIndex, week.startIndex + week.dayCount);
              const allSelected = weekDayKeys.every((key) => selectedDays.has(key));
              const isHighlighted = highlightedWeekIndices.has(idx);

              // Determine box shadow: month start (bold) > week start (subtle)
              let boxShadow: string | undefined;
              if (week.isNewMonth) {
                boxShadow = 'inset 2px 0 0 0 hsl(var(--foreground))';
              } else if (idx > 0) {
                boxShadow = 'inset 2px 0 0 0 hsl(var(--foreground) / 0.3)';
              }

              return (
                <button
                  type="button"
                  key={`week-${week.startIndex}`}
                  onClick={() => toggleWeekSelection(week.startIndex, week.dayCount)}
                  onMouseEnter={onHeaderMouseEnter}
                  onMouseLeave={onHeaderMouseLeave}
                  className={cn(
                    'sticky top-8 z-20 flex h-6 cursor-pointer items-center justify-center border-b border-0 bg-muted text-xs text-muted-foreground transition-colors hover:bg-accent p-0',
                    allSelected && 'bg-blue-200 dark:bg-blue-800',
                    isHighlighted && 'bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-400 ring-inset'
                  )}
                  style={{
                    gridRow: 2,
                    gridColumn: `${week.startIndex + 1} / span ${week.dayCount}`,
                    boxShadow,
                  }}
                >
                  {week.startDate} - {week.endDate}
                </button>
              );
            })}

            {/* Row 3: Day Letters + Numbers */}
            {weekdays.map((day, index) => {
              const dayOfWeek = day.getDay();
              const dayLetter = DAY_LETTERS[dayOfWeek - 1];
              const isMonthStart = isFirstOfMonth(day, index);
              const isWeekStart = dayOfWeek === 1 && index > 0 && !isMonthStart; // Monday, not first day, not month start
              const dayKey = weekdayKeys[index];
              const isDaySelected = selectedDays.has(dayKey);

              // Determine box shadow: month start (bold) > week start (subtle)
              let boxShadow: string | undefined;
              if (isMonthStart) {
                boxShadow = 'inset 2px 0 0 0 hsl(var(--foreground))';
              } else if (isWeekStart) {
                boxShadow = 'inset 2px 0 0 0 hsl(var(--foreground) / 0.3)';
              }

              // Show "+" button on the rightmost selected column when in column selection mode
              const showAddButton = index === columnSelectionMaxDayIndex && !isDragging && isHeaderHovered;

              return (
                <div
                  key={dayKey}
                  className="relative sticky top-14 z-20"
                  style={{ gridRow: 3 }}
                >
                  <button
                    type="button"
                    onClick={() => handleDayHeaderClick(index)}
                    onMouseEnter={onHeaderMouseEnter}
                    onMouseLeave={onHeaderMouseLeave}
                    className={cn(
                      'flex h-12 w-full cursor-pointer flex-col items-center justify-center border-b border-r border-foreground/20 bg-background text-xs transition-colors hover:bg-accent select-none p-0',
                      isToday(day) && !isDaySelected && 'bg-blue-100 dark:bg-blue-900',
                      isDaySelected && 'bg-blue-200 dark:bg-blue-800'
                    )}
                    style={{ boxShadow }}
                  >
                    <span className="font-medium text-muted-foreground">{dayLetter}</span>
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm',
                        isToday(day) && 'bg-primary text-primary-foreground font-semibold'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </button>
                  {/* Add Assignment Button - overlays the rightmost selected day header */}
                  {showAddButton && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCreateModal(true);
                      }}
                      onMouseEnter={onHeaderMouseEnter}
                      onMouseLeave={onHeaderMouseLeave}
                      className="absolute z-30 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
                      style={{
                        width: Math.max(22, Math.round(26 * zoomLevel)),
                        height: Math.max(22, Math.round(26 * zoomLevel)),
                        right: Math.round(4 * zoomLevel),
                        top: Math.round(4 * zoomLevel),
                      }}
                      aria-label="Create assignment for selected dates"
                    >
                      <Plus style={{ width: Math.max(15, Math.round(17 * zoomLevel)), height: Math.max(15, Math.round(17 * zoomLevel)) }} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Member Rows (with department headers) */}
            {sortedMemberItems.map((item, itemIndex) => {
              // Department header row - render empty grid row
              if (item.type === 'department') {
                return (
                  <div
                    key={`dept-grid-${item.department}`}
                    className="bg-muted/30 border-b"
                    style={{
                      gridRow: 4 + itemIndex,
                      gridColumn: `1 / span ${weekdays.length}`,
                      height: deptHeaderHeight,
                    }}
                  />
                );
              }

              // Member row — rendered via memoized MemberRow component
              return (
                <MemberRow
                  key={item.id}
                  memberId={item.id}
                  itemIndex={itemIndex}
                  weekdays={weekdays}
                  weekdayKeys={weekdayKeys}
                  totalColumns={weekdays.length}
                  colWidth={colWidth}
                  rowHeight={zoomedRowHeight}
                  zoomLevel={zoomLevel}
                  spans={getSpansForMember(item.id)}
                  visibleStart={visibleColStart}
                  visibleEnd={visibleColEnd}
                  selectedDays={selectedDays}
                  selectedMemberForDrag={selectedMemberForDrag}
                  selectedMembers={selectedMembers}
                  selectedAssignmentId={selectedAssignment?.id ?? null}
                  highlightedAssignmentIds={highlightedAssignmentIds}
                  clipboardMode={clipboardMode}
                  clipboardAssignmentId={clipboardAssignment?.id ?? null}
                  isDropTarget={dropTargetMemberId === item.id}
                  cellPresenceMap={cellPresenceMap}
                  cellHighlightMap={cellHighlightMap}
                  assignmentPresenceMap={assignmentPresenceMap}
                  onCellMouseDown={handleCellMouseDown}
                  onCellMouseEnter={handleCellMouseEnter}
                  onMouseUp={handleMouseUp}
                  onAssignmentClick={handleAssignmentClickForRow}
                  onAssignmentDoubleClick={handleAssignmentDoubleClick}
                  onDragStart={handleDragStartCallback}
                  onDragEnd={handleDragEndCallback}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  colorMode={colorMode}
                  requestColorMap={requestColorMap}
                  clientColorMap={clientColorMap}
                />
              );
            })}

            {sortedMemberItems.length > 0 && (
              <div
                className="sticky bottom-0 z-20 border-t bg-background"
                style={{
                  gridRow: 4 + sortedMemberItems.length,
                  gridColumn: `1 / span ${weekdays.length}`,
                }}
                aria-hidden="true"
              />
            )}

            {/* Spacer row to fill remaining height */}
            <div
              className="flex-1"
              style={{
                gridColumn: `1 / span ${weekdays.length}`,
                minHeight: '1px',
              }}
            />
            </div>
          </div>

          {/* Add Assignment Button - appears when cells are selected (hidden for MEMBER role) */}
          {canModifyAssignments && selectionButtonPosition && !isDragging && selectedMemberForDrag && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="absolute z-20 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
              style={{
                left: selectionButtonPosition.left,
                top: selectionButtonPosition.top,
                width: Math.max(22, Math.round(26 * zoomLevel)),
                height: Math.max(22, Math.round(26 * zoomLevel)),
              }}
              aria-label="Create assignment"
            >
              <Plus style={{ width: Math.max(15, Math.round(17 * zoomLevel)), height: Math.max(15, Math.round(17 * zoomLevel)) }} />
            </button>
          )}

          {/* Action Buttons Container - appears when assignment is clicked (hidden for MEMBER role) */}
          {canModifyAssignments && deleteButtonPosition && !isDeleting && selectedAssignment && (
            <div
              className="absolute z-20 flex items-center"
              style={{
                left: deleteButtonPosition.left,
                top: deleteButtonPosition.top,
                gap: Math.round(2 * zoomLevel),
              }}
            >
              {/* Status Change Button - for assignments without a request and not locked */}
              {selectedAssignment && !selectedAssignment.request && !isLockedAssignment(selectedAssignment) && (
                <Popover open={showStatusPopover} onOpenChange={setShowStatusPopover}>
                  <PopoverTrigger asChild>
                    <button
                      className="flex items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground shadow-md transition-colors hover:bg-secondary/80"
                      style={{
                        width: Math.max(22, Math.round(26 * zoomLevel)),
                        height: Math.max(22, Math.round(26 * zoomLevel)),
                      }}
                      aria-label="Change status"
                      title="Change display status"
                    >
                      <Clock4 style={{ width: Math.max(18, Math.round(21 * zoomLevel)), height: Math.max(18, Math.round(21 * zoomLevel)) }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1" align="start">
                    <div className="flex flex-col gap-0.5">
                      <button
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => {
                          updateDisplayStatusMutation.mutate({ id: selectedAssignment.id, displayStatus: DisplayStatus.SCHEDULED });
                        }}
                      >
                        <CalendarCheck className="shrink-0 text-emerald-500" style={{ width: 16, height: 16 }} />
                        Scheduled
                      </button>
                      <button
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => {
                          updateDisplayStatusMutation.mutate({ id: selectedAssignment.id, displayStatus: DisplayStatus.UNSCHEDULED });
                        }}
                      >
                        <Clock4 className="shrink-0" style={{ width: 16, height: 16 }} />
                        Unscheduled
                      </button>
                      <button
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => {
                          updateDisplayStatusMutation.mutate({ id: selectedAssignment.id, displayStatus: DisplayStatus.FORECAST });
                        }}
                      >
                        <TrendingUp className="shrink-0 text-yellow-400" style={{ width: 16, height: 16 }} />
                        Forecast
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {/* Edit Assignment Button */}
              {selectedAssignment && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
                  style={{
                    width: Math.max(22, Math.round(26 * zoomLevel)),
                    height: Math.max(22, Math.round(26 * zoomLevel)),
                  }}
                  aria-label="Edit assignment"
                  title="Edit assignment"
                >
                  <Pencil style={{ width: Math.max(14, Math.round(16 * zoomLevel)), height: Math.max(14, Math.round(16 * zoomLevel)) }} />
                </button>
              )}
              {/* Delete Assignment Button */}
              <button
                onClick={handleDelete}
                disabled={selectedAssignment ? isLockedAssignment(selectedAssignment) : false}
                className={cn(
                  "flex items-center justify-center rounded-full border border-border bg-destructive text-destructive-foreground shadow-md transition-colors hover:bg-destructive/90",
                  selectedAssignment && isLockedAssignment(selectedAssignment) && "opacity-40 cursor-not-allowed"
                )}
                style={{
                  width: Math.max(22, Math.round(26 * zoomLevel)),
                  height: Math.max(22, Math.round(26 * zoomLevel)),
                }}
                aria-label="Delete assignment"
                title={selectedAssignment && isLockedAssignment(selectedAssignment) ? 'Assignment is locked' : 'Delete entire assignment'}
              >
                <X style={{ width: Math.max(16, Math.round(19 * zoomLevel)), height: Math.max(16, Math.round(19 * zoomLevel)) }} />
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Create Assignment Modal */}
      {showCreateModal && selectedDateRange && (selectedMember || selectedMemberForDrag === null) && (
        <CreateAssignmentModal
          open={showCreateModal}
          onOpenChange={(open) => {
            setShowCreateModal(open);
            if (!open) {
              clearSelection();
            }
          }}
          initialStartDate={selectedDateRange.startDate}
          initialEndDate={selectedDateRange.endDate}
          initialMemberId={selectedMember?.id ?? ''}
          initialMemberName={selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : ''}
          isMultiMemberMode={selectedMemberForDrag === null}
          availableMembers={(data?.data.members ?? []).filter(
            (m) => !m.metadata?.hideFromSchedule
          )}
          onSuccess={clearSelection}
        />
      )}

      {/* Edit Assignment Modal */}
      {showEditModal && selectedAssignment && (
        <EditAssignmentModal
          open={showEditModal}
          onOpenChange={(open) => {
            setShowEditModal(open);
            if (!open) {
              clearAssignmentSelection();
            }
          }}
          assignment={selectedAssignment}
          onSuccess={clearAssignmentSelection}
        />
      )}

      {/* Conflict Resolution Modal */}
      {conflictModalState?.open && conflictModalState.droppedAssignment && (
        <ConflictResolutionModal
          open={conflictModalState.open}
          onOpenChange={closeConflictModal}
          droppedAssignment={conflictModalState.droppedAssignment}
          targetMemberName={conflictModalState.targetMemberName}
          conflictingAssignments={conflictModalState.conflictingAssignments}
          gaps={conflictModalState.gaps}
          onScheduleAround={handleScheduleAround}
          onOverwrite={handleOverwrite}
          isLoading={isProcessingDrop}
        />
      )}

      {/* Request Detail Modal (double-click on linked assignment) */}
      <RequestDetailModal
        requestId={requestDetailId}
        open={showRequestDetailModal}
        onOpenChange={(open) => {
          setShowRequestDetailModal(open);
          if (!open) {
            setRequestDetailId(null);
          }
        }}
      />

      {/* Member Profile Modal */}
      <ScheduleMemberProfileModal
        memberId={selectedMemberForProfile}
        open={showMemberProfileModal}
        onOpenChange={(open) => {
          setShowMemberProfileModal(open);
          if (!open) {
            setSelectedMemberForProfile(null);
          }
        }}
      />
    </div>
  );
}
