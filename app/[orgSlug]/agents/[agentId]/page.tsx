'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMobileToolbar } from '@/context/MobileToolbar';

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
  const { setToolbar } = useMobileToolbar();

  const [agentName, setAgentName] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
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

  // Bump this counter when the app regains focus (e.g. returning from PDF viewer)
  // so the toolbar effect re-runs and re-injects the toolbar into the mobile header.
  const [layoutKey, setLayoutKey] = useState(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setLayoutKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Inject file toolbar into the mobile header so it's always visible above the fixed
  // header — prevents it from rendering behind the 52px fixed header on PWA cold-open.
  useEffect(() => {
    if (mobileView !== 'editor' || !activeFile) {
      setToolbar(null);
      return;
    }
    setToolbar(
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={() => setMobileView('list')}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', padding: '4px 6px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          ← <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{activeFile}</span>
        </button>
        <span style={{ fontSize: '11px', color: charCount > 25000 ? '#da3633' : charCount > 15000 ? '#f59e0b' : 'var(--muted)', fontWeight: charCount > 15000 ? 600 : 400, flexShrink: 0 }}>
          {charCount.toLocaleString()}
        </span>
        <button
          onClick={saveFile}
          disabled={!isDirty || saving || !activeFile}
          style={{
            padding: '5px 10px', background: isDirty ? 'var(--accent)' : 'var(--border)',
            border: 'none', borderRadius: '6px', color: isDirty ? '#fff' : 'var(--muted)',
            fontWeight: 700, cursor: isDirty && !saving ? 'pointer' : 'not-allowed',
            fontSize: '12px', opacity: saving ? 0.7 : 1, flexShrink: 0,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
    return () => setToolbar(null);
  }, [mobileView, activeFile, isDirty, saving, charCount, layoutKey]);

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
    setMobileView('editor');
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
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* File list sidebar */}
      <div style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--sidebar-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        // Mobile: full-width when in list view, hidden when in editor view
      }}
        className={mobileView === 'editor' ? 'agent-files-sidebar hidden-mobile' : 'agent-files-sidebar'}
      >
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {agentName || 'Agent'} — Files
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px', paddingTop: '10px' }}>
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

        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => router.push(`/${orgSlug}/settings`)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', padding: 0 }}
          >
            ← Settings
          </button>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
        className={mobileView === 'list' ? 'agent-files-editor hidden-mobile' : 'agent-files-editor'}
      >
        {/* Toolbar — hidden on mobile (injected into fixed mobile header via setToolbar) */}
        <div className="hide-mobile" style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          background: 'var(--sidebar-bg)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Mobile back button */}
            <button
              onClick={() => setMobileView('list')}
              className="show-mobile"
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px', padding: '0 4px', flexShrink: 0 }}
            >←</button>
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
                padding: '7px 16px', background: isDirty ? 'var(--accent)' : 'var(--border)',
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
            borderBottom: '1px solid var(--border)',
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
                background: 'var(--bg)', color: 'var(--text)',
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
