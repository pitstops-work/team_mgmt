'use client';
import { useState } from 'react';

export type Comment = {
  id: string;
  section_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  reviewer_id: string;
  reviewer_name: string;
  edit_count: number;
};

export type Reviewer = { id: string; name: string };

type Props = {
  comments: Comment[];
  reviewer: Reviewer | null;
  onPost: (body: string, parentId?: string) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onShowHistory: (id: string) => void;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

function CommentItem({
  c, reviewer, onPost, onEdit, onDelete, onShowHistory, replies, allComments,
}: {
  c: Comment;
  reviewer: Reviewer | null;
  onPost: (body: string, parentId?: string) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onShowHistory: (id: string) => void;
  replies: Comment[];
  allComments: Comment[];
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(c.body);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);

  const isMine = reviewer && c.reviewer_id === reviewer.id;
  const isDeleted = !!c.deleted_at;

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === c.body) { setEditing(false); return; }
    setBusy(true);
    try { await onEdit(c.id, trimmed); setEditing(false); }
    finally { setBusy(false); }
  };

  const sendReply = async () => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setBusy(true);
    try { await onPost(trimmed, c.id); setReplyText(''); setReplying(false); }
    finally { setBusy(false); }
  };

  return (
    <div className="comment-thread">
      <div className={`comment-item${isMine ? ' is-mine' : ''}${isDeleted ? ' deleted' : ''}`}>
        <div className="meta">
          <span className="author">{c.reviewer_name}</span>
          <span>{formatTime(c.created_at)}</span>
          {c.edit_count > 0 && !isDeleted && (
            <span className="edited-tag" onClick={() => onShowHistory(c.id)} title="View edit history">
              edited · {c.edit_count}{c.edit_count === 1 ? ' rev' : ' revs'}
            </span>
          )}
        </div>
        {editing ? (
          <div className="comment-edit-form">
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              autoFocus
            />
            <div className="row">
              <button onClick={() => { setEditing(false); setEditText(c.body); }}>Cancel</button>
              <button className="save" onClick={saveEdit} disabled={busy}>Save</button>
            </div>
          </div>
        ) : (
          <div className="body">
            {isDeleted ? '[deleted]' : c.body}
          </div>
        )}
        {!editing && !isDeleted && reviewer && (
          <div className="actions-row">
            <button onClick={() => setReplying(v => !v)}>{replying ? 'Cancel reply' : 'Reply'}</button>
            {isMine && <button onClick={() => setEditing(true)}>Edit</button>}
            {isMine && (
              <button onClick={() => {
                if (confirm('Delete this comment? It will show as deleted but the thread is preserved.')) {
                  onDelete(c.id);
                }
              }}>Delete</button>
            )}
          </div>
        )}
        {replying && (
          <div className="reply-form">
            <textarea
              placeholder={`Reply to ${c.reviewer_name}...`}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              autoFocus
            />
            <div className="row">
              <button onClick={() => { setReplying(false); setReplyText(''); }}>Cancel</button>
              <button className="post" onClick={sendReply} disabled={busy || !replyText.trim()}>Post reply</button>
            </div>
          </div>
        )}
      </div>
      {replies.length > 0 && (
        <div className="comment-replies">
          {replies.map(r => (
            <CommentItem
              key={r.id} c={r} reviewer={reviewer}
              onPost={onPost} onEdit={onEdit} onDelete={onDelete}
              onShowHistory={onShowHistory}
              replies={allComments.filter(x => x.parent_id === r.id)}
              allComments={allComments}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({ comments, reviewer, onPost, onEdit, onDelete, onShowHistory }: Props) {
  // Top-level comments (no parent), sorted by created_at
  const topLevel = comments.filter(c => !c.parent_id).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (topLevel.length === 0) {
    return <div style={{ padding: '12px 0', color: 'var(--ink-3)', fontSize: 13, fontStyle: 'italic' }}>No comments yet. Be the first to start the discussion.</div>;
  }

  return (
    <>
      {topLevel.map(c => (
        <CommentItem
          key={c.id} c={c} reviewer={reviewer}
          onPost={onPost} onEdit={onEdit} onDelete={onDelete}
          onShowHistory={onShowHistory}
          replies={comments.filter(x => x.parent_id === c.id).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )}
          allComments={comments}
        />
      ))}
    </>
  );
}
