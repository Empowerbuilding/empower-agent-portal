'use client';

/**
 * Markdown renderer for portal messages.
 * Supports: headers (# ## ###), **bold**, *italic*, `code`, ```blocks```,
 * bullet lists, numbered lists, --- dividers, | tables |, line breaks,
 * ![alt](url) images, bare image URLs (jpg/png/gif/webp auto-embeds).
 */

interface Props {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Supports: ![alt](url) images, [text](url) links, **bold**, *italic*, `code`, bare image URLs
  const regex = /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?\S*)?)|(https?:\/\/[^\s<>"')\]]+))/gi;
  let last = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[0].startsWith('![') && match[3]) {
      // Markdown image: ![alt](url)
      parts.push(
        <img key={key++} src={match[3]} alt={match[2] || 'image'}
          style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', display: 'block', margin: '6px 0', cursor: 'pointer', objectFit: 'contain' }}
          onClick={() => window.open(match![3], '_blank')} />
      );
    } else if (match[4] && match[5]) {
      // Markdown link: [text](url)
      parts.push(<a key={key++} href={match[5]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{match[4]}</a>);
    } else if (match[6]) parts.push(<strong key={key++}>{match[6]}</strong>);
    else if (match[7]) parts.push(<em key={key++}>{match[7]}</em>);
    else if (match[8]) parts.push(<code key={key++} style={{ background: 'var(--border)', borderRadius: '3px', padding: '1px 5px', fontSize: '0.9em', fontFamily: 'monospace' }}>{match[8]}</code>);
    } else if (match[10]) {
      // Bare non-image URL — auto-link
      const href10 = match[10].replace(/[.,;:!?]+$/, '');
      parts.push(<a key={key++} href={href10} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{href10}</a>);
    } else if (match[9]) {
      // Bare image URL — auto-embed
      parts.push(
        <img key={key++} src={match[9]} alt="image"
          style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', display: 'block', margin: '6px 0', cursor: 'pointer', objectFit: 'contain' }}
          onClick={() => window.open(match![9], '_blank')} />
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function isTableRow(line: string) {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

function isSeparatorRow(line: string) {
  return /^\|[\s\-:|]+\|/.test(line.trim());
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
}

export default function Markdown({ content, className }: Props) {
  if (!content) return null;

  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let codeLines: string[] = [];
  let inCode = false;
  let lineKey = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.startsWith('```')) {
      const singleLine = line.match(/^```(.+)```$/);
      if (singleLine) {
        blocks.push(
          <pre key={lineKey++} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', overflow: 'auto', fontSize: '13px', fontFamily: 'monospace', margin: '6px 0', whiteSpace: 'pre-wrap' }}>
            {singleLine[1]}
          </pre>
        );
        i++; continue;
      }
      if (inCode) {
        blocks.push(
          <pre key={lineKey++} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', overflow: 'auto', fontSize: '13px', fontFamily: 'monospace', margin: '6px 0', whiteSpace: 'pre-wrap' }}>
            {codeLines.join('\n')}
          </pre>
        );
        codeLines = []; inCode = false;
      } else { inCode = true; }
      i++; continue;
    }

    if (inCode) { codeLines.push(line); i++; continue; }

    // Empty line
    if (line.trim() === '') {
      blocks.push(<div key={lineKey++} style={{ height: '6px' }} />);
      i++; continue;
    }

    // Horizontal rule --- or ***
    if (line.trim().match(/^(-{3,}|\*{3,})$/)) {
      blocks.push(<hr key={lineKey++} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />);
      i++; continue;
    }

    // Headers # through ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3);
      const sizes = ['18px', '16px', '14px'];
      const margins = ['10px 0 4px', '8px 0 4px', '6px 0 2px'];
      blocks.push(
        <div key={lineKey++} style={{ fontSize: sizes[level - 1], fontWeight: 700, color: 'var(--text)', margin: margins[level - 1], lineHeight: 1.3 }}>
          {renderInline(headingMatch[2])}
        </div>
      );
      i++; continue;
    }

    // Table
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      // Find header and separator
      const headerRow = tableLines[0];
      const hasSep = tableLines.length > 1 && isSeparatorRow(tableLines[1]);
      const bodyRows = hasSep ? tableLines.slice(2) : tableLines.slice(1);
      const headers = parseTableRow(headerRow);

      blocks.push(
        <div key={lineKey++} style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
            {headers.some(h => h) && (
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--card)' }}>
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                  {parseTableRow(row).map((cell, ci) => (
                    <td key={ci} style={{ padding: '6px 10px', color: 'var(--text)', verticalAlign: 'top' }}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Bullet list
    if (line.match(/^[-*•]\s/)) {
      blocks.push(
        <div key={lineKey++} style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
          <span style={{ color: 'var(--muted)', flexShrink: 0 }}>•</span>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(line.replace(/^[-*•]\s/, ''))}</span>
        </div>
      );
      i++; continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s(.*)$/);
    if (numMatch) {
      blocks.push(
        <div key={lineKey++} style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
          <span style={{ color: 'var(--muted)', flexShrink: 0, minWidth: '16px' }}>{numMatch[1]}.</span>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(numMatch[2])}</span>
        </div>
      );
      i++; continue;
    }

    // Plain paragraph
    blocks.push(<div key={lineKey++} style={{ marginBottom: '2px' }}>{renderInline(line)}</div>);
    i++;
  }

  return <div className={className} style={{ lineHeight: 1.5, overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0 }}>{blocks}</div>;
}
