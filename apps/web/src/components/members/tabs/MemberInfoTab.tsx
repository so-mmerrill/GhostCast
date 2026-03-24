import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mail, Phone, Building2, User, Users, CalendarOff } from 'lucide-react';

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

    // Fetch active members for manager dropdown
    const { data: membersData } = useQuery({
      queryKey: ['members', 'active-list'],
      queryFn: async () => {
        const response = await api.get<{ data: { data: Member[] } }>('/members?pageSize=1000');
        return response.data.data;
      },
    });

    const availableManagers = membersData?.filter((m) => m.id !== member.id) || [];

    // Ensure current manager is always in the list (even if data hasn't loaded yet)
    const currentManagerInList = member.managerId && availableManagers.some((m) => m.id === member.managerId);
    const managersWithCurrent = currentManagerInList || !member.manager
      ? availableManagers
      : [{ id: member.manager.id, firstName: member.manager.firstName, lastName: member.manager.lastName }, ...availableManagers];

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
              <Select
                value={formData.managerId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, managerId: value === 'none' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {managersWithCurrent.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
