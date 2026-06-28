'use client';

import { PortalMessage } from '@/lib/types';
import Markdown from '@/components/ui/Markdown';

interface Props {
  message: PortalMessage;
  currentUserId: string;
  deleteMode: boolean;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function AttachmentPreview({ attachments }: { attachments: any[] }) {
  if (!attachments?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
      {attachments.map((a: any, i: number) => {
        const isImage = a.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(a.url);
        return isImage ? (
          <img key={i} src={a.url} alt={a.name ?? 'attachment'} style={{ maxWidth: '240px', maxHeight: '200px', borderRadius: '8px', objectFit: 'cover', cursor: 'pointer' }} onClick={() => window.open(a.url, '_blank')} />
        ) : (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#21262d', borderRadius: '6px', padding: '6px 10px', color: 'var(--text)', textDecoration: 'none', fontSize: '13px' }}>
            📎 {a.name ?? 'File'}
          </a>
        );
      })}
    </div>
  );
}

export default function MessageBubble({ message, currentUserId, deleteMode, selected, onSelect }: Props) {
  const isUser = message.sender_type === 'user';
  const isMine = message.sender_id === currentUserId;
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0' }}>
        {deleteMode && (
          <input type="checkbox" checked={selected} onChange={e => onSelect(message.id, e.target.checked)}
            style={{ cursor: 'pointer', flexShrink: 0, accentColor: '#C49A0F' }} />
        )}
        <div className="msg-bubble system" style={{ flex: 1 }}>{message.content}</div>
      </div>
    );
  }

  return (
    <div className={`msg-row${isMine ? ' mine' : ''}`} style={{ paddingLeft: deleteMode ? '28px' : undefined, position: 'relative' }}>
      {deleteMode && (
        <input type="checkbox" checked={selected} onChange={e => onSelect(message.id, e.target.checked)}
          style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', accentColor: '#C49A0F' }} />
      )}
      <div className="msg-avatar" style={{ background: isUser ? '#1a3a6a' : '#1a3a2a', color: '#fff' }}>
        {isUser ? (message.sender_name?.charAt(0) ?? 'U') : '🤖'}
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <span style={{ color: isUser ? '#79c0ff' : '#56d364', fontWeight: 600 }}>
            {message.sender_name ?? (isUser ? 'User' : 'Agent')}
          </span>
          <span>{formatTime(message.created_at)}</span>
        </div>
        <div className={`msg-bubble ${isUser ? 'user' : 'agent'}`}><Markdown content={message.content} /></div>
        <AttachmentPreview attachments={message.attachments ?? []} />
      </div>
    </div>
  );
}
