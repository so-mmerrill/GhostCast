import * as LucideIcons from 'lucide-react';
import { useIconTrayStore } from '@/stores/icon-tray-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function IconTray() {
  const { registrations, activePanelId, togglePanel } = useIconTrayStore();

  if (registrations.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
        {registrations.map((registration) => {
          const isActive = activePanelId === registration.id;

          // Show X icon when panel is active, otherwise show the configured icon
          const IconComponent = isActive
            ? LucideIcons.X
            : (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
                registration.icon
              ] || LucideIcons.Puzzle;

          return (
            <Tooltip key={registration.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? 'default' : 'outline'}
                  className={cn(
                    'relative h-12 w-12 rounded-full shadow-lg transition-all',
                    'hover:scale-110',
                    isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                    !isActive && 'bg-gradient-to-br from-violet-600 to-indigo-600 border-0 text-white hover:from-violet-700 hover:to-indigo-700 hover:text-white'
                  )}
                  onClick={() => togglePanel(registration.id)}
                >
                  <IconComponent className="h-5 w-5" />
                  {registration.badgeCount !== undefined && registration.badgeCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-xs flex items-center justify-center"
                    >
                      {registration.badgeCount > 99 ? '99+' : registration.badgeCount}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{registration.tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
