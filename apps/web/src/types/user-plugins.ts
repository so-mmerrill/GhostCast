import { CatalogItem } from '@ghostcast/shared';

export interface UserPluginStatus {
  catalogId: string;
  pluginId: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  catalogItem: CatalogItem;
}
