import { ReactNode } from 'react';

export interface DataColumnConfig<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  width?: string;
}

export interface CustomFieldRenderArgs {
  values: Record<string, unknown>;
  setValue: (name: string, value: unknown) => void;
  isEditMode: boolean;
}

export interface DataFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'color' | 'select' | 'boolean' | 'multiselect' | 'fieldConfig' | 'password' | 'custom';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  // For select and multiselect - endpoint to fetch options dynamically
  optionsEndpoint?: string;
  optionsQueryKey?: string;
  optionLabelKey?: string;
  optionValueKey?: string;
  // For fieldConfig - list of configurable fields
  configurableFields?: { key: string; label: string }[];
  // For 'custom' type — caller renders the input
  render?: (args: CustomFieldRenderArgs) => ReactNode;
  // Conditional display based on create/edit mode
  showOnlyForCreate?: boolean;
  showOnlyForEdit?: boolean;
}

export interface DataEntityConfig<T> {
  entityType: string;
  displayName: string;
  pluralName: string;
  apiEndpoint: string;
  queryKey: string;
  columns: DataColumnConfig<T>[];
  formFields: DataFieldConfig[];
  pageSize?: number;
}
