export type ItineraryCardProps = {
  day: string;
  title: string;
  note?: string;
};

export function ItineraryCard({ day, title, note }: ItineraryCardProps) {
  return (
    <div className="card">
      <small style={{ color: 'var(--color-text-muted)' }}>{day}</small>
      <h3 style={{ margin: '8px 0' }}>{title}</h3>
      {note ? <p className="page-desc" style={{ margin: 0 }}>{note}</p> : null}
    </div>
  );
}
