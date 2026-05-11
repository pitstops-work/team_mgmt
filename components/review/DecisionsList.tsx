'use client';
import { useState } from 'react';
import { DECISIONS } from './DocContent';

type Vote = {
  id: string;
  decision_num: number;
  position: 'agree' | 'discuss' | 'disagree';
  reviewer_id: string;
  reviewer_name: string;
};

export default function DecisionsList({
  votes,
  reviewerId,
  onVote,
}: {
  votes: Vote[];
  reviewerId: string | null;
  onVote: (decisionNum: number, position: 'agree' | 'discuss' | 'disagree') => void;
}) {
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());

  const toggle = (n: number) => {
    setOpenSet(s => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  return (
    <div className="decisions">
      {DECISIONS.map(d => {
        const dVotes = votes.filter(v => v.decision_num === d.n);
        const myVote = reviewerId ? dVotes.find(v => v.reviewer_id === reviewerId) : null;
        const tallies = {
          agree: dVotes.filter(v => v.position === 'agree').length,
          discuss: dVotes.filter(v => v.position === 'discuss').length,
          disagree: dVotes.filter(v => v.position === 'disagree').length,
        };
        const open = openSet.has(d.n);
        return (
          <div key={d.n} className={`decision-row${open ? ' open' : ''}`}>
            <div className="decision-head" onClick={() => toggle(d.n)}>
              <div>
                <span className="decision-num">D{String(d.n).padStart(2,'0')}</span>
                <span className="decision-title">{d.t}</span>
              </div>
              <div className="decision-tally">
                {tallies.agree > 0 && <span className="tally-pill agree">{tallies.agree} agree</span>}
                {tallies.discuss > 0 && <span className="tally-pill discuss">{tallies.discuss} discuss</span>}
                {tallies.disagree > 0 && <span className="tally-pill disagree">{tallies.disagree} disagree</span>}
              </div>
              <span className="decision-toggle">+</span>
            </div>
            <div className="decision-body">
              <div className="decision-body-inner">
                <div><h5>Recommended position</h5><div>{d.r}</div></div>
                <div><h5>Alternative views</h5><div>{d.a}</div></div>
                <div><h5>What changes if alternative</h5><div>{d.c}</div></div>
              </div>
              <div className="decision-vote">
                <span style={{ color: 'var(--ink-3)' }}>YOUR POSITION:</span>
                {(['agree', 'discuss', 'disagree'] as const).map(pos => (
                  <button
                    key={pos}
                    className={myVote?.position === pos ? `active-${pos}` : ''}
                    onClick={(e) => { e.stopPropagation(); onVote(d.n, pos); }}
                    disabled={!reviewerId}
                  >
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </button>
                ))}
                <span className="decision-voters">{dVotes.length} {dVotes.length === 1 ? 'vote' : 'votes'}</span>
              </div>
              {dVotes.length > 0 && (
                <div className="decision-voters-list">
                  {dVotes.map(v => (
                    <span key={v.id} className={`voter-chip ${v.position}`}>
                      <span className="pos-dot"></span>
                      {v.reviewer_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
