import { GenericDataTable } from './data-management/GenericDataTable';
import { usersConfig } from './data-management/configs';
import { User } from '@ghostcast/shared';

export function UserManagementTab() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <GenericDataTable<User> config={usersConfig} />
    </div>
  );
}
