import { Card, CardContent } from '@/components/ui/card';

interface DashboardStatsCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly description?: string;
  readonly iconColorClass?: string;
}

export function DashboardStatsCard({ title, value, icon: Icon, description, iconColorClass = 'text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30' }: DashboardStatsCardProps) {
  const [textColor, bgColor] = iconColorClass.split(' ').reduce<[string, string]>(
    (acc, cls) => {
      if (cls.startsWith('text-')) acc[0] = cls;
      else if (cls.startsWith('bg-')) acc[1] = cls;
      return acc;
    },
    ['text-indigo-600', 'bg-indigo-100'],
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bgColor} dark:bg-opacity-30`}>
            <Icon className={`h-4.5 w-4.5 ${textColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-xl font-bold tracking-tight">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
