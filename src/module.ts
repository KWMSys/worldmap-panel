import { loadPluginCss } from 'grafana/app/plugins/sdk';
import WorldmapCtrl from './worldmap_ctrl';

loadPluginCss({
  // Todo: Remove ultimate
  dark: 'plugins/grafana-worldmap-panel-ultimate/css/worldmap.dark.css',
  light: 'plugins/grafana-worldmap-panel-ultimate/css/worldmap.light.css',
});

export { WorldmapCtrl as PanelCtrl };
