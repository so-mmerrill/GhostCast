import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { Hash } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MemberInfoTab,
  MemberSkillsTab,
  MemberRolesTab,
  MemberProfileTab,
  MemberNotesTab,
  MemberStatsTab,
} from '../members/tabs';

interface Skill {
  id: string;
  name: string;
  category: string | null;
  isActive: boolean;
}

interface MemberSkill {
  id: string;
  skillId: string;
  level: number;
  skill: Skill;
}

interface ProjectRole {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
}

interface MemberProjectRole {
  id: string;
  projectRoleId: string;
  dateAwarded: string | null;
  createdAt: string;
  projectRole: ProjectRole;
}

interface MemberData {
  id: string;
  employeeId: string | null;
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
  resume: string | null;
  certification: string | null;
  training: string | null;
  education: string | null;
  notes: string | null;
  isActive: boolean;
  skills: MemberSkill[];
  projectRoles: MemberProjectRole[];
  createdAt: string;
  updatedAt: string;
  workingHours?: {
    mon?: { start: string; end: string };
    tue?: { start: string; end: string };
    wed?: { start: string; end: string };
    thu?: { start: string; end: string };
    fri?: { start: string; end: string };
    sat?: { start: string; end: string };
    sun?: { start: string; end: string };
  } | null;
  metadata?: {
    hideFromSchedule?: boolean;
    [key: string]: unknown;
  };
}

interface ScheduleMemberProfileModalProps {
  memberId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getInitials = (firstName: string, lastName: string) =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500',
    'bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-400 dark:to-emerald-500',
    'bg-gradient-to-br from-violet-500 to-violet-600 dark:from-violet-400 dark:to-violet-500',
    'bg-gradient-to-br from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500',
    'bg-gradient-to-br from-rose-500 to-rose-600 dark:from-rose-400 dark:to-rose-500',
    'bg-gradient-to-br from-cyan-500 to-cyan-600 dark:from-cyan-400 dark:to-cyan-500',
    'bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-400 dark:to-indigo-500',
    'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 dark:from-fuchsia-400 dark:to-fuchsia-500',
  ];
  const hash = name.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
  return colors[hash % colors.length];
};

export function ScheduleMemberProfileModal({
  memberId,
  open,
  onOpenChange,
}: Readonly<ScheduleMemberProfileModalProps>) {
  const { data: member, isLoading } = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => api.get<{ data: MemberData }>(`/members/${memberId}`),
    enabled: !!memberId && open,
  });

  const memberData = member?.data;

  if (!memberId) return null;

  const fullName = memberData ? `${memberData.firstName} ${memberData.lastName}` : '';

  const renderDialogBody = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12 flex-1">
          <div className="text-muted-foreground">Loading member details...</div>
        </div>
      );
    }
    if (!memberData) {
      return (
        <div className="flex items-center justify-center py-12 flex-1">
          <div className="text-muted-foreground">Member not found</div>
        </div>
      );
    }
    return (
      <>
        {/* Compact Profile Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b bg-muted/30">
          <Avatar
            className={cn(
              'h-12 w-12 ring-2 ring-background shadow-md flex-shrink-0',
              getAvatarColor(fullName)
            )}
          >
            <AvatarFallback className="bg-transparent text-white text-sm font-semibold">
              {getInitials(memberData.firstName, memberData.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold truncate">{fullName}</h2>
              <Badge variant={memberData.isActive ? 'success' : 'secondary'} className="flex-shrink-0">
                {memberData.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {memberData.position && <span className="truncate">{memberData.position}</span>}
              {memberData.position && memberData.department && <span>•</span>}
              {memberData.department && <span className="truncate">{memberData.department}</span>}
              {memberData.employeeId && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-0.5">
                    <Hash className="h-3 w-3" />
                    {memberData.employeeId}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0 px-6 pt-4">
          <TabsList className="grid w-full grid-cols-6 flex-shrink-0">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="info" className="mt-0 h-full">
              <MemberInfoTab
                member={memberData}
                isEditing={false}
                hideFromSchedule={memberData.metadata?.hideFromSchedule ?? false}
              />
            </TabsContent>

            <TabsContent value="skills" className="mt-0 h-full">
              <MemberSkillsTab
                memberId={memberData.id}
                skills={memberData.skills || []}
                readOnly
              />
            </TabsContent>

            <TabsContent value="roles" className="mt-0 h-full">
              <MemberRolesTab
                memberId={memberData.id}
                projectRoles={memberData.projectRoles || []}
                readOnly
              />
            </TabsContent>

            <TabsContent value="profile" className="mt-0 h-full">
              <MemberProfileTab
                memberId={memberData.id}
                isEditing={false}
                resume={memberData.resume}
                certification={memberData.certification}
                training={memberData.training}
                education={memberData.education}
              />
            </TabsContent>

            <TabsContent value="notes" className="mt-0 h-full">
              <MemberNotesTab
                memberId={memberData.id}
                isEditing={false}
                notes={memberData.notes}
              />
            </TabsContent>

            <TabsContent value="stats" className="mt-0 h-full">
              <MemberStatsTab memberId={memberData.id} />
            </TabsContent>
          </div>
        </Tabs>
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{fullName || 'Member Profile'}</DialogTitle>
        </DialogHeader>

        {renderDialogBody()}
      </DialogContent>
    </Dialog>
  );
}
