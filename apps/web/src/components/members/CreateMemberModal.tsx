import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { MemberCreateInput } from '@ghostcast/shared';
import { upsertMemberInCache, type CalendarMember } from '@/lib/schedule-cache';
import { sanitizeInput, VALIDATION } from '@/lib/input-validation';
import { usePaginatedSearch } from '@/hooks/use-paginated-search';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Mail, Phone, Building2, User, Users, ChevronsUpDown, Check, Loader2 } from 'lucide-react';

interface CreateMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface MemberOption {
  id: string;
  firstName: string;
  lastName: string;
}

export function CreateMemberModal({
  open,
  onOpenChange,
  onSuccess,
}: Readonly<CreateMemberModalProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [managerId, setManagerId] = useState('');
  const [managerOpen, setManagerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = firstName.trim() !== '' && lastName.trim() !== '';

  const {
    items: managersRaw,
    search: managerSearch,
    setSearch: setManagerSearch,
  } = usePaginatedSearch<MemberOption & { isActive?: boolean }>({
    endpoint: '/members',
    queryKey: 'members-manager-search-create',
    pageSize: 50,
    extraParams: { memberStatus: 'active' },
    enabled: open,
  });

  const selectedManagerName = (() => {
    if (!managerId) return null;
    const found = managersRaw.find((m) => m.id === managerId);
    if (found) return `${found.firstName} ${found.lastName}`;
    return null;
  })();

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setPosition('');
    setDepartment('');
    setManagerId('');
};

  const handleClose = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const payload: MemberCreateInput = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(email.trim() && { email: email.trim() }),
        ...(phone.trim() && { phone: phone.trim() }),
        ...(position.trim() && { position: position.trim() }),
        ...(department.trim() && { department: department.trim() }),
        ...(managerId && { managerId }),
      };

      const response = await api.post<{ data: CalendarMember }>('/members', payload);

      toast({
        title: 'Member created',
        description: `${firstName} ${lastName} has been added successfully.`,
      });

      // Upsert the new member directly into schedule caches (no full refetch)
      upsertMemberInCache(queryClient, response.data);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      handleClose(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Failed to create member',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>
            Fill in the details to add a new team member.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* First Name */}
            <div className="space-y-2">
              <Label htmlFor="create-firstName" className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                First Name *
              </Label>
              <Input
                id="create-firstName"
                value={firstName}
                onChange={(e) => setFirstName(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                placeholder="John"
                maxLength={VALIDATION.NAME_MAX_LENGTH}
                required
              />
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label htmlFor="create-lastName" className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Last Name *
              </Label>
              <Input
                id="create-lastName"
                value={lastName}
                onChange={(e) => setLastName(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                placeholder="Doe"
                maxLength={VALIDATION.NAME_MAX_LENGTH}
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="create-email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email
              </Label>
              <Input
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, VALIDATION.EMAIL_MAX_LENGTH))}
                placeholder="john.doe@example.com"
                maxLength={VALIDATION.EMAIL_MAX_LENGTH}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="create-phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Phone
              </Label>
              <Input
                id="create-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.slice(0, 50))}
                placeholder="+1 (555) 123-4567"
                maxLength={50}
              />
            </div>

            {/* Position */}
            <div className="space-y-2">
              <Label htmlFor="create-position" className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Position
              </Label>
              <Input
                id="create-position"
                value={position}
                onChange={(e) => setPosition(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                placeholder="Job title"
                maxLength={VALIDATION.NAME_MAX_LENGTH}
              />
            </div>

            {/* Department */}
            <div className="space-y-2">
              <Label htmlFor="create-department" className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Department
              </Label>
              <Input
                id="create-department"
                value={department}
                onChange={(e) => setDepartment(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                placeholder="Department name"
                maxLength={VALIDATION.NAME_MAX_LENGTH}
              />
            </div>

            {/* Manager */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Manager
              </Label>
              <Popover open={managerOpen} onOpenChange={setManagerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={managerOpen}
                    className="w-full justify-between font-normal"
                    type="button"
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
                            setManagerId('');
                            setManagerOpen(false);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', managerId ? 'opacity-0' : 'opacity-100')} />
                          None
                        </CommandItem>
                        {managersRaw.map((m) => (
                          <CommandItem
                            key={m.id}
                            value={m.id}
                            onSelect={() => {
                              setManagerId(m.id);
                              setManagerOpen(false);
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', managerId === m.id ? 'opacity-100' : 'opacity-0')} />
                            {m.firstName} {m.lastName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
