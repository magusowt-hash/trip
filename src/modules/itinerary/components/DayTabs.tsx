'use client';

type DayTabsProps = {
  days: string[];
  activeDay: string;
  onChange: (day: string) => void;
};

export function DayTabs({ days, activeDay, onChange }: DayTabsProps) {
  return (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      {days.map((day) => {
        const active = day === activeDay;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onChange(day)}
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              border: '1px solid var(--color-border)',
              background: active ? 'var(--color-primary)' : 'var(--color-surface)',
              color: active ? '#fff' : 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}
