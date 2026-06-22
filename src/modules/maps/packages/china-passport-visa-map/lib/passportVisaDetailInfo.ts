import type { PassportVisaCountryRecord, PassportVisaRiskLevel } from './passportVisaAdminTypes.ts';

export type PassportVisaDetailInfoTrigger =
  | 'entry-residence'
  | 'travel-risk'
  | 'safety-precaution'
  | 'religious-law-restrictions';

export type PassportVisaDetailInfoSpec = {
  title: string;
  content: string;
  emptyLabel: string;
};

export type PassportVisaDetailPanelLayout = {
  width: number;
  left: number;
};

export type PassportVisaDetailIconPanelLayout = {
  width: number;
  left: number;
  arrowLeft: number;
};

export type PassportVisaDetailPanelTop = {
  top: number;
};

export function getPassportVisaDetailPreviewMaxHeight({
  kind,
  drawerHeight,
  panelTop,
  viewportWidth,
  bottomInset,
}: {
  kind: 'badge' | 'icon';
  drawerHeight: number;
  panelTop: number;
  viewportWidth: number;
  bottomInset: number;
}) {
  const mobile = viewportWidth <= 760;
  const availableHeight = Math.max(0, drawerHeight - panelTop - bottomInset);
  const preferredMaxHeight = kind === 'icon'
    ? (mobile ? 320 : 360)
    : (mobile ? 180 : 196);

  return Math.min(preferredMaxHeight, availableHeight);
}

export function getPassportVisaDetailExpandedMaxHeight({
  drawerHeight,
  panelTop,
  bottomInset,
}: {
  drawerHeight: number;
  panelTop: number;
  bottomInset: number;
}) {
  return Math.max(0, drawerHeight - panelTop - bottomInset);
}

type PassportVisaDetailInfoCountry = Pick<
  PassportVisaCountryRecord,
  'entryResidence' | 'travelRiskSafety' | 'safetyPrecautions' | 'religiousLawRestrictions'
>;

export function getPassportVisaDetailInfoSpec(
  country: PassportVisaDetailInfoCountry,
  trigger: PassportVisaDetailInfoTrigger,
): PassportVisaDetailInfoSpec {
  if (trigger === 'entry-residence') {
    return {
      title: '入境居留',
      content: country.entryResidence.trim(),
      emptyLabel: '暂无入境居留信息',
    };
  }

  if (trigger === 'travel-risk') {
    return {
      title: '旅行风险等级和安全提醒',
      content: country.travelRiskSafety.trim(),
      emptyLabel: '暂无旅行风险等级和安全提醒',
    };
  }

  if (trigger === 'religious-law-restrictions') {
    return {
      title: '教法约束',
      content: country.religiousLawRestrictions.trim(),
      emptyLabel: '暂无教法约束信息',
    };
  }

  return {
    title: '安全防范',
    content: country.safetyPrecautions.trim(),
    emptyLabel: '暂无安全防范信息',
  };
}

export function getPassportVisaRiskBadgeClassName(riskLevel: PassportVisaRiskLevel) {
  if (riskLevel === '低风险') return 'low';
  if (riskLevel === '中风险') return 'medium';
  if (riskLevel === '高风险') return 'high';
  return 'blocked';
}

export function shouldRenderPassportVisaRiskBadge(riskLevel: PassportVisaRiskLevel | '') {
  return riskLevel.trim().length > 0 && riskLevel !== '低风险';
}

export function shouldRenderPassportVisaReligiousLawBadge(religiousLawRestrictions: string) {
  return religiousLawRestrictions.trim().length > 0;
}

export function getPassportVisaDetailBadgePanelLayout({
  drawerWidth,
  viewportWidth,
  sectionInset,
}: {
  drawerWidth: number;
  viewportWidth: number;
  sectionInset: number;
}): PassportVisaDetailPanelLayout {
  const mobile = viewportWidth <= 760;
  const horizontalInset = mobile ? 14 : sectionInset;
  const width = Math.max(220, drawerWidth - (horizontalInset * 2));
  return {
    width,
    left: horizontalInset,
  };
}

export function getPassportVisaDetailIconPanelLayout({
  triggerLeft,
  triggerWidth,
  drawerWidth,
  viewportWidth,
  sectionInset,
}: {
  triggerLeft: number;
  triggerWidth: number;
  drawerWidth: number;
  viewportWidth: number;
  sectionInset: number;
}): PassportVisaDetailIconPanelLayout {
  const mobile = viewportWidth <= 760;
  const horizontalInset = mobile ? 14 : sectionInset;
  const width = Math.max(220, drawerWidth - (horizontalInset * 2));
  const triggerCenter = triggerLeft + (triggerWidth / 2);
  const left = horizontalInset;
  const arrowLeft = Math.min(width - 18, Math.max(18, triggerCenter - left));

  return { width, left, arrowLeft };
}

export function getPassportVisaDetailBadgePanelTop({
  firstSectionTop,
  drawerTop,
}: {
  firstSectionTop: number;
  drawerTop: number;
}): PassportVisaDetailPanelTop {
  return {
    top: Math.max(0, firstSectionTop - drawerTop),
  };
}

export function getPassportVisaDetailIconPanelTop({
  triggerBottom,
  drawerTop,
}: {
  triggerBottom: number;
  drawerTop: number;
}): PassportVisaDetailPanelTop {
  return {
    top: Math.max(92, triggerBottom - drawerTop + 12),
  };
}
