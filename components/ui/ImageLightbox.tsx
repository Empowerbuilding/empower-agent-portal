'use client';
import { useEffect } from 'react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={src}
        alt={alt ?? 'image'}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '92vw', maxHeight: '92vh',
          borderRadius: '8px', objectFit: 'contain',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          cursor: 'default',
        }}
      />
      <button
        className="circle-btn"
        onClick={onClose}
        style={{
          position: 'fixed', top: 16, right: 20,
          background: 'rgba(255,255,255,0.1)', border: 'none',
          color: '#fff', fontSize: 22, cursor: 'pointer',
          width: 36, height: 36, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >×</button>
    </div>
  );
}
