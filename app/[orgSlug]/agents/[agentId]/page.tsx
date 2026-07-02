'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface FileEntry {
  name: string;
  path: string;
  size: number;
}

export default function AgentFilesPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();

  const [agentName, setAgentName] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saveError, setSaveError] = useState('');
  const [fileError, setFileError] = useState('');

  const charCount = content.length;
  const isDirty = content !== originalContent;

  useEffect(() => {
    supabase.from('agents').select('display_name').eq('id', agentId).single()
      .then(({ data }) => { if (data) setAgentName(data.display_name); });
  }, [agentId]);

  useEffect(() => {
    async function loadFiles() {
      setLoadingFiles(true);
      setFileError('');
      try {
        const res = await fetch(`/api/agents/${agentId}/files`);
        const data = await res.json();
        if (!res.ok) { setFileError(data.error || 'Failed to load files'); return; }
        setFiles(data.files ?? []);
        if (data.files?.length > 0) openFile(data.files[0].name, data.files);
      } catch (e: any) {
        setFileError(e.message);
      } finally {
        setLoadingFiles(false);
      }
    }
    loadFiles();
  }, [agentId]);

  const openFile = useCallback(async (fileName: string, fileList?: FileEntry[]) => {
    if (isDirty && activeFile && !confirm(`Discard unsaved changes to ${activeFile}?`)) return;
    setActiveFile(fileName);
    setLoadingContent(true);
    setSaveNote('');
    setSaveError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || 'Failed to load file'); return; }
      setContent(data.content);
      setOriginalContent(data.content);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setLoadingContent(false);
    }
  }, [agentId, isDirty, activeFile]);

  async function saveFile() {
    if (!activeFile || !isDirty) return;
    setSaving(true);
    setSaveNote('');
    setSaveError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: activeFile, content }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaveError(data.error || 'Save failed');
      } else {
        setOriginalContent(content);
        setSaveNote(data.note || '✓ Saved');
        // Update file size in list
        setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, size: new TextEncoder().encode(content).length } : f));
      }
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function charCountColor() {
    if (charCount > 25000) return '#da3633';
    if (charCount > 15000) return '#f59e0b';
    return 'var(--muted)';
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* File list sidebar */}
      <div style={{
        width: 200, flexShrink: 0, borderRight: '1px solid #21262d',
        background: '#0a0e16', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #21262d' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {agentName || 'Agent'} — Files
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {loadingFiles ? (
            <div style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--muted)' }}>Loading…</div>
          ) : fileError ? (
            <div style={{ padding: '12px 8px', fontSize: '12px', color: '#da3633' }}>{fileError}</div>
          ) : files.map(f => (
            <button
              key={f.name}
              onClick={() => openFile(f.name)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer',
                border: 'none', textAlign: 'left', gap: '6px',
                background: activeFile === f.name ? 'rgba(76,139,240,0.15)' : 'none',
                color: activeFile === f.name ? 'var(--accent)' : 'var(--text)',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: activeFile === f.name ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>{formatSize(f.size)}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid #21262d' }}>
          <button
            onClick={() => router.push(`/${orgSlug}/settings`)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', padding: 0 }}
          >
            ← Back to Settings
          </button>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid #21262d',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          background: '#0d1117', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              {activeFile ?? '—'}
            </span>
            {isDirty && <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>● Unsaved</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: charCountColor(), fontWeight: charCount > 15000 ? 600 : 400 }}>
              {charCount.toLocaleString()} chars
              {charCount > 25000 && ' ⚠️ Very large'}
              {charCount > 15000 && charCount <= 25000 && ' ⚠️ Getting big'}
            </span>
            <button
              onClick={saveFile}
              disabled={!isDirty || saving || !activeFile}
              style={{
                padding: '7px 16px', background: isDirty ? 'var(--accent)' : '#21262d',
                border: 'none', borderRadius: '6px', color: isDirty ? '#fff' : 'var(--muted)',
                fontWeight: 700, cursor: isDirty && !saving ? 'pointer' : 'not-allowed',
                fontSize: '13px', opacity: saving ? 0.7 : 1, transition: 'all 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Save & Apply'}
            </button>
          </div>
        </div>

        {/* Status bar */}
        {(saveNote || saveError) && (
          <div style={{
            padding: '8px 16px', fontSize: '12px', flexShrink: 0,
            background: saveError ? 'rgba(218,54,51,0.08)' : 'rgba(34,197,94,0.08)',
            color: saveError ? '#da3633' : '#22c55e',
            borderBottom: '1px solid #21262d',
          }}>
            {saveError ? `⚠ ${saveError}` : `✓ ${saveNote}`}
          </div>
        )}

        {/* Textarea */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {loadingContent ? (
            <div style={{ padding: '24px', fontSize: '13px', color: 'var(--muted)' }}>Loading…</div>
          ) : (
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); setSaveNote(''); setSaveError(''); }}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveFile(); }
              }}
              spellCheck={false}
              style={{
                width: '100%', height: '100%', padding: '16px 20px',
                background: '#080c14', color: '#e6edf3',
                border: 'none', outline: 'none', resize: 'none',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                fontSize: '13px', lineHeight: '1.6',
                boxSizing: 'border-box',
              }}
              placeholder={activeFile ? 'File is empty.' : 'Select a file to edit.'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
