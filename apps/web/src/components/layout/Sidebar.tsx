import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { CalendarDays, LogOut, Moon, Sun, ChevronLeft, ChevronRight, Users, Shield, ClipboardList, Puzzle, /* BarChart3, */ Menu, FlaskConical } from 'lucide-react';
import { Role } from '@ghostcast/shared';
import { hasMinimumRole } from '@/lib/route-permissions';
import logo from '@/assets/logo.png';
import logoIcon from '@/assets/logo_no_words.png';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

type MenuItem = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  minRole?: Role;
  requiredDepartment?: string;
};

const menuItems: MenuItem[] = [
  { to: '/', icon: CalendarDays, label: 'Schedule' },
  { to: '/requests', icon: ClipboardList, label: 'Requests', minRole: Role.REQUESTER },
  { to: '/members', icon: Users, label: 'Members', minRole: Role.REQUESTER },
  // { to: '/dashboards', icon: BarChart3, label: 'Dashboards', minRole: Role.MANAGER },
  { to: '/integrations', icon: Puzzle, label: 'Plugins', minRole: Role.REQUESTER },
  { to: '/research-projects', icon: FlaskConical, label: 'Research Projects', requiredDepartment: 'Research' },
  { to: '/admin', icon: Shield, label: 'Administration', minRole: Role.ADMIN },
];

type SidebarProps = Readonly<{
  visibleMenuItems: MenuItem[];
  initials: string;
  user: ReturnType<typeof useAuth>['user'];
  theme: string;
  toggleTheme: () => void;
  handleLogout: () => void;
  pathname: string;
}>;

function MobileSidebar({
  visibleMenuItems,
  initials,
  user,
  theme,
  toggleTheme,
  handleLogout,
  pathname,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}: SidebarProps & Readonly<{
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}>) {
  return (
    <div className="flex h-14 items-center justify-between bg-gradient-to-r from-blue-900 to-blue-950 px-3">
      <Link to="/" className="flex items-center">
        <img src={logoIcon} alt="GhostCast" className="h-8 w-8 object-contain" />
      </Link>

      <nav className="flex items-center gap-1">
        {visibleMenuItems.map((item) => {
          const isActive = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-700/50 text-white'
                  : 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
              )}
              title={item.label}
            >
              <item.icon className="h-5 w-5" />
            </Link>
          );
        })}
      </nav>

      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-blue-200 hover:bg-blue-800/50 hover:text-white">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72 bg-gradient-to-b from-blue-900 to-blue-950 border-blue-800">
          <SheetHeader>
            <SheetTitle className="text-white">Menu</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <Link
              to="/profile"
              className="flex items-center gap-3 rounded-lg bg-blue-800/50 p-3 transition-colors hover:bg-blue-700/50"
            >
              <Avatar className="h-10 w-10 ring-2 ring-blue-600">
                <AvatarImage src={user?.avatar || undefined} />
                <AvatarFallback className="bg-blue-700 text-blue-100">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {user ? `${user.firstName} ${user.lastName}` : 'Loading...'}
                </p>
                <p className="truncate text-xs text-blue-300">
                  {user?.email || ''}
                </p>
              </div>
            </Link>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-blue-200 hover:bg-blue-800/50 hover:text-white"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-blue-200 hover:bg-red-900/50 hover:text-red-300"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
              Logout
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DesktopSidebar({
  visibleMenuItems,
  initials,
  user,
  theme,
  toggleTheme,
  handleLogout,
  pathname,
  isCollapsed,
  setIsCollapsed,
}: SidebarProps & Readonly<{
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}>) {
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col bg-gradient-to-b from-blue-900 to-blue-950 transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-52'
        )}
      >
        <SidebarHeader isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
        <SidebarNav
          visibleMenuItems={visibleMenuItems}
          pathname={pathname}
          isCollapsed={isCollapsed}
        />
        <SidebarFooter
          user={user}
          initials={initials}
          theme={theme}
          toggleTheme={toggleTheme}
          handleLogout={handleLogout}
          isCollapsed={isCollapsed}
        />
      </aside>
    </TooltipProvider>
  );
}

