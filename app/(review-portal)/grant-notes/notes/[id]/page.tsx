'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type Block = { id: string; type: 'decision' | 'assumption' | 'settled' | 'sign_off'; text: string };
type Section = {
  section_key: string; section_num: string; title: string;
  content_html: string; prompt_text: string; blocks: Block[]; sort_order: number;
};
type SectionComment = {
  id: string; section_key: string; body: string;
  created_at: string; deleted_at: string | null;
  reviewer_id: string; reviewer_name: string;
};
type Ack = { section_key: string; reviewer_id: string; reviewer_name: string };
type Vote = { block_id: string; reviewer_id: string; position: string; reviewer_name: string };
type Vitals = {
  grant_amount?: string; duration?: string; beneficiaries?: string;
  staff_count?: string; geography?: string; grant_number?: string; dependency_pct?: number;
};
type Donor = { name: string; pct: number; label: string };
type Diagram = { key: string; title: string; definition: string };
type Note = {
  id: string; org_name: string; org_city: string; meeting: string; theme: string;
  grant_number: string; grant_amount: string; grant_duration: string;
  doc_type: string; draft_text: string; status: string; submitted_by: string;
  vitals?: Vitals; diagrams?: Diagram[];
  donor_breakdown?: Donor[];
};
type Reviewer = { id: string; name: string };

const DONOR_COLORS = ['#2F6B4A', '#4A8F6A', '#C8873A', '#5B8DB8', '#8B5B9E', '#B85B5B'];

