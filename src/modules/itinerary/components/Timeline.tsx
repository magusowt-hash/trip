export type TimelineItem = {
  time: string;
  title: string;
  desc?: string;
};

type TimelineProps = {
  items: TimelineItem[];
};

export function Timeline({ items }: TimelineProps) {
  return (
    <div className="grid">
      {items.map((item) => (
        <div key={`${item.time}-${item.title}`} className="card" style={{ padding: '12px 16px' }}>
          <strong>{item.time} - {item.title}</strong>
          {item.desc ? <p className="page-desc">{item.desc}</p> : null}
        </div>
      ))}
    </div>
  );
}
