import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type Match } from '../db';
import Icon from '../components/Icon';
import { Empty, PageHead } from '../components/ui';
import { fmtDate } from '../lib/format';

export function sourceLabel(m: Match) {
  return m.source.kind === 'file' ? 'Video file' : m.source.kind === 'youtube' ? 'YouTube' : 'Live tags only';
}

export function MatchCard({ m }: { m: Match }) {
  const stats = useLiveQuery(async () => ({
    events: await db.events.where('matchId').equals(m.id).count(),
    clips: await db.clips.where('matchId').equals(m.id).count(),
  }), [m.id]);
  const thumb = m.source.kind === 'youtube' ? `https://i.ytimg.com/vi/${m.source.youtubeId}/mqdefault.jpg` : null;
  return (
    <Link to={`/matches/${m.id}`} className="match-card">
      <div className="match-thumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon name={m.source.kind === 'file' ? 'film' : 'zap'} size={30} />}
        <span className="pill">{sourceLabel(m)}</span>
      </div>
      <div className="match-body">
        <div className="match-title">{m.title}</div>
        <div className="muted small">
          {fmtDate(m.date)}
          {m.competition ? ` · ${m.competition}` : ''}
        </div>
        <div className="row gap-s small match-meta">
          {m.scoreFor !== undefined && m.scoreAgainst !== undefined && (
            <span className="score">
              {m.scoreFor}–{m.scoreAgainst}
            </span>
          )}
          <span>
            <Icon name="star" size={14} /> {stats?.events ?? 0} tags
          </span>
          <span>
            <Icon name="scissors" size={14} /> {stats?.clips ?? 0} clips
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Matches() {
  const [q, setQ] = useState('');
  const matches = useLiveQuery(() => db.matches.orderBy('date').reverse().toArray()) ?? [];
  const shown = matches.filter((m) => `${m.title} ${m.opponent} ${m.competition}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <PageHead title="Matches" kicker="Library">
        <Link to="/record" className="btn">
          <Icon name="rec" size={14} /> Record
        </Link>
        <Link to="/matches/new?mode=youtube" className="btn">
          <Icon name="youtube" /> YouTube
        </Link>
        <Link to="/matches/new" className="btn primary">
          <Icon name="upload" /> Upload video
        </Link>
      </PageHead>
      {matches.length > 0 && (
        <div className="search">
          <Icon name="search" size={18} />
          <input placeholder="Search matches" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {matches.length === 0 ? (
        <Empty icon="film" title="Your match library is empty">
          <p>Bring in footage any way you like:</p>
          <div className="row wrap gap center">
            <Link to="/record" className="btn">
              <Icon name="camera" /> Record in app
            </Link>
            <Link to="/matches/new" className="btn">
              <Icon name="upload" /> Upload file
            </Link>
            <Link to="/matches/new?mode=youtube" className="btn">
              <Icon name="youtube" /> YouTube link
            </Link>
            <Link to="/matches/new?mode=none&next=live" className="btn">
              <Icon name="zap" /> Live tag, add video later
            </Link>
          </div>
        </Empty>
      ) : (
        <div className="grid cards">
          {shown.map((m) => (
            <MatchCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
