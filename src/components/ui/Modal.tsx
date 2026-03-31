'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Button } from './Button';

type ModalProps = {
  open: boolean;
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  /** 内容面板样式（宽、最大高度、滚动等） */
  panelStyle?: CSSProperties;
};

export function Modal({ open, title, children, onClose, footer, panelStyle }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={() => onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        animation: 'fade-in 0.2s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'modal'}
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92%)',
          animation: 'slide-up 0.2s ease',
          ...panelStyle,
        }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {title ? <h3 style={{ margin: 0 }}>{title}</h3> : <span />}
          {onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              关闭
            </Button>
          ) : null}
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
        {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
      </div>
    </div>
  );
}
