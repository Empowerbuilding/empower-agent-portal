import { PortalMessage } from '@/lib/types';

interface Props {
  message: PortalMessage;
  currentUserId: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function MessageBubble({ message, currentUserId }: Props) {
  const isUser = message.sender_type === 'user';
  const isMine = message.sender_id === currentUserId;
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <div className="msg-bubble system">{message.content}</div>
      </div>
    );
  }

  return (
    <div className={`msg-row${isMine ? ' mine' : ''}`}>
      {/* Avatar */}
      <div
        className="msg-avatar"
        style={{ background: isUser ? '#1a3a6a' : '#1a3a2a', color: '#fff' }}
      >
        {isUser ? (message.sender_name?.charAt(0) ?? 'U') : '🤖'}
      </div>

      <div className="msg-body">
        <div className="msg-meta">
          <span style={{ color: isUser ? '#79c0ff' : '#56d364', fontWeight: 600 }}>
            {message.sender_name ?? (isUser ? 'User' : 'Agent')}
          </span>
          <span>{formatTime(message.created_at)}</span>
        </div>
        <div className={`msg-bubble ${isUser ? 'user' : 'agent'}`}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
