import type { PassportVisaRiskLevel } from './passportVisaAdminTypes';

export type PassportVisaDetailInfoTrigger =
  | 'entry-residence'
  | 'travel-risk'
  | 'safety-precaution'
  | 'religious-law-restrictions';

export function getPassportVisaDetailInfoSpec(
  country: {
    entryResidence?: string;
    travelRiskSafety?: string;
    safetyPrecautions?: string;
    religiousLawRestrictions?: string;
  },
  trigger: PassportVisaDetailInfoTrigger,
) {
  if (trigger === 'entry-residence') {
    return {
      title: '入境居留',
      content: country.entryResidence?.trim() ?? '',
      emptyLabel: '暂无入境居留信息',
    };
  }

  if (trigger === 'travel-risk') {
    return {
      title: '旅行风险等级和安全提醒',
      content: country.travelRiskSafety?.trim() ?? '',
      emptyLabel: '暂无旅行风险等级和安全提醒',
    };
  }

  if (trigger === 'safety-precaution') {
    return {
      title: '安全防范',
      content: country.safetyPrecautions?.trim() ?? '',
      emptyLabel: '暂无安全防范信息',
    };
  }

  return {
    title: '教法约束',
    content: country.religiousLawRestrictions?.trim() ?? '',
    emptyLabel: '暂无教法约束信息',
  };
}

export function getPassportVisaRiskBadgeClassName(riskLevel: PassportVisaRiskLevel | '') {
  if (riskLevel === '中风险') return 'medium';
  if (riskLevel === '高风险') return 'high';
  if (riskLevel === '请勿前往') return 'blocked';
  return 'low';
}

export function shouldRenderPassportVisaRiskBadge(riskLevel: PassportVisaRiskLevel | '') {
  return riskLevel === '中风险' || riskLevel === '高风险' || riskLevel === '请勿前往';
}

export function shouldRenderPassportVisaReligiousLawBadge(content: string | null | undefined) {
  return Boolean(content?.trim());
}

export function getPassportVisaDetailBadgePanelLayout({
  drawerWidth,
  viewportWidth: _viewportWidth,
  sectionInset,
}: {
  drawerWidth: number;
  viewportWidth: number;
  sectionInset: number;
}) {
  return {
    width: Math.max(220, drawerWidth - (sectionInset * 2)),
    left: sectionInset,
  };
}

export function getPassportVisaDetailBadgePanelTop({
  firstSectionTop,
  drawerTop,
}: {
  firstSectionTop: number;
  drawerTop: number;
}) {
  return {
    top: Math.max(0, firstSectionTop - drawerTop),
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
}) {
  const mobile = viewportWidth <= 760;
  const horizontalInset = mobile ? 14 : sectionInset;
  const width = Math.max(220, drawerWidth - (horizontalInset * 2));
  const triggerCenter = triggerLeft + (triggerWidth / 2);
  const left = horizontalInset;
  const arrowLeft = Math.min(width - 18, Math.max(18, triggerCenter - left));

  return { width, left, arrowLeft };
}

export function getPassportVisaDetailIconPanelTop({
  triggerBottom,
  drawerTop,
}: {
  triggerBottom: number;
  drawerTop: number;
}) {
  return {
    top: Math.max(92, triggerBottom - drawerTop + 12),
  };
}

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
  const availableHeight = Math.max(0, drawerHeight - panelTop - bottomInset);
  if (kind === 'badge') {
    return Math.min(196, availableHeight);
  }

  const mobileCap = viewportWidth <= 760 ? 260 : 360;
  return Math.min(mobileCap, availableHeight);
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
