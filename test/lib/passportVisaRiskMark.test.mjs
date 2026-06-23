import test from 'node:test';
import assert from 'node:assert/strict';

import { getPassportVisaRiskMarkSpec } from './passportVisaRiskMark.ts';

test('maps low risk to shield-check mark', () => {
  assert.deepEqual(getPassportVisaRiskMarkSpec('低风险'), {
    kind: 'shield-check',
    color: '#1F9D55',
    title: '低风险',
  });
});

test('maps medium and high risk to warning marks with different colors', () => {
  assert.deepEqual(getPassportVisaRiskMarkSpec('中风险'), {
    kind: 'warning',
    color: '#FFD400',
    title: '中风险',
  });
  assert.deepEqual(getPassportVisaRiskMarkSpec('高风险'), {
    kind: 'warning',
    color: '#FF3B30',
    title: '高风险',
  });
});

test('maps do-not-travel to prohibited mark', () => {
  assert.deepEqual(getPassportVisaRiskMarkSpec('请勿前往'), {
    kind: 'prohibited',
    color: '#C53E3E',
    title: '请勿前往',
  });
});
