import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoreVertical, Pencil, Archive, Trash2, Flame, Zap } from 'lucide-react';
import { toast } from 'sonner';

import {
  api,
  Habit,
  HabitFrequency,
  HabitLevelInfo,
  HabitLifeArea,
  HabitLog,
  HabitRadarStats,
  HabitTodayStat,
  HabitType,
  RecurrenceDay,
} from '../api';
import {
  EmptyState,
  PremiumCard,
  PremiumHeader,
  PremiumPage,
  SkeletonBlock,
} from '../components/premium-ui';
import { localDateKey } from '../utils/date';

// ─── constants ────────────────────────────────────────────────────────────────

const LIFE_AREAS = [
  { key: 'corpo' as HabitLifeArea, label: 'Corpo', emoji: '💪', color: '#e07c4a' },
  { key: 'mente' as HabitLifeArea, label: 'Mente', emoji: '🧠', color: '#818cf8' },
  { key: 'trabalho' as HabitLifeArea, label: 'Trabalho', emoji: '💼', color: '#5bb98c' },
  { key: 'relacoes' as HabitLifeArea, label: 'Relações', emoji: '❤️', color: '#d46464' },
  { key: 'financas' as HabitLifeArea, label: 'Finanças', emoji: '💰', color: '#d4a843' },
  { key: 'crescimento' as HabitLifeArea, label: 'Crescimento', emoji: '🌱', color: '#7dd3fc' },
] as const;

const AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.key, a])) as Record<
  HabitLifeArea,
  (typeof LIFE_AREAS)[number]
>;

const RADAR_AREAS: HabitLifeArea[] = ['corpo', 'mente', 'financas', 'crescimento', 'relacoes', 'trabalho'];

