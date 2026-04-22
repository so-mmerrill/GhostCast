import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SKILL_LEVELS } from '@/hooks/use-dashboard-data';

interface SkillHeatmapProps {
  readonly members: { id: string; name: string }[];
  readonly skills: { id: string; name: string; category: string | null }[];
  readonly lookup: Map<string, Map<string, number>>;
}

function getLevelColor(level: number): string {
  switch (level) {
    case 1: return 'bg-gray-200 dark:bg-gray-700';
    case 2: return 'bg-blue-300 dark:bg-blue-800';
    case 3: return 'bg-yellow-300 dark:bg-yellow-700';
    case 4: return 'bg-orange-400 dark:bg-orange-700';
    case 5: return 'bg-green-500 dark:bg-green-700';
    default: return '';
  }
}

export function SkillHeatmap({ members, skills, lookup }: SkillHeatmapProps) {
  if (members.length === 0 || skills.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Skill Proficiency Heatmap</h3>
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No data to display
          </div>
        </CardContent>
      </Card>
    );
  }

  // Limit to 30 skills and 50 members for readability
  const displaySkills = skills.slice(0, 30);
  const displayMembers = members.slice(0, 50);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Skill Proficiency Heatmap</h3>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {SKILL_LEVELS.map(sl => (
              <span key={sl.value} className="flex items-center gap-1">
                <span className={`inline-block w-3 h-3 rounded-sm ${getLevelColor(sl.value)}`} />
                {sl.value} - {sl.label}
              </span>
            ))}
          </div>
        </div>

        <TooltipProvider delayDuration={100}>
          <div className="overflow-x-auto">
            <div
              className="grid gap-px"
              style={{
                gridTemplateColumns: `160px repeat(${displaySkills.length}, 32px)`,
              }}
            >
              {/* Header row */}
              <div /> {/* empty corner */}
              {displaySkills.map(skill => (
                <Tooltip key={skill.id}>
                  <TooltipTrigger asChild>
                    <div className="flex items-end justify-center h-20 pb-1">
                      <span
                        className="text-[9px] text-muted-foreground whitespace-nowrap origin-bottom-left"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        {skill.name.length > 15 ? skill.name.slice(0, 14) + '...' : skill.name}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs font-medium">{skill.name}</p>
                    {skill.category && <p className="text-xs text-muted-foreground">{skill.category}</p>}
                  </TooltipContent>
                </Tooltip>
              ))}

              {/* Data rows */}
              {displayMembers.map(member => {
                const memberMap = lookup.get(member.id);
                return (
                  <div key={member.id} className="contents">
                    <div className="flex items-center px-1 h-7 text-xs truncate text-muted-foreground">
                      {member.name}
                    </div>
                    {displaySkills.map(skill => {
                      const level = memberMap?.get(skill.id);
                      const levelInfo = level ? SKILL_LEVELS.find(l => l.value === level) : undefined;

                      return (
                        <Tooltip key={skill.id}>
                          <TooltipTrigger asChild>
                            <div
                              className={`h-7 w-7 rounded-sm border border-border/30 ${
                                level ? getLevelColor(level) : 'bg-muted/20'
                              }`}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">
                              <span className="font-medium">{member.name}</span>
                              {' / '}
                              <span>{skill.name}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {levelInfo ? `${levelInfo.value} - ${levelInfo.label}` : 'No assignment'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </TooltipProvider>

        {(members.length > 50 || skills.length > 30) && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Showing {Math.min(members.length, 50)} of {members.length} members and {Math.min(skills.length, 30)} of {skills.length} skills
          </p>
        )}
      </CardContent>
    </Card>
  );
}
