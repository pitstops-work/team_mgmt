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
      fetch(`/api/review/review/grant-notes/${id}/sections`, {
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
    return fetch(`/api/review/review/grant-notes/${id}/sections`)
      .then(r => r.json())
      .then(d => {
        const loaded = d.sections || [];
        setSections(loaded);
        setSectionsLoaded(true);
        return loaded as Section[];
      });
  }, [id]);

  useEffect(() => {
    if (!authed) return;
    fetch(`/api/review/review/grant-notes/${id}`).then(r => r.json()).then(d => { if (d.note) setNote(d.note); });
    fetch(`/api/review/review/grant-notes/${id}/metadata`).then(r => r.json()).then(d => {
      if (Array.isArray(d.source_documents)) setSourceDocs(d.source_documents);
      if (d.vitals && typeof d.vitals === 'object') setVitals(d.vitals);
    });
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

  const runTransform = async () => {
    setTransforming(true);
    setTransformError('');
    try {
      const res = await fetch(`/api/review/review/grant-notes/${id}/transform`, { method: 'POST' });
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
    await fetch(`/api/review/review/grant-notes/${id}/sections`, {
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
    await fetch(`/api/review/review/grant-notes/${id}/sections`, {
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
      const res = await fetch(`/api/review/review/grant-notes/${id}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          section_key: activeKey,
          instruction: promptInstruction,
          current_html: prevHtml,
          include_context: promptContext,
        }),
      });
      const d = await res.json();
      if (d.content_html) {
        setPromptUndoStack(s => [...s.slice(-9), prevHtml]);
        editor.commands.setContent(d.content_html);
        setDirty(true);
      } else {
        setPromptError(d.error || 'No content returned');
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
      fetch(`/api/review/review/grant-notes/${id}/metadata`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vitals }),
      }),
      fetch(`/api/review/review/grant-notes/${id}`, {
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
    await fetch(`/api/review/review/grant-notes/${id}/metadata`, {
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
      await fetch(`/api/review/review/grant-notes/${id}/metadata`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source_documents: updated }),
      });
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
    await fetch(`/api/review/review/grant-notes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'submitted' }),
    });
    router.push(`/review/notes/${id}`);
  };

  const authSubmit = async () => {
    setPassBusy(true); setPassError('');
    const res = await fetch('/api/review/review/auth/staff', {
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
          <Link href="/review/notes" className="gn-back">← All notes</Link>
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

            <div className="gn-editor-sidebar-footer">
              <Link href="/review/draft" className="gn-editor-sidebar-link">Rulebook →</Link>
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
