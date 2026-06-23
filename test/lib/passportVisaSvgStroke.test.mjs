import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPassportVisaNonScalingStroke } from './passportVisaSvgStroke.ts';

function createFakeElement() {
  const attributes = new Map();

  return {
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
  };
}

test('applies a non-scaling stroke so borders stay visually thinner while zooming', () => {
  const element = createFakeElement();

  applyPassportVisaNonScalingStroke(element, '0.9');

  assert.equal(element.getAttribute('stroke-width'), '0.9');
  assert.equal(element.getAttribute('vector-effect'), 'non-scaling-stroke');
});
