import { mapPackages } from './map-packages';

export function getMapPackage(slug: string) {
  return mapPackages.find((item) => item.slug === slug);
}

