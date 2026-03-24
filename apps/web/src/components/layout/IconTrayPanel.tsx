import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useIconTrayStore } from '@/stores/icon-tray-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function IconTrayPanel() {
  const { registrations, activePanelId, closePanel } = useIconTrayStore();
  const panelRef = useRef<HTMLDivElement>(null);

  const activeRegistration = registrations.find((r) => r.id === activePanelId);

  // Close panel when clicking outside
  useEffect(() => {
    if (!activePanelId) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element;

      // Don't close if clicking on the panel itself
      if (panelRef.current?.contains(target)) {
        return;
      }

      // Don't close if clicking on the icon tray buttons
      const iconTray = document.querySelector('.fixed.bottom-4.right-4.z-40');
      if (iconTray?.contains(target)) {
        return;
      }

      // Don't close if clicking on Radix UI portals (dropdowns, selects, popovers, etc.)
      if (target.closest('[data-radix-popper-content-wrapper]') ||
          target.closest('[data-radix-portal]') ||
          target.closest('[role="listbox"]')) {
        return;
      }

      closePanel();
    }

    // Add listener with a small delay to avoid immediate close on the same click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activePanelId, closePanel]);

  // Close on escape key
  useEffect(() => {
    if (!activePanelId) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closePanel();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [activePanelId, closePanel]);

  if (!activeRegistration) {
    return null;
  }

  const { PanelComponent, panelTitle, windowWidth, windowHeight, hideCloseButton, HeaderComponent } = activeRegistration;

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-[45] flex flex-col',
        'bg-background dark:bg-zinc-800 border dark:border-zinc-600 rounded-lg shadow-2xl',
        'animate-in fade-in-0 zoom-in-95 duration-200',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
      )}
      style={{
        bottom: '5rem', // Position above the icon tray
        right: '1rem',
        width: `${windowWidth}px`,
        height: `${windowHeight}px`,
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100vh - 7rem)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-t-lg px-4 py-3">
        <h3 className="font-semibold text-sm">{panelTitle}</h3>
        <div className="flex items-center gap-2">
          {HeaderComponent && <HeaderComponent />}
          {!hideCloseButton && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
              onClick={closePanel}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <PanelComponent onClose={closePanel} />
      </div>
    </div>
  );
}