const ALL_DAYS: RecurrenceDay[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const DAY_LABELS: Record<RecurrenceDay, string> = {
  seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom',
};

const FREQ_OPTIONS: Array<{ key: HabitFrequency; label: string; icon: string }> = [
  { key: 'daily', label: 'Diário', icon: '🗓' },
  { key: 'weekly', label: 'Semanal', icon: '📅' },
  { key: 'monthly', label: 'Mensal', icon: '📆' },
  { key: 'specific_days', label: 'Dias específicos', icon: '📌' },
];

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

// ─── HabitRadarCompact ────────────────────────────────────────────────────────

const R_SIZE = 140;
const R_CENTER = R_SIZE / 2;
const R_MAX = 50;

function polarToXY(angle: number, radius: number, cx = R_CENTER, cy = R_CENTER) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function levelToR(level: number) { return (level / 10) * R_MAX; }

interface HabitRadarCompactProps {
  stats: HabitRadarStats | null;
  hoveredArea: HabitLifeArea | null;
  onHover: (area: HabitLifeArea | null) => void;
}

function HabitRadarCompact({ stats, hoveredArea, onHover }: HabitRadarCompactProps) {
  const angles = RADAR_AREAS.map((_, i) => (Math.PI * (270 + 60 * i)) / 180);
  const gridLevels = [3, 6, 10];

  const areaLevels = RADAR_AREAS.map((area) => stats?.[area]?.level ?? 1);
  const filledPoints = areaLevels.map((lvl, i) => {
    const r = levelToR(lvl);
    const { x, y } = polarToXY(angles[i], r);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg
      viewBox={`0 0 ${R_SIZE} ${R_SIZE}`}
      width={R_SIZE}
      height={R_SIZE}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <radialGradient id="r-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(224,124,74,0.4)" />
          <stop offset="100%" stopColor="rgba(129,140,248,0.15)" />
        </radialGradient>
        <filter id="r-glow">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Grid */}
      {gridLevels.map((gl) => (
        <polygon
          key={gl}
          points={angles.map((a) => { const { x, y } = polarToXY(a, levelToR(gl)); return `${x},${y}`; }).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={1}
        />
      ))}

      {/* Axes */}
      {angles.map((angle, i) => {
        const outer = polarToXY(angle, R_MAX);
        return <line key={i} x1={R_CENTER} y1={R_CENTER} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />;
      })}

      {/* Fill */}
      <polygon points={filledPoints} fill="url(#r-grad)" stroke="none" />
      <polygon points={filledPoints} fill="none" stroke="rgba(224,124,74,0.6)" strokeWidth={1.5} filter="url(#r-glow)" />

      {/* Dots + hover hit areas */}
      {RADAR_AREAS.map((area, i) => {
        const lvl = stats?.[area]?.level ?? 1;
        const { x, y } = polarToXY(angles[i], levelToR(lvl));
        const isHovered = hoveredArea === area;

        // Wedge hit area between adjacent midpoint angles
        const prev = angles[(i - 1 + 6) % 6];
        const next = angles[(i + 1) % 6];
        const midP = (angles[i] + prev) / 2;
        const midN = (angles[i] + next) / 2;
        const hitR = R_MAX + 18;
        const p0 = polarToXY(midP, hitR);
        const p1 = polarToXY(angles[i], hitR);
        const p2 = polarToXY(midN, hitR);
        const hitPts = `${R_CENTER},${R_CENTER} ${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`;

        return (
          <g key={area}>
            <polygon
              points={hitPts}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHover(area)}
              onMouseLeave={() => onHover(null)}
            />
            <circle
              cx={x} cy={y} r={isHovered ? 5 : 3}
              fill={AREA_MAP[area].color}
              stroke={isHovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)'}
              strokeWidth={isHovered ? 1.5 : 1}
              filter={isHovered ? 'url(#r-glow)' : undefined}
              style={{ transition: 'all 0.15s' }}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ─── AreaLevelCard ─────────────────────────────────────────────────────────────

interface AreaLevelCardProps {
  area: (typeof LIFE_AREAS)[number];
  info: HabitLevelInfo | null;
  hovered: boolean;
  onHover: (v: boolean) => void;
}

function AreaLevelCard({ area, info, hovered, onHover }: AreaLevelCardProps) {
  const level = info?.level ?? 1;
  const pct = info?.progressPct ?? 0;
  const xpLeft = info && info.nextLevelXp !== null ? info.nextLevelXp - info.totalXp : null;

  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px solid ${hovered ? area.color + '55' : 'var(--border)'}`,
        background: hovered ? `${area.color}0d` : 'var(--surface)',
        transition: 'all 0.18s',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: hovered ? area.color : 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {area.emoji} {area.label}
        </span>
        <span style={{
          fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99,
          background: `${area.color}22`, color: area.color,
        }}>
          Nv.{level}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99, background: area.color,
          width: `${pct}%`, transition: 'width 0.5s ease',
          boxShadow: hovered ? `0 0 6px ${area.color}` : 'none',
        }} />
      </div>
      {hovered && (
        <div style={{ fontSize: '0.67rem', color: 'var(--muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>{info?.totalXp ?? 0} XP</span>
          {xpLeft !== null && <span>faltam {xpLeft} XP</span>}
          {xpLeft === null && <span style={{ color: area.color }}>Nível máximo 🏆</span>}
        </div>
      )}
      {hovered && info && (
        <div style={{ fontSize: '0.65rem', color: area.color, marginTop: 2 }}>{info.name}</div>
      )}
    </div>
  );
}

// ─── HabitStatsWidget ─────────────────────────────────────────────────────────

interface HabitStatsWidgetProps {
  stats: HabitRadarStats | null;
  ready: boolean;
}

function HabitStatsWidget({ stats, ready }: HabitStatsWidgetProps) {
  const [hoveredArea, setHoveredArea] = useState<HabitLifeArea | null>(null);

  if (!ready) return <SkeletonBlock lines={1} height={150} />;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* Compact radar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <HabitRadarCompact
          stats={stats}
          hoveredArea={hoveredArea}
          onHover={setHoveredArea}
        />
      </div>

      {/* Area cards grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {LIFE_AREAS.map((area) => (
          <AreaLevelCard
            key={area.key}
            area={area}
            info={stats?.[area.key] ?? null}
            hovered={hoveredArea === area.key}
            onHover={(v) => setHoveredArea(v ? area.key : null)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── HabitMenu ────────────────────────────────────────────────────────────────

function HabitMenu({ habit, onEdit, onArchive, onDelete }: {
  habit: HabitTodayStat;
  onEdit: (h: HabitTodayStat) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
          color: 'var(--muted)', borderRadius: 6, display: 'flex', alignItems: 'center',
          opacity: 0, transition: 'opacity 0.15s',
        }}
        className="habit-menu-trigger"
        title="Opções"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 200,
          background: 'var(--surface-elevated)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 4, minWidth: 140,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {[
            { icon: <Pencil size={12} />, label: 'Editar', action: () => onEdit(habit) },
            { icon: <Archive size={12} />, label: 'Arquivar', action: () => onArchive(habit.id) },
            { icon: <Trash2 size={12} />, label: 'Excluir', action: () => onDelete(habit.id), danger: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.action(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
                background: 'none', border: 'none', cursor: 'pointer', borderRadius: 7,
                fontSize: '0.8rem', color: item.danger ? 'var(--danger)' : 'var(--text)', textAlign: 'left',
              }}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HabitRow ─────────────────────────────────────────────────────────────────

interface HabitRowProps {
  stat: HabitTodayStat;
  date: string;
  onLog: (id: string, value?: number) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
  onRecaiu: (id: string) => Promise<void>;
  onUndoRecaiu: (id: string) => Promise<void>;
  onEdit: (h: HabitTodayStat) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  busy: boolean;
  areaColor: string;
}

function HabitRow({ stat, onLog, onUndo, onRecaiu, onUndoRecaiu, onEdit, onArchive, onDelete, busy, areaColor }: HabitRowProps) {
  const { type, title, streak, currentLog, periodProgress, isCompletedToday, dailyTarget, unit } = stat;

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    transition: 'background 0.15s',
  };

  if (type === 'binary') {
    return (
      <div className="habit-row-hover" style={rowStyle}>
        {/* Check circle */}
        <button
          onClick={() => isCompletedToday ? onUndo(stat.id) : onLog(stat.id)}
          disabled={busy}
          style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
            border: `2px solid ${isCompletedToday ? areaColor : 'rgba(255,255,255,0.15)'}`,
            background: isCompletedToday ? areaColor : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', color: 'white', transition: 'all 0.2s',
            boxShadow: isCompletedToday ? `0 0 8px ${areaColor}55` : 'none',
          }}
        >
          {isCompletedToday && '✓'}
        </button>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.88rem', fontWeight: 600,
            color: isCompletedToday ? 'var(--muted)' : 'var(--text)',
            textDecoration: isCompletedToday ? 'line-through' : 'none',
            transition: 'all 0.2s',
          }}>
            {stat.icon ? `${stat.icon} ` : ''}{title}
          </div>
          {periodProgress && (
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
              {periodProgress.done}/{periodProgress.target} esta {stat.frequencyType === 'weekly' ? 'semana' : 'mês'}
            </div>
          )}
        </div>

        {/* Streak */}
        {streak > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: '0.75rem', fontWeight: 700, color: '#f97316',
            background: 'rgba(249,115,22,0.1)', padding: '3px 8px', borderRadius: 99,
          }}>
            <Flame size={12} /> {streak}
          </div>
        )}

        {/* Done button */}
        <button
          onClick={() => isCompletedToday ? onUndo(stat.id) : onLog(stat.id)}
          disabled={busy}
          style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem',
            fontWeight: 600, border: `1px solid ${isCompletedToday ? areaColor + '44' : 'var(--border)'}`,
            background: isCompletedToday ? `${areaColor}18` : 'var(--surface)',
            color: isCompletedToday ? areaColor : 'var(--text)',
            transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
        >
          {isCompletedToday ? '✓ Feito' : 'Marcar'}
        </button>

        <HabitMenu habit={stat} onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} />
      </div>
    );
  }

  if (type === 'quantitative') {
    const current = currentLog?.value ?? 0;
    const target = dailyTarget ?? 1;
    const pct = Math.min(100, Math.round((current / target) * 100));
    const isComplete = pct >= 100;
    const inc = unit === 'páginas' ? 10 : 1;

    return (
      <div className="habit-row-hover" style={rowStyle}>
        {/* Progress ring */}
        <div style={{ position: 'relative', flexShrink: 0, width: 28, height: 28 }}>
          <svg viewBox="0 0 28 28" width={28} height={28}>
            <circle cx={14} cy={14} r={11} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
            <circle
              cx={14} cy={14} r={11} fill="none"
              stroke={isComplete ? areaColor : `${areaColor}88`}
              strokeWidth={3}
              strokeDasharray={`${Math.round(2 * Math.PI * 11 * pct / 100)} 100`}
              strokeLinecap="round"
              transform="rotate(-90 14 14)"
              style={{ transition: 'stroke-dasharray 0.4s ease', filter: isComplete ? `drop-shadow(0 0 4px ${areaColor})` : 'none' }}
            />
            {isComplete && (
              <text x={14} y={18} textAnchor="middle" fontSize={9} fill={areaColor}>✓</text>
            )}
          </svg>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: isComplete ? 'var(--muted)' : 'var(--text)' }}>
            {stat.icon ? `${stat.icon} ` : ''}{title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99, background: isComplete ? areaColor : `${areaColor}88`,
                width: `${pct}%`, transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {current}/{target} {unit ?? ''}
            </span>
          </div>
          {periodProgress && (
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>
              {periodProgress.done}/{periodProgress.target} esta {stat.frequencyType === 'weekly' ? 'semana' : 'mês'}
            </div>
          )}
        </div>

        {streak > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: '0.75rem', fontWeight: 700, color: '#f97316',
            background: 'rgba(249,115,22,0.1)', padding: '3px 8px', borderRadius: 99,
          }}>
            <Flame size={12} /> {streak}
          </div>
        )}

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => onLog(stat.id, inc)}
            disabled={busy}
            style={{
              padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem',
              fontWeight: 600, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)',
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            +{inc} {unit ?? ''}
          </button>
          {current > 0 && (
            <button
              onClick={() => onUndo(stat.id)}
              disabled={busy}
              title="Zerar dia"
              style={{
                padding: '5px 8px', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem',
                border: '1px solid rgba(255,255,255,0.06)', background: 'none', color: 'var(--muted)',
              }}
            >
              ↺
            </button>
          )}
        </div>

        <HabitMenu habit={stat} onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} />
      </div>
    );
  }

  // vice
  const recaiu = currentLog?.value === -1;
  return (
    <div className="habit-row-hover" style={rowStyle}>
      {/* Clean indicator */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${recaiu ? 'var(--danger)' : areaColor}`,
        background: recaiu ? 'rgba(239,68,68,0.1)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.8rem',
      }}>
        {recaiu ? '✗' : '✓'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>
          {stat.icon ? `${stat.icon} ` : ''}{title}
        </div>
        <div style={{ fontSize: '0.72rem', color: recaiu ? 'var(--danger)' : 'var(--muted)', marginTop: 2 }}>
          {recaiu ? '⚠ Recaiu hoje' : `${streak} dias limpos`}
        </div>
      </div>

      {!recaiu && streak > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
          fontSize: '0.75rem', fontWeight: 700, color: '#22c55e',
          background: 'rgba(34,197,94,0.1)', padding: '3px 8px', borderRadius: 99,
        }}>
          <Zap size={11} /> {streak}d
        </div>
      )}

      {recaiu ? (
        <button
          onClick={() => onUndoRecaiu(stat.id)}
          disabled={busy}
          style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem',
            fontWeight: 600, border: '1px solid rgba(34,197,94,0.3)',
            background: 'rgba(34,197,94,0.08)', color: '#22c55e', transition: 'all 0.15s',
          }}
        >
          Desfazer
        </button>
      ) : (
        <button
          onClick={() => onRecaiu(stat.id)}
          disabled={busy}
          style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem',
            fontWeight: 600, border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', transition: 'all 0.15s',
          }}
        >
          Recaí
        </button>
      )}

      <HabitMenu habit={stat} onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} />
    </div>
  );
}

