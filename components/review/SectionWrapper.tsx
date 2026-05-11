'use client';
import { useState } from 'react';
import CommentThread, { Comment, Reviewer } from './CommentThread';
import { renderHtmlWithComponents } from '@/lib/review/renderContent';

type Props = {
  id: string;
  num: string;
  title: string;
  reviewer: Reviewer | null;
  comments: Comment[];
  notesForSection: any[];
  acksForSection: any[];
  onPostComment: (sectionId: string, body: string, parentId?: string) => Promise<void>;
  onEditComment: (id: string, body: string) => Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
  onShowHistory: (id: string) => void;
  onOpenNote: (sectionId: string, context: string) => void;
  onAck: (sectionId: string) => void;
  children?: React.ReactNode;
  contentHtml?: string;
  componentMap?: Record<string, React.ReactNode>;
  promptText?: string;
  specialAfter?: React.ReactNode;
};

export default function SectionWrapper({
  id, num, title, reviewer,
  comments, notesForSection, acksForSection,
  onPostComment, onEditComment, onDeleteComment, onShowHistory,
  onOpenNote, onAck,
  children, contentHtml, componentMap, promptText, specialAfter,
}: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const post = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    try { await onPostComment(id, trimmed); setText(''); }
    finally { setBusy(false); }
  };

  const visibleComments = comments;
  const myAck = !!(reviewer && acksForSection.find(a => a.reviewer_id === reviewer.id));
  const otherAcks = acksForSection.filter(a => !reviewer || a.reviewer_id !== reviewer.id);
  const myNote = reviewer && notesForSection.find(n => n.reviewer_id === reviewer.id);
  const allNotes = notesForSection;

  function renderContent() {
    if (!contentHtml) return children;
    if (componentMap) return renderHtmlWithComponents(contentHtml, componentMap);
    return <div className="db-content" dangerouslySetInnerHTML={{ __html: contentHtml }} />;
  }

  return (
    <section className="s" id={id} data-num={num} data-title={title}>
      <button
        className={`note-btn${myNote ? ' has-note' : ''}`}
        onClick={() => onOpenNote(id, `Section ${num} — ${title}`)}
      >
        {myNote ? '✎ note' : '+ note'}
      </button>

      <div className="section-header">
        <div className="section-num">Section {num}</div>
        <h2 className="section-title">{title}</h2>
      </div>

      {/* Prompt sentinel — picked up by IntersectionObserver on the main page */}
      {promptText && <span className="prompt-sentinel" data-prompt={promptText} />}

      {renderContent()}
      {specialAfter}

      {allNotes.length > 0 && (
        <div className="notes-strip has-notes">
          <div className="notes-strip-label">Quick notes from reviewers</div>
          {allNotes.map(n => (
            <div key={n.id} className="note-card">
              <div className="meta">{n.reviewer_name} · {new Date(n.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
              <div>{n.body}</div>
            </div>
          ))}
        </div>
      )}

      <div className="ack-row">
        <span className="ack-label">Mark this section as reviewed</span>
        {otherAcks.length > 0 && (
          <span className="others">{otherAcks.length} other{otherAcks.length > 1 ? 's' : ''} reviewed</span>
        )}
        <button className={`ack-btn${myAck ? ' done' : ''}`} onClick={() => onAck(id)} disabled={!reviewer}>
          {myAck ? 'Reviewed' : 'Mark read'}
        </button>
      </div>

      <div className="comment-box">
        <div className="comment-box-head">
          <span className="comment-box-title">Discussion</span>
          <span className="comment-count">{visibleComments.length} {visibleComments.length === 1 ? 'comment' : 'comments'}</span>
        </div>
        {reviewer && (
          <div className="comment-input-row">
            <textarea className="comment-input" placeholder="Considered comment, question, or suggestion..."
              value={text} onChange={e => setText(e.target.value)} />
            <button className="comment-submit" onClick={post} disabled={busy || !text.trim()}>Post</button>
          </div>
        )}
        <div className="comment-list">
          <CommentThread comments={visibleComments} reviewer={reviewer}
            onPost={async (body, parentId) => onPostComment(id, body, parentId)}
            onEdit={onEditComment} onDelete={onDeleteComment} onShowHistory={onShowHistory} />
        </div>
      </div>
    </section>
  );
}
