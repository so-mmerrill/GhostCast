import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { usePaginatedSearch } from '@/hooks/use-paginated-search';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Mail, Phone, Building2, User, Users, CalendarOff, ChevronsUpDown, Check } from 'lucide-react';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  managerId: string | null;
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface MemberInfoTabProps {
  member: Member;
  isEditing: boolean;
  hideFromSchedule: boolean;
  savedData?: Record<string, unknown>;
  onUpdate?: () => void;
}

export interface MemberInfoTabRef {
  getData: () => Record<string, unknown>;
}

export const MemberInfoTab = forwardRef<MemberInfoTabRef, MemberInfoTabProps>(
  function MemberInfoTab({ member, isEditing, hideFromSchedule, savedData, onUpdate: _onUpdate }, ref) {
    const [formData, setFormData] = useState({
      firstName: (savedData?.firstName as string) ?? member.firstName,
      lastName: (savedData?.lastName as string) ?? member.lastName,
      email: (savedData?.email as string) ?? member.email ?? '',
      phone: (savedData?.phone as string) ?? member.phone ?? '',
      position: (savedData?.position as string) ?? member.position ?? '',
      department: (savedData?.department as string) ?? member.department ?? '',
      managerId: (savedData?.managerId as string) ?? member.managerId ?? '',
      hideFromSchedule: (savedData?.metadata as { hideFromSchedule?: boolean })?.hideFromSchedule ?? hideFromSchedule,
    });

    // Reset form data when editing is cancelled
    useEffect(() => {
      if (!isEditing) {
        setFormData({
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email || '',
          phone: member.phone || '',
          position: member.position || '',
          department: member.department || '',
          managerId: member.managerId || '',
          hideFromSchedule: hideFromSchedule,
        });
      }
    }, [isEditing, member, hideFromSchedule]);

    // Expose getData method to parent
    useImperativeHandle(ref, () => ({
      getData: () => ({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        position: formData.position.trim() || null,
        department: formData.department.trim() || null,
        managerId: formData.managerId || null,
        metadata: {
          hideFromSchedule: formData.hideFromSchedule,
        },
      }),
    }));

    const [managerOpen, setManagerOpen] = useState(false);

    // Server-side paginated search for manager dropdown
    const {
      items: managersRaw,
      search: managerSearch,
      setSearch: setManagerSearch,
    } = usePaginatedSearch<Member & { isActive?: boolean }>({
      endpoint: '/members',
      queryKey: 'members-manager-search',
      pageSize: 50,
      extraParams: { memberStatus: 'active' },
      enabled: isEditing,
    });

    const availableManagers = managersRaw.filter((m) => m.id !== member.id);

    // Ensure current manager is always in the list (even if not in paginated results)
    const currentManagerInList = member.managerId && availableManagers.some((m) => m.id === member.managerId);
    const managersWithCurrent = currentManagerInList || !member.manager
      ? availableManagers
      : [{ id: member.manager.id, firstName: member.manager.firstName, lastName: member.manager.lastName } as Member, ...availableManagers];

    // Find display name for currently selected manager
    const selectedManagerName = (() => {
      if (!formData.managerId) return null;
      const found = managersWithCurrent.find((m) => m.id === formData.managerId);
      if (found) return `${found.firstName} ${found.lastName}`;
      if (member.manager && member.manager.id === formData.managerId) {
        return `${member.manager.firstName} ${member.manager.lastName}`;
      }
      return null;
    })();

    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* First Name */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              First Name
            </Label>
            {isEditing ? (
              <Input
                value={formData.firstName}
                onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                placeholder="First name"
              />
            ) : (
              <p className="text-sm py-2">{member.firstName}</p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Last Name
            </Label>
            {isEditing ? (
              <Input
                value={formData.lastName}
                onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                placeholder="Last name"
              />
            ) : (
              <p className="text-sm py-2">{member.lastName}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email
            </Label>
            {isEditing ? (
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            ) : (
              <p className="text-sm py-2">{member.email || 'Not provided'}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone
            </Label>
            {isEditing ? (
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 000-0000"
              />
            ) : (
              <p className="text-sm py-2">{member.phone || 'Not provided'}</p>
            )}
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Position
            </Label>
            {isEditing ? (
              <Input
                value={formData.position}
                onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
                placeholder="Job title"
              />
            ) : (
              <p className="text-sm py-2">{member.position || 'Not assigned'}</p>
            )}
          </div>

          {/* Department */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Department
            </Label>
            {isEditing ? (
              <Input
                value={formData.department}
                onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
                placeholder="Department name"
              />
            ) : (
              <p className="text-sm py-2">{member.department || 'Not assigned'}</p>
            )}
          </div>

          {/* Manager */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Manager
            </Label>
            {isEditing ? (
              <Popover open={managerOpen} onOpenChange={setManagerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={managerOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedManagerName ?? 'Select manager...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search members..."
                      value={managerSearch}
                      onValueChange={setManagerSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No member found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => {
                            setFormData((prev) => ({ ...prev, managerId: '' }));
                            setManagerOpen(false);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', !formData.managerId ? 'opacity-100' : 'opacity-0')} />
                          None
                        </CommandItem>
                        {managersWithCurrent.map((m) => (
                          <CommandItem
                            key={m.id}
                            value={m.id}
                            onSelect={() => {
                              setFormData((prev) => ({ ...prev, managerId: m.id }));
                              setManagerOpen(false);
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', formData.managerId === m.id ? 'opacity-100' : 'opacity-0')} />
                            {m.firstName} {m.lastName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <p className="text-sm py-2">
                {member.manager
                  ? `${member.manager.firstName} ${member.manager.lastName}`
                  : 'Not assigned'}
              </p>
            )}
          </div>

          {/* Hide from Schedule */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-muted-foreground" />
              Schedule Visibility
            </Label>
            {isEditing ? (
              <div className="flex items-center space-x-2 py-2">
                <Checkbox
                  id="hideFromSchedule"
                  checked={formData.hideFromSchedule}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, hideFromSchedule: checked === true }))
                  }
                />
                <label
                  htmlFor="hideFromSchedule"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Hide from schedule
                </label>
              </div>
            ) : (
              <p className="text-sm py-2">
                {hideFromSchedule ? 'Hidden from schedule' : 'Visible on schedule'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
);