function SidebarHeader({
  isCollapsed,
  setIsCollapsed,
}: Readonly<{
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}>) {
  if (isCollapsed) {
    return (
      <div className="relative flex h-28 items-center justify-center border-b border-blue-800">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-blue-200 hover:bg-blue-800/50 hover:text-white"
              onClick={() => setIsCollapsed(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-blue-900 text-white border-blue-800">
            Expand sidebar
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="relative flex h-28 items-center justify-center border-b border-blue-800">
      <img src={logo} alt="GhostCast" className="h-24 object-contain" />
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 h-10 w-10 p-0 text-blue-200 hover:bg-blue-800/50 hover:text-white"
        onClick={() => setIsCollapsed(true)}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
    </div>
  );
}

function SidebarNav({
  visibleMenuItems,
  pathname,
  isCollapsed,
}: Readonly<{
  visibleMenuItems: MenuItem[];
  pathname: string;
  isCollapsed: boolean;
}>) {
  return (
    <nav className="flex-1 px-2 py-4">
      {visibleMenuItems.map((item) => (
        <NavItem
          key={item.to}
          item={item}
          isActive={pathname === item.to}
          isCollapsed={isCollapsed}
        />
      ))}
    </nav>
  );
}

function NavItem({
  item,
  isActive,
  isCollapsed,
}: Readonly<{
  item: MenuItem;
  isActive: boolean;
  isCollapsed: boolean;
}>) {
  const linkContent = (
    <Link
      to={item.to}
      className={cn(
        'flex items-center rounded-lg text-sm font-medium transition-all',
        isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
        isActive
          ? 'bg-blue-700/50 text-white'
          : 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
      )}
    >
      <item.icon className="h-5 w-5 flex-shrink-0" />
      {!isCollapsed && item.label}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" className="bg-blue-900 text-white border-blue-800">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

function SidebarFooter({
  user,
  initials,
  theme,
  toggleTheme,
  handleLogout,
  isCollapsed,
}: Readonly<{
  user: ReturnType<typeof useAuth>['user'];
  initials: string;
  theme: string;
  toggleTheme: () => void;
  handleLogout: () => void;
  isCollapsed: boolean;
}>) {
  return (
    <div className="mt-auto border-t border-blue-800">
      <div className={cn('p-2', !isCollapsed && 'p-4')}>
        <UserProfile user={user} initials={initials} isCollapsed={isCollapsed} />
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} isCollapsed={isCollapsed} />
        <LogoutButton handleLogout={handleLogout} isCollapsed={isCollapsed} />
      </div>
    </div>
  );
}

function UserProfile({
  user,
  initials,
  isCollapsed,
}: Readonly<{
  user: ReturnType<typeof useAuth>['user'];
  initials: string;
  isCollapsed: boolean;
}>) {
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/profile"
            className="flex justify-center rounded-lg bg-blue-800/50 p-2 transition-colors hover:bg-blue-700/50"
          >
            <Avatar className="h-8 w-8 ring-2 ring-blue-600">
              <AvatarImage src={user?.avatar || undefined} />
              <AvatarFallback className="bg-blue-700 text-blue-100 text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-blue-900 text-white border-blue-800">
          <p className="font-medium">{user ? `${user.firstName} ${user.lastName}` : 'Loading...'}</p>
          <p className="text-xs text-blue-300">{user?.email || ''}</p>
          <p className="text-xs text-blue-400 mt-1">Click to view profile</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      to="/profile"
      className="flex items-center gap-3 rounded-lg bg-blue-800/50 p-3 transition-colors hover:bg-blue-700/50"
    >
      <Avatar className="h-10 w-10 ring-2 ring-blue-600">
        <AvatarImage src={user?.avatar || undefined} />
        <AvatarFallback className="bg-blue-700 text-blue-100">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-white">
          {user ? `${user.firstName} ${user.lastName}` : 'Loading...'}
        </p>
        <p className="truncate text-xs text-blue-300">
          {user?.email || ''}
        </p>
      </div>
    </Link>
  );
}

function ThemeToggle({
  theme,
  toggleTheme,
  isCollapsed,
}: Readonly<{
  theme: string;
  toggleTheme: () => void;
  isCollapsed: boolean;
}>) {
  const icon = theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />;
  const label = theme === 'dark' ? 'Light Mode' : 'Dark Mode';

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-center text-blue-200 hover:bg-blue-800/50 hover:text-white"
            onClick={toggleTheme}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-blue-900 text-white border-blue-800">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      className="mt-3 w-full justify-start gap-3 text-blue-200 hover:bg-blue-800/50 hover:text-white"
      onClick={toggleTheme}
    >
      {icon}
      {label}
    </Button>
  );
}

function LogoutButton({
  handleLogout,
  isCollapsed,
}: Readonly<{
  handleLogout: () => void;
  isCollapsed: boolean;
}>) {
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-blue-200 hover:bg-red-900/50 hover:text-red-300"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-blue-900 text-white border-blue-800">
          Logout
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start gap-3 text-blue-200 hover:bg-red-900/50 hover:text-red-300"
      onClick={handleLogout}
    >
      <LogOut className="h-5 w-5" />
      Logout
    </Button>
  );
}

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia('(max-width: 767px)');
    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobileView(e.matches);
    };
    handleMediaChange(mediaQuery);
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  useEffect(() => {
    if (!user) {
      navigate({ to: '/login', search: { redirect: location.pathname } });
    }
  }, [user, navigate, location.pathname]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '??';

  const handleLogout = () => {
    void logout().then(() => {
      navigate({ to: '/login', search: { redirect: '/' } });
    });
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const visibleMenuItems = menuItems.filter((item) => {
    const roleOk = !item.minRole || (user && hasMinimumRole(user.role, item.minRole));
    const departmentOk =
      !item.requiredDepartment || (user && user.department === item.requiredDepartment);
    return roleOk && departmentOk;
  });

  const sharedProps: SidebarProps = {
    visibleMenuItems,
    initials,
    user,
    theme,
    toggleTheme,
    handleLogout,
    pathname: location.pathname,
  };

  if (isMobileView) {
    return (
      <MobileSidebar
        {...sharedProps}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />
    );
  }

  return (
    <DesktopSidebar
      {...sharedProps}
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
    />
  );
}
