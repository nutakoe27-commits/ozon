import { useRef, useState } from 'react';
import { Move } from 'lucide-react';
import type { Zone } from './types';
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export function HotspotScene({
  image,
  point,
  onPoint,
  zone,
  onZone,
  editing = false,
}: {
  image?: string;
  point?: { x: number; y: number };
  onPoint?: (point: { x: number; y: number }) => void;
  zone?: Zone;
  onZone?: (zone: Zone) => void;
  editing?: boolean;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const [aspect, setAspect] = useState(5 / 3);
  function coordinates(e: React.PointerEvent) {
    const rect = scene.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    };
  }
  return (
    <div
      className={`hotspot-scene ${editing ? 'editing' : ''}`}
      ref={scene}
      style={{ aspectRatio: aspect }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = coordinates(e);
        if (editing) {
          anchor.current = p;
          onZone?.({ ...p, width: 3, height: 3 });
        } else {
          dragging.current = true;
          onPoint?.(p);
        }
      }}
      onPointerMove={(e) => {
        const p = coordinates(e);
        if (editing && anchor.current) {
          const a = anchor.current;
          onZone?.({
            x: Math.min(a.x, p.x),
            y: Math.min(a.y, p.y),
            width: Math.max(3, Math.abs(p.x - a.x)),
            height: Math.max(3, Math.abs(p.y - a.y)),
          });
        } else if (dragging.current) onPoint?.(p);
      }}
      onPointerUp={() => {
        anchor.current = null;
        dragging.current = false;
      }}
      onPointerCancel={() => {
        anchor.current = null;
        dragging.current = false;
      }}
    >
      <img
        draggable={false}
        src={image || '/assets/warehouse.svg'}
        alt="Рабочая сцена для задания по безопасности"
        onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        onError={(e) => {
          if (!e.currentTarget.src.endsWith('/assets/warehouse.svg'))
            e.currentTarget.src = '/assets/warehouse.svg';
        }}
      />
      {editing && zone && (
        <div
          className="target-zone"
          style={{
            left: `${zone.x}%`,
            top: `${zone.y}%`,
            width: `${zone.width}%`,
            height: `${zone.height}%`,
          }}
        >
          <span>Безопасная зона</span>
        </div>
      )}
      {!editing && point && (
        <button
          type="button"
          className="worker-marker"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          aria-label="Переместить работника. Используйте стрелки на клавиатуре или перетаскивание."
          aria-valuetext={`X ${Math.round(point.x)}, Y ${Math.round(point.y)}`}
          onKeyDown={(e) => {
            const keys: Record<string, [number, number]> = {
              ArrowLeft: [-2, 0],
              ArrowRight: [2, 0],
              ArrowUp: [0, -2],
              ArrowDown: [0, 2],
            };
            const delta = keys[e.key];
            if (delta) {
              e.preventDefault();
              onPoint?.({ x: clamp(point.x + delta[0]), y: clamp(point.y + delta[1]) });
            }
          }}
        >
          <svg viewBox="0 0 50 83" aria-hidden="true">
            <ellipse cx="25" cy="78" rx="22" ry="4" fill="#172c2733" />
            <path d="m17 48-3 27h9l3-24 3 24h9l-5-28" fill="#273e38" />
            <path
              d="M12 27 5 50l8 3 7-17h12l7 17 7-3-8-23"
              fill="#efb648"
              stroke="#243d32"
              strokeWidth="1.5"
            />
            <path d="M16 25h19v26H16z" fill="#d9ef79" stroke="#243d32" strokeWidth="1.5" />
            <path d="M19 28v19m12-19v19" stroke="white" strokeWidth="3" />
            <circle cx="25" cy="17" r="10" fill="#e1ac86" />
            <path
              d="M13 15c0-14 24-14 24 0v4H13z"
              fill="#f4c14e"
              stroke="#243d32"
              strokeWidth="1.5"
            />
            <path d="M10 20h30M25 5v10" stroke="#243d32" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span>
            <Move size={12} />
          </span>
        </button>
      )}
    </div>
  );
}
