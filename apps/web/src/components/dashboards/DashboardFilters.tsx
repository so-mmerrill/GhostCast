import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  readonly label: string;
  readonly options: FilterOption[];
  readonly selected: string[];
  readonly onChange: (selected: string[]) => void;
}

function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1 text-xs',
            selected.length > 0 && 'border-indigo-300 dark:border-indigo-700',
          )}
        >
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {options.length > 8 && (
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mb-2 w-full rounded border px-2 py-1 text-xs bg-transparent outline-none focus:ring-1 focus:ring-indigo-500"
          />
        )}
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">No options</p>
          )}
          {filtered.map(option => (
            <label
              key={option.value}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <span className="truncate">{option.label}</span>
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full h-7 text-xs"
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Member selector with "Select All" and department grouping ---

interface MemberOption {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
}

interface MemberSelectFilterProps {
  readonly members: MemberOption[];
  readonly selected: string[];
  readonly onChange: (selected: string[]) => void;
}

function MemberSelectFilter({ members, selected, onChange }: MemberSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const departments = useMemo(() => {
    const deptMap = new Map<string, MemberOption[]>();
    for (const m of members) {
      const dept = m.department || 'No Department';
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept)!.push(m);
    }
    return [...deptMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, deptMembers]) => ({
        name,
        members: deptMembers.sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
        ),
      }));
  }, [members]);

  const filteredDepts = useMemo(() => {
    if (!search) return departments;
    const q = search.toLowerCase();
    return departments
      .map(dept => ({
        name: dept.name,
        members: dept.members.filter(m =>
          `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
          dept.name.toLowerCase().includes(q),
        ),
      }))
      .filter(dept => dept.members.length > 0);
  }, [departments, search]);

  const allSelected = members.length > 0 && selected.length === members.length;
  const someSelected = selected.length > 0 && selected.length < members.length;

  const toggleAll = () => {
    onChange(allSelected ? [] : members.map(m => m.id));
  };

  const toggleDepartment = (deptMembers: MemberOption[]) => {
    const deptIds = deptMembers.map(m => m.id);
    const allDeptSelected = deptIds.every(id => selected.includes(id));
    if (allDeptSelected) {
      onChange(selected.filter(id => !deptIds.includes(id)));
    } else {
      const newSelected = new Set(selected);
      for (const id of deptIds) newSelected.add(id);
      onChange([...newSelected]);
    }
  };

  const toggleMember = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter(v => v !== id)
        : [...selected, id],
    );
  };

  const buttonLabel = 'Members';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1 text-xs',
            selected.length > 0 && 'border-indigo-300 dark:border-indigo-700',
          )}
        >
          {buttonLabel}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
              {allSelected ? 'All' : selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <input
          type="text"
          placeholder="Search members or departments..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-2 w-full rounded border px-2 py-1 text-xs bg-transparent outline-none focus:ring-1 focus:ring-indigo-500"
        />

        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {/* Select All */}
          <label className="flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-accent font-semibold">
            <Checkbox
              checked={allSelected}
              // @ts-expect-error - indeterminate is valid but not in the type
              indeterminate={someSelected}
              onCheckedChange={toggleAll}
            />
            <span>Select All</span>
            <span className="ml-auto text-muted-foreground">{members.length}</span>
          </label>

          <div className="my-1 border-t border-border" />

          {filteredDepts.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">No matches</p>
          )}

          {filteredDepts.map(dept => {
            const deptIds = dept.members.map(m => m.id);
            const allDeptSelected = deptIds.every(id => selected.includes(id));
            const someDeptSelected = !allDeptSelected && deptIds.some(id => selected.includes(id));

            return (
              <div key={dept.name}>
                {/* Department header */}
                <label className="flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-accent font-medium text-muted-foreground">
                  <Checkbox
                    checked={allDeptSelected}
                    // @ts-expect-error - indeterminate is valid but not in the type
                    indeterminate={someDeptSelected}
                    onCheckedChange={() => toggleDepartment(dept.members)}
                  />
                  <span className="truncate">{dept.name}</span>
                  <span className="ml-auto text-[10px]">{dept.members.length}</span>
                </label>

                {/* Individual members */}
                {dept.members.map(m => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 rounded pl-7 pr-2 py-1 text-xs cursor-pointer hover:bg-accent"
                  >
                    <Checkbox
                      checked={selected.includes(m.id)}
                      onCheckedChange={() => toggleMember(m.id)}
                    />
                    <span className="truncate">{m.firstName} {m.lastName}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>

        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full h-7 text-xs"
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Number multi-select (for proficiency levels) ---

interface NumberMultiSelectFilterProps {
  readonly label: string;
  readonly options: { value: number; label: string }[];
  readonly selected: number[];
  readonly onChange: (selected: number[]) => void;
}

function NumberMultiSelectFilter({ label, options, selected, onChange }: NumberMultiSelectFilterProps) {
  const strSelected = selected.map(String);
  const strOptions = options.map(o => ({ value: String(o.value), label: `${o.value} - ${o.label}` }));

  return (
    <MultiSelectFilter
      label={label}
      options={strOptions}
      selected={strSelected}
      onChange={vals => onChange(vals.map(Number))}
    />
  );
}

// --- Exported filter bars ---

interface SkillsFilterBarProps {
  readonly members: { id: string; firstName: string; lastName: string; department: string | null }[];
  readonly skills: { id: string; name: string; category: string | null }[];
  readonly filters: { memberIds: string[]; skillIds: string[]; categories: string[]; levels: number[] };
  readonly onChange: (filters: { memberIds: string[]; skillIds: string[]; categories: string[]; levels: number[] }) => void;
}

export function SkillsFilterBar({ members, skills, filters, onChange }: SkillsFilterBarProps) {
  const categories = [...new Set(skills.map(s => s.category || 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
  const proficiencyOptions = [
    { value: 1, label: 'No skill' },
    { value: 2, label: 'Foundational' },
    { value: 3, label: 'Working' },
    { value: 4, label: 'Proficient' },
    { value: 5, label: 'Mastery' },
  ];

  const hasFilters = filters.memberIds.length > 0 || filters.skillIds.length > 0 || filters.categories.length > 0 || filters.levels.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MemberSelectFilter
        members={members}
        selected={filters.memberIds}
        onChange={memberIds => onChange({ ...filters, memberIds })}
      />
      <MultiSelectFilter
        label="Skills"
        options={skills.map(s => ({ value: s.id, label: s.name }))}
        selected={filters.skillIds}
        onChange={skillIds => onChange({ ...filters, skillIds })}
      />
      <MultiSelectFilter
        label="Category"
        options={categories.map((c: string) => ({ value: c, label: c }))}
        selected={filters.categories}
        onChange={categories => onChange({ ...filters, categories })}
      />
      <NumberMultiSelectFilter
        label="Proficiency"
        options={proficiencyOptions}
        selected={filters.levels}
        onChange={levels => onChange({ ...filters, levels })}
      />
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => onChange({ memberIds: [], skillIds: [], categories: [], levels: [] })}
        >
          <X className="h-3 w-3" />
          Clear all
        </Button>
      )}
    </div>
  );
}

interface RolesFilterBarProps {
  readonly members: { id: string; firstName: string; lastName: string; department: string | null }[];
  readonly roles: { id: string; name: string }[];
  readonly filters: { memberIds: string[]; roleIds: string[] };
  readonly onChange: (filters: { memberIds: string[]; roleIds: string[] }) => void;
}

export function RolesFilterBar({ members, roles, filters, onChange }: RolesFilterBarProps) {
  const hasFilters = filters.memberIds.length > 0 || filters.roleIds.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MemberSelectFilter
        members={members}
        selected={filters.memberIds}
        onChange={memberIds => onChange({ ...filters, memberIds })}
      />
      <MultiSelectFilter
        label="Roles"
        options={roles.map(r => ({ value: r.id, label: r.name }))}
        selected={filters.roleIds}
        onChange={roleIds => onChange({ ...filters, roleIds })}
      />
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => onChange({ memberIds: [], roleIds: [] })}
        >
          <X className="h-3 w-3" />
          Clear all
        </Button>
      )}
    </div>
  );
}
