import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { Member, MemberProjectRole } from '@/types/member';
import { Card, CardContent } from '@/components/ui/card';

interface RolesDataTableProps {
  readonly data: { member: Member; memberRole: MemberProjectRole }[];
}

type SortColumn = 'member' | 'role' | 'dateAwarded';
type SortDir = 'asc' | 'desc';

function SortIcon({ column, active, direction }: { column: SortColumn; active: SortColumn | null; direction: SortDir }) {
  if (active !== column) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3 w-3 ml-1" />
    : <ArrowDown className="h-3 w-3 ml-1" />;
}

export function RolesDataTable({ data }: RolesDataTableProps) {
  const [sortCol, setSortCol] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortCol) return 0;
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortCol) {
      case 'member':
        return dir * `${a.member.firstName} ${a.member.lastName}`.localeCompare(`${b.member.firstName} ${b.member.lastName}`);
      case 'role':
        return dir * (a.memberRole.projectRole?.name || '').localeCompare(b.memberRole.projectRole?.name || '');
      case 'dateAwarded':
        return dir * (a.memberRole.dateAwarded || '').localeCompare(b.memberRole.dateAwarded || '');
      default:
        return 0;
    }
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Detailed Data</h3>
          <span className="text-xs text-muted-foreground">{data.length} entries</span>
        </div>
        <div className="max-h-96 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none hover:text-foreground sticky top-0 bg-background" onClick={() => handleSort('member')}>
                  <span className="inline-flex items-center">Member<SortIcon column="member" active={sortCol} direction={sortDir} /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:text-foreground sticky top-0 bg-background" onClick={() => handleSort('role')}>
                  <span className="inline-flex items-center">Role<SortIcon column="role" active={sortCol} direction={sortDir} /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:text-foreground sticky top-0 bg-background" onClick={() => handleSort('dateAwarded')}>
                  <span className="inline-flex items-center">Date Awarded<SortIcon column="dateAwarded" active={sortCol} direction={sortDir} /></span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No data matches the current filters
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <TableRow key={`${row.member.id}-${row.memberRole.projectRoleId}`}>
                    <TableCell className="font-medium text-sm">
                      {row.member.firstName} {row.member.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: row.memberRole.projectRole?.color || '#6B7280' }}
                        />
                        <span className="text-sm">{row.memberRole.projectRole?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.memberRole.dateAwarded
                        ? new Date(row.memberRole.dateAwarded).toLocaleDateString()
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
