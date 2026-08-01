'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type QAStatus = 'pending' | 'approved' | 'revision' | 'rejected';

interface ProjectFile {
  id: string;
  plan_name: string;
  plan_slug: string;
  filename: string;
  file_key: string;
  version: number;
  content_type: string;
  file_size: number | null;
  uploaded_by: string;
  qa_status: QAStatus;
  qa_notes: string | null;
  created_at: string;
  archived: boolean;
  project_name?: string | null;
  contact_name?: string | null;
}

const QA_COLORS: Record<QAStatus, { bg: string; color: string; label: string }> = {
  pending:  { bg: 'rgba(234,179,8,0.15)',   color: '#eab308', label: 'Pending' },
  approved: { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', label: 'Approved' },
  revision: { bg: 'rgba(249,115,22,0.15)',  color: '#f97316', label: 'Revision' },
  rejected: { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444', label: 'Rejected' },
};

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FilesPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [qaFilter, setQaFilter] = useState<QAStatus | 'all'>('all');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadPlanName, setUploadPlanName] = useState('');
  const [uploadProjectName, setUploadProjectName] = useState('');
  const [uploadContactName, setUploadContactName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // QA modal
  const [qaModal, setQaModal] = useState<ProjectFile | null>(null);
  const [qaStatus, setQaStatus] = useState<QAStatus>('pending');
  const [qaNotes, setQaNotes] = useState('');
  const [savingQa, setSavingQa] = useState(false);

  // History modal
  const [historyFile, setHistoryFile] = useState<ProjectFile | null>(null);
  const [history, setHistory] = useState<ProjectFile[]>([]);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Init user + org
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      if (!org) return;
      setOrgId(org.id);
      const { data: pu } = await supabase.from('portal_users').select('*').eq('supabase_auth_id', user.id).eq('org_id', org.id).single();
      if (pu) setCurrentUser(pu);
    };
    init();
  }, [orgSlug]);

  const loadFiles = useCallback(async () => {
    if (!orgId || !currentUser) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/files?orgId=${orgId}&userId=${currentUser.id}&role=${currentUser.role}`);
      const data = await res.json();
      setFiles(data.files ?? []);
    } finally {
      setLoading(false);
    }
  }, [orgId, currentUser]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // Upload flow
  const handleUpload = async () => {
    if (!uploadFile || !orgId || !currentUser) return;
    const effectiveName = uploadPlanName.trim() || uploadFile.name.replace(/\.[^.]+$/, '');
    setUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Get presigned URL
      const presignRes = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'presign-upload',
          planName: effectiveName,
          filename: uploadFile.name,
          contentType: uploadFile.type || 'application/octet-stream',
          orgId,
          uploadedBy: currentUser.name,
        }),
      });
      const { uploadUrl, key, version, planSlug } = await presignRes.json();

      // Step 2: Upload to Spaces via XHR (so we can track progress)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.onload = () => xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', uploadFile.type || 'application/octet-stream');
        xhr.send(uploadFile);
      });

      // Step 3: Confirm upload — save metadata
      const confirmRes = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm-upload',
          key,
          planName: effectiveName,
          planSlug,
          projectName: uploadProjectName.trim() || null,
          contactName: uploadContactName.trim() || null,
          filename: uploadFile.name,
          version,
          contentType: uploadFile.type || 'application/octet-stream',
          fileSize: uploadFile.size,
          orgId,
          uploadedBy: currentUser.name,
        }),
      });
      const result = await confirmRes.json();
      if (result.error) throw new Error(result.error);

      showToast(`✅ ${uploadFile.name} uploaded — v${version}`);
      setUploadModal(false);
      setUploadPlanName('');
      setUploadProjectName('');
      setUploadContactName('');
      setUploadFile(null);
      loadFiles();
    } catch (err: any) {
      showToast(`❌ ${err.message}`, false);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Download
  const handleDownload = async (file: ProjectFile) => {
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'presign-download', fileKey: file.file_key, filename: file.filename }),
      });
      const { downloadUrl, error } = await res.json();
      if (error) throw new Error(error);
      window.open(downloadUrl, '_blank');
    } catch (err: any) {
      showToast(`❌ Download failed: ${err.message}`, false);
    }
  };

  // QA update
  const handleQaSave = async () => {
    if (!qaModal || !orgId) return;
    setSavingQa(true);
    try {
      await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qa-update', fileId: qaModal.id, qaStatus, qaNotes, orgId }),
      });
      showToast('QA status updated');
      setQaModal(null);
      loadFiles();
    } finally {
      setSavingQa(false);
    }
  };

  // Load version history
  const showHistory = async (file: ProjectFile) => {
    setHistoryFile(file);
    const { data } = await supabase
      .from('project_files')
      .select('*')
      .eq('org_id', orgId)
      .eq('plan_slug', file.plan_slug)
      .order('version', { ascending: false });
    setHistory(data ?? []);
  };

  // Filter
  const filtered = files.filter(f => {
    const matchSearch = !search || f.plan_name.toLowerCase().includes(search.toLowerCase()) || f.filename.toLowerCase().includes(search.toLowerCase()) || (f.project_name ?? '').toLowerCase().includes(search.toLowerCase()) || (f.contact_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchQa = qaFilter === 'all' || f.qa_status === qaFilter;
    return matchSearch && matchQa;
  });

  const isContractor = currentUser?.role === 'contractor';
  const canUpload = !isContractor;
  const canQA = currentUser?.role === 'admin' || currentUser?.role === 'owner' || currentUser?.name === 'Ben';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: 0, overflow: 'hidden' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: toast.ok ? '#27ae60' : '#c0392b',
          color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 500, fontSize: 14,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>📁 File Library</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Revit project files — versioned, private</div>
        </div>
        {canUpload && (
          <button
            onClick={() => setUploadModal(true)}
            style={{
              background: 'var(--accent)', border: 'none', color: '#fff',
              padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ↑ Upload File
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search plan or filename…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13,
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'pending', 'approved', 'revision', 'rejected'] as const).map(s => (
            <button
              key={s}
              onClick={() => setQaFilter(s)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: qaFilter === s ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: qaFilter === s ? 'rgba(76,139,240,0.15)' : 'var(--surface)',
                color: qaFilter === s ? 'var(--accent)' : 'var(--muted)',
                fontWeight: qaFilter === s ? 600 : 400,
                flexShrink: 0,
              }}
            >
              {s === 'all' ? 'All' : QA_COLORS[s as QAStatus].label}
            </button>
          ))}
        </div>
      </div>

      {/* File List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 60, fontSize: 14 }}>Loading files…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 60, fontSize: 14 }}>
            {files.length === 0 ? 'No files yet. Upload the first one.' : 'No files match your filters.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(file => {
              const qa = QA_COLORS[file.qa_status] ?? QA_COLORS.pending;
              return (
                <div
                  key={file.id}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  {/* Top row: icon + info */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, background: 'rgba(76,139,240,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, flexShrink: 0,
                    }}>
                      {file.content_type?.includes('pdf') ? '📄' : file.content_type?.includes('image') ? '🖼️' : file.filename?.match(/\.(rvt|dwg|dxf)$/i) ? '📐' : '📎'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{file.plan_name}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--sidebar-bg)', padding: '1px 7px', borderRadius: 10 }}>v{file.version}</span>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: qa.bg, color: qa.color, fontWeight: 500,
                        }}>{qa.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere', wordBreak: 'break-all' }}>
                        {file.filename} · {formatBytes(file.file_size)}
                      </div>
                      {(file.project_name || file.contact_name) && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          {file.project_name && <span style={{ fontSize: 11, background: 'rgba(76,139,240,0.12)', color: 'var(--accent)', padding: '1px 7px', borderRadius: 10 }}>📁 {file.project_name}</span>}
                          {file.contact_name && <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', padding: '1px 7px', borderRadius: 10 }}>👤 {file.contact_name}</span>}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {file.uploaded_by} · {formatDate(file.created_at)}
                      </div>
                      {file.qa_notes && (
                        <div style={{ fontSize: 12, color: '#f97316', marginTop: 4 }}>💬 {file.qa_notes}</div>
                      )}
                    </div>
                  </div>

                  {/* Actions row — full width on mobile */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => showHistory(file)}
                      title="Version history"
                      style={{
                        background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
                        color: 'var(--muted)', padding: '7px 12px', borderRadius: 6,
                        fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      🕒 History
                    </button>
                    {canQA && (
                      <button
                        onClick={() => { setQaModal(file); setQaStatus(file.qa_status); setQaNotes(file.qa_notes ?? ''); }}
                        title="Update QA status"
                        style={{
                          background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
                          color: 'var(--muted)', padding: '7px 12px', borderRadius: 6,
                          fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        ✅ QA
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(file)}
                      style={{
                        flex: 1, background: 'var(--accent)', border: 'none', color: '#fff',
                        padding: '7px 14px', borderRadius: 6, fontSize: 12,
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      ↓ Download
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {uploadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => !uploading && setUploadModal(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 16px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 18 }}>Upload File</div>

            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginBottom: 5 }}>Name <span style={{ fontWeight: 400 }}>(optional)</span></label>
            <input
              value={uploadPlanName}
              onChange={e => setUploadPlanName(e.target.value)}
              placeholder="e.g. Spring Mountain Structural Plans"
              disabled={uploading}
              style={{ width: '100%', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 10px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginBottom: 5 }}>Project</label>
                <input value={uploadProjectName} onChange={e => setUploadProjectName(e.target.value)} placeholder="e.g. Deer Valley Pass" disabled={uploading} style={{ width: '100%', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 10px', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginBottom: 5 }}>Contact</label>
                <input value={uploadContactName} onChange={e => setUploadContactName(e.target.value)} placeholder="e.g. John Smith" disabled={uploading} style={{ width: '100%', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 10px', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginBottom: 5 }}>File *</label>
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)', borderRadius: 8, padding: '20px 16px',
                textAlign: 'center', cursor: 'pointer', marginBottom: 20,
                background: uploadFile ? 'rgba(76,139,240,0.08)' : 'var(--sidebar-bg)',
              }}
            >
              {uploadFile ? (
                <div>
                  <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>📐 {uploadFile.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{formatBytes(uploadFile.size)}</div>
                </div>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>Click to select any file</div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
              accept="*"
            />

            {uploading && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  <span>Uploading…</span><span>{uploadProgress}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--sidebar-bg)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--accent)', width: `${uploadProgress}%`, transition: 'width 0.2s' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setUploadModal(false)} disabled={uploading} style={{ flex: 1, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '9px 0', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadFile}
                style={{
                  flex: 2, background: uploading || !uploadFile ? '#2a5299' : 'var(--accent)',
                  border: 'none', color: '#fff', padding: '9px 0', borderRadius: 7,
                  cursor: uploading || !uploadFile ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                {uploading ? `Uploading ${uploadProgress}%…` : 'Upload ↑'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QA Modal */}
      {qaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setQaModal(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 16px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>QA Status</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>{qaModal.plan_name} — v{qaModal.version}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {(['pending', 'approved', 'revision', 'rejected'] as QAStatus[]).map(s => {
                const q = QA_COLORS[s];
                return (
                  <button key={s} onClick={() => setQaStatus(s)} style={{
                    padding: '10px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: qaStatus === s ? `1.5px solid ${q.color}` : '1px solid var(--border)',
                    background: qaStatus === s ? q.bg : 'var(--sidebar-bg)',
                    color: qaStatus === s ? q.color : 'var(--muted)',
                  }}>{q.label}</button>
                );
              })}
            </div>

            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginBottom: 5 }}>Notes (optional)</label>
            <textarea
              value={qaNotes}
              onChange={e => setQaNotes(e.target.value)}
              placeholder="e.g. Fix the master bath window placement"
              rows={3}
              style={{ width: '100%', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 18 }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setQaModal(null)} style={{ flex: 1, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '9px 0', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={handleQaSave} disabled={savingQa} style={{ flex: 2, background: 'var(--accent)', border: 'none', color: '#fff', padding: '9px 0', borderRadius: 7, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {savingQa ? 'Saving…' : 'Save QA Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {historyFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setHistoryFile(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 460, maxWidth: '92vw', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>Version History</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>{historyFile.plan_name}</div>

            {history.map(h => {
              const qa = QA_COLORS[h.qa_status] ?? QA_COLORS.pending;
              return (
                <div key={h.id} style={{
                  border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px',
                  marginBottom: 10,
                  background: !h.archived ? 'rgba(76,139,240,0.06)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>v{h.version}</span>
                    {!h.archived && <span style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(76,139,240,0.15)', padding: '1px 7px', borderRadius: 10 }}>Current</span>}
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: qa.bg, color: qa.color }}>{qa.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{h.filename} · {formatBytes(h.file_size)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Uploaded by {h.uploaded_by} · {formatDate(h.created_at)}</div>
                  <button
                    onClick={() => handleDownload(h)}
                    style={{ marginTop: 8, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                  >
                    ↓ Download
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
