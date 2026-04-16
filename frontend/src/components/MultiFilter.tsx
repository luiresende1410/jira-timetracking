import { useState, useRef, useEffect } from 'react';

interface Props {
  label: string;
  options: string[];
  excluded: Set<string>;
  onChange: (excluded: Set<string>) => void;
}

export default function MultiFilter({ label, options, excluded, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const activeCount = options.length - excluded.size;

  const toggle = (val: string) => {
    const next = new Set(excluded);
    if (next.has(val)) next.delete(val); else next.add(val);
    onChange(next);
  };

  const selectAll = () => onChange(new Set());
  const deselectAll = () => onChange(new Set(options));

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(!open)} style={{
        padding: '6px 14px', background: '#2a2a4a', color: excluded.size > 0 ? '#FF6B00' : '#aaa',
        border: '1px solid #3a3a5a', borderRadius: 6, cursor: 'pointer', fontFamily: 'Montserrat', fontSize: 12,
      }}>
        {label} {excluded.size > 0 ? `(${activeCount}/${options.length})` : `(${options.length})`}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
          background: '#16213e', border: '1px solid #3a3a5a', borderRadius: 8,
          minWidth: 260, maxHeight: 360, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid #2a2a4a' }}>
            <input
              type="text" placeholder="Buscar..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', background: '#0f3460', border: '1px solid #2a2a4a',
                borderRadius: 4, color: '#e0e0e0', fontFamily: 'Montserrat', fontSize: 12, outline: 'none',
              }}
            />
          </div>
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #2a2a4a', display: 'flex', gap: 8 }}>
            <button onClick={selectAll} style={{ background: 'none', border: 'none', color: '#4ECDC4', fontSize: 11, cursor: 'pointer', fontFamily: 'Montserrat' }}>Todos</button>
            <button onClick={deselectAll} style={{ background: 'none', border: 'none', color: '#FF6B6B', fontSize: 11, cursor: 'pointer', fontFamily: 'Montserrat' }}>Nenhum</button>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 260, padding: '4px 0' }}>
            {filtered.map(o => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 12, color: excluded.has(o) ? '#666' : '#ccc', textDecoration: excluded.has(o) ? 'line-through' : 'none' }}>
                <input type="checkbox" checked={!excluded.has(o)} onChange={() => toggle(o)} />
                {o}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
