import * as LucideIcons from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CatalogWithInstallStatus, PluginType, PluginScope } from '@ghostcast/shared';
import { cn } from '@/lib/utils';

function StatusBadge({ item }: Readonly<{ item: CatalogWithInstallStatus }>) {
  if (!item.isInstalled) {
    return <span className="text-xs text-muted-foreground">v{item.version}</span>;
  }
  if (item.scope === PluginScope.USER) {
    return <Badge variant="secondary" className="text-xs">Installed</Badge>;
  }
  return (
    <Badge variant={item.installed?.isEnabled ? 'default' : 'outline'} className="text-xs">
      {item.installed?.isEnabled ? 'Enabled' : 'Disabled'}
    </Badge>
  );
}

interface IntegrationCardProps {
  item: CatalogWithInstallStatus;
  onClick: () => void;
}

export function IntegrationCard({ item, onClick }: Readonly<IntegrationCardProps>) {
  // Dynamic icon lookup
  const IconComponent =
    (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon] ||
    LucideIcons.Puzzle;

  const isIntegration = item.type === PluginType.INTEGRATION;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md',
        item.isInstalled && 'border-green-500/30 bg-green-50/50 dark:bg-green-950/10'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
              isIntegration ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'
            )}
          >
            <IconComponent
              className={cn(
                'h-6 w-6',
                isIntegration ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'
              )}
            />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="truncate font-semibold">{item.displayName}</h3>
              {/* Scope tag (User/Admin) */}
              {item.tags?.includes('User') && (
                <Badge variant="outline" className="shrink-0 border-teal-500 bg-teal-50 text-xs text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  User
                </Badge>
              )}
              {item.tags?.includes('Admin') && (
                <Badge variant="outline" className="shrink-0 border-amber-500 bg-amber-50 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  Admin
                </Badge>
              )}
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            <Badge variant={isIntegration ? 'default' : 'secondary'} className="text-xs">
              {isIntegration ? 'Integration' : 'Extension'}
            </Badge>
            <span className="text-xs text-muted-foreground">{item.category}</span>
          </div>
          <StatusBadge item={item} />
        </div>
      </CardContent>
    </Card>
  );
}
