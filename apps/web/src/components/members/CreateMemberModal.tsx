import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { MemberCreateInput } from '@ghostcast/shared';
import { upsertMemberInCache, type CalendarMember } from '@/lib/schedule-cache';
import { sanitizeInput, VALIDATION } from '@/lib/input-validation';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface CreateMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface DayHours {
  enabled: boolean;
  start: string;
  end: string;
}

interface WorkingHoursState {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
}

const defaultDayHours: DayHours = { enabled: false, start: '09:00', end: '17:00' };

const dayLabels: Record<keyof WorkingHoursState, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const initialWorkingHours: WorkingHoursState = {
  mon: { ...defaultDayHours },
  tue: { ...defaultDayHours },
  wed: { ...defaultDayHours },
  thu: { ...defaultDayHours },
  fri: { ...defaultDayHours },
  sat: { ...defaultDayHours },
  sun: { ...defaultDayHours },
};

export function CreateMemberModal({
  open,
  onOpenChange,
  onSuccess,
}: Readonly<CreateMemberModalProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [workingHours, setWorkingHours] = useState<WorkingHoursState>(initialWorkingHours);
  const [showWorkingHours, setShowWorkingHours] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = firstName.trim() !== '' && lastName.trim() !== '';

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmployeeId('');
    setEmail('');
    setPhone('');
    setDepartment('');
    setWorkingHours(initialWorkingHours);
    setShowWorkingHours(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  const updateDayHours = (day: keyof WorkingHoursState, field: keyof DayHours, value: boolean | string) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const buildWorkingHoursPayload = () => {
    const result: Record<string, { start: string; end: string }> = {};
    (Object.keys(workingHours) as (keyof WorkingHoursState)[]).forEach((day) => {
      if (workingHours[day].enabled) {
        result[day] = {
          start: workingHours[day].start,
          end: workingHours[day].end,
        };
      }
    });
    return Object.keys(result).length > 0 ? result : undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const payload: MemberCreateInput = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(employeeId.trim() && { employeeId: employeeId.trim() }),
        ...(email.trim() && { email: email.trim() }),
        ...(phone.trim() && { phone: phone.trim() }),
        ...(department.trim() && { department: department.trim() }),
        workingHours: buildWorkingHoursPayload(),
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
          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                placeholder="John"
                maxLength={VALIDATION.NAME_MAX_LENGTH}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                placeholder="Doe"
                maxLength={VALIDATION.NAME_MAX_LENGTH}
                required
              />
            </div>
          </div>

          {/* Contact Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, VALIDATION.EMAIL_MAX_LENGTH))}
                placeholder="john.doe@example.com"
                maxLength={VALIDATION.EMAIL_MAX_LENGTH}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.slice(0, 50))}
                placeholder="+1 (555) 123-4567"
                maxLength={50}
              />
            </div>
          </div>

          {/* Employment Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee ID</Label>
              <Input
                id="employeeId"
                value={employeeId}
                onChange={(e) => setEmployeeId(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                placeholder="EMP001"
                maxLength={VALIDATION.NAME_MAX_LENGTH}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(sanitizeInput(e.target.value, VALIDATION.NAME_MAX_LENGTH))}
                placeholder="Engineering"
                maxLength={VALIDATION.NAME_MAX_LENGTH}
              />
            </div>
          </div>

          {/* Working Hours Section */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setShowWorkingHours(!showWorkingHours)}
              className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Working Hours</span>
                <span className="text-sm text-muted-foreground">(Optional)</span>
              </div>
              {showWorkingHours ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showWorkingHours && (
              <div className="px-4 pb-4 space-y-3">
                {(Object.keys(dayLabels) as (keyof WorkingHoursState)[]).map((day) => (
                  <div key={day} className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-28">
                      <Checkbox
                        id={`${day}-enabled`}
                        checked={workingHours[day].enabled}
                        onCheckedChange={(checked) =>
                          updateDayHours(day, 'enabled', checked === true)
                        }
                      />
                      <Label
                        htmlFor={`${day}-enabled`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {dayLabels[day]}
                      </Label>
                    </div>
                    {workingHours[day].enabled && (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="time"
                          value={workingHours[day].start}
                          onChange={(e) => updateDayHours(day, 'start', e.target.value)}
                          className="w-32"
                        />
                        <span className="text-sm text-muted-foreground">to</span>
                        <Input
                          type="time"
                          value={workingHours[day].end}
                          onChange={(e) => updateDayHours(day, 'end', e.target.value)}
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
