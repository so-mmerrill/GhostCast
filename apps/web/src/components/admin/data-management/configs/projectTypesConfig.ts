import { ProjectType, FIELD_LABELS, ConfigurableRequestField } from '@ghostcast/shared';
import { DataEntityConfig } from './types';

// Convert FIELD_LABELS to array format for the form field
const CONFIGURABLE_FIELDS = (Object.entries(FIELD_LABELS) as [ConfigurableRequestField, string][]).map(
  ([key, label]) => ({ key, label })
);

export const projectTypesConfig: DataEntityConfig<ProjectType> = {
  entityType: 'projectType',
  displayName: 'Project Type',
  pluralName: 'Project Types',
  apiEndpoint: '/project-types',
  queryKey: 'project-types',
  columns: [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'abbreviation', header: 'Abbreviation' },
    { key: 'color', header: 'Color' },
    { key: 'description', header: 'Description' },
    {
      key: 'fieldConfig',
      header: 'Field Config',
      render: (item) => {
        if (!item.fieldConfig) return 'Default (all visible)';
        const config = item.fieldConfig as Record<string, { visible?: boolean; required?: boolean }>;
        const visibleCount = Object.values(config).filter((f) => f?.visible !== false).length;
        const requiredCount = Object.values(config).filter((f) => f?.required).length;
        return `${visibleCount} visible, ${requiredCount} required`;
      },
    },
    { key: 'isActive', header: 'Status' },
  ],
  formFields: [
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true,
      placeholder: 'Enter project type name',
      validation: { minLength: 1, maxLength: 100 },
    },
    {
      name: 'abbreviation',
      label: 'Abbreviation',
      type: 'text',
      required: false,
      placeholder: 'e.g., PT, GC, RT',
      validation: { maxLength: 10 },
    },
    {
      name: 'color',
      label: 'Color',
      type: 'color',
      required: false,
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      required: false,
      placeholder: 'Enter description',
      validation: { maxLength: 500 },
    },
    {
      name: 'fieldConfig',
      label: 'Request Form Field Configuration',
      type: 'fieldConfig',
      required: false,
      configurableFields: CONFIGURABLE_FIELDS,
    },
  ],
};
