import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPassportVisaMapPathPresentation } from './passportVisaMapColoring.ts';

test('applies theme no-data fill when country is missing or hidden', () => {
  const hiddenPath = {
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
  };

  hiddenPath.setAttribute('data-country-code', 'MX');

  applyPassportVisaMapPathPresentation(hiddenPath, {
    country: null,
    isVisible: false,
    noDataColor: '#f0f0f0',
    groupColor: () => '#000000',
  });

  assert.equal(hiddenPath.attributes.get('fill'), '#f0f0f0');
  assert.equal(hiddenPath.attributes.has('data-country-code'), false);
});

test('applies scenario-driven group color when country is visible', () => {
  const visiblePath = {
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
  };

  applyPassportVisaMapPathPresentation(visiblePath, {
    country: { mapCountryCode: 'MX', displayGroup: 'visa-free' },
    isVisible: true,
    noDataColor: '#f0f0f0',
    groupColor: (group) => (group === 'visa-free' ? '#d4a52a' : '#8b5e3c'),
  });

  assert.equal(visiblePath.attributes.get('fill'), '#d4a52a');
  assert.equal(visiblePath.attributes.get('data-country-code'), 'MX');
});

test('applies page presentation fill and emphasis without clearing interaction code', () => {
  const pagePath = {
    attributes: new Map([['data-country-code', 'MX']]),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
  };

  applyPassportVisaMapPathPresentation(pagePath, {
    baseFill: '#8b5e3c',
    isActive: true,
    isFaded: false,
  });

  assert.equal(pagePath.attributes.get('fill'), '#8b5e3c');
  assert.equal(pagePath.attributes.get('opacity'), '1');
  assert.equal(pagePath.attributes.get('stroke-width'), '1.5');
  assert.equal(pagePath.attributes.get('data-country-code'), 'MX');
});
