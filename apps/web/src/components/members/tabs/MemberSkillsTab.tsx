import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  category: string | null;
  isActive: boolean;
}

interface MemberSkill {
  id: string;
  skillId: string;
  level: number;
  skill: Skill;
}

interface MemberSkillsTabProps {
  readonly memberId: string;
  readonly skills: MemberSkill[];
  readonly onUpdate?: () => void;
  readonly readOnly?: boolean;
}

const SKILL_LEVELS = [
  { value: 1, label: 'No skill', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { value: 2, label: 'Foundational', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 3, label: 'Working', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 4, label: 'Proficient', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 5, label: 'Mastery', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
];

type SkillSortColumn = 'name' | 'category' | 'level';
type SortDirection = 'asc' | 'desc';

function SortIcon<T extends string>({ column, activeColumn, direction }: Readonly<{ column: T; activeColumn: T | null; direction: SortDirection }>) {
  if (activeColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground/50" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
    : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
}

export function MemberSkillsTab({ memberId, skills, onUpdate, readOnly }: MemberSkillsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [sortColumn, setSortColumn] = useState<SkillSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (column: SkillSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedSkills = [...skills].sort((a, b) => {
    if (!sortColumn) return 0;
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortColumn) {
      case 'name':
        return dir * a.skill.name.localeCompare(b.skill.name);
      case 'category':
        return dir * (a.skill.category || '').localeCompare(b.skill.category || '');
      case 'level':
        return dir * (a.level - b.level);
      default:
        return 0;
    }
  });

  // Fetch all available skills
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: skillsResponse } = useQuery<any>({
    queryKey: ['skills'],
    queryFn: () => api.get('/skills?pageSize=1000'),
  });

  // Handle multiple possible response structures
  const getSkillsArray = (): Skill[] => {
    if (!skillsResponse) return [];
    if (Array.isArray(skillsResponse.data)) return skillsResponse.data;
    if (skillsResponse.data?.data && Array.isArray(skillsResponse.data.data)) {
      return skillsResponse.data.data;
    }
    if (Array.isArray(skillsResponse)) return skillsResponse;
    return [];
  };
  const allSkillsData = getSkillsArray().filter((s: Skill) => s.isActive);

  const handleAddSkill = async () => {
    if (!selectedSkillId) return;

    setIsAdding(true);
    try {
      await api.post(`/members/${memberId}/skills`, {
        skillId: selectedSkillId,
        level: selectedLevel,
      });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast({
        title: 'Skill added',
        description: 'Skill has been added to the member.',
      });
      setShowAddDialog(false);
      setSelectedSkillId('');
      setSelectedLevel(1);
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'Failed to add skill',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveSkill = async (skillId: string, skillName: string) => {
    try {
      await api.delete(`/members/${memberId}/skills/${skillId}`);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast({
        title: 'Skill removed',
        description: `${skillName} has been removed from the member.`,
      });
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'Failed to remove skill',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleLevelChange = async (skillId: string, level: number) => {
    try {
      await api.put(`/members/${memberId}/skills/${skillId}`, { level });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast({
        title: 'Skill updated',
        description: 'Proficiency level has been updated.',
      });
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'Failed to update skill',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  // Filter out already assigned skills
  const availableSkills =
    allSkillsData?.filter((skill) => !skills.some((ms) => ms.skillId === skill.id)) || [];

  return (
    <div className="p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('name')}>
              <span className="inline-flex items-center">Skill<SortIcon column="name" activeColumn={sortColumn} direction={sortDirection} /></span>
            </TableHead>
            <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('category')}>
              <span className="inline-flex items-center">Category<SortIcon column="category" activeColumn={sortColumn} direction={sortDirection} /></span>
            </TableHead>
            <TableHead className="w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('level')}>
              <span className="inline-flex items-center">Proficiency<SortIcon column="level" activeColumn={sortColumn} direction={sortDirection} /></span>
            </TableHead>
            {!readOnly && (
              <TableHead className="w-[100px] text-right">
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus/>Add
                </Button>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedSkills.length === 0 ? (
            <TableRow>
              <TableCell colSpan={readOnly ? 3 : 4} className="text-center text-muted-foreground py-8">
                {readOnly ? 'No skills assigned.' : 'No skills assigned. Click "Add Skill" to get started.'}
              </TableCell>
            </TableRow>
          ) : (
            sortedSkills.map((ms) => {
              const levelInfo = SKILL_LEVELS.find((l) => l.value === ms.level);
              return (
                <TableRow key={ms.id}>
                  <TableCell className="font-medium">{ms.skill.name}</TableCell>
                  <TableCell>
                    {ms.skill.category ? (
                      <Badge variant="outline">{ms.skill.category}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {readOnly ? (
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${levelInfo?.color || ''}`}>
                        {levelInfo?.label || 'Unknown'}
                      </span>
                    ) : (
                      <Select
                        value={String(ms.level)}
                        onValueChange={(value) => handleLevelChange(ms.skillId, Number(value))}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SKILL_LEVELS.map((level) => (
                            <SelectItem key={level.value} value={String(level.value)}>
                              <span className="flex items-center gap-2">
                                <span
                                  className={`inline-block w-2 h-2 rounded-full ${level.color.split(' ')[0]}`}
                                />
                                {level.value} - {level.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveSkill(ms.skillId, ms.skill.name)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Add Skill Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Skill</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Skill</Label>
              <Select value={selectedSkillId} onValueChange={setSelectedSkillId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a skill" />
                </SelectTrigger>
                <SelectContent>
                  {availableSkills.length === 0 ? (
                    <div className="py-2 px-2 text-sm text-muted-foreground">
                      No skills available
                    </div>
                  ) : (
                    availableSkills.map((skill) => (
                      <SelectItem key={skill.id} value={skill.id}>
                        {skill.name}
                        {skill.category && ` (${skill.category})`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Proficiency Level</Label>
              <Select
                value={String(selectedLevel)}
                onValueChange={(v) => setSelectedLevel(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={String(level.value)}>
                      {level.value} - {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSkill} disabled={!selectedSkillId || isAdding}>
              {isAdding ? 'Adding...' : 'Add Skill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
