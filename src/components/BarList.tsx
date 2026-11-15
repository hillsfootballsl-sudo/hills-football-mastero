/**
 * Horizontal bar list for counts (magnitude, single series). Bars share one hue; the
 * small dot beside each label carries the event type's identity colour, and values
 * stay in text ink. Each row has a native tooltip and the list doubles as a table.
 */
export interface BarDatum {
  key: string | number;
  label: string;
  value: number;
  dot?: string;
  hint?: string;
}

export default function BarList({ data, max, unit = '', onSelect }: { data: BarDatum[]; max?: number; unit?: string; onSelect?: (d: BarDatum) => void }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="muted small">No data yet.</p>;
  return (
    <table className="barlist">
      <tbody>
        {data.map((d) => (
          <tr key={d.key} title={`${d.label}: ${d.value}${unit}${d.hint ? ` · ${d.hint}` : ''}`} onClick={onSelect ? () => onSelect(d) : undefined} className={onSelect ? 'clickable' : ''}>
            <th scope="row">
              {d.dot && <span className="tag-dot" style={{ background: d.dot }} />}
              {d.label}
            </th>
            <td className="bar-cell">
              <div className="bar" style={{ width: `${(d.value / top) * 100}%` }} />
            </td>
            <td className="bar-val mono">
              {d.value}
              {unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
