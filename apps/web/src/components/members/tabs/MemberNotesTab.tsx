import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StickyNote } from 'lucide-react';

interface MemberNotesTabProps {
  memberId: string;
  notes: string | null;
  isEditing: boolean;
  savedData?: Record<string, unknown>;
  onUpdate?: () => void;
}

export interface MemberNotesTabRef {
  getData: () => Record<string, unknown>;
}

export const MemberNotesTab = forwardRef<MemberNotesTabRef, MemberNotesTabProps>(
  function MemberNotesTab({ memberId: _memberId, notes, isEditing, savedData, onUpdate: _onUpdate }, ref) {
    const [notesValue, setNotesValue] = useState((savedData?.notes as string) ?? notes ?? '');

    // Reset form data when editing is cancelled
    useEffect(() => {
      if (!isEditing) {
        setNotesValue(notes || '');
      }
    }, [isEditing, notes]);

    // Expose getData method to parent
    useImperativeHandle(ref, () => ({
      getData: () => ({
        notes: notesValue || null,
      }),
    }));

    return (
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            Notes
          </Label>
          {isEditing ? (
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Add notes about this member..."
              rows={12}
              className="resize-none"
            />
          ) : (
            <div className="rounded-md border p-4 min-h-[250px] text-sm whitespace-pre-wrap bg-muted/30">
              {notes || <span className="text-muted-foreground italic">No notes</span>}
            </div>
          )}
        </div>
      </div>
    );
  }
);
