import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GenericDataForm } from './GenericDataForm';
import { useDataManagement } from './hooks/useDataManagement';
import { DataEntityConfig } from './configs/types';

interface GenericDataDialogProps<T extends { id: string }> {
  config: DataEntityConfig<T>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: T | null;
  duplicatingItem?: T | null;
}

export function GenericDataDialog<T extends { id: string }>({
  config,
  open,
  onOpenChange,
  editingItem,
  duplicatingItem,
}: Readonly<GenericDataDialogProps<T>>) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const { useCreate, useUpdate } = useDataManagement<T>({
    endpoint: config.apiEndpoint,
    queryKey: config.queryKey,
  });

  const createMutation = useCreate();
  const updateMutation = useUpdate();

  const isEditing = !!editingItem;
  const isDuplicating = !!duplicatingItem;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const getDialogTitle = (): string => {
    if (isEditing) return `Edit ${config.displayName}`;
    if (isDuplicating) return `Duplicate ${config.displayName}`;
    return `Create ${config.displayName}`;
  };

  const getDialogDescription = (): string => {
    if (isEditing) return `Update the details for this ${config.displayName.toLowerCase()}.`;
    if (isDuplicating) return `Create a copy of this ${config.displayName.toLowerCase()}. Change the name to avoid conflicts.`;
    return `Add a new ${config.displayName.toLowerCase()} to the system.`;
  };

  const getFormMode = (): string => {
    if (isEditing) return 'edit';
    if (isDuplicating) return 'duplicate';
    return 'new';
  };

  const getSubmitButtonText = (): string => {
    if (isPending) return 'Saving...';
    if (isEditing) return 'Save Changes';
    return 'Create';
  };

  // Prepare initial data for the form
  // When duplicating, use the source item data with a modified name
  const getInitialData = (): Record<string, unknown> | null => {
    if (editingItem) {
      return editingItem as unknown as Record<string, unknown>;
    }
    if (duplicatingItem) {
      const sourceData = duplicatingItem as unknown as Record<string, unknown>;
      const sourceName = typeof sourceData.name === 'string' ? sourceData.name : '';
      return {
        ...sourceData,
        name: sourceName ? `${sourceName} (Copy)` : '',
      };
    }
    return null;
  };

  const initialData = getInitialData();

  const handleFormChange = useCallback((data: Record<string, unknown>) => {
    setFormData(data);
    setError(null);
  }, []);

  const validateForm = (): boolean => {
    for (const field of config.formFields) {
      if (field.required) {
        const value = formData[field.name];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          setError(`${field.label} is required`);
          return false;
        }
      }
      if (field.validation?.minLength) {
        const value = formData[field.name] as string;
        if (value && value.length < field.validation.minLength) {
          setError(`${field.label} must be at least ${field.validation.minLength} characters`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      // Clean up empty strings to null for optional fields
      const cleanedData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value === '' || value === undefined) {
          cleanedData[key] = null;
        } else {
          cleanedData[key] = value;
        }
      }

      if (isEditing) {
        await updateMutation.mutateAsync({
          id: editingItem.id,
          data: cleanedData as Partial<T>,
        });
      } else {
        await createMutation.mutateAsync(cleanedData as Partial<T>);
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <GenericDataForm
            key={`${getFormMode()}-${editingItem?.id || duplicatingItem?.id || ''}`}
            fields={config.formFields}
            initialData={initialData ?? undefined}
            onChange={handleFormChange}
            isEditing={isEditing}
          />

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {getSubmitButtonText()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
