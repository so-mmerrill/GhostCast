import { useCallback } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { ScheduleView } from '@/components/schedule/ScheduleView';
import { api } from '@/lib/api';
import { useScheduleViewStore } from '@/stores/schedule-view-store';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CalendarDays, Info, Menu, Plus, Minus } from 'lucide-react';

interface ProjectType {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
}

interface Formatter {
  id: string;
  name: string;
  isBold: boolean;
  prefix: string | null;
  suffix: string | null;
  isActive: boolean;
}

export const Route = createFileRoute('/_authenticated/')({
  component: SchedulePage,
});

function SchedulePage() {
  // Zoom state (persisted in schedule view store)
  const ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  const { zoomLevel, setZoomLevel, colorMode, setColorMode } = useScheduleViewStore();

  const handleZoomIn = useCallback(() => {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx === -1) {
      const next = ZOOM_LEVELS.find((l) => l > zoomLevel);
      if (next !== undefined) setZoomLevel(next);
    } else if (idx < ZOOM_LEVELS.length - 1) {
      setZoomLevel(ZOOM_LEVELS[idx + 1]);
    }
  }, [zoomLevel, setZoomLevel]);

  const handleZoomOut = useCallback(() => {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx === -1) {
      const prev = [...ZOOM_LEVELS].reverse().find((l) => l < zoomLevel);
      if (prev !== undefined) setZoomLevel(prev);
    } else if (idx > 0) {
      setZoomLevel(ZOOM_LEVELS[idx - 1]);
    }
  }, [zoomLevel, setZoomLevel]);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
  }, [setZoomLevel]);

  // Fetch project types for legend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projectTypesResponse } = useQuery<any>({
    queryKey: ['project-types'],
    queryFn: () => api.get('/project-types', { pageSize: '1000' }),
  });

  // Fetch formatters for legend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: formattersResponse } = useQuery<any>({
    queryKey: ['formatters'],
    queryFn: () => api.get('/formatters'),
  });

  // Handle multiple possible response structures
  const getProjectTypesArray = (): ProjectType[] => {
    if (!projectTypesResponse) return [];
    if (Array.isArray(projectTypesResponse.data)) return projectTypesResponse.data;
    if (projectTypesResponse.data?.data && Array.isArray(projectTypesResponse.data.data)) {
      return projectTypesResponse.data.data;
    }
    if (Array.isArray(projectTypesResponse)) return projectTypesResponse;
    return [];
  };
  const projectTypes = getProjectTypesArray().filter((pt) => pt.isActive);

  const getFormattersArray = (): Formatter[] => {
    if (!formattersResponse) return [];
    if (Array.isArray(formattersResponse.data)) return formattersResponse.data;
    if (formattersResponse.data?.data && Array.isArray(formattersResponse.data.data)) {
      return formattersResponse.data.data;
    }
    if (Array.isArray(formattersResponse)) return formattersResponse;
    return [];
  };
  const formatters = getFormattersArray().filter((f) => f.isActive);

  return (
    <div className="flex h-full flex-col overflow-hidden p-6 gap-3">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
        </div>

        {/* Color mode toggle + Legend */}
        <div className="flex items-center justify-end gap-2">
            {/* Assessment / Request color mode toggle */}
            <div className="hidden sm:flex items-center rounded-md border border-input">
              <Button
                variant={colorMode === 'project-type' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-r-none h-8 px-3 text-xs"
                onClick={() => setColorMode('project-type')}
              >
                Project Types
              </Button>
              <Button
                variant={colorMode === 'assignment' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none h-8 px-3 text-xs"
                onClick={() => setColorMode('assignment')}
              >
                Assignments
              </Button>
              <Button
                variant={colorMode === 'client' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-l-none h-8 px-3 text-xs"
                onClick={() => setColorMode('client')}
              >
                Clients
              </Button>
            </div>
            {/* Mobile Menu - visible only on mobile */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Color Mode */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Color Mode</h4>
                  <div className="flex items-center rounded-md border border-input">
                    <Button
                      variant={colorMode === 'project-type' ? 'default' : 'ghost'}
                      size="sm"
                      className="flex-1 rounded-r-none h-8 text-xs"
                      onClick={() => setColorMode('project-type')}
                    >
                      Project Types
                    </Button>
                    <Button
                      variant={colorMode === 'assignment' ? 'default' : 'ghost'}
                      size="sm"
                      className="flex-1 rounded-none h-8 text-xs"
                      onClick={() => setColorMode('assignment')}
                    >
                      Assignments
                    </Button>
                    <Button
                      variant={colorMode === 'client' ? 'default' : 'ghost'}
                      size="sm"
                      className="flex-1 rounded-l-none h-8 text-xs"
                      onClick={() => setColorMode('client')}
                    >
                      Clients
                    </Button>
                  </div>
                </div>
                {/* Legend */}
                <div className="max-h-[300px] overflow-y-auto">
                  <h4 className="mb-3 text-sm font-semibold text-muted-foreground">Legend</h4>
                  <div className="space-y-4">
                    <div>
                      <h5 className="mb-2 text-sm font-medium">Project Types</h5>
                      {projectTypes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No project types</p>
                      ) : (
                        <div className="space-y-1.5">
                          {projectTypes.map((pt) => (
                            <div key={pt.id} className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: pt.color }}
                              />
                              <span className="text-sm">{pt.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {formatters.length > 0 && (
                      <div>
                        <h5 className="mb-2 text-sm font-medium">Formatters</h5>
                        <div className="space-y-1.5">
                          {formatters.map((f) => (
                            <div key={f.id} className="flex items-center gap-2">
                              <span className={`text-sm ${f.isBold ? 'font-bold' : ''}`}>
                                {f.prefix && <span className="text-muted-foreground">{f.prefix} </span>}
                                {f.name}
                                {f.suffix && <span className="text-muted-foreground"> {f.suffix}</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Keyboard Shortcuts */}
                    <div>
                      <h5 className="mb-2 text-sm font-medium">Keyboard Shortcuts</h5>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">New assignment</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+N</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Copy</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+C</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Cut</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+X</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Paste</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+V</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Edit</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+E</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Undo</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+Z</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Delete</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Del</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Move cell</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Arrows</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Extend selection</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Shift+←→</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Scheduled</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Alt+1</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Forecast</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Alt+2</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Unscheduled</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Alt+3</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Zoom in</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl++</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Zoom out</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+-</kbd></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Reset zoom</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+0</kbd></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
            {/* Legend button - hidden below sm */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="hidden sm:flex h-9 w-9" title="Legend">
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 max-h-[400px] overflow-y-auto">
                <div className="space-y-4">
                  {/* Project Types */}
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Project Types</h4>
                    {projectTypes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No project types</p>
                    ) : (
                      <div className="space-y-1.5">
                        {projectTypes.map((pt) => (
                          <div key={pt.id} className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: pt.color }}
                            />
                            <span className="text-sm">{pt.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Formatters */}
                  {formatters.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold">Formatters</h4>
                      <div className="space-y-1.5">
                        {formatters.map((f) => (
                          <div key={f.id} className="flex items-center gap-2">
                            <span className={`text-sm ${f.isBold ? 'font-bold' : ''}`}>
                              {f.prefix && <span className="text-muted-foreground">{f.prefix} </span>}
                              {f.name}
                              {f.suffix && <span className="text-muted-foreground"> {f.suffix}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Keyboard Shortcuts */}
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Keyboard Shortcuts</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">New assignment</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+N</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Copy</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+C</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Cut</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+X</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Paste</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+V</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Edit</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+E</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Undo</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+Z</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Delete</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Del</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Move cell</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Arrows</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Extend selection</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Shift+←→</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Scheduled</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Alt+1</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Forecast</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Alt+2</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Unscheduled</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Alt+3</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Zoom in</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl++</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Zoom out</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+-</kbd></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Reset zoom</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl+0</kbd></div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
        </div>
      </div>

      {/* Schedule View */}
      <div className="flex-1 min-h-0">
        <ScheduleView
          zoomLevel={zoomLevel}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
        />
      </div>

      {/* Footer - Zoom Controls */}
      <div className="flex flex-shrink-0 items-center justify-center -mb-6 -mt-3">
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleZoomOut}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Zoom out"
            title="Zoom out (Ctrl+-)"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-9 select-none text-center text-xs text-muted-foreground">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Zoom in"
            title="Zoom in (Ctrl++)"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
