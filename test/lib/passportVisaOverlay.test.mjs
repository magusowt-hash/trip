import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PASSPORT_VISA_OVERLAY_ATTR,
  PASSPORT_VISA_OVERLAY_FADE_DURATION_MS,
  PASSPORT_VISA_OVERLAY_HOLD_DURATION_MS,
  getPassportVisaDesiredOverlayStates,
  getPassportVisaOverlayPresentationStyle,
  getPassportVisaOverlaySelector,
  getPassportVisaOverlayTransitionPlan,
  getPassportVisaRenderedOverlayStates,
  getPassportVisaSuppressedHoverCodeOnActivate,
  getPassportVisaVisibleHoverCode,
  setPassportVisaOverlayCode,
} from './passportVisaOverlay.ts';

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

test('overlay selector targets the dedicated overlay attribute', () => {
  assert.equal(PASSPORT_VISA_OVERLAY_ATTR, 'data-overlay-code');
  assert.equal(getPassportVisaOverlaySelector(), '[data-overlay-code]');
});

test('overlay code is stored on the dedicated overlay attribute', () => {
  const element = createFakeElement();

  setPassportVisaOverlayCode(element, 'FR');

  assert.equal(element.getAttribute('data-overlay-code'), 'FR');
  assert.equal(element.getAttribute('data-country-code'), null);
});

test('visible overlay uses instant transition and full opacity', () => {
  assert.deepEqual(
    getPassportVisaOverlayPresentationStyle('visible'),
    {
      opacity: '1',
      transition: 'opacity 0ms linear',
    },
  );
});

test('fading overlay uses fade transition and target opacity zero', () => {
  assert.deepEqual(
    getPassportVisaOverlayPresentationStyle('fading'),
    {
      opacity: '0',
      transition: `opacity ${PASSPORT_VISA_OVERLAY_FADE_DURATION_MS}ms ease-out`,
    },
  );
});

test('visible to fading transition is split to trigger browser fade', () => {
  assert.deepEqual(
    getPassportVisaOverlayTransitionPlan('visible', 'fading'),
    {
      immediate: 'visible',
      deferred: 'fading',
    },
  );
});

test('other overlay transitions apply immediately', () => {
  assert.deepEqual(
    getPassportVisaOverlayTransitionPlan('hidden', 'visible'),
    {
      immediate: 'visible',
      deferred: null,
    },
  );
});

test('hidden overlay uses instant transition and zero opacity', () => {
  assert.deepEqual(
    getPassportVisaOverlayPresentationStyle('hidden'),
    {
      opacity: '0',
      transition: 'opacity 0ms linear',
    },
  );
});

test('desired overlay states show hover when nothing is flashing', () => {
  assert.deepEqual(
    getPassportVisaDesiredOverlayStates('JP', null, null),
    [{ code: 'JP', state: 'visible' }],
  );
});

test('desired overlay states let click animation inherit same-country hover without visible change', () => {
  assert.deepEqual(
    getPassportVisaDesiredOverlayStates('JP', 'JP', 'visible'),
    [{ code: 'JP', state: 'visible' }],
  );
});

test('activating the currently hovered country suppresses hover for the animation window', () => {
  assert.equal(getPassportVisaSuppressedHoverCodeOnActivate('JP', 'JP'), 'JP');
  assert.equal(getPassportVisaSuppressedHoverCodeOnActivate('KR', 'JP'), null);
});

test('visible hover is suppressed only while pointer remains on the suppressed country', () => {
  assert.equal(getPassportVisaVisibleHoverCode('JP', 'JP'), null);
  assert.equal(getPassportVisaVisibleHoverCode('KR', 'JP'), 'KR');
  assert.equal(getPassportVisaVisibleHoverCode(null, 'JP'), null);
});

test('desired overlay states keep fade state for same country', () => {
  assert.deepEqual(
    getPassportVisaDesiredOverlayStates('JP', 'JP', 'fading'),
    [{ code: 'JP', state: 'fading' }],
  );
});

test('desired overlay states can show another hovered country while previous one fades', () => {
  assert.deepEqual(
    getPassportVisaDesiredOverlayStates('KR', 'JP', 'fading'),
    [
      { code: 'KR', state: 'visible' },
      { code: 'JP', state: 'fading' },
    ],
  );
});

test('rendered overlay states keep clicked country visible when same-country hover is suppressed', () => {
  assert.deepEqual(
    getPassportVisaRenderedOverlayStates('JP', 'JP', 'JP', 'visible'),
    [{ code: 'JP', state: 'visible' }],
  );
});

test('rendered overlay states keep clicked country fading while another hover is visible', () => {
  assert.deepEqual(
    getPassportVisaRenderedOverlayStates('KR', 'JP', 'JP', 'fading'),
    [
      { code: 'KR', state: 'visible' },
      { code: 'JP', state: 'fading' },
    ],
  );
});

test('rendered overlay states fade previous hovered country immediately after pointer leaves', () => {
  assert.deepEqual(
    getPassportVisaRenderedOverlayStates(null, null, 'JP', 'fading'),
    [{ code: 'JP', state: 'fading' }],
  );
});

test('runtime rendered overlay states return a map keyed by country code', () => {
  const renderedStates = getPassportVisaRenderedOverlayStates({
    currentCode: 'JP',
    currentState: 'visible',
    hoveredCode: 'KR',
    suppressedHoverCode: null,
    previousStates: new Map([['JP', 'visible']]),
  });

  assert.equal(renderedStates instanceof Map, true);
  assert.equal(renderedStates.get('KR'), 'visible');
  assert.equal(renderedStates.get('JP'), 'visible');
});

test('hold duration stays at 150ms before fade starts', () => {
  assert.equal(PASSPORT_VISA_OVERLAY_HOLD_DURATION_MS, 150);
});
