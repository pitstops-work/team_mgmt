'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { upload } from '@vercel/blob/client';

function shortTrigger(t: string): string {
  switch (t) {
    case 'orchestrator_turn': return 'AI EDIT';
    case 'section_update': return 'EDIT';
    case 'section_create': return 'ADD';
    case 'section_reorder': return 'REORDER';
    case 'transform_visual': return 'INITIAL';
    case 'transform_refresh': return 'REFRESH';
    case 'transform_text': return 'TEXT';
    case 'note_created': return 'CREATED';
    case 'note_patch': return 'NOTE';
    case 'metadata_vitals': return 'VITALS';
    default: return t.toUpperCase();
  }
}
function triggerBadgeBg(t: string): string {
  if (t === 'orchestrator_turn') return '#1F4D3A';
  if (t.startsWith('transform_')) return '#B8500A';
  if (t === 'note_created') return '#444';
  return '#e8e6db';
}
function triggerBadgeFg(t: string): string {
  if (t === 'orchestrator_turn' || t.startsWith('transform_') || t === 'note_created') return '#fff';
  return '#555';
}

function toRoman(n: number): string {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) { while (n >= vals[i]) { r += syms[i]; n -= vals[i]; } }
  return r;
}

type Block = { id: string; type: 'decision' | 'assumption' | 'settled' | 'sign_off'; text: string };
type Section = {
  section_key: string; section_num: string; title: string;
  content_html: string; prompt_text: string; blocks: Block[]; sort_order: number;
};
type Note = {
  id: string; org_name: string; org_city: string; meeting: string;
  theme: string; grant_number: string; grant_amount: string; doc_type: string; status: string;
};
type Vitals = {
  grant_amount?: string; duration?: string; geography?: string;
  beneficiaries?: string; staff_count?: string;
};

