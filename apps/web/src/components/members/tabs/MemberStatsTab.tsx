import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';

interface ProjectTypeStat {
  projectTypeId: string;
  projectTypeName: string;
  projectTypeColor: string;
  projectTypeAbbreviation: string | null;
  count: number;
  lastAssignmentDate: string;
}

interface MemberAssignmentStats {
  linkedRequests: ProjectTypeStat[];
  noLinkedRequest: ProjectTypeStat[];
}

interface MemberStatsTabProps {
  memberId: string;
}

export function MemberStatsTab({ memberId }: Readonly<MemberStatsTabProps>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: statsResponse, isLoading, error } = useQuery<any>({
    queryKey: ['member-stats', memberId],
    queryFn: () => api.get<MemberAssignmentStats>(`/members/${memberId}/stats`),
  });

  // Handle response structure variations
  const stats: MemberAssignmentStats | undefined =
    statsResponse?.data ?? statsResponse;

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="text-muted-foreground">Loading statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load statistics
      </div>
    );
  }

  const renderStatsTable = (data: ProjectTypeStat[], emptyMessage: string) => {
    if (data.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project Type</TableHead>
            <TableHead className="text-center w-[80px]">Count</TableHead>
            <TableHead className="w-[140px]">Last Assignment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((stat) => (
            <TableRow key={stat.projectTypeId}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stat.projectTypeColor }}
                  />
                  <span className="font-medium">{stat.projectTypeName}</span>
                  {stat.projectTypeAbbreviation && (
                    <span className="text-muted-foreground text-xs">
                      ({stat.projectTypeAbbreviation})
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center font-semibold">
                {stat.count}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(stat.lastAssignmentDate), 'MMM d, yyyy')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="p-4 space-y-6">
      {/* Linked Requests Section */}
      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">
          Linked Requests
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Unique requests by project type (current year)
        </p>
        {renderStatsTable(
          stats?.linkedRequests || [],
          'No assignments with linked requests found.'
        )}
      </div>

      {/* No Linked Request Section */}
      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">
          No Linked Request
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Assignments without linked requests (current year)
        </p>
        {renderStatsTable(
          stats?.noLinkedRequest || [],
          'No assignments without linked requests found.'
        )}
      </div>
    </div>
  );
}
