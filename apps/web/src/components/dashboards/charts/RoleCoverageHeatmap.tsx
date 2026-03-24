import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RoleCoverageHeatmapProps {
  readonly members: { id: string; name: string }[];
  readonly roles: { id: string; name: string; color: string }[];
  readonly lookup: Map<string, Set<string>>;
}

export function RoleCoverageHeatmap({ members, roles, lookup }: RoleCoverageHeatmapProps) {
  if (members.length === 0 || roles.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Role Coverage Matrix</h3>
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No data to display
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayRoles = roles.slice(0, 30);
  const displayMembers = members.slice(0, 50);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Role Coverage Matrix</h3>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500 dark:bg-indigo-600" />
              Has role
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-muted/20 border border-border/30" />
              No role
            </span>
          </div>
        </div>

        <TooltipProvider delayDuration={100}>
          <div className="overflow-x-auto">
            <div
              className="grid gap-px"
              style={{
                gridTemplateColumns: `160px repeat(${displayRoles.length}, 32px)`,
              }}
            >
              {/* Header row */}
              <div /> {/* empty corner */}
              {displayRoles.map(role => (
                <Tooltip key={role.id}>
                  <TooltipTrigger asChild>
                    <div className="flex items-end justify-center h-20 pb-1">
                      <span
                        className="text-[9px] text-muted-foreground whitespace-nowrap origin-bottom-left"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        {role.name.length > 15 ? role.name.slice(0, 14) + '...' : role.name}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                      <span className="text-xs font-medium">{role.name}</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}

              {/* Data rows */}
              {displayMembers.map(member => {
                const memberRoles = lookup.get(member.id);
                return (
                  <div key={member.id} className="contents">
                    <div className="flex items-center px-1 h-7 text-xs truncate text-muted-foreground">
                      {member.name}
                    </div>
                    {displayRoles.map(role => {
                      const hasRole = memberRoles?.has(role.id) ?? false;
                      return (
                        <Tooltip key={role.id}>
                          <TooltipTrigger asChild>
                            <div
                              className={`h-7 w-7 rounded-sm border border-border/30 ${
                                hasRole
                                  ? 'bg-indigo-500 dark:bg-indigo-600'
                                  : 'bg-muted/20'
                              }`}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">
                              <span className="font-medium">{member.name}</span>
                              {' / '}
                              <span>{role.name}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {hasRole ? 'Has role' : 'No role'}
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

        {(members.length > 50 || roles.length > 30) && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Showing {Math.min(members.length, 50)} of {members.length} members and {Math.min(roles.length, 30)} of {roles.length} roles
          </p>
        )}
      </CardContent>
    </Card>
  );
}
