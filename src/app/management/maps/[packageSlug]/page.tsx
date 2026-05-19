import { notFound } from 'next/navigation';
import { getMapPackage } from '@/modules/maps';

type Props = {
  params: {
    packageSlug: string;
  };
};

export default async function MapPackageManagementPage({ params }: Props) {
  const { packageSlug } = params;
  const mapPackage = getMapPackage(packageSlug);

  if (!mapPackage || !mapPackage.admin.enabled) {
    notFound();
  }

  const AdminPage = mapPackage.admin.page;
  return <AdminPage />;
}
