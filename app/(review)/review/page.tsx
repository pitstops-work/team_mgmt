import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="home-page">
      <div className="home-hero">
        <div className="home-title">Review Portal</div>
        <div className="home-subtitle">Document drafting, editing, and leadership review</div>
      </div>

      <div className="home-grid">
        <Link href="/review/draft" className="home-card">
          <div className="home-card-icon">✦</div>
          <div className="home-card-title">Draft a note</div>
          <div className="home-card-desc">Upload org documents and generate a grant note or programme design with Claude. Submit for review when ready.</div>
        </Link>

        <Link href="/review/notes" className="home-card">
          <div className="home-card-icon">◎</div>
          <div className="home-card-title">Grant notes</div>
          <div className="home-card-desc">Review submitted grant notes. Comment, approve, or reject. Download as Word.</div>
        </Link>

        <Link href="/review/admin" className="home-card home-card-muted">
          <div className="home-card-icon">⚙</div>
          <div className="home-card-title">Admin</div>
          <div className="home-card-desc">Edit section content, manage reviewers, update the Claude rulebook.</div>
        </Link>
      </div>
    </div>
  );
}
