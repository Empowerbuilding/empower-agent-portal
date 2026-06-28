'use client';

/**
 * Simple inline markdown renderer for portal messages.
 * Supports: **bold**, *italic*, `code`, ```code blocks```, bullet lists, line breaks.
 */

interface Props {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} style={{ background: '#21262d', borderRadius: '3px', padding: '1px 5px', fontSize: '0.9em', fontFamily: 'monospace' }}>{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ content, className }: Props) {
  if (!content) return null;

  // Split into blocks by double newlines (paragraphs) and code fences
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let codeLines: string[] = [];
  let inCode = false;
  let lineKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCode) {
        blocks.push(
          <pre key={lineKey++} style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
            padding: '10px 12px', overflow: 'auto', fontSize: '13px',
            fontFamily: 'monospace', margin: '6px 0', whiteSpace: 'pre-wrap',
          }}>
            {codeLines.join('\n')}
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === '') {
      blocks.push(<div key={lineKey++} style={{ height: '6px' }} />);
      continue;
    }

    // Bullet list
    if (line.match(/^[-*]\s/)) {
      blocks.push(
        <div key={lineKey++} style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
          <span style={{ color: 'var(--muted)', flexShrink: 0 }}>•</span>
          <span>{renderInline(line.replace(/^[-*]\s/, ''))}</span>
        </div>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\.\s(.*)$/);
      if (num) {
        blocks.push(
          <div key={lineKey++} style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
            <span style={{ color: 'var(--muted)', flexShrink: 0, minWidth: '16px' }}>{num[1]}.</span>
            <span>{renderInline(num[2])}</span>
          </div>
        );
        continue;
      }
    }

    blocks.push(<div key={lineKey++} style={{ marginBottom: '2px' }}>{renderInline(line)}</div>);
  }

  return <div className={className} style={{ lineHeight: 1.5 }}>{blocks}</div>;
}
