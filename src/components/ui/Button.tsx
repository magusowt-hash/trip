'use client';

import type { ButtonHTMLAttributes, CSSProperties } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

const variantStyleMap: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: '#fff',
    border: '1px solid var(--color-primary)',
  },
  secondary: {
    background: 'var(--color-secondary)',
    color: '#fff',
    border: '1px solid var(--color-secondary)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
};

const sizeStyleMap: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '6px 10px', fontSize: 12 },
  md: { padding: '8px 14px', fontSize: 14 },
  lg: { padding: '10px 16px', fontSize: 16 },
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const baseStyle: CSSProperties = {
    borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
    transition: 'transform 0.15s ease, box-shadow 0.2s ease, background-color 0.2s ease',
    boxShadow: disabled ? 'none' : '0 2px 10px rgba(0,0,0,0.06)',
  };

  return (
    <button
      {...props}
      disabled={disabled}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'translateY(1px) scale(0.99)';
        props.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        props.onMouseUp?.(e);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        props.onMouseLeave?.(e);
      }}
      style={{
        ...baseStyle,
        ...variantStyleMap[variant],
        ...sizeStyleMap[size],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
