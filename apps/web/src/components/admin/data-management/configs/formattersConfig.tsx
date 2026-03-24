import { Formatter } from '@ghostcast/shared';
import { DataEntityConfig } from './types';

export const formattersConfig: DataEntityConfig<Formatter> = {
  entityType: 'formatter',
  displayName: 'Formatter',
  pluralName: 'Formatters',
  apiEndpoint: '/formatters',
  queryKey: 'formatters',
  columns: [
    { key: 'name', header: 'Name', sortable: true },
    {
      key: 'preview',
      header: 'Preview',
      render: (item) => {
        const prefix = item.prefix ? `${item.prefix} ` : '';
        const suffix = item.suffix ? ` ${item.suffix}` : '';
        const text = `${prefix}Sample${suffix}`;
        return (
          <span className={item.isBold ? 'font-bold' : 'font-normal'}>
            {text}
          </span>
        );
      },
    },
    {
      key: 'projectRoles',
      header: 'Project Roles',
      render: (item) => {
        const names = item.projectRoles
          ?.map((fpr) => fpr.projectRole?.name)
          .filter(Boolean);
        return names?.length ? names.join(', ') : '-';
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
      placeholder: 'Enter formatter name (e.g., Lead, Travel)',
      validation: { minLength: 1, maxLength: 100 },
    },
    {
      name: 'isBold',
      label: 'Bold Text',
      type: 'boolean',
      required: false,
    },
    {
      name: 'prefix',
      label: 'Prefix',
      type: 'text',
      required: false,
      placeholder: 'e.g., -',
      validation: { maxLength: 50 },
    },
    {
      name: 'suffix',
      label: 'Suffix',
      type: 'text',
      required: false,
      placeholder: 'e.g., *',
      validation: { maxLength: 50 },
    },
    {
      name: 'projectRoleIds',
      label: 'Associated Project Roles',
      type: 'multiselect',
      required: false,
      optionsEndpoint: '/project-roles',
      optionsQueryKey: 'project-roles',
      optionLabelKey: 'name',
      optionValueKey: 'id',
    },
  ],
};
