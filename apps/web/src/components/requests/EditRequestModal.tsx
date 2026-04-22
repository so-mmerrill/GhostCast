import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { usePaginatedSearch } from '@/hooks/use-paginated-search';
import { TIMEZONES, formatTimezone, timezoneMatchesSearch } from '@/lib/timezones';
import { RequestStatus } from '@ghostcast/shared';
import type { QuipParsedRequestFields } from '@ghostcast/shared';
import type { UserPluginStatus } from '@/types/user-plugins';
import { sanitizeInput, sanitizeUrl, VALIDATION } from '@/lib/input-validation';
import { QuipFileBrowser } from './QuipFileBrowser';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Loader2,
  Check,
  X,
  ChevronsUpDown,
  Plane,
  Trash2,
  FileText,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface FieldSettings {
  visible: boolean;
  required: boolean;
}

interface ProjectType {
  id: string;
  name: string;
  abbreviation?: string | null;
  color: string;
  isActive: boolean;
  fieldConfig?: Record<string, FieldSettings> | null;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isActive: boolean;
}

interface Skill {
  id: string;
  name: string;
  category: string | null;
  isActive: boolean;
}

interface RequestMember {
  memberId: string;
  member: Member;
}

interface RequestSkill {
  skillId: string;
  skill: Skill;
}

interface RequestData {
  id: string;
  title: string;
  status: RequestStatus;
  description: string | null;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  projectId: string | null;
  kantataId: string | null;
  clientName: string | null;
  projectName: string | null;
  projectTypeId: string | null;
  executionWeeks: number;
  preparationWeeks: number;
  reportingWeeks: number;
  travelRequired: boolean;
  travelLocation: string | null;
  timezone: string | null;
  urlLink: string | null;
  studentCount: number;
  format: string | null;
  location: string | null;
  requiredMemberCount: number;
  requiredMembers: RequestMember[];
  requiredSkills: RequestSkill[];
}

interface EditRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string | null;
  onSuccess?: () => void;
}

const STATUS_OPTIONS = [
  { value: RequestStatus.UNSCHEDULED, label: 'Unscheduled' },
  { value: RequestStatus.SCHEDULED, label: 'Scheduled' },
  { value: RequestStatus.FORECAST, label: 'Forecast' },
  { value: RequestStatus.CANCELLED, label: 'Cancelled' },
];

const wheelAttached = new WeakSet<HTMLElement>();

// react-remove-scroll (used by Radix Dialog) preventDefaults wheel events
// outside its subtree, which kills scrolling on portaled Popover content.
// Bypass it with a native non-passive listener that scrolls the list manually.
const attachPopoverListWheel = (el: HTMLDivElement | null) => {
  if (!el || wheelAttached.has(el)) return;
  wheelAttached.add(el);
  el.addEventListener(
    'wheel',
    (e) => {
      el.scrollTop += e.deltaY;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    },
    { passive: false },
  );
};

// Sub-component for member selection to reduce main component complexity
interface MemberSelectorProps {
  isRequired: boolean;
  memberSelectionMode: 'count' | 'specific';
  onToggleMode: () => void;
  requiredMemberCount: string;
  onCountChange: (value: string) => void;
  selectedMemberObjects: Member[];
  selectedMemberIds: string[];
  filteredMembers: Member[];
  membersOpen: boolean;
  onMembersOpenChange: (open: boolean) => void;
  memberSearch: string;
  onMemberSearchChange: (value: string) => void;
  onRemoveMember: (memberId: string, e: React.MouseEvent) => void;
  onToggleMember: (member: Member, isSelected: boolean) => void;
}

