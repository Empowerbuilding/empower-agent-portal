'use client';

import { useState } from 'react';
import { PortalMessage } from '@/lib/types';

interface Props {
  message: PortalMessage;
  currentUserId: string;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function MessageBubble({ message, currentUserId, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState(false);
  const isUser = message.sender_type === 'user';
  const isMine = message.sender_id === currentUserId;
  const isSystem = message.sender_type === 'system';
  const showCheck = hovered || selected;

  if (isSystem) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onSelect(message.id, e.target.checked)}
          style={{ opacity: showCheck ? 1 : 0, cursor: 'pointer', flexShrink: 0, accentColor: '#C49A0F' }}
        />
        <div className="msg-bubble system" style={{ flex: 1 }}>{message.content}</div>
      </div>
    );
  }

  return (
    <div
      className={`msg-row${isMine ? ' mine' : ''}`}
      style={{ position: 'relative', paddingLeft: '24px' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox — left edge */}
      <input
        type="checkbox"
        checked={selected}
        onChange={e => onSelect(message.id, e.target.checked)}
        style={{
          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
          opacity: showCheck ? 1 : 0, cursor: 'pointer', accentColor: '#C49A0F',
        }}
      />

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
        <div className={`msg-bubble ${isUser ? 'user' : 'agent'}`}>{message.content}</div>
      </div>
    </div>
  );
}
