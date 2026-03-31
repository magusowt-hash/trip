type ToastProps = {
  message: string;
  show: boolean;
};

export function Toast({ message, show }: ToastProps) {
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 16,
        top: 16,
        zIndex: 1200,
        background: 'var(--color-text)',
        color: '#fff',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        animation: 'slide-down 0.2s ease',
      }}
    >
      {message}
    </div>
  );
}
