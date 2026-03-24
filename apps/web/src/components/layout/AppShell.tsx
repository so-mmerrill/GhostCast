import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { IconTray } from './IconTray';
import { IconTrayPanel } from './IconTrayPanel';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: Readonly<AppShellProps>) {
  return (
    <div className="flex h-screen flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Icon Tray - Fixed position bottom-right */}
      <IconTray />

      {/* Floating overlay panel for active icon */}
      <IconTrayPanel />
    </div>
  );
}
