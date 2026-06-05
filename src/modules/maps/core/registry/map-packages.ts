import type { MapPackage } from '../contracts/map-package';
import { chinaNatureMapPackage } from '../../packages/china-nature-map';
import { railMapPackage } from '../../packages/rail-map';
import { standardMapPackage } from '../../packages/standard-map';

export const mapPackages: MapPackage[] = [
  standardMapPackage,
  railMapPackage,
  chinaNatureMapPackage,
];
