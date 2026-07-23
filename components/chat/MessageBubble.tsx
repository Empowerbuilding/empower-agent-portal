'use client';

import { useState } from 'react';
import { PortalMessage } from '@/lib/types';
import Markdown from '@/components/ui/Markdown';

interface Props {
  message: PortalMessage;
  currentUserId: string;
  deleteMode: boolean;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  showHeader?: boolean;
  grouped?: boolean;
  onReply?: (msg: PortalMessage) => void;
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function ReplyQuote({ replyTo }: { replyTo: { sender_name: string; content: string } }) {
  return (
    <div style={{
      borderLeft: '3px solid var(--accent)',
      paddingLeft: '8px',
      marginBottom: '4px',
      opacity: 0.75,
      fontSize: '12px',
      color: 'var(--muted)',
      maxWidth: '100%',
      overflow: 'hidden',
    }}>
      <span style={{ fontWeight: 600, color: 'var(--text)', marginRight: '6px' }}>{replyTo.sender_name}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
        {replyTo.content.slice(0, 120)}{replyTo.content.length > 120 ? '\u2026' : ''}
      </span>
    </div>
  );
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
          <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text)', textDecoration: 'none', fontSize: '13px' }}>
            📎 {a.name ?? 'File'}
          </a>
        );
      })}
    </div>
  );
}

export default function MessageBubble({ message, currentUserId, deleteMode, selected, onSelect, showHeader = true, grouped = false, onReply }: Props) {
  const [hovered, setHovered] = useState(false);
  const isUser = message.sender_type === 'user';
  const isSystem = message.sender_type === 'system';

  const approvalState = isSystem ? (message.metadata?.approval_state as string | undefined) : undefined;

  if (isSystem && approvalState) {
    const stateColor = approvalState === 'sent' ? 'var(--accent)' : approvalState === 'approved' ? 'var(--accent)' : 'var(--muted)';
    const stateLabel = approvalState === 'sent' ? '✓ Sent' : approvalState === 'approved' ? '⏳ Queued' : '⏸ Pending';
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '6px 0' }}>
        {deleteMode && (
          <input type="checkbox" checked={selected} onChange={e => onSelect(message.id, e.target.checked)}
            style={{ cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)', marginTop: '14px' }} />
        )}
        <div style={{
          flex: 1, minWidth: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px',
          padding: '12px 14px', maxWidth: '560px', wordBreak: 'break-word', overflowWrap: 'anywhere',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>{message.sender_name ?? 'System'}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: stateColor }}>{stateLabel}</span>
          </div>
          {message.metadata?.reply_to ? (
            <ReplyQuote replyTo={message.metadata.reply_to as { sender_name: string; content: string }} />
          ) : null}
          <Markdown content={message.content} />
        </div>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0' }}>
        {deleteMode && (
          <input type="checkbox" checked={selected} onChange={e => onSelect(message.id, e.target.checked)}
            style={{ cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' }} />
        )}
        <div className="msg-bubble system" style={{ flex: 1 }}><Markdown content={message.content} /></div>
      </div>
    );
  }

  return (
    <div
      className={`msg-row${grouped ? ' grouped' : ''} ${isUser ? 'user' : 'agent'}`}
      style={{ paddingLeft: deleteMode && !grouped ? '28px' : undefined, position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {deleteMode && (
        <input type="checkbox" checked={selected} onChange={e => onSelect(message.id, e.target.checked)}
          style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', accentColor: 'var(--accent)' }} />
      )}
      {!grouped && (
        <div className="msg-avatar" style={{ background: isUser ? '#2563eb' : '#40444b', color: '#fff' }}>
          {isUser ? (message.sender_name?.charAt(0) ?? 'U') : <img src="/logo.png" alt="Agent" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', padding: '2px' }} />}
        </div>
      )}
      <div className="msg-body" style={{ position: 'relative' }}>
        {showHeader && (
          <div className="msg-meta">
            <span style={{ color: '#fff', fontWeight: 600 }}>
              {message.sender_name ?? (isUser ? 'User' : 'Agent')}
            </span>
            <span>{formatDateTime(message.created_at)}</span>
          </div>
        )}
        {message.metadata?.reply_to ? (
          <ReplyQuote replyTo={message.metadata.reply_to as { sender_name: string; content: string }} />
        ) : null}
        <div className={`msg-bubble ${isUser ? 'user' : 'agent'}`} title={!showHeader ? formatDateTime(message.created_at) : undefined}>
          <Markdown content={message.content} />
        </div>
        {onReply && hovered && !deleteMode && (
          <button
            onClick={() => onReply(message)}
            title="Reply"
            style={{
              position: 'absolute', right: isUser ? 'auto' : '-28px', left: isUser ? '-28px' : 'auto',
              top: '50%', transform: 'translateY(-50%)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '6px', cursor: 'pointer', color: 'var(--muted)',
              padding: '3px 5px', fontSize: '12px', lineHeight: 1,
              display: 'flex', alignItems: 'center',
            }}
          >↩</button>
        )}
        <AttachmentPreview attachments={message.attachments ?? []} />
      </div>
    </div>
  );
}
