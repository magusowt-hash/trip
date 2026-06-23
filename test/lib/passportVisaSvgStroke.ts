export function applyPassportVisaNonScalingStroke(
  element: Element,
  strokeWidth: string,
) {
  element.setAttribute('stroke-width', strokeWidth);
  element.setAttribute('vector-effect', 'non-scaling-stroke');
}