// ─── HabitAreaSection ─────────────────────────────────────────────────────────

interface HabitAreaSectionProps {
  area: (typeof LIFE_AREAS)[number];
  habits: HabitTodayStat[];
  date: string;
  onLog: (id: string, value?: number) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
  onRecaiu: (id: string) => Promise<void>;
  onUndoRecaiu: (id: string) => Promise<void>;
  onEdit: (h: HabitTodayStat) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}

function HabitAreaSection({ area, habits, date, onLog, onUndo, onRecaiu, onUndoRecaiu, onEdit, onArchive, onDelete, busy }: HabitAreaSectionProps) {
  const done = habits.filter((h) => h.isCompletedToday).length;
  const allDone = done === habits.length;

  return (
    <div style={{
      borderLeft: `3px solid ${area.color}`,
      paddingLeft: 14,
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: '1rem' }}>{area.emoji}</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          {area.label}
        </span>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99,
          background: allDone ? `${area.color}22` : 'rgba(255,255,255,0.05)',
          color: allDone ? area.color : 'var(--muted)',
          border: `1px solid ${allDone ? area.color + '44' : 'transparent'}`,
          marginLeft: 'auto',
        }}>
          {done}/{habits.length}
        </span>
      </div>
      {habits.map((h) => (
        <HabitRow
          key={h.id}
          stat={h}
          date={date}
          onLog={onLog}
          onUndo={onUndo}
          onRecaiu={onRecaiu}
          onUndoRecaiu={onUndoRecaiu}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
          busy={busy}
          areaColor={area.color}
        />
      ))}
    </div>
  );
}

