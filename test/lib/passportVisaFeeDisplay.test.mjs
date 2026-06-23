import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePassportVisaFeeDisplay,
  parsePassportVisaStayDurationDisplay,
} from './passportVisaFeeDisplay.ts';

test('parsePassportVisaFeeDisplay accepts symbol plus number values', () => {
  assert.deepEqual(parsePassportVisaFeeDisplay('€90'), {
    amount: '90',
    currencySymbol: '€',
  });
  assert.deepEqual(parsePassportVisaFeeDisplay('$25'), {
    amount: '25',
    currencySymbol: '$',
  });
  assert.deepEqual(parsePassportVisaFeeDisplay('¥240'), {
    amount: '240',
    currencySymbol: '¥',
  });
});

test('parsePassportVisaFeeDisplay accepts plain numeric values', () => {
  assert.deepEqual(parsePassportVisaFeeDisplay('0'), {
    amount: '0',
    currencySymbol: '',
  });
  assert.deepEqual(parsePassportVisaFeeDisplay('300'), {
    amount: '300',
    currencySymbol: '',
  });
});

test('parsePassportVisaFeeDisplay rejects unsupported formats', () => {
  assert.equal(parsePassportVisaFeeDisplay('需咨询使领馆'), null);
  assert.equal(parsePassportVisaFeeDisplay('300 BWP（博茨瓦纳普拉）'), null);
  assert.equal(parsePassportVisaFeeDisplay('申根签 €60'), null);
  assert.equal(parsePassportVisaFeeDisplay(''), null);
});

test('parsePassportVisaStayDurationDisplay extracts leading days and trailing note', () => {
  assert.deepEqual(parsePassportVisaStayDurationDisplay('15天，普通签90天'), {
    days: '15',
    note: '普通签90天',
  });
  assert.deepEqual(parsePassportVisaStayDurationDisplay('30天,可延期'), {
    days: '30',
    note: '可延期',
  });
});

test('parsePassportVisaStayDurationDisplay rejects unsupported formats', () => {
  assert.equal(parsePassportVisaStayDurationDisplay('普通签90天'), null);
  assert.equal(parsePassportVisaStayDurationDisplay('15日，普通签90天'), null);
  assert.equal(parsePassportVisaStayDurationDisplay(''), null);
});
