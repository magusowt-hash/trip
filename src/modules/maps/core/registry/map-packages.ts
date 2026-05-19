import type { MapPackage } from '../contracts/map-package';
import { railMapPackage } from '../../packages/rail-map';
import { standardMapPackage } from '../../packages/standard-map';

export const mapPackages: MapPackage[] = [
  standardMapPackage,
  railMapPackage,
];