// ─── FrequencyField ───────────────────────────────────────────────────────────

interface FrequencyFieldProps {
  frequencyType: HabitFrequency;
  frequencyTarget: number;
  specificDays: RecurrenceDay[];
  onFreqChange: (f: HabitFrequency) => void;
  onTargetChange: (n: number) => void;
  onDaysChange: (days: RecurrenceDay[]) => void;
}

function FrequencyField({ frequencyType, frequencyTarget, specificDays, onFreqChange, onTargetChange, onDaysChange }: FrequencyFieldProps) {
  return (
    <div>
      <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
        Frequência
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
        {FREQ_OPTIONS.map((opt) => (
          <button key={opt.key} type="button" onClick={() => onFreqChange(opt.key)} style={{
            padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem',
            fontWeight: frequencyType === opt.key ? 700 : 500,
            border: `1px solid ${frequencyType === opt.key ? 'var(--accent)' : 'var(--border)'}`,
            background: frequencyType === opt.key ? 'rgba(224,124,74,0.15)' : 'var(--surface)',
            color: frequencyType === opt.key ? 'var(--accent)' : 'var(--text)',
            transition: 'all 0.15s', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span>{opt.icon}</span> {opt.label}
          </button>
        ))}
      </div>

      {(frequencyType === 'weekly' || frequencyType === 'monthly') && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
            Quantas vezes por {frequencyType === 'weekly' ? 'semana' : 'mês'}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" onClick={() => onTargetChange(Math.max(1, frequencyTarget - 1))}
              style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, minWidth: 32, textAlign: 'center', color: 'var(--accent)' }}>{frequencyTarget}</span>
            <button type="button" onClick={() => onTargetChange(Math.min(frequencyType === 'weekly' ? 7 : 31, frequencyTarget + 1))}
              style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{frequencyType === 'weekly' ? 'dias/semana' : 'dias/mês'}</span>
          </div>
        </div>
      )}

      {frequencyType === 'specific_days' && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Dias</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_DAYS.map((day) => {
              const sel = specificDays.includes(day);
              return (
                <button key={day} type="button"
                  onClick={() => onDaysChange(sel ? specificDays.filter((d) => d !== day) : [...specificDays, day])}
                  style={{
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem',
                    fontWeight: sel ? 700 : 500, minWidth: 44,
                    border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                    background: sel ? 'rgba(224,124,74,0.15)' : 'var(--surface)',
                    color: sel ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.15s',
                  }}>{DAY_LABELS[day]}</button>
              );
            })}
          </div>
          {specificDays.length === 0 && (
            <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: 6 }}>Selecione pelo menos um dia</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared form state ────────────────────────────────────────────────────────

interface HabitFormState {
  title: string; icon: string; lifeArea: HabitLifeArea | null; type: HabitType | null;
  frequencyType: HabitFrequency; frequencyTarget: number; specificDays: RecurrenceDay[];
  unit: string; dailyTarget: number | '';
}
function defaultForm(): HabitFormState {
  return { title: '', icon: '', lifeArea: null, type: null, frequencyType: 'daily', frequencyTarget: 3, specificDays: [], unit: '', dailyTarget: '' };
}

const TYPE_OPTIONS: Array<{ key: HabitType; icon: string; label: string; desc: string }> = [
  { key: 'binary', icon: '✓', label: 'Binário', desc: 'Feito ou não feito' },
  { key: 'quantitative', icon: '📊', label: 'Quantitativo', desc: 'Mede quantidade' },
  { key: 'vice', icon: '🚫', label: 'Vício', desc: 'Dias sem recair' },
];

// ─── HabitCreateModal ─────────────────────────────────────────────────────────

function HabitCreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<HabitFormState>(defaultForm());
  const [saving, setSaving] = useState(false);

  const set = (p: Partial<HabitFormState>) => setForm((f) => ({ ...f, ...p }));
  const canNext1 = Boolean(form.title.trim() && form.lifeArea && form.type);
  const canNext2 = form.frequencyType !== 'specific_days' || form.specificDays.length > 0;
  const isLast = step === 3 || (step === 2 && form.type !== 'quantitative');

  async function submit() {
    if (!form.lifeArea || !form.type) return;
    setSaving(true);
    try {
      await api.createHabit({
        title: form.title.trim(), lifeArea: form.lifeArea, type: form.type,
        frequencyType: form.frequencyType,
        frequencyTarget: form.frequencyType === 'weekly' || form.frequencyType === 'monthly' ? form.frequencyTarget : 1,
        specificDays: form.frequencyType === 'specific_days' ? form.specificDays : [],
        unit: form.unit.trim() || undefined,
        dailyTarget: form.dailyTarget !== '' ? Number(form.dailyTarget) : undefined,
        icon: form.icon.trim() || undefined,
      });
      toast.success('Hábito criado!');
      onCreate();
    } catch { toast.error('Erro ao criar hábito'); }
    finally { setSaving(false); }
  }

  function next() {
    if (step === 1) setStep(2);
    else if (step === 2 && form.type === 'quantitative') setStep(3);
    else submit();
  }

  return (
    <div className="habit-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="habit-modal" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="habit-modal-steps">
          {Array.from({ length: form.type === 'quantitative' ? 3 : 2 }, (_, i) => i + 1).map((s) => (
            <div key={s} className={`habit-modal-step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`} />
          ))}
          <span className="habit-modal-step-label">
            {step === 1 && 'Definição'}{step === 2 && 'Frequência'}{step === 3 && 'Meta'}
          </span>
        </div>
        <div className="habit-modal-title">
          {step === 1 && 'Novo hábito'}{step === 2 && 'Com que frequência?'}{step === 3 && 'Qual a meta diária?'}
        </div>

        {step === 1 && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Nome</label>
                <input className="premium-input" placeholder="Ex: Exercício, Leitura..." value={form.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Emoji</label>
                <input className="premium-input" placeholder="💪" value={form.icon} onChange={(e) => set({ icon: e.target.value })} style={{ width: 64, textAlign: 'center', fontSize: '1.2rem' }} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Área da vida</label>
              <div className="habit-area-grid">
                {LIFE_AREAS.map((area) => (
                  <button key={area.key} type="button" className={`habit-area-btn ${form.lifeArea === area.key ? 'selected' : ''}`}
                    style={{ '--area-color': area.color } as React.CSSProperties} onClick={() => set({ lifeArea: area.key })}>
                    {area.emoji} {area.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Tipo</label>
              <div className="habit-type-grid">
                {TYPE_OPTIONS.map((opt) => (
                  <button key={opt.key} type="button" className={`habit-type-btn ${form.type === opt.key ? 'selected' : ''}`} onClick={() => set({ type: opt.key })}>
                    <div className="type-icon">{opt.icon}</div>
                    <div className="type-label">{opt.label}</div>
                    <div className="type-desc">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <FrequencyField frequencyType={form.frequencyType} frequencyTarget={form.frequencyTarget}
            specificDays={form.specificDays} onFreqChange={(f) => set({ frequencyType: f })}
            onTargetChange={(n) => set({ frequencyTarget: n })} onDaysChange={(d) => set({ specificDays: d })} />
        )}

        {step === 3 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Unidade (páginas, copos, km...)</label>
              <input className="premium-input" placeholder="páginas" value={form.unit} onChange={(e) => set({ unit: e.target.value })} autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Meta diária</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => set({ dailyTarget: Math.max(1, Number(form.dailyTarget || 1) - 1) })}
                  style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <input type="number" className="premium-input" placeholder="50" value={form.dailyTarget}
                  onChange={(e) => set({ dailyTarget: e.target.value === '' ? '' : Number(e.target.value) })}
                  style={{ width: 80, textAlign: 'center', fontSize: '1.1rem' }} />
                <button type="button" onClick={() => set({ dailyTarget: Number(form.dailyTarget || 0) + 1 })}
                  style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                {form.unit && <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{form.unit}/dia</span>}
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          {step > 1 && <button className="premium-btn-secondary" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={saving}>Voltar</button>}
          <button className="premium-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="premium-btn" onClick={next} disabled={saving || (step === 1 && !canNext1) || (step === 2 && !canNext2)}>
            {saving ? 'Salvando...' : isLast ? 'Criar hábito' : 'Próximo →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HabitEditModal ───────────────────────────────────────────────────────────

function HabitEditModal({ habit, onClose, onSave }: { habit: HabitTodayStat; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<HabitFormState>({
    title: habit.title, icon: habit.icon ?? '', lifeArea: habit.lifeArea, type: habit.type,
    frequencyType: habit.frequencyType, frequencyTarget: habit.frequencyTarget ?? 3,
    specificDays: (habit.specificDays ?? []) as RecurrenceDay[],
    unit: habit.unit ?? '', dailyTarget: habit.dailyTarget ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<HabitFormState>) => setForm((f) => ({ ...f, ...p }));

  async function save() {
    if (!form.lifeArea) return;
    setSaving(true);
    try {
      await api.updateHabit(habit.id, {
        title: form.title.trim(), icon: form.icon.trim() || undefined, lifeArea: form.lifeArea,
        frequencyType: form.frequencyType,
        frequencyTarget: form.frequencyType === 'weekly' || form.frequencyType === 'monthly' ? form.frequencyTarget : 1,
        specificDays: form.frequencyType === 'specific_days' ? form.specificDays : [],
        unit: form.unit.trim() || undefined,
        dailyTarget: form.dailyTarget !== '' ? Number(form.dailyTarget) : undefined,
      });
      toast.success('Hábito atualizado!');
      onSave();
    } catch { toast.error('Erro ao atualizar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="habit-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="habit-modal" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="habit-modal-title">Editar hábito</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Nome</label>
            <input className="premium-input" value={form.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Emoji</label>
            <input className="premium-input" value={form.icon} onChange={(e) => set({ icon: e.target.value })} style={{ width: 64, textAlign: 'center', fontSize: '1.2rem' }} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Área da vida</label>
          <div className="habit-area-grid">
            {LIFE_AREAS.map((area) => (
              <button key={area.key} type="button" className={`habit-area-btn ${form.lifeArea === area.key ? 'selected' : ''}`}
                style={{ '--area-color': area.color } as React.CSSProperties} onClick={() => set({ lifeArea: area.key })}>
                {area.emoji} {area.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <FrequencyField frequencyType={form.frequencyType} frequencyTarget={form.frequencyTarget}
            specificDays={form.specificDays} onFreqChange={(f) => set({ frequencyType: f })}
            onTargetChange={(n) => set({ frequencyTarget: n })} onDaysChange={(d) => set({ specificDays: d })} />
        </div>
        {form.type === 'quantitative' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Unidade</label>
              <input className="premium-input" value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="páginas" />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Meta diária</label>
              <input type="number" className="premium-input" value={form.dailyTarget}
                onChange={(e) => set({ dailyTarget: e.target.value === '' ? '' : Number(e.target.value) })} style={{ width: 90 }} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="premium-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="premium-btn" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HabitHeatmap ─────────────────────────────────────────────────────────────

function HabitHeatmap({ habits, allHabits }: { habits: HabitTodayStat[]; allHabits: Habit[] }) {
  const ids = allHabits.map((h) => h.id);
  const [selectedId, setSelectedId] = useState<string | null>(ids[0] ?? null);
  const [heatmap, setHeatmap] = useState<{ logs: HabitLog[]; startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    setHeatmap(null);
    api.getHabitHeatmap(selectedId, 365).then(setHeatmap).catch(() => {});
  }, [selectedId]);

  if (allHabits.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Nenhum hábito ainda.</p>;
  }

  const selectedHabit = allHabits.find((h) => h.id === selectedId);

  // Only show cells from habit creation date to today
  const todayStr = localDateKey();
  const createdStr = selectedHabit?.createdAt
    ? selectedHabit.createdAt.slice(0, 10)
    : todayStr;

  const logValues = new Map(heatmap?.logs.map((l) => [l.date, l.value]) ?? []);

  // Generate cells from createdAt → today
  const cells: Array<{ date: string; value: number | null; isFuture: boolean }> = [];
  const startDate = new Date(createdStr + 'T00:00:00Z');
  const endDate = new Date(todayStr + 'T00:00:00Z');
  const msPerDay = 86400000;
  const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startDate.getTime() + i * msPerDay);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, value: logValues.get(key) ?? null, isFuture: false });
  }

  function cellBg(value: number | null, isFuture: boolean) {
    if (isFuture) return 'rgba(255,255,255,0.03)';
    if (value === null) return 'rgba(255,255,255,0.05)';
    if (value === -1) return 'rgba(239,68,68,0.5)';
    if (value >= 10) return 'rgba(91,185,140,0.9)';
    if (value >= 3) return 'rgba(91,185,140,0.55)';
    return 'rgba(91,185,140,0.25)';
  }

  const doneCount = cells.filter((c) => c.value !== null && c.value > 0).length;
  const totalDays = cells.filter((c) => !c.isFuture).length;
  const consistency = totalDays > 0 ? Math.round((doneCount / totalDays) * 100) : 0;

  return (
    <div>
      {/* Selector + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <select className="premium-input" value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value)}
          style={{ display: 'inline-block', width: 'auto', flex: 1, minWidth: 140 }}>
          {allHabits.map((h) => (
            <option key={h.id} value={h.id}>{h.icon ? `${h.icon} ` : ''}{h.title}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>{doneCount}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>dias feitos</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#5bb98c' }}>{consistency}%</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>consistência</div>
          </div>
        </div>
      </div>

      {/* Grid */}
      {cells.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Hábito criado hoje — dados aparecerão amanhã.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {cells.map((cell) => (
            <div
              key={cell.date}
              title={`${cell.date}: ${cell.value === null ? 'sem registro' : cell.value === -1 ? 'recaiu' : `${cell.value}`}`}
              style={{
                width: 11, height: 11, borderRadius: 2,
                background: cellBg(cell.value, cell.isFuture),
                cursor: 'default', transition: 'transform 0.1s',
                outline: cell.date === todayStr ? '1.5px solid rgba(255,255,255,0.35)' : 'none',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.5)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Menos</span>
        {[null, 1, 5, 10].map((v, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: cellBg(v, false) }} />
        ))}
        <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Mais</span>
      </div>
    </div>
  );
}

// ─── HabitosPage ──────────────────────────────────────────────────────────────

export function HabitosPage() {
  const [date, setDate] = useState(localDateKey());
  const [habits, setHabits] = useState<HabitTodayStat[]>([]);
  const [allHabits, setAllHabits] = useState<Habit[]>([]);
  const [radar, setRadar] = useState<HabitRadarStats | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitTodayStat | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const todayStr = localDateKey();

  const load = useCallback(async () => {
    try {
      const [todayStats, radarStats, allHabitsData] = await Promise.all([
        api.getHabitsTodayStats(date),
        api.getHabitsRadar(),
        api.getHabits(),
      ]);
      setHabits(todayStats);
      setRadar(radarStats);
      setAllHabits(allHabitsData);
      return { todayStats, radarStats, allHabitsData };
    } catch {
      toast.error('Erro ao carregar hábitos');
      return null;
    } finally {
      setReady(true);
    }
  }, [date]);

  useEffect(() => { setReady(false); load(); }, [load]);

  const handleLog = useCallback(async (id: string, value?: number) => {
    const stat = habits.find((h) => h.id === id);
    if (!stat) return;
    const prevRadar = radar;
    setBusy(true);
    try {
      await api.logHabit(id, { date, value });
      const result = await load();
      if (result && prevRadar) {
        const areaKey = stat.lifeArea;
        const prevLevel = prevRadar[areaKey]?.level ?? 1;
        const newLevel = result.radarStats[areaKey]?.level ?? 1;
        if (newLevel > prevLevel) {
          toast.success(`🎉 Subiu para Nível ${newLevel} em ${AREA_MAP[areaKey].label}!`, { duration: 4000 });
        } else {
          toast.success(`+${stat.xpPerCompletion ?? 10} XP ${AREA_MAP[areaKey].emoji}`, { duration: 2000 });
        }
      }
    } catch { toast.error('Erro ao registrar'); }
    finally { setBusy(false); }
  }, [date, habits, radar, load]);

  const handleUndo = useCallback(async (id: string) => {
    setBusy(true);
    try { await api.deleteHabitLog(id, date); await load(); toast.success('Registro removido'); }
    catch { toast.error('Erro ao desfazer'); }
    finally { setBusy(false); }
  }, [date, load]);

  const handleRecaiu = useCallback(async (id: string) => {
    if (!confirm('Registrar recaída?')) return;
    setBusy(true);
    try {
      const result = await api.habitRecaiu(id, date);
      if (result.previousStreak > 0) toast.info(`Sequência de ${result.previousStreak} dias encerrada.`);
      await load();
    } catch { toast.error('Erro ao registrar recaída'); }
    finally { setBusy(false); }
  }, [date, load]);

  const handleUndoRecaiu = useCallback(async (id: string) => {
    setBusy(true);
    try { await api.deleteHabitLog(id, date); await load(); toast.success('Recaída desfeita! 💪'); }
    catch { toast.error('Erro ao desfazer'); }
    finally { setBusy(false); }
  }, [date, load]);

  const handleArchive = useCallback(async (id: string) => {
    if (!confirm('Arquivar este hábito?')) return;
    try { await api.archiveHabit(id); toast.success('Arquivado'); await load(); }
    catch { toast.error('Erro ao arquivar'); }
  }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Excluir este hábito permanentemente?')) return;
    try { await api.archiveHabit(id); toast.success('Removido'); await load(); }
    catch { toast.error('Erro ao excluir'); }
  }, [load]);

  const areaHabits = LIFE_AREAS.map((area) => ({
    area, habits: habits.filter((h) => h.lifeArea === area.key),
  })).filter((g) => g.habits.length > 0);

  const isToday = date === todayStr;
  const displayLabel = isToday ? 'Hoje'
    : date === addDays(todayStr, -1) ? 'Ontem'
    : formatDisplayDate(date);

  const totalH = habits.length;
  const doneH = habits.filter((h) => h.isCompletedToday).length;

  return (
    <PremiumPage>
      <PremiumHeader
        title="Hábitos"
        subtitle="RPG de vida"
        actions={
          <button className="premium-btn" onClick={() => setShowCreateModal(true)}>+ Novo hábito</button>
        }
      />

      {/* Date nav */}
      <div className="habit-date-nav">
        <button className="habit-date-nav-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Dia anterior">
          <ChevronLeft size={16} />
        </button>
        <div className="habit-date-nav-center">
          <span className="habit-date-label">{displayLabel}</span>
          {!isToday && (
            <span className="habit-date-sub">
              {new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
        <button className="habit-date-nav-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= todayStr} aria-label="Próximo dia">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Stats widget: compact radar + area cards */}
      <PremiumCard>
        <HabitStatsWidget stats={radar} ready={ready} />
      </PremiumCard>

      {/* Global progress bar */}
      {ready && totalH > 0 && (
        <div style={{ padding: '4px 2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Progresso do dia</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: doneH === totalH ? '#5bb98c' : 'var(--muted)' }}>
              {doneH}/{totalH} {doneH === totalH && '🎉'}
            </span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: doneH === totalH ? '#5bb98c' : 'var(--accent)',
              width: `${Math.round((doneH / totalH) * 100)}%`,
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Habit list */}
      {!ready ? (
        <PremiumCard><SkeletonBlock lines={4} height={52} /></PremiumCard>
      ) : habits.length === 0 ? (
        <PremiumCard>
          <EmptyState title="Nenhum hábito para este dia" description='Crie o primeiro hábito clicando em "+ Novo hábito"' />
        </PremiumCard>
      ) : (
        <PremiumCard>
          <style>{`.habit-row-hover:hover .habit-menu-trigger { opacity: 1 !important; }`}</style>
          {areaHabits.map(({ area, habits: aHabits }) => (
            <HabitAreaSection
              key={area.key} area={area} habits={aHabits} date={date}
              onLog={handleLog} onUndo={handleUndo} onRecaiu={handleRecaiu} onUndoRecaiu={handleUndoRecaiu}
              onEdit={setEditingHabit} onArchive={handleArchive} onDelete={handleDelete} busy={busy}
            />
          ))}
        </PremiumCard>
      )}

      {/* Analysis */}
      {allHabits.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button className="premium-btn-secondary" onClick={() => setAnalysisOpen(!analysisOpen)}
            style={{ width: '100%', justifyContent: 'center' }}>
            Análise {analysisOpen ? '▴' : '▾'}
          </button>
          {analysisOpen && (
            <div style={{ marginTop: 8 }}>
              <PremiumCard>
                <HabitHeatmap habits={habits} allHabits={allHabits} />
              </PremiumCard>
            </div>
          )}
        </div>
      )}

      {showCreateModal && <HabitCreateModal onClose={() => setShowCreateModal(false)} onCreate={() => { setShowCreateModal(false); load(); }} />}
      {editingHabit && <HabitEditModal habit={editingHabit} onClose={() => setEditingHabit(null)} onSave={() => { setEditingHabit(null); load(); }} />}
    </PremiumPage>
  );
}
