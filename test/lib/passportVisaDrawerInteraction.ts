export function shouldRenderPassportVisaDrawerBackdrop({
  isDrawerOpen,
  hasSelectedCountry,
}: {
  isDrawerOpen: boolean;
  hasSelectedCountry: boolean;
}) {
  return isDrawerOpen && hasSelectedCountry && false;
}
