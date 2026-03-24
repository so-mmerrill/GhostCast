import { ProjectRole } from '@ghostcast/shared';
import { DataEntityConfig } from './types';

// Extended type with simplified formatters relation from API
interface ProjectRoleWithFormatters extends Omit<ProjectRole, 'formatters'> {
  formatters?: Array<{
    formatter?: {
      id: string;
      name: string;
    };
  }>;
}

export const projectRolesConfig: DataEntityConfig<ProjectRoleWithFormatters> = {
  entityType: 'projectRole',
  displayName: 'Project Role',
  pluralName: 'Project Roles',
  apiEndpoint: '/project-roles',
  queryKey: 'project-roles',
  columns: [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'color', header: 'Color' },
    {
      key: 'formatters',
      header: 'Formatters',
      render: (item) => {
        const names = item.formatters
          ?.map((f) => f.formatter?.name)
          .filter(Boolean);
        return names?.length ? names.join(', ') : '-';
      },
    },
    { key: 'description', header: 'Description' },
    { key: 'isActive', header: 'Status' },
  ],
  formFields: [
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true,
      placeholder: 'Enter project role name',
      validation: { minLength: 1, maxLength: 100 },
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
      name: 'formatterIds',
      label: 'Associated Formatters',
      type: 'multiselect',
      required: false,
      optionsEndpoint: '/formatters',
      optionsQueryKey: 'formatters',
      optionLabelKey: 'name',
      optionValueKey: 'id',
    },
  ],
};
