import { useState, useRef, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface ProjectRole {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive?: boolean;
}

interface MemberProjectRole {
  id: string;
  projectRoleId: string;
  createdAt: string;
  projectRole: ProjectRole;
}

interface MemberRolesTabProps {
  readonly memberId: string;
  readonly projectRoles?: MemberProjectRole[];
  readonly onUpdate?: () => void;
  readonly readOnly?: boolean;
}

type RoleSortColumn = 'name' | 'description';
type SortDirection = 'asc' | 'desc';

function SortIcon<T extends string>({ column, activeColumn, direction }: Readonly<{ column: T; activeColumn: T | null; direction: SortDirection }>) {
  if (activeColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground/50" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
    : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
}

export function MemberRolesTab({ memberId, projectRoles: initialProjectRoles, onUpdate, readOnly }: MemberRolesTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sortColumn, setSortColumn] = useState<RoleSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (column: RoleSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Fetch member's project roles directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: memberRolesResponse } = useQuery<any>({
    queryKey: ['member-project-roles', memberId],
    queryFn: () => api.get(`/members/${memberId}/project-roles`),
  });

  // Handle multiple possible response structures for member roles
  const getMemberRoles = (): MemberProjectRole[] => {
    if (!memberRolesResponse) return initialProjectRoles || [];
    // Structure: { data: [...] }
    if (Array.isArray(memberRolesResponse.data)) return memberRolesResponse.data;
    // Structure: { data: { data: [...] } }
    if (memberRolesResponse.data?.data && Array.isArray(memberRolesResponse.data.data)) {
      return memberRolesResponse.data.data;
    }
    // Structure: direct array
    if (Array.isArray(memberRolesResponse)) return memberRolesResponse;
    return initialProjectRoles || [];
  };

  const memberProjectRoles = getMemberRoles();

  const sortedRoles = [...memberProjectRoles].sort((a, b) => {
    if (!sortColumn) return 0;
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortColumn) {
      case 'name':
        return dir * a.projectRole.name.localeCompare(b.projectRole.name);
      case 'description':
        return dir * (a.projectRole.description || '').localeCompare(b.projectRole.description || '');
      default:
        return 0;
    }
  });

  // Fetch all available project roles (use large pageSize to get all roles)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projectRolesResponse } = useQuery<any>({
    queryKey: ['project-roles', 'all'],
    queryFn: () => api.get('/project-roles?pageSize=1000'),
  });

  // Handle multiple possible response structures
  const getAllRoles = (): ProjectRole[] => {
    if (!projectRolesResponse) return [];
    // Structure: { data: [...] }
    if (Array.isArray(projectRolesResponse.data)) return projectRolesResponse.data;
    // Structure: { data: { data: [...] } }
    if (projectRolesResponse.data?.data && Array.isArray(projectRolesResponse.data.data)) {
      return projectRolesResponse.data.data;
    }
    // Structure: direct array
    if (Array.isArray(projectRolesResponse)) return projectRolesResponse;
    return [];
  };

  // Filter out already assigned roles (only show active roles)
  const availableRoles = getAllRoles().filter(
    (role) => role.isActive !== false && !memberProjectRoles.some((pr) => pr.projectRoleId === role.id)
  );

  const filteredRoles = availableRoles.filter((role) =>
    role.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddRole = async (roleId: string) => {
    if (isAdding) return;

    setIsAdding(true);
    try {
      await api.post(`/members/${memberId}/project-roles`, {
        projectRoleId: roleId,
      });
      queryClient.invalidateQueries({ queryKey: ['member-project-roles', memberId] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast({
        title: 'Role added',
        description: 'Project role has been assigned to the member.',
      });
      setSearchQuery('');
      setIsDropdownOpen(false);
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'Failed to add role',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveRole = async (projectRoleId: string, roleName: string) => {
    try {
      await api.delete(`/members/${memberId}/project-roles/${projectRoleId}`);
      queryClient.invalidateQueries({ queryKey: ['member-project-roles', memberId] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast({
        title: 'Role removed',
        description: `${roleName} has been removed from the member.`,
      });
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'Failed to remove role',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen || filteredRoles.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredRoles.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredRoles[selectedIndex]) {
          handleAddRole(filteredRoles[selectedIndex].id);
        }
        break;
      case 'Escape':
        setIsDropdownOpen(false);
        break;
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Search input for adding roles */}
      {!readOnly && (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search and add a role..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              onKeyDown={handleKeyDown}
              className="pl-9"
            />
          </div>

          {/* Search results dropdown */}
          {isDropdownOpen && searchQuery && (
            <div
              ref={dropdownRef}
              className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg"
            >
              {filteredRoles.length === 0 ? (
                <div className="py-3 px-3 text-sm text-muted-foreground">
                  No matching roles found
                </div>
              ) : (
                <div className="max-h-60 overflow-auto py-1">
                  {filteredRoles.map((role, index) => (
                    <button
                      key={role.id}
                      type="button"
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent cursor-pointer ${
                        index === selectedIndex ? 'bg-accent' : ''
                      }`}
                      onClick={() => handleAddRole(role.id)}
                      disabled={isAdding}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: role.color || '#6B7280' }}
                      />
                      <span className="font-medium">{role.name}</span>
                      {role.description && (
                        <span className="text-muted-foreground truncate">
                          — {role.description}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('name')}>
              <span className="inline-flex items-center">Role<SortIcon column="name" activeColumn={sortColumn} direction={sortDirection} /></span>
            </TableHead>
            <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('description')}>
              <span className="inline-flex items-center">Description<SortIcon column="description" activeColumn={sortColumn} direction={sortDirection} /></span>
            </TableHead>
            {!readOnly && <TableHead className="w-[80px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRoles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={readOnly ? 2 : 3} className="text-center text-muted-foreground py-8">
                {readOnly ? 'No roles assigned.' : 'No roles assigned. Search above to add roles.'}
              </TableCell>
            </TableRow>
          ) : (
            sortedRoles.map((pr) => (
              <TableRow key={pr.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: pr.projectRole.color || '#6B7280' }}
                    />
                    <span className="font-medium">{pr.projectRole.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {pr.projectRole.description ? (
                    <span className="text-sm text-muted-foreground">
                      {pr.projectRole.description}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveRole(pr.projectRoleId, pr.projectRole.name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
