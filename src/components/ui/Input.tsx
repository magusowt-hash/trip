import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  onEnter?: (value: string) => void;
};

export function Input({ label, error, style, onEnter, ...props }: InputProps) {
  return (
    <label className="grid" style={{ gap: 6 }}>
      {label ? <span style={{ fontSize: 'var(--font-caption)', color: 'var(--color-text-muted)' }}>{label}</span> : null}
      <input
        {...props}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter(e.currentTarget.value);
          props.onKeyDown?.(e);
        }}
        style={{
          width: '100%',
          border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
          borderRadius: 8,
          padding: '8px 10px',
          outline: 'none',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          boxShadow: error ? '0 0 0 2px rgba(220,38,38,0.1)' : 'none',
          ...style,
        }}
      />
      {error ? <small style={{ color: 'var(--color-danger)' }}>{error}</small> : null}
    </label>
  );
}
