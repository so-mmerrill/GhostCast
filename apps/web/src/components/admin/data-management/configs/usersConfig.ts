import { User } from '@ghostcast/shared';
import { DataEntityConfig } from './types';

export const usersConfig: DataEntityConfig<User> = {
  entityType: 'user',
  displayName: 'User',
  pluralName: 'Users',
  apiEndpoint: '/users',
  queryKey: 'users',
  pageSize: 20,
  columns: [
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'name',
      header: 'Name',
      render: (item) => `${item.firstName} ${item.lastName}`,
    },
    {
      key: 'role',
      header: 'Role',
      render: (item) => {
        const roleLabels: Record<string, string> = {
          ADMIN: 'Admin',
          MANAGER: 'Manager',
          SCHEDULER: 'Scheduler',
          REQUESTER: 'Requester',
          MEMBER: 'Member',
          UNASSIGNED: 'Unassigned',
        };
        return roleLabels[item.role] || item.role;
      },
    },
    {
      key: 'ssoProvider',
      header: 'Auth',
      render: (item) => (item.ssoProvider ? `SSO (${item.ssoProvider})` : 'Password'),
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      render: (item) =>
        item.lastLogin
          ? new Date(item.lastLogin).toLocaleDateString()
          : 'Never',
    },
    {
      key: 'lastPasswordChange',
      header: 'Password Changed',
      render: (item) =>
        item.lastPasswordChange
          ? new Date(item.lastPasswordChange).toLocaleDateString()
          : 'Never',
    },
    { key: 'isActive', header: 'Status' },
  ],
  formFields: [
    {
      name: 'email',
      label: 'Email',
      type: 'text',
      required: true,
      placeholder: 'user@example.com',
      validation: { maxLength: 255 },
    },
    {
      name: 'firstName',
      label: 'First Name',
      type: 'text',
      required: true,
      placeholder: 'Enter first name',
      validation: { minLength: 1, maxLength: 100 },
    },
    {
      name: 'lastName',
      label: 'Last Name',
      type: 'text',
      required: true,
      placeholder: 'Enter last name',
      validation: { minLength: 1, maxLength: 100 },
    },
    {
      name: 'role',
      label: 'Role',
      type: 'select',
      required: true,
      options: [
        { value: 'UNASSIGNED', label: 'Unassigned' },
        { value: 'MEMBER', label: 'Member' },
        { value: 'REQUESTER', label: 'Requester' },
        { value: 'SCHEDULER', label: 'Scheduler' },
        { value: 'MANAGER', label: 'Manager' },
        { value: 'ADMIN', label: 'Admin' },
      ],
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: false,
      placeholder: 'Minimum 8 characters',
      validation: { minLength: 8, maxLength: 128 },
      showOnlyForCreate: true,
    },
    {
      name: 'mustResetPassword',
      label: 'Force Password Reset',
      type: 'boolean',
      required: false,
    },
  ],
};
