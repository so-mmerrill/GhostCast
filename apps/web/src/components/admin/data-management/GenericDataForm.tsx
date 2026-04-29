import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Eye, EyeOff, ChevronsUpDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import { DataFieldConfig } from './configs/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// Sentinel value used to represent "no selection" in select fields
// (Radix Select disallows empty-string item values).
const SELECT_NONE = '__none__';

// Helper to extract options array from various API response formats
function getOptionsArray(response: unknown, field: DataFieldConfig): { value: string; label: string }[] {
  if (!response) return [];

  const labelKey = field.optionLabelKey || 'name';
  const valueKey = field.optionValueKey || 'id';

  let items: unknown[] = [];

  // Handle different response structures
  if (Array.isArray(response)) {
    items = response;
  } else if (typeof response === 'object' && response !== null) {
    const resp = response as Record<string, unknown>;
    if (Array.isArray(resp.data)) {
      items = resp.data;
    } else if (resp.data && typeof resp.data === 'object') {
      const nested = resp.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) {
        items = nested.data;
      }
    }
  }

  return items
    .filter((item) => {
      if (typeof item === 'string') return true;
      return (item as { isActive?: unknown }).isActive !== false;
    })
    .map((item) => {
      if (typeof item === 'string') {
        return { value: item, label: item };
      }
      const obj = item as Record<string, unknown>;
      return {
        value: String(obj[valueKey]),
        label: String(obj[labelKey]),
      };
    });
}

