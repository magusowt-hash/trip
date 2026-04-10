export type RecommendCardProps = {
  name: string;
  tag: string;
};

export function RecommendCard({ name, tag }: RecommendCardProps) {
  return (
    <div className="card row" style={{ justifyContent: 'space-between' }}>
      <strong>{name}</strong>
      <span style={{ color: 'var(--color-secondary)' }}>{tag}</span>
    </div>
  );
}
