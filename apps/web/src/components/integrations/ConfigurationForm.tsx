import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PluginConfigSchemaField, SyncPipelineStep } from '@ghostcast/shared';
import { Save } from 'lucide-react';
import { SyncPipelineEditor } from './SyncPipelineEditor';

interface ConfigurationFormProps {
  schema: PluginConfigSchemaField[];
  values: Record<string, unknown>;
  onChange?: (values: Record<string, unknown>) => void;
  onSave?: (values: Record<string, unknown>) => void;
  disabled?: boolean;
  isSaving?: boolean;
}

interface FieldRendererProps {
  readonly field: PluginConfigSchemaField;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly isDisabled: boolean;
}

function toSafeString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function BooleanField({ field, value, onChange, isDisabled }: Readonly<FieldRendererProps>) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={field.key}
        checked={!!value}
        onCheckedChange={onChange}
        disabled={isDisabled}
      />
      {field.description && (
        <span className="text-sm text-muted-foreground">{field.description}</span>
      )}
    </div>
  );
}

function SelectField({ field, value, onChange, isDisabled }: Readonly<FieldRendererProps>) {
  const stringValue = toSafeString(value) || toSafeString(field.default);
  return (
    <Select
      value={stringValue}
      onValueChange={onChange}
      disabled={isDisabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {field.options?.map((opt) => (
          <SelectItem key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiselectField({ field, value, onChange, isDisabled }: Readonly<FieldRendererProps>) {
  const selected = Array.isArray(value) ? (value as (string | number)[]) : [];

  const handleOptionChange = (optValue: string | number, checked: boolean) => {
    const next = checked
      ? [...selected, optValue]
      : selected.filter((v) => v !== optValue);
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      {field.options?.map((opt) => (
        <div key={String(opt.value)} className="flex items-center gap-2">
          <Checkbox
            id={`${field.key}-${opt.value}`}
            checked={selected.includes(opt.value)}
            onCheckedChange={(checked) => handleOptionChange(opt.value, !!checked)}
            disabled={isDisabled}
          />
          <Label htmlFor={`${field.key}-${opt.value}`} className="text-sm font-normal">
            {opt.label}
          </Label>
        </div>
      ))}
    </div>
  );
}

function TextareaField({ field, value, onChange, isDisabled }: Readonly<FieldRendererProps>) {
  return (
    <Textarea
      id={field.key}
      value={toSafeString(value)}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      placeholder={field.description}
      disabled={isDisabled}
      rows={4}
    />
  );
}

function InputField({ field, value, onChange, isDisabled }: Readonly<FieldRendererProps>) {
  const isConfiguredPassword = field.type === 'password' && value === '***configured***';

  const getInputType = () => {
    if (field.type === 'password') return 'password';
    if (field.type === 'number') return 'number';
    return 'text';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = field.type === 'number' ? Number(e.target.value) : e.target.value;
    onChange(newValue);
  };

  return (
    <>
      {isConfiguredPassword && (
        <p className="mb-1 text-xs text-green-600 dark:text-green-400">
          ✓ Already configured. Leave blank to keep current value, or enter a new value to update.
        </p>
      )}
      <Input
        id={field.key}
        type={getInputType()}
        value={isConfiguredPassword ? '' : toSafeString(value)}
        onChange={handleInputChange}
        placeholder={isConfiguredPassword ? 'Enter new value to update' : field.description}
        required={field.required && !isConfiguredPassword}
        disabled={isDisabled}
        min={field.validation?.min}
        max={field.validation?.max}
      />
    </>
  );
}

function SyncPipelineField({ field, value, onChange, isDisabled }: Readonly<FieldRendererProps>) {
  const steps = Array.isArray(value) ? (value as SyncPipelineStep[]) : [];
  const actions = field.pipelineActions || [];
  return (
    <SyncPipelineEditor
      value={steps}
      onChange={onChange}
      availableActions={actions}
      disabled={isDisabled}
    />
  );
}

function FieldRenderer(props: Readonly<FieldRendererProps>) {
  switch (props.field.type) {
    case 'boolean':
      return <BooleanField {...props} />;
    case 'select':
      return <SelectField {...props} />;
    case 'multiselect':
      return <MultiselectField {...props} />;
    case 'textarea':
      return <TextareaField {...props} />;
    case 'syncPipeline':
      return <SyncPipelineField {...props} />;
    default:
      return <InputField {...props} />;
  }
}

export function ConfigurationForm({
  schema,
  values,
  onChange,
  onSave,
  disabled,
  isSaving,
}: Readonly<ConfigurationFormProps>) {
  const [formValues, setFormValues] = useState<Record<string, unknown>>(values);
  const isEditable = !!onSave;
  const isDisabled = disabled || (!isEditable && !onChange);

  useEffect(() => {
    setFormValues(values);
  }, [values]);

  const handleChange = (key: string, value: unknown) => {
    const newValues = { ...formValues, [key]: value };
    setFormValues(newValues);
    onChange?.(newValues);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave?.(formValues);
  };

  // Group consecutive fields with the same group name into rows
  const fieldGroups: { group: string | null; fields: PluginConfigSchemaField[] }[] = [];
  for (const field of schema) {
    const groupName = field.group ?? null;
    const last = fieldGroups.at(-1);
    if (groupName && last && last.group === groupName) {
      last.fields.push(field);
    } else {
      fieldGroups.push({ group: groupName, fields: [field] });
    }
  }

  const renderField = (field: PluginConfigSchemaField) => (
    <div key={field.key} className="space-y-2">
      <Label htmlFor={field.key}>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>

      <FieldRenderer
        field={field}
        value={formValues[field.key]}
        onChange={(value) => handleChange(field.key, value)}
        isDisabled={isDisabled}
      />

      {field.description && field.type !== 'boolean' && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fieldGroups.map((entry) => {
        if (entry.group && entry.fields.length > 1) {
          return (
            <div key={entry.group} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
              {entry.fields.map(renderField)}
            </div>
          );
        }
        return entry.fields.map(renderField);
      })}

      {isEditable && (
        <Button type="submit" disabled={disabled || isSaving}>
          {isSaving ? (
            <span className="animate-pulse">Saving...</span>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Configuration
            </>
          )}
        </Button>
      )}
    </form>
  );
}
