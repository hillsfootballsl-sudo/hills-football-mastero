import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Presentation } from '../db';
import Icon from '../components/Icon';
import { Empty, PageHead } from '../components/ui';

export async function newPresentation(title = 'Team review'): Promise<number> {
  const now = Date.now();
  return (await db.presentations.add({ title, audience: 'Squad', summary: '', sections: [], createdAt: now, updatedAt: now } as unknown as Presentation)) as number;
}

export default function Presentations() {
  const nav = useNavigate();
  const list = useLiveQuery(() => db.presentations.orderBy('updatedAt').reverse().toArray()) ?? [];
  const create = async () => nav(`/presentations/${await newPresentation()}`);
  return (
    <div className="page">
      <PageHead title="Presentations" kicker="Step 3 · Educate">
        <button className="btn primary" onClick={create}>
          <Icon name="plus" /> New presentation
        </button>
      </PageHead>
      <div className="callout">
        <Icon name="key" />
        <div>
          <b>Do not overwhelm. Educate.</b> Pick a few key moments, group them under tactical objectives, and add one clear teaching point each.
        </div>
      </div>
      {list.length === 0 ? (
        <Empty icon="present" title="No presentations yet">
          <p>Build a team or unit meeting from your best clips.</p>
          <button className="btn primary" onClick={create}>
            Create your first presentation
          </button>
        </Empty>
      ) : (
        <div className="grid cards">
          {list.map((p) => {
            const n = p.sections.reduce((s, x) => s + x.items.length, 0);
            return (
              <div key={p.id} className="pres-card">
                <Link to={`/presentations/${p.id}`} className="pres-body">
                  <div className="kicker">{p.audience || 'Squad'}</div>
                  <h3>{p.title}</h3>
                  <ol className="pres-objs">
                    {p.sections.slice(0, 4).map((s) => (
                      <li key={s.id}>{s.objective}</li>
                    ))}
                  </ol>
                  <div className="muted small">
                    {p.sections.length} objective{p.sections.length === 1 ? '' : 's'} · {n} clip{n === 1 ? '' : 's'} · updated {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </Link>
                <Link to={`/presentations/${p.id}/present`} className={`btn primary sm ${n ? '' : 'disabled'}`}>
                  <Icon name="play" size={14} /> Present
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
