import { PortalMessage } from '@/lib/types';

interface Props {
  message: PortalMessage;
  currentUserId: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function MessageBubble({ message, currentUserId }: Props) {
  const isUser = message.sender_type === 'user';
  const isCurrentUser = message.sender_id === currentUserId;
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div
          className="text-xs px-3 py-1 rounded-full"
          style={{ background: '#1e1e1e', color: '#666' }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 py-0.5 group ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
        style={{
          background: isUser ? '#2a4a8a' : '#1e3a1e',
          color: '#fff',
        }}
      >
        {isUser
          ? (message.sender_name?.charAt(0) ?? 'U')
          : '🤖'
        }
      </div>

      {/* Content */}
      <div className={`flex flex-col max-w-[75%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        {/* Name + time */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold" style={{ color: isUser ? '#7aa3e0' : '#6aaa6a' }}>
            {message.sender_name ?? (isUser ? 'User' : 'Agent')}
          </span>
          <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#555' }}>
            {formatTime(message.created_at)}
          </span>
        </div>

        {/* Message bubble */}
        <div
          className="px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{
            background: isCurrentUser ? '#1d3557' : '#1e1e1e',
            color: '#f0f0f0',
            borderRadius: isCurrentUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          }}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