// Select field with optional API-fetched options. Falls back to field.options when no endpoint set.
function SelectField({
  field,
  value,
  onChange,
}: Readonly<{
  field: DataFieldConfig;
  value: string;
  onChange: (value: string) => void;
}>) {
  const { data: optionsResponse, isLoading } = useQuery({
    queryKey: [field.optionsQueryKey || field.name],
    queryFn: () => api.get(field.optionsEndpoint || ''),
    enabled: !!field.optionsEndpoint,
  });

  const fetchedOptions = field.optionsEndpoint ? getOptionsArray(optionsResponse, field) : [];
  const options = field.optionsEndpoint ? fetchedOptions : (field.options ?? []);

  if (field.optionsEndpoint && isLoading) {
    return <div className="text-sm text-muted-foreground">Loading options...</div>;
  }

  return (
    <Select
      value={value || SELECT_NONE}
      onValueChange={(val) => onChange(val === SELECT_NONE ? '' : val)}
    >
      <SelectTrigger>
        <SelectValue placeholder={field.placeholder || 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        {!field.required && (
          <SelectItem value={SELECT_NONE}>
            <span className="text-muted-foreground">None</span>
          </SelectItem>
        )}
        {options.length === 0 && field.optionsEndpoint && (
          <SelectItem value={SELECT_NONE} disabled>
            No options available
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Multiselect field component with API fetching and searchable dropdown
function MultiselectField({
  field,
  value,
  onChange,
}: Readonly<{
  field: DataFieldConfig;
  value: string[];
  onChange: (value: string[]) => void;
}>) {
  const [open, setOpen] = useState(false);

  const { data: optionsResponse, isLoading } = useQuery({
    queryKey: [field.optionsQueryKey || field.name],
    queryFn: () => api.get(field.optionsEndpoint || ''),
    enabled: !!field.optionsEndpoint,
  });

  const options = getOptionsArray(optionsResponse, field);

  // Get labels for selected values
  const selectedLabels = value
    .map((v) => options.find((opt) => opt.value === v)?.label)
    .filter(Boolean);

  const handleSelect = (optionValue: string) => {
    const isSelected = value.includes(optionValue);
    const newValue = isSelected
      ? value.filter((id) => id !== optionValue)
      : [...value, optionValue];
    onChange(newValue);
  };

  const handleRemove = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((id) => id !== optionValue));
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading options...</div>;
  }

  if (options.length === 0) {
    return <div className="text-sm text-muted-foreground">No options available</div>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-[40px] h-auto"
        >
          <div className="flex flex-wrap gap-1 flex-1 text-left">
            {selectedLabels.length > 0 ? (
              selectedLabels.map((label, index) => {
                const optionValue = value[index];
                return (
                  <Badge
                    key={optionValue}
                    variant="secondary"
                    className="mr-1 mb-0.5"
                  >
                    {label}
                    <button
                      type="button"
                      className="ml-1 rounded-full outline-none hover:bg-muted-foreground/20"
                      onClick={(e) => handleRemove(optionValue, e)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })
            ) : (
              <span className="text-muted-foreground">Select {field.label?.toLowerCase() || 'items'}...</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${field.label?.toLowerCase() || 'items'}...`} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = value.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    {option.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Field configuration editor for project types
function FieldConfigEditor({
  field,
  value,
  onChange,
}: Readonly<{
  field: DataFieldConfig;
  value: Record<string, { visible: boolean; required: boolean; valueTemplate?: string }>;
  onChange: (value: Record<string, { visible: boolean; required: boolean; valueTemplate?: string }>) => void;
}>) {
  const configurableFields = field.configurableFields || [];
  const config = value || {};

  const handleToggle = (fieldKey: string, property: 'visible' | 'required', checked: boolean) => {
    const currentFieldConfig = config[fieldKey] || { visible: true, required: false };
    const newFieldConfig = { ...currentFieldConfig, [property]: checked };

    // If setting required to true, also set visible to true
    if (property === 'required' && checked) {
      newFieldConfig.visible = true;
    }
    // If setting visible to false, also set required to false and clear value template
    if (property === 'visible' && !checked) {
      newFieldConfig.required = false;
      newFieldConfig.valueTemplate = undefined;
    }

    onChange({ ...config, [fieldKey]: newFieldConfig });
  };

  const handleValueTemplateChange = (fieldKey: string, valueTemplate: string) => {
    const currentFieldConfig = config[fieldKey] || { visible: true, required: false };
    onChange({ ...config, [fieldKey]: { ...currentFieldConfig, valueTemplate: valueTemplate || undefined } });
  };

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="grid grid-cols-[1fr_80px_80px_1fr] gap-2 text-sm font-medium text-muted-foreground pb-2 border-b">
        <span>Field</span>
        <span className="text-center">Visible</span>
        <span className="text-center">Required</span>
        <span>Value Template</span>
      </div>
      <div className="max-h-[320px] overflow-y-auto space-y-1">
        {configurableFields.map(({ key, label }) => {
          const fieldConfig = config[key] || { visible: true, required: false };
          return (
            <div key={key} className="grid grid-cols-[1fr_80px_80px_1fr] gap-2 items-center py-1">
              <span className="text-sm">{label}</span>
              <div className="flex justify-center">
                <Checkbox
                  checked={fieldConfig.visible}
                  onCheckedChange={(checked) => handleToggle(key, 'visible', checked === true)}
                />
              </div>
              <div className="flex justify-center">
                <Checkbox
                  checked={fieldConfig.required}
                  onCheckedChange={(checked) => handleToggle(key, 'required', checked === true)}
                  disabled={!fieldConfig.visible}
                />
              </div>
              <div>
                {fieldConfig.visible ? (
                  <Input
                    value={fieldConfig.valueTemplate || ''}
                    onChange={(e) => handleValueTemplateChange(key, e.target.value)}
                    placeholder="{value}"
                    className="h-7 text-xs"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground pt-2 border-t">
        Unconfigured fields default to visible and not required. Value templates use {'{value}'} as placeholder for prefix/suffix patterns.
      </p>
    </div>
  );
}

interface GenericDataFormProps {
  readonly fields: DataFieldConfig[];
  readonly initialData?: Record<string, unknown>;
  readonly onChange: (data: Record<string, unknown>) => void;
  readonly isEditing?: boolean;
}

export function GenericDataForm({
  fields,
  initialData,
  onChange,
  isEditing = false,
}: GenericDataFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const isSsoUser = isEditing && !!initialData?.ssoProvider;

  // Filter fields based on create/edit mode
  const visibleFields = fields.filter((field) => {
    if (field.showOnlyForCreate && isEditing) return false;
    if (field.showOnlyForEdit && !isEditing) return false;
    return true;
  });

  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    fields.forEach((field) => {
      if (initialData && field.name in initialData) {
        initial[field.name] = initialData[field.name];
      } else if (field.type === 'multiselect') {
        // For multiselect, try to extract IDs from nested relation data
        // e.g., formatterIds from formatters: [{ formatter: { id } }]
        const relationName = field.name.replace(/Ids$/, 's'); // formatterIds -> formatters
        const relationData = initialData?.[relationName];
        if (Array.isArray(relationData)) {
          const singularName = relationName.replace(/s$/, ''); // formatters -> formatter
          initial[field.name] = relationData
            .map((item: Record<string, unknown>) => {
              // Handle nested relation structure: { formatter: { id } }
              const nested = item[singularName] as Record<string, unknown> | undefined;
              return nested?.id || item.id;
            })
            .filter(Boolean);
        } else {
          initial[field.name] = [];
        }
      } else if (field.type === 'boolean') {
        initial[field.name] = true;
      } else if (field.type === 'color') {
        initial[field.name] = '#3B82F6';
      } else if (field.type === 'custom') {
        initial[field.name] = initialData?.[field.name] ?? null;
      } else {
        initial[field.name] = '';
      }
    });
    // Add isActive for editing
    if (isEditing && initialData) {
      initial.isActive = initialData.isActive ?? true;
    }
    return initial;
  });

  useEffect(() => {
    onChange(formData);
  }, [formData, onChange]);

  const handleChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const renderField = (field: DataFieldConfig) => {
    const value = formData[field.name];

    switch (field.type) {
      case 'text':
        return (
          <Input
            id={field.name}
            value={(value as string) || ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.validation?.maxLength}
          />
        );

      case 'textarea':
        return (
          <Textarea
            id={field.name}
            value={(value as string) || ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.validation?.maxLength}
            rows={3}
          />
        );

      case 'color':
        return (
          <div className="flex items-center gap-3">
            <input
              type="color"
              id={field.name}
              value={(value as string) || '#3B82F6'}
              onChange={(e) => handleChange(field.name, e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border bg-transparent p-1"
            />
            <Input
              value={(value as string) || ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder="#000000"
              className="flex-1"
              maxLength={7}
            />
          </div>
        );

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={value as boolean}
              onCheckedChange={(checked) => handleChange(field.name, checked)}
            />
            <label
              htmlFor={field.name}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {field.label}
            </label>
          </div>
        );

      case 'multiselect':
        return (
          <MultiselectField
            field={field}
            value={(value as string[]) || []}
            onChange={(newValue) => handleChange(field.name, newValue)}
          />
        );

      case 'fieldConfig':
        return (
          <FieldConfigEditor
            field={field}
            value={(value as Record<string, { visible: boolean; required: boolean }>) || {}}
            onChange={(newValue) => handleChange(field.name, newValue)}
          />
        );

      case 'select':
        return (
          <SelectField
            field={field}
            value={(value as string) || ''}
            onChange={(newValue) => handleChange(field.name, newValue)}
          />
        );

      case 'password':
        return (
          <div className="relative">
            <Input
              id={field.name}
              type={showPassword ? 'text' : 'password'}
              value={(value as string) || ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.validation?.maxLength}
              minLength={field.validation?.minLength}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        );

      case 'custom':
        return field.render
          ? field.render({ values: formData, setValue: handleChange, isEditMode: isEditing })
          : null;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 pl-4">
      {visibleFields
        .filter((field) => !(isEditing && field.name === 'mustResetPassword'))
        .map((field) => (
        <div key={field.name} className="space-y-2">
          {field.type !== 'boolean' && field.type !== 'custom' && (
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
          )}
          {renderField(field)}
        </div>
      ))}

      {/* Change Password & Force Reset section for editing (only if there's a password field in config) */}
      {isEditing && fields.some((f) => f.type === 'password') && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-4">
            {!showChangePassword && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowChangePassword(true)}
                disabled={isSsoUser}
                title={isSsoUser ? 'Password cannot be changed for SSO users' : undefined}
              >
                Change Password
              </Button>
            )}
            {fields.some((f) => f.name === 'mustResetPassword') && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mustResetPassword"
                  checked={formData.mustResetPassword as boolean}
                  onCheckedChange={(checked) => handleChange('mustResetPassword', checked)}
                  disabled={isSsoUser}
                />
                <label
                  htmlFor="mustResetPassword"
                  className={cn(
                    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                    isSsoUser && "opacity-50 cursor-not-allowed"
                  )}
                >
                  Force Password Reset
                </label>
              </div>
            )}
          </div>
          {isSsoUser && (
            <p className="text-xs text-muted-foreground">
              Password management is disabled for SSO-authenticated users.
            </p>
          )}
          {showChangePassword && (
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={(formData.password as string) || ''}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  maxLength={128}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep current password.
              </p>
            </div>
          )}
        </div>
      )}

      {/* isActive toggle for editing */}
      {isEditing && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isActive"
              checked={formData.isActive as boolean}
              onCheckedChange={(checked) => handleChange('isActive', checked)}
            />
            <label
              htmlFor="isActive"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Active
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Inactive items will be hidden from selection lists but preserved in the system.
          </p>
        </div>
      )}
    </div>
  );
}
