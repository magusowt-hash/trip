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

type PassportVisaOverlayRuntimeTransitionPlan = {
  nextCode: string;
  nextState: PassportVisaOverlayActivePresentationState;
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
): PassportVisaOverlayTransitionPlan;
export function getPassportVisaOverlayTransitionPlan(input: {
  currentCode: string | null;
  currentState: PassportVisaOverlayActivePresentationState | null;
  nextCode: string;
  reason: 'hover-leave' | 'hover-enter' | 'activate';
}): PassportVisaOverlayRuntimeTransitionPlan | null;
export function getPassportVisaOverlayTransitionPlan(
  inputOrPreviousState:
    | PassportVisaOverlayPresentationState
    | {
        currentCode: string | null;
        currentState: PassportVisaOverlayActivePresentationState | null;
        nextCode: string;
        reason: 'hover-leave' | 'hover-enter' | 'activate';
      },
  nextState?: PassportVisaOverlayPresentationState,
): PassportVisaOverlayTransitionPlan | PassportVisaOverlayRuntimeTransitionPlan | null {
  if (typeof inputOrPreviousState !== 'string') {
    if (inputOrPreviousState.reason === 'hover-leave') {
      return {
        nextCode: inputOrPreviousState.nextCode,
        nextState: 'fading',
      };
    }

    return {
      nextCode: inputOrPreviousState.nextCode,
      nextState: inputOrPreviousState.currentState ?? 'visible',
    };
  }

  const previousState = inputOrPreviousState;
  if (previousState === 'visible' && nextState === 'fading') {
    return {
      immediate: 'visible',
      deferred: 'fading',
    };
  }

  return {
    immediate: nextState ?? 'hidden',
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
): Array<{ code: string; state: PassportVisaOverlayActivePresentationState }>;
export function getPassportVisaRenderedOverlayStates(input: {
  currentCode: string | null;
  currentState: PassportVisaOverlayActivePresentationState | null;
  hoveredCode: string | null;
  suppressedHoverCode: string | null;
  previousStates: Map<string, PassportVisaOverlayPresentationState>;
}): Map<string, PassportVisaOverlayPresentationState>;
export function getPassportVisaRenderedOverlayStates(
  inputOrHoveredCode:
    | string
    | null
    | {
        currentCode: string | null;
        currentState: PassportVisaOverlayActivePresentationState | null;
        hoveredCode: string | null;
        suppressedHoverCode: string | null;
        previousStates: Map<string, PassportVisaOverlayPresentationState>;
      },
  suppressedHoverCountryCode?: string | null,
  animatedCountryCode?: string | null,
  animatedPresentationState?: PassportVisaOverlayActivePresentationState | null,
) {
  if (
    typeof inputOrHoveredCode === 'object'
    && inputOrHoveredCode !== null
    && 'currentCode' in inputOrHoveredCode
  ) {
    const renderedStates = new Map<string, PassportVisaOverlayPresentationState>();
    const visibleHoverCode = getPassportVisaVisibleHoverCode(
      inputOrHoveredCode.hoveredCode,
      inputOrHoveredCode.suppressedHoverCode,
    );

    if (visibleHoverCode) {
      renderedStates.set(visibleHoverCode, 'visible');
    }

    if (inputOrHoveredCode.currentCode && inputOrHoveredCode.currentState) {
      renderedStates.set(inputOrHoveredCode.currentCode, inputOrHoveredCode.currentState);
    }

    for (const [code, state] of inputOrHoveredCode.previousStates) {
      if (!renderedStates.has(code) && state === 'fading') {
        renderedStates.set(code, 'hidden');
      }
    }

    return renderedStates;
  }

  return getPassportVisaDesiredOverlayStates(
    getPassportVisaVisibleHoverCode(inputOrHoveredCode, suppressedHoverCountryCode ?? null),
    animatedCountryCode ?? null,
    animatedPresentationState ?? null,
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
