import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Award, GraduationCap, BookOpen } from 'lucide-react';

interface MemberProfileTabProps {
  memberId: string;
  resume: string | null;
  certification: string | null;
  training: string | null;
  education: string | null;
  isEditing: boolean;
  savedData?: Record<string, unknown>;
  onUpdate?: () => void;
}

export interface MemberProfileTabRef {
  getData: () => Record<string, unknown>;
}

export const MemberProfileTab = forwardRef<MemberProfileTabRef, MemberProfileTabProps>(
  function MemberProfileTab({
    memberId: _memberId,
    resume,
    certification,
    training,
    education,
    isEditing,
    savedData,
    onUpdate: _onUpdate,
  }, ref) {
    const [formData, setFormData] = useState({
      resume: (savedData?.resume as string) ?? resume ?? '',
      certification: (savedData?.certification as string) ?? certification ?? '',
      training: (savedData?.training as string) ?? training ?? '',
      education: (savedData?.education as string) ?? education ?? '',
    });

    // Reset form data when editing is cancelled
    useEffect(() => {
      if (!isEditing) {
        setFormData({
          resume: resume || '',
          certification: certification || '',
          training: training || '',
          education: education || '',
        });
      }
    }, [isEditing, resume, certification, training, education]);

    // Expose getData method to parent
    useImperativeHandle(ref, () => ({
      getData: () => ({
        resume: formData.resume || null,
        certification: formData.certification || null,
        training: formData.training || null,
        education: formData.education || null,
      }),
    }), [formData]);

    const fields = [
      {
        key: 'resume',
        label: 'Resume',
        icon: FileText,
        placeholder: 'Enter resume summary, work experience, and key qualifications...',
      },
      {
        key: 'certification',
        label: 'Certifications',
        icon: Award,
        placeholder: 'List certifications, licenses, and professional credentials...',
      },
      {
        key: 'training',
        label: 'Training',
        icon: BookOpen,
        placeholder: 'List completed training courses, workshops, and professional development...',
      },
      {
        key: 'education',
        label: 'Education',
        icon: GraduationCap,
        placeholder: 'List degrees, schools, and educational achievements...',
      },
    ] as const;

    return (
      <div className="space-y-6 p-4">
        {fields.map((field) => {
          const Icon = field.icon;
          const value = formData[field.key];
          const originalValues = { resume, certification, training, education };
          const originalValue = originalValues[field.key];

          return (
            <div key={field.key} className="space-y-2">
              <Label className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {field.label}
              </Label>
              {isEditing ? (
                <Textarea
                  value={value}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  rows={4}
                  className="resize-none"
                />
              ) : (
                <div className="rounded-md border p-3 min-h-[80px] text-sm whitespace-pre-wrap bg-muted/30">
                  {originalValue || (
                    <span className="text-muted-foreground italic">Not provided</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);
