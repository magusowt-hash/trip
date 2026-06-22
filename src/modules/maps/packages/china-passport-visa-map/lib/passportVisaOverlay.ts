export const PASSPORT_VISA_OVERLAY_ATTR = 'data-overlay-code';
export const PASSPORT_VISA_OVERLAY_HOLD_DURATION_MS = 150;
export const PASSPORT_VISA_OVERLAY_FADE_DURATION_MS = 1100;

export type PassportVisaOverlayPresentationState = 'hidden' | 'visible' | 'fading';
export type PassportVisaOverlayActivePresentationState = Exclude<
  PassportVisaOverlayPresentationState,
  'hidden'
>;
export type PassportVisaOverlayTransitionPlan = {
  immediate: PassportVisaOverlayPresentationState;
  deferred: PassportVisaOverlayPresentationState | null;
};

export function getPassportVisaOverlaySelector() {
  return `[${PASSPORT_VISA_OVERLAY_ATTR}]`;
}

export function setPassportVisaOverlayCode(element: Element, code: string) {
  element.setAttribute(PASSPORT_VISA_OVERLAY_ATTR, code);
}

export function getPassportVisaOverlayPresentationStyle(
  state: PassportVisaOverlayPresentationState,
) {
  if (state === 'visible') {
    return {
      opacity: '1' as const,
      transition: 'opacity 0ms linear',
    };
  }

  if (state === 'fading') {
    return {
      opacity: '0' as const,
      transition: `opacity ${PASSPORT_VISA_OVERLAY_FADE_DURATION_MS}ms ease-out`,
    };
  }

  return {
    opacity: '0' as const,
    transition: 'opacity 0ms linear',
  };
}

export function getPassportVisaOverlayTransitionPlan(
  previousState: PassportVisaOverlayPresentationState,
  nextState: PassportVisaOverlayPresentationState,
): PassportVisaOverlayTransitionPlan {
  if (previousState === 'visible' && nextState === 'fading') {
    return {
      immediate: 'visible',
      deferred: 'fading',
    };
  }

  return {
    immediate: nextState,
    deferred: null,
  };
}

export function getPassportVisaDesiredOverlayStates(
  hoveredCountryCode: string | null,
  animatedCountryCode: string | null,
  animatedPresentationState: PassportVisaOverlayActivePresentationState | null,
) {
  const desiredStates = new Map<string, PassportVisaOverlayActivePresentationState>();

  if (hoveredCountryCode) {
    desiredStates.set(hoveredCountryCode, 'visible');
  }

  if (animatedCountryCode && animatedPresentationState) {
    desiredStates.set(animatedCountryCode, animatedPresentationState);
  }

  return Array.from(desiredStates, ([code, state]) => ({ code, state }));
}

export function getPassportVisaRenderedOverlayStates(
  hoveredCountryCode: string | null,
  suppressedHoverCountryCode: string | null,
  animatedCountryCode: string | null,
  animatedPresentationState: PassportVisaOverlayActivePresentationState | null,
) {
  return getPassportVisaDesiredOverlayStates(
    getPassportVisaVisibleHoverCode(hoveredCountryCode, suppressedHoverCountryCode),
    animatedCountryCode,
    animatedPresentationState,
  );
}

export function getPassportVisaSuppressedHoverCodeOnActivate(
  hoveredCountryCode: string | null,
  activatedCountryCode: string,
) {
  if (hoveredCountryCode === activatedCountryCode) {
    return activatedCountryCode;
  }

  return null;
}

export function getPassportVisaVisibleHoverCode(
  hoveredCountryCode: string | null,
  suppressedHoverCountryCode: string | null,
) {
  if (!hoveredCountryCode) {
    return null;
  }

  if (hoveredCountryCode === suppressedHoverCountryCode) {
    return null;
  }

  return hoveredCountryCode;
}
