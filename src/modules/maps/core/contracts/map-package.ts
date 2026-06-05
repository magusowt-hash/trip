import type { ComponentType } from 'react';

export type MapPackageSlug = string;

export type MapPackage = {
  slug: MapPackageSlug;
  packageName: string;
  name: string;
  description: string;
  admin: {
    enabled: boolean;
    entryPath: string;
    page: () => JSX.Element;
  };
  frontend?: {
    rightPanel: ComponentType<any>;
  };
};

export type MapPackageRecord = {
  slug: string;
  name: string;
  description: string;
  isEnabled: number | boolean;
  sortOrder: number;
};