const STATUS_LABEL: Record<string, string> = {
  designing: 'In Design',
  submitted: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [comments, setComments] = useState<SectionComment[]>([]);
  const [acks, setAcks] = useState<Ack[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [activeSection, setActiveSection] = useState('');

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [commentBusy, setCommentBusy] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);

  const [promptBubble, setPromptBubble] = useState<string | null>(null);
  const seenPrompts = useRef<Set<string>>(new Set());
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('reviewer');
    if (saved) { try { setReviewer(JSON.parse(saved)); } catch {} }
    fetch(`/api/review/review/grant-notes/${id}`).then(r => r.json()).then(d => {
      if (d.note) {
        setNote(d.note);
        if (Array.isArray(d.note.diagrams) && d.note.diagrams.length > 0) setDiagrams(d.note.diagrams);
      }
    });
    fetch(`/api/review/review/grant-notes/${id}/sections`).then(r => r.json()).then(d => setSections(d.sections || []));
    fetch(`/api/review/review/grant-notes/${id}/section-comments`).then(r => r.json()).then(d => setComments(d.comments || []));
    fetch(`/api/review/review/grant-notes/${id}/section-acks`).then(r => r.json()).then(d => setAcks(d.acks || []));
    fetch(`/api/review/review/grant-notes/${id}/section-votes`).then(r => r.json()).then(d => setVotes(d.votes || []));
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`/api/review/review/grant-notes/${id}/section-comments`).then(r => r.json()).then(d => {
        if (d.comments) setComments(d.comments);
      });
      fetch(`/api/review/review/grant-notes/${id}/section-acks`).then(r => r.json()).then(d => {
        if (d.acks) setAcks(d.acks);
      });
      fetch(`/api/review/review/grant-notes/${id}/section-votes`).then(r => r.json()).then(d => {
        if (d.votes) setVotes(d.votes);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (sections.length === 0) return;
    const sectionObs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0.2)
          setActiveSection((e.target as HTMLElement).id);
      }
    }, { threshold: 0.2 });

    const promptObs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        const prompt = el.dataset.prompt;
        if (!prompt || seenPrompts.current.has(prompt)) continue;
        seenPrompts.current.add(prompt);
        setPromptBubble(prompt);
        if (promptTimer.current) clearTimeout(promptTimer.current);
        promptTimer.current = setTimeout(() => setPromptBubble(null), 9000);
      }
    }, { threshold: 0.9 });

    document.querySelectorAll('.gn-section').forEach(el => sectionObs.observe(el));
    document.querySelectorAll('.gn-prompt-sentinel').forEach(el => promptObs.observe(el));

    return () => { sectionObs.disconnect(); promptObs.disconnect(); };
  }, [sections]);

  useEffect(() => {
    if (diagrams.length === 0) return;
    let cancelled = false;
    import('mermaid').then(({ default: mermaid }) => {
      if (cancelled) return;
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', fontFamily: 'Calibri, ui-sans-serif, sans-serif' });
      diagrams.forEach(d => {
        const el = document.getElementById(`mermaid-${d.key}`);
        if (!el || el.dataset.rendered) return;
        mermaid.render(`mermaid-svg-${d.key}`, d.definition)
          .then(({ svg }) => { if (!cancelled && el) { el.innerHTML = svg; el.dataset.rendered = '1'; } })
          .catch(() => { if (!cancelled && el) el.textContent = ''; });
      });
    });
    return () => { cancelled = true; };
  }, [diagrams]);

  const joinAs = async () => {
    if (!nameInput.trim()) return;
    setNameBusy(true);
    const res = await fetch('/api/review/review/reviewers', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    const d = await res.json();
    const r = { id: d.id, name: d.name };
    setReviewer(r);
    localStorage.setItem('reviewer', JSON.stringify(r));
    setNameBusy(false);
  };

  const postComment = async (sectionKey: string) => {
    const text = (commentInputs[sectionKey] || '').trim();
    if (!text || !reviewer || commentBusy) return;
    setCommentBusy(sectionKey);
    const res = await fetch(`/api/review/review/grant-notes/${id}/section-comments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewer_id: reviewer.id, section_key: sectionKey, text }),
    });
    const d = await res.json();
    if (d.comment) setComments(prev => [...prev, d.comment]);
    setCommentInputs(prev => ({ ...prev, [sectionKey]: '' }));
    setCommentBusy(null);
  };

  const deleteComment = async (commentId: string) => {
    if (!reviewer) return;
    await fetch(`/api/review/review/grant-notes/${id}/section-comments?comment_id=${commentId}&reviewer_id=${reviewer.id}`, { method: 'DELETE' });
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, deleted_at: new Date().toISOString() } : c));
  };

  const toggleAck = useCallback(async (sectionKey: string) => {
    if (!reviewer) return;
    const res = await fetch(`/api/review/review/grant-notes/${id}/section-acks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewer_id: reviewer.id, section_key: sectionKey }),
    });
    const d = await res.json();
    if (d.acked) {
      setAcks(prev => [...prev, { section_key: sectionKey, reviewer_id: reviewer.id, reviewer_name: reviewer.name }]);
    } else {
      setAcks(prev => prev.filter(a => !(a.section_key === sectionKey && a.reviewer_id === reviewer.id)));
    }
  }, [reviewer, id]);

  const vote = useCallback(async (blockId: string, position: string) => {
    if (!reviewer) return;
    const res = await fetch(`/api/review/review/grant-notes/${id}/section-votes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewer_id: reviewer.id, block_id: blockId, position }),
    });
    const d = await res.json();
    if (d.removed) {
      setVotes(prev => prev.filter(v => !(v.block_id === blockId && v.reviewer_id === reviewer.id)));
    } else {
      setVotes(prev => {
        const filtered = prev.filter(v => !(v.block_id === blockId && v.reviewer_id === reviewer.id));
        return [...filtered, { block_id: blockId, reviewer_id: reviewer.id, position: d.position, reviewer_name: reviewer.name }];
      });
    }
  }, [reviewer, id]);

  const setStatus = async (status: string) => {
    setStatusBusy(true);
    await fetch(`/api/review/review/grant-notes/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setNote(prev => prev ? { ...prev, status } : prev);
    setStatusBusy(false);
  };

  if (!reviewer) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-tag">Grant Note · Internal Review</div>
          <h1>{note?.org_name || 'Grant Note'}</h1>
          <p>Enter your name to join the review. Your comments, votes, and acknowledgements will be attributed to you.</p>
          <input type="text" placeholder="Your name" value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') joinAs(); }}
            autoFocus />
          <button onClick={joinAs} disabled={!nameInput.trim() || nameBusy}>
            {nameBusy ? 'Joining…' : 'Enter review'}
          </button>
        </div>
      </div>
    );
  }

  if (!note) return <div className="gn-loading">Loading…</div>;

  if (note.status === 'designing') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-tag">Grant Note · {note.org_name}</div>
          <h1>Not ready for review</h1>
          <p>The staff team is still designing this document. It will appear here once submitted for review.</p>
          <Link href="/grant-notes/notes" style={{ display: 'block', marginTop: 16, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>← All notes</Link>
        </div>
      </div>
    );
  }

  const ackedCount = reviewer
    ? sections.filter(s => acks.some(a => a.section_key === s.section_key && a.reviewer_id === reviewer.id)).length
    : 0;
  const pct = sections.length > 0 ? Math.round((ackedCount / sections.length) * 100) : 0;
  const totalComments = comments.filter(c => !c.deleted_at).length;

  return (
    <>
      {promptBubble && (
        <div className="prompt-bubble show" onClick={() => setPromptBubble(null)}>
          <div className="prompt-bubble-tag">
            <span>A question for you</span>
            <button className="prompt-bubble-close" onClick={e => { e.stopPropagation(); setPromptBubble(null); }}>×</button>
          </div>
          <p>{promptBubble}</p>
        </div>
      )}

      <div className="app">
        <aside className="sidebar">
          <div className="brand">{note.org_name}</div>
          <div className="brand-sub">
            {note.meeting}
            {note.doc_type === 'programme_design' ? ' · Programme Design' : note.grant_number ? ` · ${note.grant_number} grant` : ''}
            {note.grant_amount ? ` · ${note.grant_amount}` : ''}
          </div>

          <div className="you">
            <div>
              <div className="you-label">Reviewing as</div>
              <div className="you-name">{reviewer.name}</div>
            </div>
            <button className="you-change" onClick={() => { setReviewer(null); localStorage.removeItem('reviewer'); }}>Change</button>
          </div>

          <div className="live-indicator">
            <div className="live-dot" />
            Live · syncing
          </div>

          <div className="meta-block">
            <div><span>Comments</span><span>{totalComments}</span></div>
            <div><span>Sections reviewed</span><span>{ackedCount} / {sections.length}</span></div>
          </div>

          <div className="gn-sidebar-status">
            <span className={`status-badge status-${note.status}`}>{STATUS_LABEL[note.status] || note.status}</span>
            <div className="gn-sidebar-actions">
              <button className="gn-approve-btn" disabled={statusBusy || note.status === 'approved'}
                onClick={() => setStatus('approved')}>Approve</button>
              <button className="gn-reject-btn" disabled={statusBusy || note.status === 'rejected'}
                onClick={() => setStatus('rejected')}>Reject</button>
            </div>
          </div>

          <div className="nav-label">Sections</div>
          <ul className="nav">
            {sections.map(s => {
              const count = comments.filter(c => c.section_key === s.section_key && !c.deleted_at).length;
              return (
                <li key={s.section_key}>
                  <a href={`#${s.section_key}`} className={activeSection === s.section_key ? 'active' : ''}>
                    <span className="nav-item-label">
                      <span className="num">{s.section_num}.</span>
                      {s.title}
                    </span>
                    {count > 0 && <span className="badge">{count}</span>}
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="progress">
            <div className="progress-label">Your progress</div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
            <div className="progress-text">{ackedCount} of {sections.length} sections marked read</div>
          </div>

          <a href={`/api/review/grant-notes/${id}/export`} className="gn-sidebar-export" download>↓ Download Word</a>
          <Link href={`/review/notes/${id}/design`} className="gn-sidebar-export" style={{ marginTop: 6, opacity: 0.5 }}>Edit design →</Link>
        </aside>

        <main className="main">

          {/* Vitals block — shown when design path was used */}
          {note.vitals && Object.keys(note.vitals).length > 0 && (
            <div className="gn-vitals-block">
              <div className="gn-vitals-grid">
                {note.vitals.grant_amount && (
                  <div className="gn-vital-card">
                    <span className="gn-vital-val">{note.vitals.grant_amount}</span>
                    <span className="gn-vital-label">Grant amount</span>
                  </div>
                )}
                {note.vitals.duration && (
                  <div className="gn-vital-card">
                    <span className="gn-vital-val">{note.vitals.duration}</span>
                    <span className="gn-vital-label">Duration</span>
                  </div>
                )}
                {note.vitals.beneficiaries && (
                  <div className="gn-vital-card">
                    <span className="gn-vital-val">{note.vitals.beneficiaries}</span>
                    <span className="gn-vital-label">Beneficiaries</span>
                  </div>
                )}
                {note.vitals.staff_count && (
                  <div className="gn-vital-card">
                    <span className="gn-vital-val">{note.vitals.staff_count}</span>
                    <span className="gn-vital-label">Staff</span>
                  </div>
                )}
                {note.vitals.geography && (
                  <div className="gn-vital-card gn-vital-card-wide">
                    <span className="gn-vital-val">{note.vitals.geography}</span>
                    <span className="gn-vital-label">Geography</span>
                  </div>
                )}
                {note.vitals.dependency_pct != null && (
                  <div className="gn-vital-card gn-vital-card-dep">
                    <span className="gn-vital-val">{note.vitals.dependency_pct}%</span>
                    <span className="gn-vital-label">Budget dependency</span>
                    <div className="gn-dep-bar">
                      <div className="gn-dep-fill" style={{ width: `${Math.min(note.vitals.dependency_pct, 100)}%`,
                        background: note.vitals.dependency_pct > 50 ? 'var(--accent)' : 'var(--accent-2)' }} />
                    </div>
                  </div>
                )}
              </div>

              {Array.isArray(note.donor_breakdown) && note.donor_breakdown.length > 0 && (
                <div className="gn-donor-section">
                  <div className="gn-donor-label">Funding sources</div>
                  <div className="gn-donor-track">
                    {note.donor_breakdown.map((d, i) => (
                      <div key={d.name} className="gn-donor-segment" title={`${d.name}: ${d.label} (${d.pct}%)`}
                        style={{ width: `${d.pct}%`, background: DONOR_COLORS[i % DONOR_COLORS.length] }} />
                    ))}
                  </div>
                  <div className="gn-donor-legend">
                    {note.donor_breakdown.map((d, i) => (
                      <div key={d.name} className="gn-donor-item">
                        <span className="gn-donor-dot" style={{ background: DONOR_COLORS[i % DONOR_COLORS.length] }} />
                        <span className="gn-donor-name">{d.name}</span>
                        <span className="gn-donor-pct">{d.pct}%</span>
                        <span className="gn-donor-amt">{d.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mermaid diagrams */}
          {diagrams.map(d => (
            <div key={d.key} className="gn-diagram-block">
              <div className="gn-diagram-title">{d.title}</div>
              <div id={`mermaid-${d.key}`} className="gn-diagram-render" />
            </div>
          ))}

          {sections.length === 0 && (
            <div style={{ padding: '64px', color: 'var(--ink-3)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
              No visual sections yet. <Link href={`/review/notes/${id}/design`} style={{ color: 'var(--accent)' }}>Open design editor →</Link>
            </div>
          )}

          {sections.map(s => {
            const sComments = comments.filter(c => c.section_key === s.section_key && !c.deleted_at);
            const isAcked = reviewer ? acks.some(a => a.section_key === s.section_key && a.reviewer_id === reviewer.id) : false;
            const ackedNames = acks.filter(a => a.section_key === s.section_key).map(a => a.reviewer_name);
            const decisions = s.blocks.filter(b => b.type === 'decision');
            const assumptions = s.blocks.filter(b => b.type === 'assumption');
            const settled = s.blocks.filter(b => b.type === 'settled');
            const signOffs = s.blocks.filter(b => b.type === 'sign_off');

            return (
              <section key={s.section_key} id={s.section_key} className="s gn-section">
                <div className="section-header">
                  <div className="section-num">Section {s.section_num}</div>
                  <h2 className="section-title">{s.title}</h2>
                </div>

                {s.prompt_text && (
                  <span className="gn-prompt-sentinel prompt-sentinel" data-prompt={s.prompt_text} />
                )}

                <div className="gn-content" dangerouslySetInnerHTML={{ __html: s.content_html }} />

                {assumptions.map(b => (
                  <div key={b.id} className="callout assumption">
                    <div className="callout-tag">Assumption</div>
                    <p>{b.text}</p>
                  </div>
                ))}

                {settled.map(b => (
                  <div key={b.id} className="callout settled">
                    <div className="callout-tag">Settled</div>
                    <p>{b.text}</p>
                  </div>
                ))}

                {signOffs.map(b => (
                  <div key={b.id} className="callout sign-off">
                    <div className="callout-tag">Sign-off needed</div>
                    <p>{b.text}</p>
                  </div>
                ))}

                {decisions.map(b => {
                  const blockVotes = votes.filter(v => v.block_id === b.id);
                  const myVote = reviewer ? blockVotes.find(v => v.reviewer_id === reviewer.id)?.position : null;
                  const counts = {
                    agree: blockVotes.filter(v => v.position === 'agree').length,
                    discuss: blockVotes.filter(v => v.position === 'discuss').length,
                    disagree: blockVotes.filter(v => v.position === 'disagree').length,
                  };
                  return (
                    <div key={b.id} className="callout decision">
                      <div className="callout-tag">Decision required</div>
                      <p className="callout-title">{b.text}</p>
                      <div className="decision-vote" style={{ marginTop: 10, borderTop: 'none', padding: 0 }}>
                        {(['agree', 'discuss', 'disagree'] as const).map(pos => (
                          <button key={pos}
                            className={myVote === pos
                              ? pos === 'agree' ? 'active-agree' : pos === 'discuss' ? 'active-discuss' : 'active-disagree'
                              : ''}
                            onClick={() => vote(b.id, pos)}
                          >
                            {pos === 'agree' ? '✓ Agree' : pos === 'discuss' ? '⚑ Discuss' : '✗ Disagree'}
                            {counts[pos] > 0 && (
                              <span style={{ marginLeft: 6, opacity: 0.7 }}>{counts[pos]}</span>
                            )}
                          </button>
                        ))}
                        {blockVotes.length > 0 && (
                          <span className="decision-voters">
                            {blockVotes.map(v => v.reviewer_name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="ack-row">
                  <span className="ack-label">Mark this section as reviewed</span>
                  {ackedNames.filter(n => n !== reviewer?.name).length > 0 && (
                    <span className="others">
                      {ackedNames.filter(n => n !== reviewer?.name).length} other{ackedNames.filter(n => n !== reviewer?.name).length > 1 ? 's' : ''} reviewed
                    </span>
                  )}
                  <button className={`ack-btn${isAcked ? ' done' : ''}`} onClick={() => toggleAck(s.section_key)}>
                    {isAcked ? 'Reviewed' : 'Mark read'}
                  </button>
                </div>

                <div className="comment-box">
                  <div className="comment-box-head">
                    <span className="comment-box-title">Discussion</span>
                    <span className="comment-count">{sComments.length} {sComments.length === 1 ? 'comment' : 'comments'}</span>
                  </div>
                  <div className="comment-input-row">
                    <textarea className="comment-input"
                      placeholder="Considered comment, question, or concern…"
                      value={commentInputs[s.section_key] || ''}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [s.section_key]: e.target.value }))}
                    />
                    <button className="comment-submit"
                      onClick={() => postComment(s.section_key)}
                      disabled={commentBusy === s.section_key || !(commentInputs[s.section_key] || '').trim()}
                    >
                      {commentBusy === s.section_key ? 'Posting…' : 'Post'}
                    </button>
                  </div>
                  {sComments.length > 0 && (
                    <div className="comment-list">
                      {sComments.map(c => (
                        <div key={c.id} className={`comment-item${reviewer?.id === c.reviewer_id ? ' is-mine' : ''}`}>
                          <div className="meta">
                            <span className="author">{c.reviewer_name}</span>
                            <span>{new Date(c.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="body">{c.body}</div>
                          {reviewer?.id === c.reviewer_id && (
                            <div className="actions-row">
                              <button onClick={() => deleteComment(c.id)}>Delete</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </main>
      </div>
    </>
  );
}
