import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRenderPassportVisaDrawerBackdrop } from './passportVisaDrawerInteraction.ts';

test('does not render drawer backdrop when drawer is open', () => {
  assert.equal(
    shouldRenderPassportVisaDrawerBackdrop({
      isDrawerOpen: true,
      hasSelectedCountry: true,
    }),
    false,
  );
});
