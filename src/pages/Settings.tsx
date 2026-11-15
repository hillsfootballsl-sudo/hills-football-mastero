import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_TAG_TYPES, type Player, type TagType } from '../db';
import Icon from '../components/Icon';
import { Modal, PageHead, toast } from '../components/ui';
import { useTagTypes } from '../lib/hooks';
import { fmtBytes, todayISO } from '../lib/format';
import { createBackup, restoreBackup } from '../lib/backup';
import { downloadBlob } from '../lib/exportClip';

const SAMPLE_SQUAD: [number, string, string][] = [
  [1, 'Goalkeeper One', 'GK'],
  [2, 'Right Back', 'RB'],
  [4, 'Centre Back A', 'CB'],
  [5, 'Centre Back B', 'CB'],
  [3, 'Left Back', 'LB'],
  [6, 'Holding Mid', 'DM'],
  [8, 'Box-to-Box Mid', 'CM'],
  [10, 'Playmaker', 'AM'],
  [7, 'Right Winger', 'RW'],
  [11, 'Left Winger', 'LW'],
  [9, 'Striker', 'ST'],
];

export default function Settings() {
  const tagTypes = useTagTypes();
  const [edit, setEdit] = useState<Partial<TagType> | null>(null);
  const [usage, setUsage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const counts = useLiveQuery(async () => ({ videos: await db.videos.count(), players: await db.players.count(), events: await db.events.count() }));

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setUsage({ usage: est?.usage, quota: est?.quota, persisted });
    })().catch(() => {});
  }, [busy]);

  const saveTag = async () => {
    if (!edit?.name?.trim()) return;
    const hk = edit.hotkey?.trim().toLowerCase().slice(0, 1) || undefined;
    if (hk && tagTypes.some((t) => t.hotkey === hk && t.id !== edit.id)) return toast(`Hotkey "${hk.toUpperCase()}" is already used`);
    if (hk && 'iod, .'.includes(hk)) return toast('That key is reserved for player controls');
    const row = { name: edit.name.trim(), color: edit.color ?? '#5eb8ff', hotkey: hk, category: edit.category ?? '', preRoll: edit.preRoll ?? 5, postRoll: edit.postRoll ?? 5 };
    if (edit.id) await db.tagTypes.update(edit.id, row);
    else await db.tagTypes.add({ ...row, order: tagTypes.length } as TagType);
    setEdit(null);
  };

  const move = async (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= tagTypes.length) return;
    await db.transaction('rw', db.tagTypes, async () => {
      await db.tagTypes.update(tagTypes[i].id, { order: j });
      await db.tagTypes.update(tagTypes[j].id, { order: i });
    });
  };

  const exportBackup = async (videos: boolean) => {
    setBusy('export');
    try {
      const blob = await createBackup(videos);
      downloadBlob(blob, `hills-mastero-backup-${todayISO()}${videos ? '-with-videos' : ''}.mastero`);
    } catch (e) {
      toast(String(e));
    }
    setBusy(null);
  };

  const importBackup = async (f: File) => {
    if (!confirm('Restoring replaces ALL data on this device with the backup. Continue?')) return;
    setBusy('import');
    try {
      const r = await restoreBackup(f);
      toast(`Restored ${r.matches} matches and ${r.videos} videos`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  return (
    <div className="page narrow-wide">
      <PageHead title="Settings" kicker="Hills Football Mastero" />

      <section className="panel">
        <div className="row between">
          <h3>Event tags</h3>
          <button className="btn sm primary" onClick={() => setEdit({ color: '#5eb8ff', preRoll: 5, postRoll: 5, category: '' })}>
            <Icon name="plus" size={14} /> New tag
          </button>
        </div>
        <p className="muted small">The buttons you tap while tagging. Pre/post-roll set how much video a clip made from the tag includes before and after the moment.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Category</th>
                <th>Key</th>
                <th className="num">Clip window</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tagTypes.map((t, i) => (
                <tr key={t.id}>
                  <td>
                    <span className="tag-dot" style={{ background: t.color }} /> {t.name}
                  </td>
                  <td className="muted">{t.category}</td>
                  <td>{t.hotkey && <kbd>{t.hotkey.toUpperCase()}</kbd>}</td>
                  <td className="num mono">
                    −{t.preRoll}s / +{t.postRoll}s
                  </td>
                  <td className="row-actions">
                    <button className="icon-btn sm" onClick={() => move(i, -1)} aria-label="Move up">
                      <Icon name="up" size={16} />
                    </button>
                    <button className="icon-btn sm" onClick={() => move(i, 1)} aria-label="Move down">
                      <Icon name="down" size={16} />
                    </button>
                    <button className="icon-btn sm" onClick={() => setEdit(t)} aria-label="Edit">
                      <Icon name="edit" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="btn sm ghost"
          onClick={async () => {
            const missing = DEFAULT_TAG_TYPES.filter((d) => !tagTypes.some((t) => t.name === d.name));
            if (!missing.length) return toast('All default tags are present');
            await db.tagTypes.bulkAdd(missing.map((m, i) => ({ ...m, hotkey: tagTypes.some((t) => t.hotkey === m.hotkey) ? undefined : m.hotkey, order: tagTypes.length + i }) as TagType));
            toast(`Restored ${missing.length} default tags`);
          }}
        >
          Restore default tags
        </button>
      </section>

      <section className="panel">
        <h3>Storage</h3>
        <p className="muted small">
          Everything (videos, tags, clips, presentations) is stored privately on this device. Nothing is uploaded.
        </p>
        <div className="row gap wrap">
          <div className="stat small">
            <div className="stat-n">{fmtBytes(usage.usage)}</div>
            <div className="stat-l">used of {fmtBytes(usage.quota)} available</div>
          </div>
          <div className="stat small">
            <div className="stat-n">{counts?.videos ?? 0}</div>
            <div className="stat-l">stored videos</div>
          </div>
          <div className="stat small">
            <div className="stat-n">{usage.persisted ? 'On' : 'Off'}</div>
            <div className="stat-l">protected from auto-cleanup</div>
          </div>
        </div>
        {!usage.persisted && (
          <button
            className="btn sm"
            onClick={async () => {
              const ok = await navigator.storage?.persist?.();
              toast(ok ? 'Storage protected' : 'The browser declined. Installing the app to your home screen usually helps.');
              setBusy(null);
              setUsage({ ...usage, persisted: !!ok });
            }}
          >
            Protect storage
          </button>
        )}
      </section>

      <section className="panel">
        <h3>Backup & restore</h3>
        <p className="muted small">Move your work to another device or keep a safe copy. Backups with videos can be very large.</p>
        <div className="row gap wrap">
          <button className="btn" disabled={!!busy} onClick={() => exportBackup(false)}>
            <Icon name="download" /> Backup data only
          </button>
          <button className="btn" disabled={!!busy} onClick={() => exportBackup(true)}>
            <Icon name="download" /> Backup with videos
          </button>
          <button className="btn" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Restore backup
          </button>
          <input ref={fileRef} type="file" accept=".mastero,application/octet-stream" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
        </div>
        {busy && <p className="muted small">{busy === 'export' ? 'Preparing backup…' : 'Restoring…'}</p>}
      </section>

      {counts && counts.players === 0 && (
        <section className="panel">
          <h3>Getting started</h3>
          <p className="muted small">Load a placeholder 11-player squad to try tagging. You can rename players in Squad.</p>
          <button
            className="btn sm"
            onClick={async () => {
              await db.players.bulkAdd(SAMPLE_SQUAD.map(([number, name, position], i) => ({ number, name, position, active: true, createdAt: Date.now() + i }) as Player));
              toast('Sample squad added');
            }}
          >
            Load sample squad
          </button>
        </section>
      )}

      <section className="panel">
        <h3>About</h3>
        <p className="muted small">
          Hills Football Mastero v1.0 · Record. Tag. Review. Present. Install it from your browser menu ("Add to Home screen" or "Install app") to use it full-screen and offline.
        </p>
      </section>

      {edit && (
        <Modal
          title={edit.id ? 'Edit tag' : 'New tag'}
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && (
                <button
                  className="btn danger"
                  onClick={async () => {
                    const n = await db.events.where('tagTypeId').equals(edit.id!).count();
                    if (!confirm(n ? `${n} tagged events use "${edit.name}". Delete the tag and those events?` : `Delete "${edit.name}"?`)) return;
                    await db.events.where('tagTypeId').equals(edit.id!).delete();
                    await db.tagTypes.delete(edit.id!);
                    setEdit(null);
                  }}
                >
                  <Icon name="trash" size={16} /> Delete
                </button>
              )}
              <button className="btn primary" onClick={saveTag} disabled={!edit.name?.trim()}>
                Save
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label>
              Name
              <input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
            </label>
            <label>
              Category
              <input value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="Attack, Transition…" />
            </label>
            <label>
              Colour
              <input type="color" value={edit.color ?? '#5eb8ff'} onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
            </label>
            <label>
              Keyboard key
              <input maxLength={1} value={edit.hotkey ?? ''} onChange={(e) => setEdit({ ...edit, hotkey: e.target.value })} placeholder="a–z" />
            </label>
            <label>
              Seconds before
              <input type="number" min={0} max={60} value={edit.preRoll ?? 5} onChange={(e) => setEdit({ ...edit, preRoll: Number(e.target.value) })} />
            </label>
            <label>
              Seconds after
              <input type="number" min={0} max={60} value={edit.postRoll ?? 5} onChange={(e) => setEdit({ ...edit, postRoll: Number(e.target.value) })} />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