export default function DesignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [authed, setAuthed] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  const [note, setNote] = useState<Note | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const [transformError, setTransformError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Source documents
  const [sourceDocs, setSourceDocs] = useState<string[]>([]);
  const [sourcesPanelOpen, setSourcesPanelOpen] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const sourceFileRef = useRef<HTMLInputElement>(null);

  // Active section for editing
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI prompt terminal
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptInstruction, setPromptInstruction] = useState('');
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState('');
  const [promptContext, setPromptContext] = useState(false);
  const [promptUndoStack, setPromptUndoStack] = useState<string[]>([]);

  // Vitals
  const [vitals, setVitals] = useState<Vitals>({});
  const [vitalsPanelOpen, setVitalsPanelOpen] = useState(false);
  const [vitalsDirty, setVitalsDirty] = useState(false);
  const [vitalsSaving, setVitalsSaving] = useState(false);

  // Scope (active capabilities) — phase 3.
  type CapMeta = { id: string; label: string; description: string; category: string };
  const [allCaps, setAllCaps] = useState<CapMeta[]>([]);
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [scopeLoaded, setScopeLoaded] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);

  // Version timeline — phase 4.
  type VersionRow = {
    id: string;
    version_number: number;
    instruction: string | null;
    scope_used: string[];
    capability_calls: Array<{ tool: string; summary: string }>;
    trigger: string;
    created_by: string;
    created_at: string;
  };
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(true);

  // Promotion candidate banner — phase 6.
  type PromotionHint = { normalized: string; count: number; sample_instruction: string; common_scope: string[] };
  const [promotionHint, setPromotionHint] = useState<PromotionHint | null>(null);

  const loadVersions = useCallback(() => {
    fetch(`/api/review/grant-notes/${id}/versions?limit=50`)
      .then(r => r.json())
      .then(d => setVersions(Array.isArray(d.versions) ? d.versions : []))
      .catch(() => {});
  }, [id]);

  // revertTo is declared further down — it depends on loadSections which is declared later.

  // Section reordering
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const reorderSections = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setSections(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(s => s.section_key === fromKey);
      const toIdx = arr.findIndex(s => s.section_key === toKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      const reindexed = arr.map((s, i) => ({ ...s, sort_order: i, section_num: toRoman(i + 1) }));
      fetch(`/api/review/grant-notes/${id}/sections`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: reindexed.map(s => ({ section_key: s.section_key, sort_order: s.sort_order, section_num: s.section_num })) }),
      });
      return reindexed;
    });
  }, [id]);

  // Block adding
  const [addingBlock, setAddingBlock] = useState(false);
  const [newBlockType, setNewBlockType] = useState<'decision' | 'assumption' | 'settled' | 'sign_off'>('decision');
  const [newBlockText, setNewBlockText] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: '',
    onUpdate: () => setDirty(true),
  });

  useEffect(() => {
    if (sessionStorage.getItem('staffAuthed') === 'true') setAuthed(true);
  }, []);

  const loadSections = useCallback(() => {
    return fetch(`/api/review/grant-notes/${id}/sections`)
      .then(r => r.json())
      .then(d => {
        const loaded = d.sections || [];
        setSections(loaded);
        setSectionsLoaded(true);
        return loaded as Section[];
      });
  }, [id]);

  const revertTo = useCallback(async (versionId: string, versionNumber: number) => {
    if (!confirm(`Revert document to v${versionNumber}? Current sections will be replaced with the v${versionNumber} snapshot. (A new version row records the revert.)`)) return;
    const createdBy = (typeof window !== 'undefined' && localStorage.getItem('staffName')) || 'staff';
    const res = await fetch(`/api/review/grant-notes/${id}/versions/${versionId}/revert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ created_by: createdBy }),
    });
    if (!res.ok) {
      alert('Revert failed — see server logs.');
      return;
    }
    await loadSections();
    loadVersions();
  }, [id, loadSections, loadVersions]);

  useEffect(() => {
    if (!authed) return;
    fetch(`/api/review/grant-notes/${id}`).then(r => r.json()).then(d => { if (d.note) setNote(d.note); });
    fetch(`/api/review/grant-notes/${id}/metadata`).then(r => r.json()).then(d => {
      if (Array.isArray(d.source_documents)) setSourceDocs(d.source_documents);
      if (d.vitals && typeof d.vitals === 'object') setVitals(d.vitals);
    });
    loadVersions();
    Promise.all([
      fetch(`/api/review/capabilities`).then(r => r.json()),
      fetch(`/api/review/grant-notes/${id}/scope`).then(r => r.json()),
    ]).then(([capsRes, scopeRes]) => {
      const caps: CapMeta[] = (capsRes.capabilities || []).map((c: any) => ({
        id: c.id, label: c.label, description: c.description, category: c.category,
      }));
      setAllCaps(caps);
      const ids: string[] = Array.isArray(scopeRes?.capability_ids) ? scopeRes.capability_ids : [];
      setScopeIds(ids);
      setScopeLoaded(true);
    }).catch(() => setScopeLoaded(true));
    loadSections().then(loaded => {
      if (loaded.length > 0) {
        const first = loaded[0];
        setActiveKey(first.section_key);
        setEditTitle(first.title);
        setEditPrompt(first.prompt_text || '');
      }
    });
  }, [id, authed, loadSections]);

  // Auto-transform ONLY when sections are confirmed empty after load
  useEffect(() => {
    if (!authed || !note || !sectionsLoaded || sections.length > 0 || transforming) return;
    runTransform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsLoaded, note, authed]);

  // Sync editor content when active section changes
  useEffect(() => {
    if (!editor || !activeKey) return;
    const s = sections.find(sec => sec.section_key === activeKey);
    if (s) {
      editor.commands.setContent(s.content_html || '<p></p>');
      setEditTitle(s.title || '');
      setEditPrompt(s.prompt_text || '');
      setDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, editor]);

  // Ctrl/Cmd+S to save
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveRef.current?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const persistScope = useCallback(async (ids: string[]) => {
    setScopeIds(ids);
    const updatedBy = (typeof window !== 'undefined' && localStorage.getItem('staffName')) || 'staff';
    await fetch(`/api/review/grant-notes/${id}/scope`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capability_ids: ids, updated_by: updatedBy }),
    }).catch(() => { /* best-effort */ });
  }, [id]);

  const dropScopeId = (capId: string) => persistScope(scopeIds.filter(x => x !== capId));
  const addScopeId = (capId: string) => {
    if (scopeIds.includes(capId)) return;
    persistScope([...scopeIds, capId]);
    setScopeMenuOpen(false);
  };
  const availableToAdd = allCaps.filter(c => !scopeIds.includes(c.id));

  const runTransform = async () => {
    setTransforming(true);
    setTransformError('');
    try {
      const res = await fetch(`/api/review/grant-notes/${id}/transform`, { method: 'POST' });
      if (!res.ok) {
        try { const d = await res.json(); setTransformError(d.error || 'Transform failed'); }
        catch { setTransformError(`Server error (${res.status}) — check logs`); }
        return;
      }
      const loaded = await loadSections();
      if (loaded.length > 0) {
        const first = loaded[0];
        setActiveKey(first.section_key);
        setEditTitle(first.title);
        setEditPrompt(first.prompt_text || '');
        editor?.commands.setContent(first.content_html || '<p></p>');
      }
    } catch (e: any) {
      setTransformError(e.message);
    } finally {
      setTransforming(false);
    }
  };

  const saveSection = useCallback(async () => {
    if (!activeKey || !editor || saving) return;
    setSaving(true);
    const html = editor.getHTML();
    await fetch(`/api/review/grant-notes/${id}/sections`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        section_key: activeKey,
        title: editTitle,
        content_html: html,
        prompt_text: editPrompt,
      }),
    });
    setSections(prev => prev.map(s => s.section_key === activeKey
      ? { ...s, title: editTitle, content_html: html, prompt_text: editPrompt }
      : s
    ));
    setDirty(false);
    setSaving(false);
  }, [activeKey, editor, editTitle, editPrompt, id, saving]);

  // Keep ref in sync for keyboard shortcut
  useEffect(() => { saveRef.current = saveSection; }, [saveSection]);

  const selectSection = async (key: string) => {
    if (key === activeKey) return;
    if (dirty) await saveSection();
    setActiveKey(key);
  };

  const saveBlocks = async (sectionKey: string, blocks: Block[]) => {
    await fetch(`/api/review/grant-notes/${id}/sections`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ section_key: sectionKey, blocks }),
    });
    setSections(prev => prev.map(s => s.section_key === sectionKey ? { ...s, blocks } : s));
  };

  const removeBlock = (sectionKey: string, blockId: string) => {
    const section = sections.find(s => s.section_key === sectionKey);
    if (!section) return;
    saveBlocks(sectionKey, section.blocks.filter(b => b.id !== blockId));
  };

  const addBlock = (sectionKey: string) => {
    const section = sections.find(s => s.section_key === sectionKey);
    if (!section || !newBlockText.trim()) return;
    const newId = `${newBlockType[0]}${Date.now()}`;
    saveBlocks(sectionKey, [...section.blocks, { id: newId, type: newBlockType, text: newBlockText.trim() }]);
    setNewBlockText('');
    setAddingBlock(false);
  };

  const applyPrompt = async () => {
    if (!activeKey || !editor || !promptInstruction.trim() || promptBusy) return;
    const prevHtml = editor.getHTML();
    setPromptBusy(true);
    setPromptError('');
    try {
      // Persist any local edits first so the orchestrator sees them.
      if (dirty) {
        await fetch(`/api/review/grant-notes/${id}/sections`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ section_key: activeKey, content_html: prevHtml }),
        });
      }

      // Phase 4: post directly to the orchestrator. Sticky scope governs;
      // we don't override scope from the terminal — that's what the chip bar
      // is for. For per-section edits we filter the orchestrator to this section.
      const res = await fetch(`/api/review/grant-notes/${id}/orchestrate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instruction: promptInstruction,
          section_filter: promptContext ? undefined : [activeKey],
          created_by: (typeof window !== 'undefined' && localStorage.getItem('staffName')) || 'staff',
        }),
      });
      const d = await res.json();

      if (d.clarification_request) {
        setPromptError(`AI needs clarification: ${d.clarification_request.message}`);
        return;
      }
      if (d.error) {
        setPromptError(d.error);
        return;
      }

      // Refetch sections to pick up the orchestrator's persisted changes.
      const loaded = await loadSections();
      const updated = loaded.find(s => s.section_key === activeKey);
      if (updated) {
        setPromptUndoStack(s => [...s.slice(-9), prevHtml]);
        editor.commands.setContent(updated.content_html || '<p></p>');
        setDirty(false);
      }

      // Refresh the version timeline.
      loadVersions();

      // Surface promotion candidate hint from the orchestrator response.
      if (d.promotion_candidate?.normalized) {
        setPromotionHint({
          normalized: d.promotion_candidate.normalized,
          count: d.promotion_candidate.count,
          sample_instruction: promptInstruction,
          common_scope: scopeIds,
        });
      }

      if (Array.isArray(d.lint_issues) && d.lint_issues.length > 0) {
        setPromptError(`Applied but with notes: ${d.lint_issues.join('; ')}`);
      }
    } catch (e: any) {
      setPromptError(e.message || 'Failed');
    } finally {
      setPromptBusy(false);
    }
  };

  const undoPrompt = () => {
    if (!editor || promptUndoStack.length === 0) return;
    const prev = promptUndoStack[promptUndoStack.length - 1];
    setPromptUndoStack(s => s.slice(0, -1));
    editor.commands.setContent(prev);
    setDirty(true);
  };

  const saveVitals = async () => {
    setVitalsSaving(true);
    await Promise.all([
      fetch(`/api/review/grant-notes/${id}/metadata`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vitals }),
      }),
      fetch(`/api/review/grant-notes/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_amount: vitals.grant_amount || null,
          grant_duration: vitals.duration || null,
        }),
      }),
    ]);
    if (vitals.grant_amount !== undefined) {
      setNote(prev => prev ? { ...prev, grant_amount: vitals.grant_amount! } : prev);
    }
    setVitalsDirty(false);
    setVitalsSaving(false);
  };

  const docName = (url: string) =>
    decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'document').replace(/^\d+-/, '');

  const removeSourceDoc = async (url: string) => {
    const updated = sourceDocs.filter(u => u !== url);
    setSourceDocs(updated);
    await fetch(`/api/review/grant-notes/${id}/metadata`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source_documents: updated }),
    });
  };

  const addSourceDocs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingDocs(true);
    setUploadError('');
    try {
      const newUrls = await Promise.all(Array.from(files).map(async file => {
        const blob = await upload(`${Date.now()}-${file.name}`, file, {
          access: 'public', handleUploadUrl: '/api/review/blob-upload',
        });
        return blob.url;
      }));
      const updated = [...sourceDocs, ...newUrls];
      setSourceDocs(updated);
      const patchRes = await fetch(`/api/review/grant-notes/${id}/metadata`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source_documents: updated }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      const toIngest: string[] = Array.isArray(patchData?.new_doc_urls) ? patchData.new_doc_urls : newUrls;
      if (toIngest.length > 0) {
        // Fire ingestion for RAG. Phase 0: kicked off here so the server function
        // has a live request to keep it alive on Vercel. We don't block on it.
        fetch('/api/review/ingest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ note_id: id, doc_urls: toIngest }),
        }).catch(() => { /* ingest is best-effort in phase 0 */ });
      }
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed');
    } finally {
      setUploadingDocs(false);
      if (sourceFileRef.current) sourceFileRef.current.value = '';
    }
  };

  const submitForReview = async () => {
    if (dirty) await saveSection();
    setSubmitting(true);
    await fetch(`/api/review/grant-notes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'submitted' }),
    });
    router.push(`/grant-notes/notes/${id}`);
  };

  const authSubmit = async () => {
    setPassBusy(true); setPassError('');
    const res = await fetch('/api/review/auth/staff', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: passInput }),
    });
    setPassBusy(false);
    if (res.ok) { sessionStorage.setItem('staffAuthed', 'true'); setAuthed(true); }
    else setPassError('Wrong passphrase');
  };

  if (!authed) {
    return (
      <div className="draft-gate">
        <div className="draft-gate-box">
          <div className="draft-gate-title">Staff Access</div>
          <div className="draft-gate-hint">Enter passphrase to continue</div>
          <input type="password" className="draft-gate-input" placeholder="Passphrase"
            value={passInput} onChange={e => setPassInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && authSubmit()} autoFocus />
          {passError && <div className="draft-gate-error">{passError}</div>}
          <button className="draft-gate-btn" onClick={authSubmit} disabled={passBusy || !passInput}>
            {passBusy ? 'Checking…' : 'Enter'}
          </button>
        </div>
      </div>
    );
  }

  const activeSection = sections.find(s => s.section_key === activeKey);

  return (
    <div className="gn-editor-app">

      {/* Top bar */}
      <div className="gn-editor-topbar">
        <div className="gn-editor-topbar-left">
          <Link href="/grant-notes/notes" className="gn-back">← All notes</Link>
          {note && (
            <span className="gn-editor-topbar-title">
              {note.org_name}{note.org_city ? `, ${note.org_city}` : ''} — Design
            </span>
          )}
        </div>
        <div className="gn-editor-topbar-right">
          {sections.length > 0 && !transforming && (
            <>
              <button className="gn-design-retransform" onClick={runTransform}
                title={sourceDocs.length > 0 ? 'Refreshes section content from updated source documents — preserves your titles, prompts and blocks' : 'Re-generates section structure from draft text'}>
                {sourceDocs.length > 0 ? 'Refresh content' : 'Re-transform'}
              </button>
              {note?.doc_type === 'grant_note' && (
                <a href={`/api/review/grant-notes/${id}/export`} className="gn-design-retransform" download>↓ Word</a>
              )}
            </>
          )}
          <button className="gn-design-submit-btn" onClick={submitForReview}
            disabled={submitting || sections.length === 0}>
            {submitting ? 'Submitting…' : 'Submit for review →'}
          </button>
        </div>
      </div>

      {/* Scope chip bar — sticky scope for this note (phase 3) */}
      {scopeLoaded && (
        <div className="gn-scope-bar" style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
          background: '#f8f7f2', borderBottom: '1px solid #e5e3da', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#555', letterSpacing: '0.3px' }}>SCOPE</span>
          {scopeIds.length === 0 && (
            <span style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>(empty — only editor primitives are active)</span>
          )}
          {scopeIds.map(id => {
            const meta = allCaps.find(c => c.id === id);
            return (
              <span key={id} title={meta?.description || id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#fff', border: '1px solid #d4d2c8', borderRadius: 12,
                padding: '2px 4px 2px 10px', fontSize: 12,
              }}>
                <span>{meta?.label || id}</span>
                <button
                  onClick={() => dropScopeId(id)}
                  title={`Remove ${meta?.label || id} from scope`}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: '#888', padding: '0 4px', fontSize: 14, lineHeight: 1,
                  }}
                >×</button>
              </span>
            );
          })}
          {availableToAdd.length > 0 && (
            <span style={{ position: 'relative' }}>
              <button
                onClick={() => setScopeMenuOpen(o => !o)}
                style={{
                  border: '1px dashed #b8b5a8', background: 'transparent',
                  borderRadius: 12, padding: '2px 10px', cursor: 'pointer',
                  fontSize: 12, color: '#555',
                }}
              >+ add</button>
              {scopeMenuOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
                  background: '#fff', border: '1px solid #d4d2c8', borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 280,
                }}>
                  {availableToAdd.map(c => (
                    <button
                      key={c.id}
                      onClick={() => addScopeId(c.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: '8px 12px', fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{c.label} <span style={{ color: '#888', fontWeight: 400 }}>· {c.category}</span></div>
                      <div style={{ color: '#666', fontSize: 11 }}>{c.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#888' }}>
            Sticky scope · used by the orchestrator when running prompt instructions
          </span>
        </div>
      )}

      {/* Promotion candidate banner — phase 6 */}
      {promotionHint && (
        <div style={{
          margin: '12px 16px', padding: '10px 14px', borderRadius: 6,
          background: '#fff8e0', border: '1px solid #e6d28a',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
        }}>
          <span style={{
            background: '#7a5a00', color: '#fff', padding: '2px 8px',
            borderRadius: 3, fontSize: 10, letterSpacing: '0.2px',
          }}>RECURRING</span>
          <span>
            You've asked <em>"{promotionHint.sample_instruction.length > 60
              ? promotionHint.sample_instruction.slice(0, 60) + '…'
              : promotionHint.sample_instruction}"</em> {promotionHint.count}× —
            consider promoting it to a rule.
          </span>
          <span style={{ flex: 1 }} />
          <a href="/grant-notes/admin/rulebook" target="_blank"
            style={{ color: '#7a5a00', fontWeight: 600, textDecoration: 'underline', fontSize: 12 }}>
            Open rulebook →
          </a>
          <button onClick={() => setPromotionHint(null)} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: '#7a5a00', fontSize: 16,
          }}>×</button>
        </div>
      )}

      {/* Transform/loading state */}
      {(transforming || (sectionsLoaded && sections.length === 0)) && (
        <div className="gn-design-empty">
          <div className={`gn-design-empty-icon${transforming ? ' gn-pulse' : ''}`}>◎</div>
          <div className="gn-design-empty-title">
            {transforming ? 'Transforming document…' : 'Preparing visual document'}
          </div>
          <div className="gn-design-empty-sub">
            {transforming
              ? 'Claude is structuring the draft into sections. This takes 30–60 seconds.'
              : 'Claude will generate sections, reviewer prompts, and decision points from your documents.'}
          </div>
          {transformError && <div className="gn-design-error">{transformError}</div>}
          {!transforming && (
            <button className="gn-design-transform-btn" onClick={runTransform}>Transform document</button>
          )}
        </div>
      )}

      {/* Two-panel editor */}
      {sections.length > 0 && (
        <div className="gn-editor-body">

          {/* Left: section navigator */}
          <aside className="gn-editor-sidebar">
            <div className="gn-editor-sidebar-label">Content Editor</div>
            {note && <div className="gn-editor-sidebar-doc">{note.org_name}</div>}
            <nav className="gn-editor-nav">
              {sections.map((s, idx) => (
                <div key={s.section_key}
                  draggable
                  className={`gn-editor-nav-item${s.section_key === activeKey ? ' active' : ''}${draggedKey === s.section_key ? ' dragging' : ''}${dragOverKey === s.section_key && dragOverKey !== draggedKey ? ' drag-over' : ''}`}
                  onClick={() => selectSection(s.section_key)}
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggedKey(s.section_key); }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(s.section_key); }}
                  onDrop={e => { e.preventDefault(); if (draggedKey) reorderSections(draggedKey, s.section_key); setDraggedKey(null); setDragOverKey(null); }}
                  onDragEnd={() => { setDraggedKey(null); setDragOverKey(null); }}
                >
                  <span className="gn-editor-nav-drag" title="Drag to reorder">⠿</span>
                  <span className="gn-editor-nav-num">{toRoman(idx + 1)}.</span>
                  <span className="gn-editor-nav-title">{s.title}</span>
                </div>
              ))}
            </nav>
            {/* Source documents panel */}
            <div className="gn-sources-panel">
              <button
                className="gn-sources-toggle"
                onClick={() => setSourcesPanelOpen(o => !o)}>
                <span>Source documents ({sourceDocs.length})</span>
                <span>{sourcesPanelOpen ? '▲' : '▼'}</span>
              </button>
              {sourcesPanelOpen && (
                <div className="gn-sources-body">
                  {sourceDocs.length === 0 && (
                    <div className="gn-sources-empty">No documents uploaded</div>
                  )}
                  {sourceDocs.map(url => (
                    <div key={url} className="gn-sources-item">
                      <span className="gn-sources-name" title={docName(url)}>{docName(url)}</span>
                      <button className="gn-sources-remove" onClick={() => removeSourceDoc(url)}
                        title="Remove document">×</button>
                    </div>
                  ))}
                  <input ref={sourceFileRef} type="file" multiple style={{ display: 'none' }}
                    accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.txt,.png,.jpg,.jpeg"
                    onChange={e => addSourceDocs(e.target.files)} />
                  <button
                    className="gn-sources-add"
                    onClick={() => sourceFileRef.current?.click()}
                    disabled={uploadingDocs}>
                    {uploadingDocs ? 'Uploading…' : '+ Add documents'}
                  </button>
                  {uploadError && <div className="gn-sources-error">{uploadError}</div>}
                  {sourceDocs.length > 0 && (
                    <div className="gn-sources-hint">
                      After updating, click Re-transform to refresh section content from the new documents.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Vitals panel */}
            <div className="gn-sources-panel">
              <button className="gn-sources-toggle" onClick={() => setVitalsPanelOpen(o => !o)}>
                <span>Vitals {vitalsDirty ? '●' : ''}</span>
                <span>{vitalsPanelOpen ? '▲' : '▼'}</span>
              </button>
              {vitalsPanelOpen && (
                <div className="gn-sources-body">
                  {([
                    { key: 'grant_amount', label: 'Grant amount', placeholder: '₹74.64L' },
                    { key: 'duration', label: 'Duration', placeholder: '1 year' },
                    { key: 'geography', label: 'Geography', placeholder: 'Bangalore, Whitefield…' },
                    { key: 'beneficiaries', label: 'Beneficiaries', placeholder: '1,000 young people' },
                    { key: 'staff_count', label: 'Staff', placeholder: '12 FTE' },
                  ] as { key: keyof Vitals; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                    <div key={key} className="gn-vital-field">
                      <div className="gn-vital-field-label">{label}</div>
                      <input
                        className="gn-vital-field-input"
                        value={vitals[key] || ''}
                        placeholder={placeholder}
                        onChange={e => { setVitals(v => ({ ...v, [key]: e.target.value })); setVitalsDirty(true); }}
                      />
                    </div>
                  ))}
                  <button className="gn-sources-add" onClick={saveVitals}
                    disabled={vitalsSaving || !vitalsDirty}>
                    {vitalsSaving ? 'Saving…' : 'Save vitals'}
                  </button>
                  <div className="gn-sources-hint">
                    Vitals appear as tiles at the top of the review page.
                  </div>
                </div>
              )}
            </div>

            {/* Version timeline — phase 4 */}
            <div className="gn-sources-panel">
              <button className="gn-sources-toggle" onClick={() => setVersionsOpen(o => !o)}>
                <span>History {versions.length > 0 ? `(${versions.length})` : ''}</span>
                <span>{versionsOpen ? '▲' : '▼'}</span>
              </button>
              {versionsOpen && (
                <div className="gn-sources-body" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {versions.length === 0 && (
                    <div className="gn-sources-hint">No versions yet. Each AI turn or edit creates a new version.</div>
                  )}
                  {versions.map(v => (
                    <div key={v.id} style={{
                      borderLeft: '2px solid #d4d2c8', paddingLeft: 10, marginBottom: 10,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <strong style={{ fontSize: 12 }}>v{v.version_number}</strong>
                        <span style={{ fontSize: 10, color: '#999' }}>
                          {new Date(v.created_at).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                        <span style={{
                          background: triggerBadgeBg(v.trigger), color: triggerBadgeFg(v.trigger),
                          padding: '1px 6px', borderRadius: 3, fontSize: 10, letterSpacing: '0.2px',
                        }}>{shortTrigger(v.trigger)}</span>
                        {v.created_by && v.created_by !== 'system' && (
                          <span style={{ marginLeft: 6 }}>· {v.created_by}</span>
                        )}
                      </div>
                      {v.instruction && (
                        <div style={{ fontSize: 12, color: '#333', marginTop: 4, fontStyle: 'italic' }}>
                          "{v.instruction.length > 100 ? v.instruction.slice(0, 100) + '…' : v.instruction}"
                        </div>
                      )}
                      {v.scope_used.length > 0 && (
                        <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                          scope: {v.scope_used.join(', ')}
                        </div>
                      )}
                      {v.capability_calls.length > 0 && (
                        <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                          {v.capability_calls.slice(0, 3).map((c, i) => (
                            <div key={i}>· {c.summary}</div>
                          ))}
                          {v.capability_calls.length > 3 && (
                            <div style={{ color: '#999' }}>… +{v.capability_calls.length - 3} more</div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => revertTo(v.id, v.version_number)}
                        title={`Restore the document to v${v.version_number}`}
                        style={{
                          marginTop: 6, border: '1px solid #c8c4b4', background: '#fff',
                          color: '#444', padding: '2px 8px', borderRadius: 3,
                          cursor: 'pointer', fontSize: 11,
                        }}
                      >↩ Revert to v{v.version_number}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="gn-editor-sidebar-footer">
              <Link href="/grant-notes/draft" className="gn-editor-sidebar-link">Rulebook →</Link>
            </div>
          </aside>

          {/* Right: editor */}
          <main className="gn-editor-main">
            {activeSection && (
              <div className="gn-editor-area">

                {/* Section header */}
                <div className="gn-editor-section-header">
                  <div className="gn-editor-section-num">Section {activeSection.section_num}</div>
                  <input className="gn-editor-title-input"
                    value={editTitle}
                    onChange={e => { setEditTitle(e.target.value); setDirty(true); }}
                    placeholder="Section title" />
                  {dirty && <span className="gn-editor-dirty">●</span>}
                </div>

                {/* Toolbar */}
                <div className="gn-editor-toolbar">
                  <button className={`gn-tb-btn${editor?.isActive('bold') ? ' on' : ''}`}
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
                    title="Bold (Ctrl+B)">B</button>
                  <button className={`gn-tb-btn gn-tb-italic${editor?.isActive('italic') ? ' on' : ''}`}
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
                    title="Italic (Ctrl+I)">I</button>
                  <div className="gn-tb-divider" />
                  <button className={`gn-tb-btn${editor?.isActive('heading', { level: 2 }) ? ' on' : ''}`}
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 2 }).run(); }}>H2</button>
                  <button className={`gn-tb-btn${editor?.isActive('heading', { level: 3 }) ? ' on' : ''}`}
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 3 }).run(); }}>H3</button>
                  <div className="gn-tb-divider" />
                  <button className={`gn-tb-btn${editor?.isActive('bulletList') ? ' on' : ''}`}
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
                    title="Bullet list">• List</button>
                  <button className={`gn-tb-btn${editor?.isActive('orderedList') ? ' on' : ''}`}
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }}
                    title="Ordered list">1. List</button>
                  <div className="gn-tb-divider" />
                  <button className="gn-tb-btn"
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }}
                    title="Insert table">Table</button>
                </div>

                {/* TipTap editor */}
                <EditorContent editor={editor} className="gn-tiptap-editor" />

                {/* Reader prompt */}
                <div className="gn-editor-prompt-row">
                  <div className="gn-editor-prompt-label">
                    Reader prompt — bubble that pops up when this section scrolls into view
                  </div>
                  <input className="gn-editor-prompt-input"
                    value={editPrompt}
                    onChange={e => { setEditPrompt(e.target.value); setDirty(true); }}
                    placeholder="Leave empty for no reader prompt" />
                </div>

                {/* AI Prompt Terminal */}
                <div className="gn-prompt-terminal">
                  <button className="gn-prompt-terminal-toggle" onClick={() => setPromptOpen(o => !o)}>
                    <span>AI prompt</span>
                    <span>{promptOpen ? '▲' : '▼'}</span>
                  </button>
                  {promptOpen && (
                    <div className="gn-prompt-terminal-body">
                      <textarea
                        className="gn-prompt-textarea"
                        placeholder="Give an instruction to revise this section… e.g. &quot;Make this more concise&quot;, &quot;Add a risk about staffing capacity&quot;, &quot;Rewrite the opening paragraph&quot;"
                        value={promptInstruction}
                        onChange={e => setPromptInstruction(e.target.value)}
                        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') applyPrompt(); }}
                        rows={3}
                      />
                      <div className="gn-prompt-actions">
                        <button
                          className="gn-prompt-apply-btn"
                          onClick={applyPrompt}
                          disabled={promptBusy || !promptInstruction.trim()}>
                          {promptBusy ? 'Revising…' : 'Apply'}
                        </button>
                        {promptUndoStack.length > 0 && (
                          <button className="gn-prompt-undo-btn" onClick={undoPrompt}
                            title="Undo last AI change (Ctrl+Z)">
                            ↩ Undo
                          </button>
                        )}
                        <button
                          className={`gn-prompt-context-toggle${promptContext ? ' on' : ''}`}
                          onClick={() => setPromptContext(o => !o)}
                          title={promptContext ? 'Document context on — Claude can see all other sections' : 'Document context off — Claude only sees this section'}>
                          {promptContext ? '⊕ doc context' : '⊕ doc context'}
                        </button>
                        {promptBusy && <span className="gn-prompt-hint">{promptContext ? 'Reading document…' : 'Revising…'}</span>}
                        {promptError && <span className="gn-prompt-error">{promptError}</span>}
                      </div>
                      <div className="gn-prompt-cost-note">
                        {promptContext ? '~₹1.50 per call (doc context on)' : '~₹0.80–1.20 per call'} · Ctrl+Enter to apply
                      </div>
                    </div>
                  )}
                </div>

                {/* Decision / Assumption / Settled blocks */}
                <div className="gn-editor-blocks-section">
                  {activeSection.blocks.length > 0 && (
                    <div className="gn-design-blocks">
                      {activeSection.blocks.map(b => (
                        <div key={b.id} className={`gn-design-block gn-design-block-${b.type}`}>
                          <span className="gn-design-block-tag">
                            {b.type === 'decision' ? 'Decision' : b.type === 'settled' ? 'Settled' : b.type === 'sign_off' ? 'Sign-off needed' : 'Assumption'}
                          </span>
                          <span className="gn-design-block-text">{b.text}</span>
                          <button className="gn-design-block-remove"
                            onClick={() => removeBlock(activeSection.section_key, b.id)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {addingBlock ? (
                    <div className="gn-design-add-block-form">
                      <div className="gn-design-block-type-row">
                        {(['decision', 'assumption', 'settled', 'sign_off'] as const).map(t => (
                          <button key={t}
                            className={`gn-block-type-btn${newBlockType === t ? ' active' : ''}`}
                            onClick={() => setNewBlockType(t)}>
                            {t === 'sign_off' ? 'Sign-off needed' : t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>
                      <input className="gn-design-block-input"
                        placeholder="20-35 words describing the decision, assumption, or settled position…"
                        value={newBlockText} onChange={e => setNewBlockText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addBlock(activeSection.section_key)}
                        autoFocus />
                      <div className="gn-design-block-actions">
                        <button className="gn-btn-primary"
                          onClick={() => addBlock(activeSection.section_key)}
                          disabled={!newBlockText.trim()}>Add</button>
                        <button className="gn-btn-ghost"
                          onClick={() => { setAddingBlock(false); setNewBlockText(''); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="gn-design-add-block-btn"
                      onClick={() => { setAddingBlock(true); setNewBlockType('decision'); setNewBlockText(''); }}>
                      + Add decision, assumption, or settled block
                    </button>
                  )}
                </div>

                {/* Save row */}
                <div className="gn-editor-save-row">
                  <button className="gn-editor-save-btn" onClick={saveSection} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <span className="gn-editor-save-hint">
                    Ctrl+B bold · Ctrl+I italic · Ctrl+S save
                  </span>
                </div>

              </div>
            )}
          </main>

        </div>
      )}
    </div>
  );
}
