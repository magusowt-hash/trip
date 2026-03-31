export type ItineraryItemProps = {
  spot: string;
  transport: string;
};

export function ItineraryItem({ spot, transport }: ItineraryItemProps) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span>{spot}</span>
      <small style={{ color: 'var(--color-text-muted)' }}>{transport}</small>
    </div>
  );
}
