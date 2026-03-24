import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Role } from '@ghostcast/shared';
import { Hash, Trash2, Pencil, Save, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MemberInfoTab,
  MemberSkillsTab,
  MemberRolesTab,
  MemberProfileTab,
  MemberNotesTab,
} from './tabs';
import type {
  MemberInfoTabRef,
  MemberProfileTabRef,
  MemberNotesTabRef,
} from './tabs';
import type { Member } from '@/types/member';

interface MemberProfileModalProps {
  member: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMemberDeleted?: () => void;
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

export function MemberProfileModal({
  member: memberProp,
  open,
  onOpenChange,
  onMemberDeleted,
}: Readonly<MemberProfileModalProps>) {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch fresh member data to stay in sync with cache
  const { data: memberResponse } = useQuery({
    queryKey: ['member', memberProp?.id],
    queryFn: () => api.get<{ data: Member }>(`/members/${memberProp?.id}`),
    enabled: !!memberProp?.id && open,
    initialData: memberProp ? { data: memberProp } : undefined,
  });

  // Use fetched data if available, otherwise fall back to prop
  const member = memberResponse?.data ?? memberProp;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, unknown>>>({});

  // Refs to collect data from tabs
  const infoTabRef = useRef<MemberInfoTabRef>(null);
  const profileTabRef = useRef<MemberProfileTabRef>(null);
  const notesTabRef = useRef<MemberNotesTabRef>(null);

  // Reset editing state when modal closes or member changes
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setActiveTab('info');
      setPendingEdits({});
    }
  }, [open, memberProp?.id]);

  // Save current tab's form data before switching tabs
  const handleTabChange = (newTab: string) => {
    if (isEditing) {
      let currentData: Record<string, unknown> | undefined;
      switch (activeTab) {
        case 'info':
          currentData = infoTabRef.current?.getData();
          break;
        case 'profile':
          currentData = profileTabRef.current?.getData();
          break;
        case 'notes':
          currentData = notesTabRef.current?.getData();
          break;
      }
      if (currentData) {
        setPendingEdits((prev) => ({ ...prev, [activeTab]: currentData }));
      }
    }
    setActiveTab(newTab);
  };

  if (!member) return null;

  const fullName = `${member.firstName} ${member.lastName}`;
  const canDelete = hasRole(Role.MANAGER);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const deletedMemberId = member.id;
      await api.delete(`/members/${deletedMemberId}`);
      toast({
        title: 'Member deleted',
        description: `${fullName} has been removed.`,
      });
      // Close modal first to disable the individual member query
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onMemberDeleted?.();
      // Remove the deleted member from cache (don't refetch)
      queryClient.removeQueries({ queryKey: ['member', deletedMemberId] });
      // Then invalidate list queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    } catch (error) {
      toast({
        title: 'Failed to delete member',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['members'] });
    queryClient.invalidateQueries({ queryKey: ['member', member.id] });
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const infoData = infoTabRef.current?.getData() || pendingEdits.info || {};
      const profileData = profileTabRef.current?.getData() || pendingEdits.profile || {};
      const notesData = notesTabRef.current?.getData() || pendingEdits.notes || {};

      await api.put(`/members/${member.id}`, {
        ...infoData,
        ...profileData,
        ...notesData,
      });

      // Invalidate both the list and single-member queries
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member', member.id] });
      toast({
        title: 'Member updated',
        description: 'All changes have been saved.',
      });
      setIsEditing(false);
      setPendingEdits({});
      handleUpdate();
    } catch (error) {
      toast({
        title: 'Failed to save changes',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setPendingEdits({});
  };

  const canEdit = hasRole(Role.MANAGER);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{fullName}</DialogTitle>
        </DialogHeader>

        {/* Compact Profile Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b bg-muted/30">
          <Avatar
            className={cn(
              'h-12 w-12 ring-2 ring-background shadow-md flex-shrink-0',
              getAvatarColor(fullName)
            )}
          >
            <AvatarFallback className="bg-transparent text-white text-sm font-semibold">
              {getInitials(member.firstName, member.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold truncate">{fullName}</h2>
              <Badge variant={member.isActive ? 'success' : 'secondary'} className="flex-shrink-0">
                {member.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {member.position && <span className="truncate">{member.position}</span>}
              {member.position && member.department && <span>•</span>}
              {member.department && <span className="truncate">{member.department}</span>}
              {member.employeeId && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-0.5">
                    <Hash className="h-3 w-3" />
                    {member.employeeId}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {canEdit && !isEditing && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0 px-6 pt-4">
          <TabsList className="grid w-full grid-cols-5 flex-shrink-0">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="info" className="mt-0 h-full">
              <MemberInfoTab ref={infoTabRef} member={member} isEditing={isEditing} hideFromSchedule={member.metadata?.hideFromSchedule ?? false} savedData={pendingEdits.info} onUpdate={handleUpdate} />
            </TabsContent>

            <TabsContent value="skills" className="mt-0 h-full">
              <MemberSkillsTab
                memberId={member.id}
                skills={member.skills || []}
                readOnly={!isEditing}
                onUpdate={handleUpdate}
              />
            </TabsContent>

            <TabsContent value="roles" className="mt-0 h-full">
              <MemberRolesTab
                memberId={member.id}
                projectRoles={member.projectRoles || []}
                readOnly={!isEditing}
                onUpdate={handleUpdate}
              />
            </TabsContent>

            <TabsContent value="profile" className="mt-0 h-full">
              <MemberProfileTab ref={profileTabRef} memberId={member.id} isEditing={isEditing} resume={member.resume} certification={member.certification} training={member.training} education={member.education} savedData={pendingEdits.profile} onUpdate={handleUpdate} />
            </TabsContent>

            <TabsContent value="notes" className="mt-0 h-full">
              <MemberNotesTab ref={notesTabRef} memberId={member.id} isEditing={isEditing} notes={member.notes} savedData={pendingEdits.notes} onUpdate={handleUpdate} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer with Save/Cancel buttons when editing */}
        {isEditing && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/30">
            <Button variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button onClick={handleSaveAll} disabled={isSaving}>
              <Save className="h-4 w-4 mr-1" /> {isSaving ? 'Saving...' : 'Save All Changes'}
            </Button>
          </div>
        )}
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Member"
        description={`Are you sure you want to delete ${fullName}? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </Dialog>
  );
}
