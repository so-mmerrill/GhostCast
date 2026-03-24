import { Skill } from '@ghostcast/shared';
import { DataEntityConfig } from './types';

export const skillsConfig: DataEntityConfig<Skill> = {
  entityType: 'skill',
  displayName: 'Skill',
  pluralName: 'Skills',
  apiEndpoint: '/skills',
  queryKey: 'skills',
  pageSize: 10,
  columns: [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'category', header: 'Category', sortable: true },
    { key: 'description', header: 'Description' },
    { key: 'isActive', header: 'Status' },
  ],
  formFields: [
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true,
      placeholder: 'Enter skill name',
      validation: { minLength: 1, maxLength: 100 },
    },
    {
      name: 'category',
      label: 'Category',
      type: 'text',
      required: false,
      placeholder: 'Enter category',
      validation: { maxLength: 100 },
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      required: false,
      placeholder: 'Enter description',
      validation: { maxLength: 500 },
    },
  ],
};
