import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Role, ScheduleFilterMode, ScheduleFilterPreference } from '@ghostcast/shared';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePaginatedSearch } from '@/hooks/use-paginated-search';
import type { CustomFieldRenderArgs } from './configs/types';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  department: string | null;
  isActive?: boolean;
}

interface DepartmentsResponse {
  data: string[];
}

const MODE_LABELS: Record<ScheduleFilterMode, string> = {
  [ScheduleFilterMode.ALL]: 'All members',
  [ScheduleFilterMode.CUSTOM]: 'Custom (linked member + selected departments + selected members)',
};

function memberLabel(m: Member): string {
  return `${m.firstName} ${m.lastName}${m.email ? ` (${m.email})` : ''}`;
}

function DepartmentMultiSelect({
  values,
  options,
  onChange,
}: Readonly<{
  values: string[];
  options: string[];
  onChange: (next: string[]) => void;
}>) {
  const [open, setOpen] = useState(false);

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  const remove = (v: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(values.filter((x) => x !== v));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-[40px] h-auto py-2"
        >
          <div className="flex flex-wrap gap-1 flex-1 text-left">
            {values.length > 0 ? (
              values.map((v) => (
                <Badge key={v} variant="secondary" className="mr-1 mb-0.5" onClick={(e) => remove(v, e)}>
                  {v}
                  <X className="ml-1 h-3 w-3 cursor-pointer" />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">Select departments...</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search departments..." />
          <CommandList>
            <CommandEmpty>No departments found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = values.includes(option);
                return (
                  <CommandItem key={option} value={option} onSelect={() => toggle(option)}>
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    {option}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ScheduleFilterField({ values, setValue }: Readonly<CustomFieldRenderArgs>) {
  const role = values.role as Role | undefined;
  const preferences = (values.preferences as Record<string, unknown> | null) ?? {};
  const isMemberRole = role === Role.MEMBER;
  // For MEMBER users with no saved filter, default to CUSTOM so the form shows the
  // same starting state the schedule will use (linked-member-only).
  const filter = (preferences.scheduleFilter as ScheduleFilterPreference | undefined) ?? {
    mode: isMemberRole ? ScheduleFilterMode.CUSTOM : ScheduleFilterMode.ALL,
  };

  // Display state for selected items (full Member objects so we can render labels).
  // Source of truth for ids stays in `filter` (i.e., the form's preferences blob).
  const [linkedMember, setLinkedMember] = useState<Member | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate display state once on mount by fetching saved ids individually.
  useEffect(() => {
    if (hydrated || !isMemberRole) return;

    const ids = new Set<string>();
    if (filter.linkedMemberId) ids.add(filter.linkedMemberId);
    for (const id of filter.memberIds ?? []) ids.add(id);

    if (ids.size === 0) {
      setHydrated(true);
      return;
    }

    let cancelled = false;
    Promise.all(
      Array.from(ids).map((id) =>
        api.get<{ data: Member }>(`/members/${id}`).then((r) => r.data).catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const fetched = results.filter((m): m is Member => !!m);
      if (filter.linkedMemberId) {
        setLinkedMember(fetched.find((m) => m.id === filter.linkedMemberId) ?? null);
      }
      const ordered = (filter.memberIds ?? [])
        .map((id) => fetched.find((m) => m.id === id))
        .filter((m): m is Member => !!m);
      setSelectedMembers(ordered);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, isMemberRole, filter.linkedMemberId, filter.memberIds]);

  // Server-side member search (mirrors CreateRequestModal pattern)
  const {
    items: memberSearchItems,
    search: memberSearch,
    setSearch: setMemberSearch,
  } = usePaginatedSearch<Member>({
    endpoint: '/members',
    queryKey: 'members-search-schedule-filter',
    pageSize: 50,
    extraParams: { memberStatus: 'active' },
    enabled: isMemberRole,
  });

  // Departments — small list, fine to bulk-fetch
  const { data: departmentsData } = useQuery<DepartmentsResponse>({
    queryKey: ['members', 'departments'],
    queryFn: () => api.get<DepartmentsResponse>('/members/departments'),
    staleTime: 5 * 60 * 1000,
    enabled: isMemberRole,
  });

  const [linkedMemberOpen, setLinkedMemberOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  if (!isMemberRole) return null;

  const departments = departmentsData?.data ?? [];

  const updateFilter = (next: Partial<ScheduleFilterPreference>) => {
    setValue('preferences', { ...preferences, scheduleFilter: { ...filter, ...next } });
  };

  const handleSetLinkedMember = (member: Member | null) => {
    setLinkedMember(member);
    updateFilter({ linkedMemberId: member?.id });
  };

  const handleToggleSelectedMember = (member: Member) => {
    const isSelected = selectedMembers.some((m) => m.id === member.id);
    if (isSelected) {
      setSelectedMembers((prev) => prev.filter((m) => m.id !== member.id));
      updateFilter({ memberIds: (filter.memberIds ?? []).filter((id) => id !== member.id) });
    } else {
      setSelectedMembers((prev) => [...prev, member]);
      updateFilter({ memberIds: [...(filter.memberIds ?? []), member.id] });
    }
  };

  const handleRemoveSelectedMember = (memberId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMembers((prev) => prev.filter((m) => m.id !== memberId));
    updateFilter({ memberIds: (filter.memberIds ?? []).filter((id) => id !== memberId) });
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold">Schedule Visibility</h3>
        <p className="text-xs text-muted-foreground">
          Controls which members&apos; assignments this user sees on the Schedule page. Their own
          linked member is always visible regardless of mode.
        </p>
      </div>

      {/* Linked Member — single-select with server-side search */}
      <div className="space-y-2">
        <Label>Linked Member</Label>
        <Popover open={linkedMemberOpen} onOpenChange={setLinkedMemberOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={linkedMemberOpen}
              className="w-full justify-between"
            >
              <span className={cn('truncate', !linkedMember && 'text-muted-foreground')}>
                {linkedMember
                  ? memberLabel(linkedMember)
                  : 'Auto-linked from email match — pick a member to override'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search members..."
                value={memberSearch}
                onValueChange={setMemberSearch}
              />
              <CommandList>
                <CommandEmpty>No matching members.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__none"
                    onSelect={() => {
                      handleSetLinkedMember(null);
                      setLinkedMemberOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">— No linked member —</span>
                  </CommandItem>
                  {memberSearchItems.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.id}
                      onSelect={() => {
                        handleSetLinkedMember(m);
                        setLinkedMemberOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          linkedMember?.id === m.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {memberLabel(m)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">
          Auto-populated by matching the user&apos;s email against active members. Override here if
          the wrong member was selected or no match was found.
        </p>
      </div>

      {/* Visibility Mode */}
      <div className="space-y-2">
        <Label htmlFor="scheduleFilter-mode">Visibility Mode</Label>
        <Select
          value={filter.mode}
          onValueChange={(val) => updateFilter({ mode: val as ScheduleFilterMode })}
        >
          <SelectTrigger id="scheduleFilter-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(ScheduleFilterMode).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filter.mode !== ScheduleFilterMode.ALL && (
        <>
          {/* Departments */}
          <div className="space-y-2">
            <Label>Visible Departments</Label>
            <DepartmentMultiSelect
              values={filter.departments ?? []}
              options={departments}
              onChange={(next) => updateFilter({ departments: next })}
            />
            <p className="text-xs text-muted-foreground">
              All members in the selected departments will be visible.
            </p>
          </div>

          {/* Visible Members — multi-select with server-side search */}
          <div className="space-y-2">
            <Label>Visible Members</Label>
            <Popover open={membersOpen} onOpenChange={setMembersOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={membersOpen}
                  className="w-full min-h-10 h-auto justify-between font-normal py-2"
                >
                  <div className="flex flex-wrap gap-1 flex-1 text-left">
                    {selectedMembers.length > 0 ? (
                      selectedMembers.map((m) => (
                        <Badge
                          key={m.id}
                          variant="secondary"
                          className="mr-1"
                          onClick={(e) => handleRemoveSelectedMember(m.id, e)}
                        >
                          {m.firstName} {m.lastName}
                          <X className="ml-1 h-3 w-3 cursor-pointer" />
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">Select members...</span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search members..."
                    value={memberSearch}
                    onValueChange={setMemberSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No matching members.</CommandEmpty>
                    <CommandGroup>
                      {memberSearchItems.map((m) => {
                        const isSelected = selectedMembers.some((s) => s.id === m.id);
                        return (
                          <CommandItem
                            key={m.id}
                            value={m.id}
                            onSelect={() => handleToggleSelectedMember(m)}
                          >
                            <div
                              className={cn(
                                'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'opacity-50 [&_svg]:invisible',
                              )}
                            >
                              <Check className="h-3 w-3" />
                            </div>
                            {memberLabel(m)}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              These members will be visible in addition to the linked member and any selected departments.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
