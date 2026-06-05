export type { MapPackage, MapPackageSlug } from './core/contracts/map-package';
export { getMapPackage } from './core/registry/get-map-package';
export { mapPackages } from './core/registry/map-packages';
export { buildMapPackageRuntimeList, pickInitialActiveMapSlug } from './core/map-package-runtime';
export { chinaNatureMapPackage } from './packages/china-nature-map';
export { standardMapPackage } from './packages/standard-map';
export { railMapPackage } from './packages/rail-map';
export { ChinaNatureMapRightPanel } from './packages/china-nature-map/frontend';
export {
  StandardMapRightPanel,
  type StandardMapSearchResult,
  useStandardMapPanelController,
} from './packages/standard-map/frontend';
export { RailMapRightPanel, useRailMapPanelController } from './packages/rail-map/frontend';