function MemberSelector({
  isRequired,
  memberSelectionMode,
  onToggleMode,
  requiredMemberCount,
  onCountChange,
  selectedMemberObjects,
  selectedMemberIds,
  filteredMembers,
  membersOpen,
  onMembersOpenChange,
  memberSearch,
  onMemberSearchChange,
  onRemoveMember,
  onToggleMember,
}: Readonly<MemberSelectorProps>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>
          Required Members {isRequired && <span className="text-destructive">*</span>}
        </Label>
        <button
          type="button"
          onClick={onToggleMode}
          className="text-xs text-primary hover:underline"
        >
          {memberSelectionMode === 'count' ? 'Select specific members' : 'Use count instead'}
        </button>
      </div>
      {memberSelectionMode === 'count' ? (
        <Input
          type="number"
          min="0"
          value={requiredMemberCount}
          onChange={(e) => onCountChange(e.target.value)}
          placeholder="Number of members needed"
          className="h-10"
        />
      ) : (
        <Popover open={membersOpen} onOpenChange={onMembersOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={membersOpen}
              className="w-full min-h-10 h-auto justify-between font-normal py-2"
            >
              <div className="flex flex-wrap gap-1 flex-1">
                {selectedMemberObjects.length > 0 ? (
                  selectedMemberObjects.map((member) => (
                    <Badge
                      key={member.id}
                      variant="secondary"
                      className="mr-1"
                      onClick={(e) => onRemoveMember(member.id, e)}
                    >
                      {member.firstName} {member.lastName}
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
          <PopoverContent className="w-[350px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search members..."
                value={memberSearch}
                onValueChange={onMemberSearchChange}
              />
              <CommandList className="scrollbar-on-hover" ref={attachPopoverListWheel}>
                <CommandEmpty>No member found.</CommandEmpty>
                <CommandGroup>
                  {filteredMembers.map((member) => {
                    const isSelected = selectedMemberIds.includes(member.id);
                    return (
                      <CommandItem
                        key={member.id}
                        value={member.id}
                        onSelect={() => onToggleMember(member, isSelected)}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div
                            className={`h-4 w-4 border rounded flex items-center justify-center ${
                              isSelected
                                ? 'bg-primary border-primary'
                                : 'border-muted-foreground/30'
                            }`}
                          >
                            {isSelected && (
                              <Check className="h-3 w-3 text-primary-foreground" />
                            )}
                          </div>
                          {member.firstName} {member.lastName}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// Sub-component for skill selection to reduce main component complexity
interface SkillSelectorProps {
  isRequired: boolean;
  selectedSkills: Skill[];
  selectedSkillIds: string[];
  filteredSkills: Skill[];
  skillsOpen: boolean;
  onSkillsOpenChange: (open: boolean) => void;
  skillSearch: string;
  onSkillSearchChange: (value: string) => void;
  onRemoveSkill: (skillId: string, e: React.MouseEvent) => void;
  onToggleSkill: (skill: Skill, isSelected: boolean) => void;
}

function SkillSelector({
  isRequired,
  selectedSkills,
  selectedSkillIds,
  filteredSkills,
  skillsOpen,
  onSkillsOpenChange,
  skillSearch,
  onSkillSearchChange,
  onRemoveSkill,
  onToggleSkill,
}: Readonly<SkillSelectorProps>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>
          Required Skills {isRequired && <span className="text-destructive">*</span>}
        </Label>
        <span className="text-xs invisible">placeholder</span>
      </div>
      <Popover open={skillsOpen} onOpenChange={onSkillsOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={skillsOpen}
            className="w-full min-h-10 h-auto justify-between font-normal py-2"
          >
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedSkills.length > 0 ? (
                selectedSkills.map((skill) => (
                  <Badge
                    key={skill.id}
                    variant="secondary"
                    className="mr-1"
                    onClick={(e) => onRemoveSkill(skill.id, e)}
                  >
                    {skill.name}
                    <X className="ml-1 h-3 w-3 cursor-pointer" />
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">Select skills...</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search skills..."
              value={skillSearch}
              onValueChange={onSkillSearchChange}
            />
            <CommandList className="scrollbar-on-hover" ref={attachPopoverListWheel}>
              <CommandEmpty>No skill found.</CommandEmpty>
              <CommandGroup>
                {filteredSkills.map((skill) => {
                  const isSelected = selectedSkillIds.includes(skill.id);
                  return (
                    <CommandItem
                      key={skill.id}
                      value={skill.name}
                      onSelect={() => onToggleSkill(skill, isSelected)}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <div
                          className={`h-4 w-4 border rounded flex items-center justify-center ${
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground/30'
                          }`}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        {skill.name}
                        {skill.category && (
                          <span className="text-xs text-muted-foreground">
                            ({skill.category})
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function EditRequestModal({
  open,
  onOpenChange,
  requestId,
  onSuccess,
}: Readonly<EditRequestModalProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [status, setStatus] = useState<RequestStatus>(RequestStatus.UNSCHEDULED);
  const [requestedStartDate, setRequestedStartDate] = useState('');
  const [requestedEndDate, setRequestedEndDate] = useState('');
  const [jiraId, setJiraId] = useState('');
  const [kantataId, setKantataId] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectTypeId, setProjectTypeId] = useState('');
  const [preparationWeeks, setPreparationWeeks] = useState('0');
  const [executionWeeks, setExecutionWeeks] = useState('0');
  const [reportingWeeks, setReportingWeeks] = useState('0');
  const [timezone, setTimezone] = useState('');
  const [urlLink, setUrlLink] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [studentCount, setStudentCount] = useState('0');
  const [format, setFormat] = useState('');
  const [location, setLocation] = useState('');

  const [description, setDescription] = useState('');
  const [travelRequired, setTravelRequired] = useState(false);
  const [travelLocation, setTravelLocation] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedMemberObjects, setSelectedMemberObjects] = useState<Member[]>([]);
  const [selectedSkillObjects, setSelectedSkillObjects] = useState<Skill[]>([]);
  const [selectedProjectTypeObj, setSelectedProjectTypeObj] = useState<ProjectType | null>(null);
  const [requiredMemberCount, setRequiredMemberCount] = useState('0');
  const [memberSelectionMode, setMemberSelectionMode] = useState<'count' | 'specific'>('count');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [projectTypeOpen, setProjectTypeOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');

  // QUIP import state
  const [quipBrowserOpen, setQuipBrowserOpen] = useState(false);

  // Check if Quip plugin is enabled for the user
  const { data: userPlugins = [] } = useQuery({
    queryKey: ['user-plugins'],
    queryFn: async () => {
      const response = await api.get<{ data: UserPluginStatus[] }>('/user-plugins');
      return response.data;
    },
  });
  const isQuipEnabled = userPlugins.some(
    (p) => p.catalogId === 'quip-document-import' && p.isEnabled
  );

  // Fetch request data
  const { data: requestResponse, isLoading: loadingRequest } = useQuery<{ data: RequestData }>({
    queryKey: ['request', requestId],
    queryFn: () => api.get(`/requests/${requestId}`),
    enabled: !!requestId && open,
  });

  const requestData = requestResponse?.data;

  // Server-side paginated search for project types
  const {
    items: projectTypesRaw,
    search: projectTypeSearch,
    setSearch: setProjectTypeSearch,
  } = usePaginatedSearch<ProjectType>({
    endpoint: '/project-types',
    queryKey: 'project-types-search',
    pageSize: 50,
  });
  const projectTypes = projectTypesRaw.filter((pt) => pt.isActive);

  // Server-side paginated search for members
  const {
    items: membersRaw,
    search: memberSearch,
    setSearch: setMemberSearch,
  } = usePaginatedSearch<Member>({
    endpoint: '/members',
    queryKey: 'members-search',
    pageSize: 50,
    extraParams: { memberStatus: 'active' },
  });
  const members = membersRaw.filter((m) => m.isActive);

  // Server-side paginated search for skills
  const {
    items: skillsRaw,
    search: skillSearch,
    setSearch: setSkillSearch,
  } = usePaginatedSearch<Skill>({
    endpoint: '/skills',
    queryKey: 'skills-search',
    pageSize: 50,
  });
  const skills = skillsRaw.filter((s) => s.isActive);

  // Populate form when request data is loaded
  useEffect(() => {
    if (requestData) {
      setStatus(requestData.status || RequestStatus.UNSCHEDULED);
      setProjectName(requestData.title || '');
      setDescription(requestData.description || '');
      setJiraId(requestData.projectId || '');
      setKantataId(requestData.kantataId || '');
      setClientName(requestData.clientName || '');
      setProjectTypeId(requestData.projectTypeId || '');
      setRequestedStartDate(
        requestData.requestedStartDate
          ? new Date(requestData.requestedStartDate).toISOString().split('T')[0]
          : ''
      );
      setRequestedEndDate(
        requestData.requestedEndDate
          ? new Date(requestData.requestedEndDate).toISOString().split('T')[0]
          : ''
      );
      setPreparationWeeks(String(requestData.preparationWeeks || 0));
      setExecutionWeeks(String(requestData.executionWeeks || 0));
      setReportingWeeks(String(requestData.reportingWeeks || 0));
      setTravelRequired(requestData.travelRequired || false);
      setTravelLocation(requestData.travelLocation || '');
      setTimezone(requestData.timezone || '');
      setUrlLink(requestData.urlLink || '');
      setStudentCount(String(requestData.studentCount || 0));
      setFormat(requestData.format || '');
      setLocation(requestData.location || '');
      const memberIds = requestData.requiredMembers?.map((rm) => rm.memberId) || [];
      const memberObjs = requestData.requiredMembers?.map((rm) => rm.member) || [];
      setSelectedMemberIds(memberIds);
      setSelectedMemberObjects(memberObjs);
      setRequiredMemberCount(String(requestData.requiredMemberCount || 0));
      setMemberSelectionMode(memberIds.length > 0 ? 'specific' : 'count');
      setSelectedSkillIds(requestData.requiredSkills?.map((rs) => rs.skillId) || []);
      setSelectedSkillObjects(requestData.requiredSkills?.map((rs) => rs.skill) || []);
      // Track the project type object from the request's included relation
      const ptFromRequest = (requestData as unknown as Record<string, unknown>).projectType as ProjectType | null;
      if (ptFromRequest) setSelectedProjectTypeObj(ptFromRequest);
    }
  }, [requestData]);

  // Use server-side search results directly
  const filteredProjectTypes = projectTypes;

  const filteredTimezones = useMemo(() => {
    if (!timezoneSearch) return TIMEZONES.slice(0, 50);
    return TIMEZONES.filter((tz) => timezoneMatchesSearch(tz, timezoneSearch)).slice(0, 50);
  }, [timezoneSearch]);

  const filteredSkills = skills;
  const filteredMembers = members;

  const selectedProjectType = selectedProjectTypeObj ?? projectTypes.find((pt) => pt.id === projectTypeId);
  const selectedSkills = selectedSkillObjects;

  // Helper functions for field visibility and required status
  const getFieldConfig = (fieldName: string): FieldSettings => {
    // If no project type selected or no config, show all fields as visible/not required
    if (!selectedProjectType?.fieldConfig) {
      return { visible: true, required: false };
    }
    // Return field config or default to visible/not required
    return selectedProjectType.fieldConfig[fieldName] || { visible: true, required: false };
  };

  const isFieldVisible = (fieldName: string): boolean => getFieldConfig(fieldName).visible;
  const isFieldRequired = (fieldName: string): boolean => getFieldConfig(fieldName).required;

  // Check if any timeline fields are visible
  const isTimelineVisible = isFieldVisible('preparationWeeks') || isFieldVisible('executionWeeks') || isFieldVisible('reportingWeeks');

  // Helper to check if required text field has a value
  const isRequiredTextFieldValid = (fieldName: string, value: string): boolean => {
    return !isFieldRequired(fieldName) || value.trim().length > 0;
  };

  // Helper to check if required members are valid
  const areMembersValid = (): boolean => {
    if (!isFieldRequired('requiredMembers')) return true;
    if (memberSelectionMode === 'count') {
      return Number.parseInt(requiredMemberCount, 10) > 0;
    }
    return selectedMemberIds.length > 0;
  };

  const isValid = useMemo(() => {
    // Always required: projectName and projectTypeId
    const hasRequiredFields = projectName.trim().length > 0 && projectTypeId.length > 0;
    if (!hasRequiredFields) return false;

    // Check dynamically required text fields
    const textFieldsValid =
      isRequiredTextFieldValid('jiraId', jiraId) &&
      isRequiredTextFieldValid('kantataId', kantataId) &&
      isRequiredTextFieldValid('clientName', clientName) &&
      isRequiredTextFieldValid('urlLink', urlLink) &&
      isRequiredTextFieldValid('timezone', timezone) &&
      isRequiredTextFieldValid('requestedStartDate', requestedStartDate) &&
      isRequiredTextFieldValid('description', description);
    if (!textFieldsValid) return false;

    // Check required skills
    const skillsValid = !isFieldRequired('requiredSkills') || selectedSkillIds.length > 0;
    if (!skillsValid) return false;

    return areMembersValid();
  }, [
    projectName, projectTypeId, jiraId, kantataId, clientName, urlLink, timezone,
    requestedStartDate, description, selectedSkillIds, selectedMemberIds,
    requiredMemberCount, memberSelectionMode, selectedProjectType
  ]);
  const totalWeeks = (Number.parseInt(preparationWeeks, 10) || 0) + (Number.parseInt(executionWeeks, 10) || 0) + (Number.parseInt(reportingWeeks, 10) || 0);

  const resetForm = () => {
    setStatus(RequestStatus.UNSCHEDULED);
    setRequestedStartDate('');
    setRequestedEndDate('');
    setJiraId('');
    setKantataId('');
    setClientName('');
    setProjectName('');
    setProjectTypeId('');
    setPreparationWeeks('0');
    setExecutionWeeks('0');
    setReportingWeeks('0');
    setTimezone('');
    setUrlLink('');
    setSelectedSkillIds([]);
    setStudentCount('0');
    setFormat('');
    setLocation('');
    setDescription('');
    setTravelRequired(false);
    setTravelLocation('');
    setSelectedMemberIds([]);
    setSelectedMemberObjects([]);
    setSelectedSkillObjects([]);
    setSelectedProjectTypeObj(null);
    setRequiredMemberCount('0');
    setMemberSelectionMode('count');
  };

  // Helper: Import text fields from Quip
  const importQuipTextFields = (fields: QuipParsedRequestFields) => {
    const projectNameValue = fields.projectName || fields.title;
    if (projectNameValue) setProjectName(projectNameValue);
    if (fields.clientName) setClientName(fields.clientName);
    if (fields.projectId) setJiraId(fields.projectId);
    if (fields.requestedStartDate) setRequestedStartDate(fields.requestedStartDate);
    if (fields.requestedEndDate) setRequestedEndDate(fields.requestedEndDate);
    if (fields.timezone) setTimezone(fields.timezone);
    if (fields.urlLink) setUrlLink(fields.urlLink);
    if (fields.format) setFormat(fields.format);
    if (fields.location) setLocation(fields.location);
  };

  // Helper: Import numeric fields from Quip
  const importQuipNumericFields = (fields: QuipParsedRequestFields) => {
    if (fields.preparationWeeks !== undefined) setPreparationWeeks(String(fields.preparationWeeks));
    if (fields.executionWeeks !== undefined) setExecutionWeeks(String(fields.executionWeeks));
    if (fields.reportingWeeks !== undefined) setReportingWeeks(String(fields.reportingWeeks));
    if (fields.studentCount !== undefined) setStudentCount(String(fields.studentCount));
    if (fields.requiredMemberCount !== undefined) {
      setRequiredMemberCount(String(fields.requiredMemberCount));
      setMemberSelectionMode('count');
    }
  };

  // Helper: Resolve skill names to IDs
  const resolveSkillNames = (skillNames: string[] | undefined) => {
    if (!skillNames || skillNames.length === 0) return;
    const matched = skills
      .filter((s) => skillNames.some((name) => s.name.toLowerCase() === name.toLowerCase()));
    if (matched.length > 0) {
      setSelectedSkillIds(matched.map((s) => s.id));
      setSelectedSkillObjects(matched);
    }
  };

  // Helper: Resolve project type name to ID
  const resolveProjectTypeName = (typeName: string | undefined) => {
    if (!typeName) return;
    const matchedType = projectTypes.find((pt) => pt.name.toLowerCase() === typeName.toLowerCase());
    if (matchedType) {
      setProjectTypeId(matchedType.id);
      setSelectedProjectTypeObj(matchedType);
    }
  };

  const handleQuipImport = (fields: QuipParsedRequestFields) => {
    importQuipTextFields(fields);
    importQuipNumericFields(fields);

    if (fields.description) {
      setDescription(fields.description);
    }

    // Handle travel fields
    if (fields.travelRequired !== undefined) {
      setTravelRequired(fields.travelRequired);
      if (fields.travelLocation) setTravelLocation(fields.travelLocation);
    }

    resolveSkillNames(fields.skillNames);
    resolveProjectTypeName(fields.projectTypeName);

    toast({
      title: 'Document imported',
      description: 'Form fields have been populated from the Quip document.',
    });
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  // Member selection handlers - extracted to reduce nesting
  const handleRemoveMember = useCallback((memberId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMemberIds((prev) => prev.filter((id) => id !== memberId));
    setSelectedMemberObjects((prev) => prev.filter((m) => m.id !== memberId));
  }, []);

  const handleToggleMember = useCallback((member: Member, isSelected: boolean) => {
    if (isSelected) {
      setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
      setSelectedMemberObjects((prev) => prev.filter((m) => m.id !== member.id));
    } else {
      setSelectedMemberIds((prev) => [...prev, member.id]);
      setSelectedMemberObjects((prev) => [...prev, member]);
    }
  }, []);

  // Skill selection handlers - extracted to reduce nesting
  const handleRemoveSkill = useCallback((skillId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSkillIds((prev) => prev.filter((id) => id !== skillId));
    setSelectedSkillObjects((prev) => prev.filter((s) => s.id !== skillId));
  }, []);

  const handleToggleSkill = useCallback((skill: Skill, isSelected: boolean) => {
    if (isSelected) {
      setSelectedSkillIds((prev) => prev.filter((id) => id !== skill.id));
      setSelectedSkillObjects((prev) => prev.filter((s) => s.id !== skill.id));
    } else {
      setSelectedSkillIds((prev) => [...prev, skill.id]);
      setSelectedSkillObjects((prev) => [...prev, skill]);
    }
  }, []);

  const handleToggleMemberMode = useCallback(() => {
    const newMode = memberSelectionMode === 'count' ? 'specific' : 'count';
    setMemberSelectionMode(newMode);
    if (newMode === 'count') {
      setSelectedMemberIds([]);
      setSelectedMemberObjects([]);
    } else {
      setRequiredMemberCount('0');
    }
  }, [memberSelectionMode]);

  const handleDelete = async () => {
    if (!requestId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/requests/${requestId}/assignments`);
      await api.delete(`/requests/${requestId}`);
      toast({
        title: 'Request deleted',
        description: `"${projectName}" has been deleted.`,
      });
      setShowDeleteConfirm(false);
      handleClose(false);
      onSuccess?.();
      queryClient.removeQueries({ queryKey: ['request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['requests-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    } catch (error) {
      toast({
        title: 'Failed to delete request',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !requestId) return;

    setIsSubmitting(true);
    try {
      const payload = {
        title: projectName.trim(),
        status,
        description: description.trim() || null,
        requestedStartDate: requestedStartDate || null,
        requestedEndDate: requestedEndDate || null,
        projectId: jiraId.trim() || null,
        kantataId: kantataId.trim() || null,
        clientName: clientName.trim() || null,
        projectName: projectName.trim() || null,
        projectTypeId: projectTypeId || null,
        memberIds: memberSelectionMode === 'specific' ? selectedMemberIds : [],
        requiredMemberCount: memberSelectionMode === 'count' ? (Number.parseInt(requiredMemberCount, 10) || 0) : 0,
        skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
        executionWeeks: Number.parseInt(executionWeeks, 10) || 0,
        preparationWeeks: Number.parseInt(preparationWeeks, 10) || 0,
        reportingWeeks: Number.parseInt(reportingWeeks, 10) || 0,
        travelRequired,
        travelLocation: travelRequired && travelLocation.trim() ? travelLocation.trim() : null,
        timezone: timezone.trim() || null,
        urlLink: urlLink.trim() || null,
        studentCount: Number.parseInt(studentCount, 10) || 0,
        format: format || null,
        location: location.trim() || null,
      };

      await api.put(`/requests/${requestId}`, payload);

      toast({
        title: 'Request updated',
        description: `"${projectName}" has been updated successfully.`,
      });

      // Only invalidate the specific request and the requests list here.
      // The WebSocket REQUEST_UPDATED event handles the broader invalidation
      // (schedule, requests-paginated, requests-for-schedule, assignments)
      // to avoid a burst of concurrent requests that triggers rate limiting (429).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requests'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['request', requestId], refetchType: 'all' }),
      ]);
      handleClose(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Failed to update request',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl">Edit Project Request</DialogTitle>
              {isQuipEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setQuipBrowserOpen(true)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Import from Quip
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="status" className="text-sm text-muted-foreground">
                Status:
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RequestStatus)}>
                <SelectTrigger className="w-[130px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {loadingRequest ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="px-6 py-5 space-y-5">
              {/* Row 1: Project Type, Project Name, Jira ID, Kantata ID */}
              <div className="grid grid-cols-[1fr_2fr_0.75fr_0.75fr] gap-4">
                <div className="space-y-2">
                  <Label>
                    Project Type <span className="text-destructive">*</span>
                  </Label>
                  <Popover open={projectTypeOpen} onOpenChange={setProjectTypeOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={projectTypeOpen}
                        className="w-full h-10 justify-between font-normal"
                      >
                        {selectedProjectType ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
                              style={{ backgroundColor: selectedProjectType.color }}
                            />
                            {selectedProjectType.name}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Select type...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search project types..."
                          value={projectTypeSearch}
                          onValueChange={setProjectTypeSearch}
                        />
                        <CommandList className="scrollbar-on-hover" ref={attachPopoverListWheel}>
                          <CommandEmpty>No project type found.</CommandEmpty>
                          <CommandGroup>
                            {filteredProjectTypes.map((pt) => (
                              <CommandItem
                                key={pt.id}
                                value={pt.name}
                                onSelect={() => {
                                  setProjectTypeId(pt.id);
                                  setSelectedProjectTypeObj(pt);
                                  setProjectTypeOpen(false);
                                  setProjectTypeSearch('');
                                }}
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  <div
                                    className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
                                    style={{ backgroundColor: pt.color }}
                                  />
                                  {pt.name}
                                </div>
                                {projectTypeId === pt.id && (
                                  <Check className="h-4 w-4" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projectName">
                    Project Name <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="projectName"
                      value={projectName}
                      onChange={(e) => setProjectName(sanitizeInput(e.target.value, VALIDATION.TITLE_MAX_LENGTH))}
                      placeholder="Enter project name"
                      className={`h-10 ${selectedProjectType?.abbreviation ? 'pr-16' : ''}`}
                      maxLength={VALIDATION.TITLE_MAX_LENGTH}
                      required
                    />
                    {selectedProjectType?.abbreviation && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">
                        - {selectedProjectType.abbreviation}
                      </span>
                    )}
                  </div>
                </div>
                {isFieldVisible('jiraId') && (
                  <div className="space-y-2">
                    <Label htmlFor="jiraId">
                      Jira ID {isFieldRequired('jiraId') && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      id="jiraId"
                      value={jiraId}
                      onChange={(e) => setJiraId(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                      placeholder="ASSESS-123"
                      className="h-10"
                      maxLength={VALIDATION.NAME_MAX_LENGTH}
                    />
                  </div>
                )}
                {isFieldVisible('kantataId') && (
                  <div className="space-y-2">
                    <Label htmlFor="kantataId">
                      Kantata ID {isFieldRequired('kantataId') && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      id="kantataId"
                      value={kantataId}
                      onChange={(e) => setKantataId(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                      placeholder="SO-1234"
                      className="h-10"
                      maxLength={VALIDATION.NAME_MAX_LENGTH}
                    />
                  </div>
                )}
              </div>

              {/* Row 2: Client Name, URL Link */}
              {(isFieldVisible('clientName') || isFieldVisible('urlLink')) && (
                <div className="grid grid-cols-2 gap-4">
                  {isFieldVisible('clientName') && (
                    <div className="space-y-2">
                      <Label htmlFor="clientName">
                        Client Name {isFieldRequired('clientName') && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="clientName"
                        value={clientName}
                        onChange={(e) => setClientName(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                        placeholder="Client name"
                        className="h-10"
                        maxLength={VALIDATION.NAME_MAX_LENGTH}
                      />
                    </div>
                  )}
                  {isFieldVisible('urlLink') && (
                    <div className="space-y-2">
                      <Label htmlFor="urlLink">
                        URL Link {isFieldRequired('urlLink') && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="urlLink"
                        type="url"
                        value={urlLink}
                        onChange={(e) => setUrlLink(sanitizeUrl(e.target.value))}
                        placeholder="https://..."
                        className="h-10"
                        maxLength={2000}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Row 3: Start Date, End Date, Timezone, Travel Required, Location */}
              {(isFieldVisible('requestedStartDate') || isFieldVisible('requestedEndDate') || isFieldVisible('timezone') || isFieldVisible('travelRequired')) && (
                <div className="grid grid-cols-[auto_auto_1fr_auto_1fr] gap-4 items-end">
                  {isFieldVisible('requestedStartDate') && (
                    <div className="space-y-2">
                      <Label htmlFor="requestedStartDate">
                        Start Date {isFieldRequired('requestedStartDate') && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="requestedStartDate"
                        type="date"
                        value={requestedStartDate}
                        onChange={(e) => setRequestedStartDate(e.target.value)}
                        className="h-10 w-[150px] [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert [&::-webkit-calendar-picker-indicator]:dark:opacity-70"
                      />
                    </div>
                  )}
                  {isFieldVisible('requestedEndDate') && (
                    <div className="space-y-2">
                      <Label htmlFor="requestedEndDate">
                        End Date {isFieldRequired('requestedEndDate') && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="requestedEndDate"
                        type="date"
                        value={requestedEndDate}
                        onChange={(e) => setRequestedEndDate(e.target.value)}
                        className="h-10 w-[150px] [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert [&::-webkit-calendar-picker-indicator]:dark:opacity-70"
                      />
                    </div>
                  )}
                  {isFieldVisible('timezone') && (
                    <div className="space-y-2">
                      <Label>
                        Timezone {isFieldRequired('timezone') && <span className="text-destructive">*</span>}
                      </Label>
                      <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={timezoneOpen}
                            className="w-full h-10 justify-between font-normal"
                          >
                            {timezone ? (
                              <span className="truncate">{formatTimezone(timezone)}</span>
                            ) : (
                              <span className="text-muted-foreground">Select timezone...</span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[350px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search timezones..."
                              value={timezoneSearch}
                              onValueChange={setTimezoneSearch}
                            />
                            <CommandList className="scrollbar-on-hover" ref={attachPopoverListWheel}>
                              <CommandEmpty>No timezone found.</CommandEmpty>
                              <CommandGroup>
                                {filteredTimezones.map((tz) => (
                                  <CommandItem
                                    key={tz}
                                    value={tz}
                                    onSelect={() => {
                                      setTimezone(tz);
                                      setTimezoneOpen(false);
                                      setTimezoneSearch('');
                                    }}
                                  >
                                    <span className="flex-1 truncate">{formatTimezone(tz)}</span>
                                    {timezone === tz && <Check className="h-4 w-4" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  {isFieldVisible('travelRequired') && (
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="travelRequired" className="flex items-center gap-1.5">
                        <Plane className="h-3.5 w-3.5" />
                        Travel Required
                      </Label>
                      <div className="flex items-center gap-3 h-10">
                        <Checkbox
                          id="travelRequired"
                          checked={travelRequired}
                          onCheckedChange={(checked) => {
                            setTravelRequired(checked === true);
                            if (!checked) setTravelLocation('');
                          }}
                        />
                        <Input
                          id="travelLocation"
                          value={travelLocation}
                          onChange={(e) => setTravelLocation(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                          placeholder="Enter location"
                          className="h-10 flex-1"
                          maxLength={VALIDATION.NAME_MAX_LENGTH}
                          disabled={!travelRequired}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Row 4: Student Count, Format, Location */}
              {(isFieldVisible('studentCount') || isFieldVisible('format') || isFieldVisible('location')) && (
                <div className="grid grid-cols-3 gap-4">
                  {isFieldVisible('studentCount') && (
                    <div className="space-y-2">
                      <Label htmlFor="studentCount">
                        Student Count {isFieldRequired('studentCount') && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="studentCount"
                        type="number"
                        min="0"
                        value={studentCount}
                        onChange={(e) => setStudentCount(e.target.value)}
                        placeholder="0"
                        className="h-10"
                      />
                    </div>
                  )}
                  {isFieldVisible('format') && (
                    <div className="space-y-2">
                      <Label htmlFor="format">
                        Format {isFieldRequired('format') && <span className="text-destructive">*</span>}
                      </Label>
                      <Select value={format} onValueChange={setFormat}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select format..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Remote">Remote</SelectItem>
                          <SelectItem value="Hybrid">Hybrid</SelectItem>
                          <SelectItem value="On-site">On-site</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {isFieldVisible('location') && (
                    <div className="space-y-2">
                      <Label htmlFor="location">
                        Location {isFieldRequired('location') && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                        placeholder="Enter location"
                        className="h-10"
                        maxLength={VALIDATION.NAME_MAX_LENGTH}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Row 5: Timeline Duration */}
              {isTimelineVisible && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Timeline Duration (weeks)</Label>
                    {totalWeeks > 0 && (
                      <span className="text-sm text-muted-foreground">
                        Total: {totalWeeks} weeks
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {isFieldVisible('preparationWeeks') && (
                      <div className="space-y-1">
                        <Label htmlFor="preparationWeeks" className="text-xs text-muted-foreground">
                          Preparation {isFieldRequired('preparationWeeks') && <span className="text-destructive">*</span>}
                        </Label>
                        <Input
                          id="preparationWeeks"
                          type="number"
                          min="0"
                          value={preparationWeeks}
                          onChange={(e) => setPreparationWeeks(e.target.value)}
                          className="h-10 text-center"
                        />
                      </div>
                    )}
                    {isFieldVisible('executionWeeks') && (
                      <div className="space-y-1">
                        <Label htmlFor="executionWeeks" className="text-xs text-muted-foreground">
                          Execution {isFieldRequired('executionWeeks') && <span className="text-destructive">*</span>}
                        </Label>
                        <Input
                          id="executionWeeks"
                          type="number"
                          min="0"
                          value={executionWeeks}
                          onChange={(e) => setExecutionWeeks(e.target.value)}
                          className="h-10 text-center"
                        />
                      </div>
                    )}
                    {isFieldVisible('reportingWeeks') && (
                      <div className="space-y-1">
                        <Label htmlFor="reportingWeeks" className="text-xs text-muted-foreground">
                          Reporting {isFieldRequired('reportingWeeks') && <span className="text-destructive">*</span>}
                        </Label>
                        <Input
                          id="reportingWeeks"
                          type="number"
                          min="0"
                          value={reportingWeeks}
                          onChange={(e) => setReportingWeeks(e.target.value)}
                          className="h-10 text-center"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Row 6: Required Members, Required Skills */}
              {(isFieldVisible('requiredMembers') || isFieldVisible('requiredSkills')) && (
                <div className="grid grid-cols-2 gap-4">
                  {isFieldVisible('requiredMembers') && (
                    <MemberSelector
                      isRequired={isFieldRequired('requiredMembers')}
                      memberSelectionMode={memberSelectionMode}
                      onToggleMode={handleToggleMemberMode}
                      requiredMemberCount={requiredMemberCount}
                      onCountChange={setRequiredMemberCount}
                      selectedMemberObjects={selectedMemberObjects}
                      selectedMemberIds={selectedMemberIds}
                      filteredMembers={filteredMembers}
                      membersOpen={membersOpen}
                      onMembersOpenChange={setMembersOpen}
                      memberSearch={memberSearch}
                      onMemberSearchChange={setMemberSearch}
                      onRemoveMember={handleRemoveMember}
                      onToggleMember={handleToggleMember}
                    />
                  )}
                  {isFieldVisible('requiredSkills') && (
                    <SkillSelector
                      isRequired={isFieldRequired('requiredSkills')}
                      selectedSkills={selectedSkills}
                      selectedSkillIds={selectedSkillIds}
                      filteredSkills={filteredSkills}
                      skillsOpen={skillsOpen}
                      onSkillsOpenChange={setSkillsOpen}
                      skillSearch={skillSearch}
                      onSkillSearchChange={setSkillSearch}
                      onRemoveSkill={handleRemoveSkill}
                      onToggleSkill={handleToggleSkill}
                    />
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Description/Notes</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(sanitizeInput(e.target.value, VALIDATION.DESCRIPTION_MAX_LENGTH))}
                  placeholder="Project description and any additional notes..."
                  rows={4}
                  className="resize-none"
                  maxLength={VALIDATION.DESCRIPTION_MAX_LENGTH}
                />
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t bg-muted/30">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleClose(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={showDeleteConfirm}
      onOpenChange={setShowDeleteConfirm}
      title="Delete Request"
      description={`Are you sure you want to delete "${projectName}"? This action cannot be undone.`}
      confirmText="Delete"
      variant="destructive"
      onConfirm={handleDelete}
      isLoading={isDeleting}
    />

    <QuipFileBrowser
      open={quipBrowserOpen}
      onOpenChange={setQuipBrowserOpen}
      onImport={handleQuipImport}
    />
    </>
  );
}
