import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPassportVisaDetailBadgePanelLayout,
  getPassportVisaDetailBadgePanelTop,
  getPassportVisaDetailExpandedMaxHeight,
  getPassportVisaDetailIconPanelLayout,
  getPassportVisaDetailIconPanelTop,
  getPassportVisaDetailInfoSpec,
  getPassportVisaDetailPreviewMaxHeight,
  shouldRenderPassportVisaReligiousLawBadge,
  getPassportVisaRiskBadgeClassName,
  shouldRenderPassportVisaRiskBadge,
} from './passportVisaDetailInfo.ts';

const country = {
  entryResidence: '入境居留内容',
  travelRiskSafety: '旅行风险等级与安全提醒内容',
  safetyPrecautions: '安全防范内容',
  religiousLawRestrictions: '教法约束内容',
};

test('maps visa badge to entry residence content', () => {
  assert.deepEqual(getPassportVisaDetailInfoSpec(country, 'entry-residence'), {
    title: '入境居留',
    content: '入境居留内容',
    emptyLabel: '暂无入境居留信息',
  });
});

test('maps risk badge to travel risk and safety reminder content', () => {
  assert.deepEqual(getPassportVisaDetailInfoSpec(country, 'travel-risk'), {
    title: '旅行风险等级和安全提醒',
    content: '旅行风险等级与安全提醒内容',
    emptyLabel: '暂无旅行风险等级和安全提醒',
  });
});

test('maps risk icon to safety precaution content', () => {
  assert.deepEqual(getPassportVisaDetailInfoSpec(country, 'safety-precaution'), {
    title: '安全防范',
    content: '安全防范内容',
    emptyLabel: '暂无安全防范信息',
  });
});

test('maps religious-law badge to restriction content', () => {
  assert.deepEqual(getPassportVisaDetailInfoSpec(country, 'religious-law-restrictions'), {
    title: '教法约束',
    content: '教法约束内容',
    emptyLabel: '暂无教法约束信息',
  });
});

test('trims content and preserves empty values for fallback rendering', () => {
  assert.deepEqual(
    getPassportVisaDetailInfoSpec(
      {
        entryResidence: '  \n',
        travelRiskSafety: '  风险提醒  ',
        safetyPrecautions: '',
      },
      'travel-risk',
    ),
    {
      title: '旅行风险等级和安全提醒',
      content: '风险提醒',
      emptyLabel: '暂无旅行风险等级和安全提醒',
    },
  );
});

test('maps risk level to badge tone class key', () => {
  assert.equal(getPassportVisaRiskBadgeClassName('低风险'), 'low');
  assert.equal(getPassportVisaRiskBadgeClassName('中风险'), 'medium');
  assert.equal(getPassportVisaRiskBadgeClassName('高风险'), 'high');
  assert.equal(getPassportVisaRiskBadgeClassName('请勿前往'), 'blocked');
});

test('hides low risk badge and shows elevated risk badges', () => {
  assert.equal(shouldRenderPassportVisaRiskBadge('低风险'), false);
  assert.equal(shouldRenderPassportVisaRiskBadge('中风险'), true);
  assert.equal(shouldRenderPassportVisaRiskBadge('高风险'), true);
  assert.equal(shouldRenderPassportVisaRiskBadge('请勿前往'), true);
  assert.equal(shouldRenderPassportVisaRiskBadge(''), false);
});

test('shows religious-law badge only when the field has content', () => {
  assert.equal(shouldRenderPassportVisaReligiousLawBadge('教法约束内容'), true);
  assert.equal(shouldRenderPassportVisaReligiousLawBadge('  \n  '), false);
  assert.equal(shouldRenderPassportVisaReligiousLawBadge(''), false);
});

test('computes fixed badge detail panel layout aligned with info cards', () => {
  assert.deepEqual(
    getPassportVisaDetailBadgePanelLayout({
      drawerWidth: 420,
      viewportWidth: 1280,
      sectionInset: 18,
    }),
    {
      width: 384,
      left: 18,
    },
  );
});

test('computes badge detail panel top directly from first info card top', () => {
  assert.deepEqual(
    getPassportVisaDetailBadgePanelTop({
      firstSectionTop: 332,
      drawerTop: 20,
    }),
    {
      top: 312,
    },
  );
});

test('computes icon detail panel layout next to icon trigger', () => {
  assert.deepEqual(
    getPassportVisaDetailIconPanelLayout({
      triggerLeft: 330,
      triggerWidth: 80,
      drawerWidth: 420,
      viewportWidth: 1280,
      sectionInset: 18,
    }),
    {
      width: 384,
      left: 18,
      arrowLeft: 352,
    },
  );

  assert.deepEqual(
    getPassportVisaDetailIconPanelLayout({
      triggerLeft: 20,
      triggerWidth: 80,
      drawerWidth: 420,
      viewportWidth: 1280,
      sectionInset: 18,
    }),
    {
      width: 384,
      left: 18,
      arrowLeft: 42,
    },
  );
});

test('computes icon detail panel top from icon trigger bottom', () => {
  assert.deepEqual(
    getPassportVisaDetailIconPanelTop({
      triggerBottom: 116,
      drawerTop: 20,
    }),
    {
      top: 108,
    },
  );
});

test('preview and expanded panels can reuse the same layout contract', () => {
  const layout = getPassportVisaDetailBadgePanelLayout({
    drawerWidth: 420,
    viewportWidth: 1280,
    sectionInset: 18,
  });
  const top = getPassportVisaDetailBadgePanelTop({
    firstSectionTop: 332,
    drawerTop: 20,
  });

  assert.deepEqual(
    {
      ...layout,
      ...top,
    },
    {
      width: 384,
      left: 18,
      top: 312,
    },
  );
});

test('caps badge preview height lower than icon preview and keeps both inside drawer bounds', () => {
  assert.equal(
    getPassportVisaDetailPreviewMaxHeight({
      kind: 'badge',
      drawerHeight: 720,
      panelTop: 312,
      viewportWidth: 1280,
      bottomInset: 10,
    }),
    196,
  );

  assert.equal(
    getPassportVisaDetailPreviewMaxHeight({
      kind: 'icon',
      drawerHeight: 720,
      panelTop: 108,
      viewportWidth: 1280,
      bottomInset: 10,
    }),
    360,
  );

  assert.equal(
    getPassportVisaDetailPreviewMaxHeight({
      kind: 'icon',
      drawerHeight: 420,
      panelTop: 220,
      viewportWidth: 1280,
      bottomInset: 10,
    }),
    190,
  );
});

test('caps expanded panel height to drawer interior bottom edge', () => {
  assert.equal(
    getPassportVisaDetailExpandedMaxHeight({
      drawerHeight: 720,
      panelTop: 312,
      bottomInset: 10,
    }),
    398,
  );

  assert.equal(
    getPassportVisaDetailExpandedMaxHeight({
      drawerHeight: 420,
      panelTop: 330,
      bottomInset: 10,
    }),
    80,
  );
});
