import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import Icon from '../components/Icon';
import { MatchCard } from './Matches';

const STEPS = [
  {
    n: 1,
    title: 'Starts with Structure',
    icon: 'camera',
    points: ['Record the full game or session', 'Upload footage or link YouTube', 'Tag key moments: goals, transitions, build-up, pressing'],
    cta: { to: '/matches/new', label: 'Add a match' },
  },
  {
    n: 2,
    title: 'Raw Footage Becomes Real Insight',
    icon: 'filter',
    points: ['Filter by player or event', 'Identify tactical patterns', 'Trim focused teaching clips in seconds'],
    cta: { to: '/clips', label: 'Review clips' },
  },
  {
    n: 3,
    title: 'Do Not Overwhelm, Educate.',
    icon: 'key',
    points: ['Show selected key moments', 'Connect clips to tactical objectives', 'Turn visuals into clear feedback'],
    cta: { to: '/presentations', label: 'Build a presentation' },
  },
];

export default function Home() {
  const counts = useLiveQuery(async () => ({
    matches: await db.matches.count(),
    events: await db.events.count(),
    clips: await db.clips.count(),
    presentations: await db.presentations.count(),
    players: await db.players.count(),
  }));
  const recent = useLiveQuery(() => db.matches.orderBy('createdAt').reverse().limit(3).toArray()) ?? [];

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="kicker">Hills Football Mastero</div>
          <h1 className="hero-title">
            <span>From Recording</span>
            <span>To Presentation</span>
          </h1>
          <p className="hero-sub">Turn match footage into powerful coaching insights. Record. Tag. Review. Present.</p>
          <div className="row wrap gap">
            <Link to="/record" className="btn primary lg">
              <Icon name="rec" size={14} /> Record
            </Link>
            <Link to="/matches/new" className="btn lg">
              <Icon name="upload" /> Upload / YouTube
            </Link>
            <Link to="/live" className="btn lg">
              <Icon name="zap" /> Live tag
            </Link>
          </div>
        </div>
        <div className="hero-flow" aria-hidden="true">
          {['Recording', 'Understanding', 'Real Development'].map((s, i) => (
            <div key={s} className="flow-step" style={{ marginLeft: i * 28 }}>
              <small>{i === 0 ? 'From' : 'To'}</small>
              {s}
            </div>
          ))}
        </div>
      </section>

      {counts && (
        <section className="stat-row">
          {[
            ['Matches', counts.matches, '/matches'],
            ['Tagged moments', counts.events, '/matches'],
            ['Teaching clips', counts.clips, '/clips'],
            ['Presentations', counts.presentations, '/presentations'],
            ['Players', counts.players, '/squad'],
          ].map(([label, n, to]) => (
            <Link key={label as string} to={to as string} className="stat">
              <div className="stat-n">{n as number}</div>
              <div className="stat-l">{label as string}</div>
            </Link>
          ))}
        </section>
      )}

      <section className="steps">
        {STEPS.map((s) => (
          <article key={s.n} className="step-card">
            <header>
              <span className="step-n">{s.n}.</span>
              <h2>{s.title}</h2>
            </header>
            <ul>
              {s.points.map((p) => (
                <li key={p}>
                  <Icon name="check" size={16} /> {p}
                </li>
              ))}
            </ul>
            <Link to={s.cta.to} className="btn ghost">
              {s.cta.label} <Icon name="right" size={16} />
            </Link>
          </article>
        ))}
      </section>

      <section>
        <div className="section-head">
          <h2>Recent matches</h2>
          <Link to="/matches" className="link">
            All matches <Icon name="right" size={14} />
          </Link>
        </div>
        {recent.length ? (
          <div className="grid cards">
            {recent.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <div className="callout">
            <Icon name="film" />
            <div>
              <b>No matches yet.</b> Record a game, upload a video file, paste a YouTube link, or start live tagging from the touchline.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
