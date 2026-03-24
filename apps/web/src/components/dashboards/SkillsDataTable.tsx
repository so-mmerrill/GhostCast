import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { SKILL_LEVELS } from '@/hooks/use-dashboard-data';
import type { Member, MemberSkill } from '@/types/member';
import { Card, CardContent } from '@/components/ui/card';

interface SkillsDataTableProps {
  readonly data: { member: Member; memberSkill: MemberSkill }[];
}

type SortColumn = 'member' | 'skill' | 'category' | 'level';
type SortDir = 'asc' | 'desc';

function SortIcon({ column, active, direction }: { column: SortColumn; active: SortColumn | null; direction: SortDir }) {
  if (active !== column) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3 w-3 ml-1" />
    : <ArrowDown className="h-3 w-3 ml-1" />;
}

export function SkillsDataTable({ data }: SkillsDataTableProps) {
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
      case 'skill':
        return dir * (a.memberSkill.skill?.name || '').localeCompare(b.memberSkill.skill?.name || '');
      case 'category':
        return dir * (a.memberSkill.skill?.category || '').localeCompare(b.memberSkill.skill?.category || '');
      case 'level':
        return dir * (a.memberSkill.level - b.memberSkill.level);
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
                <TableHead className="cursor-pointer select-none hover:text-foreground sticky top-0 bg-background" onClick={() => handleSort('skill')}>
                  <span className="inline-flex items-center">Skill<SortIcon column="skill" active={sortCol} direction={sortDir} /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:text-foreground sticky top-0 bg-background" onClick={() => handleSort('category')}>
                  <span className="inline-flex items-center">Category<SortIcon column="category" active={sortCol} direction={sortDir} /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:text-foreground sticky top-0 bg-background w-[140px]" onClick={() => handleSort('level')}>
                  <span className="inline-flex items-center">Proficiency<SortIcon column="level" active={sortCol} direction={sortDir} /></span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No data matches the current filters
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => {
                  const levelInfo = SKILL_LEVELS.find(l => l.value === row.memberSkill.level);
                  return (
                    <TableRow key={`${row.member.id}-${row.memberSkill.skillId}`}>
                      <TableCell className="font-medium text-sm">
                        {row.member.firstName} {row.member.lastName}
                      </TableCell>
                      <TableCell className="text-sm">{row.memberSkill.skill?.name}</TableCell>
                      <TableCell>
                        {row.memberSkill.skill?.category ? (
                          <Badge variant="outline" className="text-xs">{row.memberSkill.skill.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${levelInfo?.bgClass || ''}`}>
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: levelInfo?.color }}
                          />
                          {levelInfo?.label || 'Unknown'}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
