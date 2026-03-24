// Plugin UI Manager - handles dynamic registration based on enabled plugins
export { PluginUIManager } from './PluginUIManager';

// Plugin panel registry - for registering panel components
export {
  registerPluginPanel,
  unregisterPluginPanel,
  getPluginPanelRegistration,
  hasPluginPanel,
} from './plugin-panel-registry';
