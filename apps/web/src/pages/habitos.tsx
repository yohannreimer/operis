import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoreVertical, Pencil, Archive, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  api,
  Habit,
  HabitFrequency,
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

// ─── HabitRadar ───────────────────────────────────────────────────────────────

const RADAR_SIZE = 300;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_MAX_RADIUS = 110;
const RADAR_AREAS: HabitLifeArea[] = ['corpo', 'mente', 'financas', 'crescimento', 'relacoes', 'trabalho'];

function polarToXY(angle: number, radius: number) {
  return {
    x: RADAR_CENTER + radius * Math.cos(angle),
    y: RADAR_CENTER + radius * Math.sin(angle),
  };
}

function levelToRadius(level: number) {
  return (level / 10) * RADAR_MAX_RADIUS;
}

function HabitRadar({ stats }: { stats: HabitRadarStats | null }) {
  const angles = RADAR_AREAS.map((_, i) => (Math.PI * (270 + 60 * i)) / 180);
  const gridLevels = [2, 4, 6, 8, 10];

  function makePolygon(levels: number[]) {
    return levels.map((lvl, i) => {
      const r = levelToRadius(lvl);
      const { x, y } = polarToXY(angles[i], r);
      return `${x},${y}`;
    }).join(' ');
  }

  const areaLevels = RADAR_AREAS.map((area) => stats?.[area]?.level ?? 1);
  const filledPolygon = makePolygon(areaLevels);

  return (
    <svg viewBox={`-50 -40 ${RADAR_SIZE + 100} ${RADAR_SIZE + 80}`} className="habit-radar-svg">
      {gridLevels.map((gl) => {
        const pts = angles.map((angle) => {
          const r = levelToRadius(gl);
          const { x, y } = polarToXY(angle, r);
          return `${x},${y}`;
        }).join(' ');
        return <polygon key={gl} points={pts} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
      })}
      {angles.map((angle, i) => {
        const outer = polarToXY(angle, RADAR_MAX_RADIUS);
        return <line key={i} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
      })}
      <defs>
        <radialGradient id="radar-fill-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(224,124,74,0.35)" />
          <stop offset="60%" stopColor="rgba(129,140,248,0.2)" />
          <stop offset="100%" stopColor="rgba(91,185,140,0.1)" />
        </radialGradient>
        <filter id="radar-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <polygon points={filledPolygon} fill="url(#radar-fill-gradient)" stroke="none" />
      <polygon points={filledPolygon} fill="none" stroke="rgba(224,124,74,0.7)" strokeWidth={1.5} filter="url(#radar-glow)" />
      {RADAR_AREAS.map((area, i) => {
        const lvl = stats?.[area]?.level ?? 1;
        const r = levelToRadius(lvl);
        const { x, y } = polarToXY(angles[i], r);
        return (
          <circle key={`dot-${area}`} cx={x} cy={y} r={4} fill={AREA_MAP[area].color}
            stroke="rgba(255,255,255,0.2)" strokeWidth={1} filter="url(#radar-glow)" />
        );
      })}
      {RADAR_AREAS.map((area, i) => {
        const angle = angles[i];
        const labelRadius = RADAR_MAX_RADIUS + 32;
        const { x, y } = polarToXY(angle, labelRadius);
        const info = AREA_MAP[area];
        const level = stats?.[area]?.level ?? 1;
        const textAnchor = x < RADAR_CENTER - 10 ? 'end' : x > RADAR_CENTER + 10 ? 'start' : 'middle';
        return (
          <g key={area}>
            <text x={x} y={y - 6} textAnchor={textAnchor} fontSize={11} fill="rgba(255,255,255,0.85)" fontWeight="600">
              {info.emoji} {info.label}
            </text>
            <text x={x} y={y + 8} textAnchor={textAnchor} fontSize={10} fill={info.color} fontWeight="700">
              Nv.{level}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── HabitMenu ────────────────────────────────────────────────────────────────

interface HabitMenuProps {
  habit: HabitTodayStat;
  onEdit: (h: HabitTodayStat) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function HabitMenu({ habit, onEdit, onArchive, onDelete }: HabitMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
          color: 'var(--muted)', borderRadius: 6, display: 'flex', alignItems: 'center',
          opacity: 0.5, transition: 'opacity 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
        title="Opções"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 100,
          background: 'var(--surface-elevated)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '4px', minWidth: 140,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <button
            onClick={() => { setOpen(false); onEdit(habit); }}
            style={{ ...menuItemStyle }}
          >
            <Pencil size={13} /> Editar
          </button>
          <button
            onClick={() => { setOpen(false); onArchive(habit.id); }}
            style={{ ...menuItemStyle }}
          >
            <Archive size={13} /> Arquivar
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(habit.id); }}
            style={{ ...menuItemStyle, color: 'var(--danger)' }}
          >
            <Trash2 size={13} /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
  background: 'none', border: 'none', cursor: 'pointer', borderRadius: 7,
  fontSize: '0.8rem', color: 'var(--text)', textAlign: 'left',
  transition: 'background 0.1s',
};

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
}

function HabitRow({ stat, date: _date, onLog, onUndo, onRecaiu, onUndoRecaiu, onEdit, onArchive, onDelete, busy }: HabitRowProps) {
  const { type, title, streak, currentLog, periodProgress, isCompletedToday, dailyTarget, unit } = stat;

  if (type === 'binary') {
    return (
      <div className="habit-row">
        <button
          className={`habit-row-check ${isCompletedToday ? 'done' : ''}`}
          onClick={() => isCompletedToday ? onUndo(stat.id) : onLog(stat.id)}
          disabled={busy}
          title={isCompletedToday ? 'Clique para desfazer' : 'Marcar como feito'}
        >
          {isCompletedToday ? '✓' : ''}
        </button>
        <div className="habit-row-info">
          <div className={`habit-row-title ${isCompletedToday ? 'done-title' : ''}`}>
            {stat.icon ? `${stat.icon} ` : ''}{title}
          </div>
          {periodProgress && (
            <div className="habit-row-sub">
              {periodProgress.done}/{periodProgress.target} esta {stat.frequencyType === 'weekly' ? 'semana' : 'mês'}
            </div>
          )}
        </div>
        {streak > 1 && <span className="habit-streak">🔥 {streak}</span>}
        <div className="habit-row-actions">
          <button
            className={`habit-btn-done ${isCompletedToday ? 'done' : ''}`}
            onClick={() => isCompletedToday ? onUndo(stat.id) : onLog(stat.id)}
            disabled={busy}
          >
            {isCompletedToday ? '✓ Feito' : 'Feito'}
          </button>
        </div>
        <HabitMenu habit={stat} onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} />
      </div>
    );
  }

  if (type === 'quantitative') {
    const current = currentLog?.value ?? 0;
    const target = dailyTarget ?? 1;
    const pct = Math.min(100, Math.round((current / target) * 100));
    const isComplete = pct >= 100;
    const incrementUnit = unit === 'páginas' ? 10 : 1;
    const incrementLabel = unit ? `+${incrementUnit} ${unit}` : `+${incrementUnit}`;

    return (
      <div className="habit-row">
        <div className="habit-row-info">
          <div className={`habit-row-title ${isComplete ? 'done-title' : ''}`}>
            {stat.icon ? `${stat.icon} ` : ''}{title}
          </div>
          <div className="habit-progress-bar">
            <div className={`habit-progress-fill ${isComplete ? 'complete' : ''}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="habit-row-sub">
            {current} / {target} {unit ?? ''}
            {periodProgress ? ` · ${periodProgress.done}/${periodProgress.target} esta ${stat.frequencyType === 'weekly' ? 'semana' : 'mês'}` : ''}
          </div>
        </div>
        {streak > 1 && <span className="habit-streak">🔥 {streak}</span>}
        <div className="habit-row-actions">
          <button className="habit-btn-increment" onClick={() => onLog(stat.id, incrementUnit)} disabled={busy} title={incrementLabel}>
            {incrementLabel}
          </button>
          {current > 0 && (
            <button
              onClick={() => onUndo(stat.id)}
              disabled={busy}
              title="Zerar registro de hoje"
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem', color: 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              Zerar
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
    <div className="habit-row">
      <div className="habit-row-info">
        <div className="habit-row-title">{stat.icon ? `${stat.icon} ` : ''}{title}</div>
        <div className="habit-row-sub" style={recaiu ? { color: 'var(--danger)' } : {}}>
          {recaiu ? '⚠ Recaiu hoje' : `${streak} dias limpos`}
        </div>
      </div>
      <div className="habit-row-actions">
        {recaiu ? (
          <button
            onClick={() => onUndoRecaiu(stat.id)}
            disabled={busy}
            style={{
              background: 'rgba(91,185,140,0.12)', border: '1px solid rgba(91,185,140,0.3)',
              cursor: 'pointer', padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem',
              color: '#5bb98c', transition: 'all 0.15s',
            }}
          >
            Desfazer
          </button>
        ) : (
          <button className="habit-btn-recaiu" onClick={() => onRecaiu(stat.id)} disabled={busy}>
            Recaí
          </button>
        )}
      </div>
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
    <div className="habit-area-section" style={{ borderLeftColor: area.color }}>
      <div className="habit-area-header">
        <span>{area.emoji}</span>
        <span className="habit-area-label">{area.label}</span>
        <span
          className="habit-area-badge"
          style={{
            background: allDone ? `${area.color}28` : 'rgba(255,255,255,0.05)',
            color: allDone ? area.color : 'var(--muted)',
            border: `1px solid ${allDone ? area.color + '44' : 'transparent'}`,
          }}
        >
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
      {/* Frequency type pills */}
      <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
        Frequência
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
        {FREQ_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onFreqChange(opt.key)}
            style={{
              padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem',
              fontWeight: frequencyType === opt.key ? 700 : 500,
              border: `1px solid ${frequencyType === opt.key ? 'var(--accent)' : 'var(--border)'}`,
              background: frequencyType === opt.key ? 'rgba(224,124,74,0.15)' : 'var(--surface)',
              color: frequencyType === opt.key ? 'var(--accent)' : 'var(--text)',
              transition: 'all 0.15s', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            <span style={{ fontSize: '1rem' }}>{opt.icon}</span> {opt.label}
          </button>
        ))}
      </div>

      {/* Target stepper for weekly/monthly */}
      {(frequencyType === 'weekly' || frequencyType === 'monthly') && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
            Quantas vezes por {frequencyType === 'weekly' ? 'semana' : 'mês'}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => onTargetChange(Math.max(1, frequencyTarget - 1))}
              style={{
                width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer', fontSize: '1.1rem',
                color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >−</button>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, minWidth: 32, textAlign: 'center', color: 'var(--accent)' }}>
              {frequencyTarget}
            </span>
            <button
              type="button"
              onClick={() => onTargetChange(Math.min(frequencyType === 'weekly' ? 7 : 31, frequencyTarget + 1))}
              style={{
                width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer', fontSize: '1.1rem',
                color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >+</button>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              {frequencyType === 'weekly' ? 'dias/semana' : 'dias/mês'}
            </span>
          </div>
        </div>
      )}

      {/* Specific days selector */}
      {frequencyType === 'specific_days' && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
            Selecione os dias
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_DAYS.map((day) => {
              const selected = specificDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onDaysChange(
                    selected ? specificDays.filter((d) => d !== day) : [...specificDays, day]
                  )}
                  style={{
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem',
                    fontWeight: selected ? 700 : 500, minWidth: 44,
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'rgba(224,124,74,0.15)' : 'var(--surface)',
                    color: selected ? 'var(--accent)' : 'var(--muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>
          {specificDays.length === 0 && (
            <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: 6 }}>
              Selecione pelo menos um dia
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HabitFormFields ──────────────────────────────────────────────────────────

interface HabitFormState {
  title: string;
  icon: string;
  lifeArea: HabitLifeArea | null;
  type: HabitType | null;
  frequencyType: HabitFrequency;
  frequencyTarget: number;
  specificDays: RecurrenceDay[];
  unit: string;
  dailyTarget: number | '';
}

function defaultFormState(): HabitFormState {
  return {
    title: '', icon: '', lifeArea: null, type: null,
    frequencyType: 'daily', frequencyTarget: 3,
    specificDays: [], unit: '', dailyTarget: '',
  };
}

// ─── HabitCreateModal ─────────────────────────────────────────────────────────

interface HabitCreateModalProps {
  onClose: () => void;
  onCreate: () => void;
}

const TYPE_OPTIONS: Array<{ key: HabitType; icon: string; label: string; desc: string }> = [
  { key: 'binary', icon: '✓', label: 'Binário', desc: 'Feito ou não feito' },
  { key: 'quantitative', icon: '📊', label: 'Quantitativo', desc: 'Mede quantidade' },
  { key: 'vice', icon: '🚫', label: 'Vício', desc: 'Dias sem recair' },
];

function HabitCreateModal({ onClose, onCreate }: HabitCreateModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<HabitFormState>(defaultFormState());
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<HabitFormState>) => setForm((f) => ({ ...f, ...patch }));

  const canGoNext1 = Boolean(form.title.trim() && form.lifeArea && form.type);
  const canGoNext2 = form.frequencyType !== 'specific_days' || form.specificDays.length > 0;
  const isLastStep = step === 3 || (step === 2 && form.type !== 'quantitative');

  async function handleSubmit() {
    if (!form.lifeArea || !form.type) return;
    setSaving(true);
    try {
      await api.createHabit({
        title: form.title.trim(),
        lifeArea: form.lifeArea,
        type: form.type,
        frequencyType: form.frequencyType,
        frequencyTarget: form.frequencyType === 'weekly' || form.frequencyType === 'monthly' ? form.frequencyTarget : 1,
        specificDays: form.frequencyType === 'specific_days' ? form.specificDays : [],
        unit: form.unit.trim() || undefined,
        dailyTarget: form.dailyTarget !== '' ? Number(form.dailyTarget) : undefined,
        icon: form.icon.trim() || undefined,
      });
      toast.success('Hábito criado!');
      onCreate();
    } catch {
      toast.error('Erro ao criar hábito');
    } finally {
      setSaving(false);
    }
  }

  function nextStep() {
    if (step === 1) {
      setStep(2);
    } else if (step === 2 && form.type === 'quantitative') {
      setStep(3);
    } else {
      handleSubmit();
    }
  }

  const totalSteps = form.type === 'quantitative' ? 3 : 2;

  return (
    <div className="habit-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="habit-modal">
        {/* Steps indicator */}
        <div className="habit-modal-steps">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
            <div key={s} className={`habit-modal-step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`} />
          ))}
          <span className="habit-modal-step-label">
            {step === 1 && 'Definição'}{step === 2 && 'Frequência'}{step === 3 && 'Meta'}
          </span>
        </div>
        <div className="habit-modal-title">
          {step === 1 && 'Novo hábito'}{step === 2 && 'Com que frequência?'}{step === 3 && 'Qual é a meta diária?'}
        </div>

        {/* Step 1: Definition */}
        {step === 1 && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  Nome do hábito
                </label>
                <input
                  className="premium-input"
                  placeholder="Ex: Exercício, Leitura..."
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  Emoji
                </label>
                <input
                  className="premium-input"
                  placeholder="💪"
                  value={form.icon}
                  onChange={(e) => set({ icon: e.target.value })}
                  style={{ width: 64, textAlign: 'center', fontSize: '1.2rem' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                Área da vida
              </label>
              <div className="habit-area-grid">
                {LIFE_AREAS.map((area) => (
                  <button
                    key={area.key}
                    type="button"
                    className={`habit-area-btn ${form.lifeArea === area.key ? 'selected' : ''}`}
                    style={{ '--area-color': area.color } as React.CSSProperties}
                    onClick={() => set({ lifeArea: area.key })}
                  >
                    {area.emoji} {area.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                Tipo de hábito
              </label>
              <div className="habit-type-grid">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`habit-type-btn ${form.type === opt.key ? 'selected' : ''}`}
                    onClick={() => set({ type: opt.key })}
                  >
                    <div className="type-icon">{opt.icon}</div>
                    <div className="type-label">{opt.label}</div>
                    <div className="type-desc">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Step 2: Frequency */}
        {step === 2 && (
          <FrequencyField
            frequencyType={form.frequencyType}
            frequencyTarget={form.frequencyTarget}
            specificDays={form.specificDays}
            onFreqChange={(f) => set({ frequencyType: f })}
            onTargetChange={(n) => set({ frequencyTarget: n })}
            onDaysChange={(days) => set({ specificDays: days })}
          />
        )}

        {/* Step 3: Quantitative meta */}
        {step === 3 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Unidade (ex: páginas, copos, km)
              </label>
              <input
                className="premium-input"
                placeholder="páginas"
                value={form.unit}
                onChange={(e) => set({ unit: e.target.value })}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Meta diária
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => set({ dailyTarget: Math.max(1, Number(form.dailyTarget || 1) - 1) })}
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface)', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >−</button>
                <input
                  type="number"
                  className="premium-input"
                  placeholder="50"
                  value={form.dailyTarget}
                  onChange={(e) => set({ dailyTarget: e.target.value === '' ? '' : Number(e.target.value) })}
                  style={{ width: 80, textAlign: 'center', fontSize: '1.1rem' }}
                />
                <button
                  type="button"
                  onClick={() => set({ dailyTarget: Number(form.dailyTarget || 0) + 1 })}
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface)', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >+</button>
                {form.unit && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{form.unit}/dia</span>
                )}
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          {step > 1 && (
            <button className="premium-btn-secondary" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={saving}>
              Voltar
            </button>
          )}
          <button className="premium-btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            className="premium-btn"
            onClick={nextStep}
            disabled={saving || (step === 1 && !canGoNext1) || (step === 2 && !canGoNext2)}
          >
            {saving ? 'Salvando...' : isLastStep ? 'Criar hábito' : 'Próximo →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HabitEditModal ───────────────────────────────────────────────────────────

interface HabitEditModalProps {
  habit: HabitTodayStat;
  onClose: () => void;
  onSave: () => void;
}

function HabitEditModal({ habit, onClose, onSave }: HabitEditModalProps) {
  const [form, setForm] = useState<HabitFormState>({
    title: habit.title,
    icon: habit.icon ?? '',
    lifeArea: habit.lifeArea,
    type: habit.type,
    frequencyType: habit.frequencyType,
    frequencyTarget: habit.frequencyTarget ?? 3,
    specificDays: (habit.specificDays ?? []) as RecurrenceDay[],
    unit: habit.unit ?? '',
    dailyTarget: habit.dailyTarget ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<HabitFormState>) => setForm((f) => ({ ...f, ...patch }));
  const canSave = Boolean(form.title.trim() && form.lifeArea);

  async function handleSave() {
    if (!form.lifeArea) return;
    setSaving(true);
    try {
      await api.updateHabit(habit.id, {
        title: form.title.trim(),
        icon: form.icon.trim() || undefined,
        lifeArea: form.lifeArea,
        frequencyType: form.frequencyType,
        frequencyTarget: form.frequencyType === 'weekly' || form.frequencyType === 'monthly' ? form.frequencyTarget : 1,
        specificDays: form.frequencyType === 'specific_days' ? form.specificDays : [],
        unit: form.unit.trim() || undefined,
        dailyTarget: form.dailyTarget !== '' ? Number(form.dailyTarget) : undefined,
      });
      toast.success('Hábito atualizado!');
      onSave();
    } catch {
      toast.error('Erro ao atualizar hábito');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="habit-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="habit-modal" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="habit-modal-title">Editar hábito</div>

        {/* Name + icon */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Nome
            </label>
            <input
              className="premium-input"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Emoji
            </label>
            <input
              className="premium-input"
              value={form.icon}
              onChange={(e) => set({ icon: e.target.value })}
              style={{ width: 64, textAlign: 'center', fontSize: '1.2rem' }}
            />
          </div>
        </div>

        {/* Life area */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
            Área da vida
          </label>
          <div className="habit-area-grid">
            {LIFE_AREAS.map((area) => (
              <button
                key={area.key}
                type="button"
                className={`habit-area-btn ${form.lifeArea === area.key ? 'selected' : ''}`}
                style={{ '--area-color': area.color } as React.CSSProperties}
                onClick={() => set({ lifeArea: area.key })}
              >
                {area.emoji} {area.label}
              </button>
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div style={{ marginBottom: 16 }}>
          <FrequencyField
            frequencyType={form.frequencyType}
            frequencyTarget={form.frequencyTarget}
            specificDays={form.specificDays}
            onFreqChange={(f) => set({ frequencyType: f })}
            onTargetChange={(n) => set({ frequencyTarget: n })}
            onDaysChange={(days) => set({ specificDays: days })}
          />
        </div>

        {/* Quantitative meta */}
        {form.type === 'quantitative' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Unidade
              </label>
              <input className="premium-input" value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="páginas" />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Meta diária
              </label>
              <input
                type="number"
                className="premium-input"
                value={form.dailyTarget}
                onChange={(e) => set({ dailyTarget: e.target.value === '' ? '' : Number(e.target.value) })}
                style={{ width: 90 }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="premium-btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="premium-btn" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HabitAnalysis ────────────────────────────────────────────────────────────

function HabitAnalysis({ habits }: { habits: Habit[] }) {
  const [selectedHabit, setSelectedHabit] = useState<string | null>(habits[0]?.id ?? null);
  const [heatmapData, setHeatmapData] = useState<{ logs: HabitLog[]; startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    if (!selectedHabit) return;
    api.getHabitHeatmap(selectedHabit, 365).then(setHeatmapData).catch(() => {});
  }, [selectedHabit]);

  if (habits.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Nenhum hábito ainda.</p>;
  }

  const logValues = new Map(heatmapData?.logs.map((l) => [l.date, l.value]) ?? []);
  const today = new Date();
  const cells: Array<{ date: string; value: number | null }> = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, value: logValues.get(key) ?? null });
  }

  function cellClass(value: number | null) {
    if (value === null) return '';
    if (value === -1) return 'vice-fail';
    if (value >= 10) return 'done-high';
    if (value >= 3) return 'done-mid';
    return 'done-low';
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Hábito:</label>
        <select
          className="premium-input"
          value={selectedHabit ?? ''}
          onChange={(e) => setSelectedHabit(e.target.value)}
          style={{ display: 'inline-block', width: 'auto', flex: 1 }}
        >
          {habits.map((h) => (
            <option key={h.id} value={h.id}>{h.icon ? `${h.icon} ` : ''}{h.title}</option>
          ))}
        </select>
      </div>
      <div className="habit-heatmap-grid">
        {cells.map((cell) => (
          <div
            key={cell.date}
            className={`habit-heatmap-cell ${cellClass(cell.value)}`}
            title={`${cell.date}: ${cell.value ?? 'sem registro'}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Menos</span>
        {['', 'done-low', 'done-mid', 'done-high'].map((cls, i) => (
          <div key={i} className={`habit-heatmap-cell ${cls}`} style={{ flexShrink: 0 }} />
        ))}
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Mais</span>
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

  useEffect(() => {
    setReady(false);
    load();
  }, [load]);

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
    } catch {
      toast.error('Erro ao registrar hábito');
    } finally {
      setBusy(false);
    }
  }, [date, habits, radar, load]);

  const handleUndo = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await api.deleteHabitLog(id, date);
      await load();
      toast.success('Registro removido');
    } catch {
      toast.error('Erro ao desfazer');
    } finally {
      setBusy(false);
    }
  }, [date, load]);

  const handleRecaiu = useCallback(async (id: string) => {
    if (!confirm('Tem certeza que quer registrar uma recaída?')) return;
    setBusy(true);
    try {
      const result = await api.habitRecaiu(id, date);
      if (result.previousStreak > 0) {
        toast.info(`Sequência de ${result.previousStreak} dias encerrada. Você consegue recomeçar!`);
      }
      await load();
    } catch {
      toast.error('Erro ao registrar recaída');
    } finally {
      setBusy(false);
    }
  }, [date, load]);

  const handleUndoRecaiu = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await api.deleteHabitLog(id, date);
      await load();
      toast.success('Recaída desfeita! Continue assim 💪');
    } catch {
      toast.error('Erro ao desfazer recaída');
    } finally {
      setBusy(false);
    }
  }, [date, load]);

  const handleArchive = useCallback(async (id: string) => {
    if (!confirm('Arquivar este hábito? Ele não aparecerá mais no dia a dia.')) return;
    try {
      await api.archiveHabit(id);
      toast.success('Hábito arquivado');
      await load();
    } catch {
      toast.error('Erro ao arquivar hábito');
    }
  }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Excluir permanentemente este hábito e todo seu histórico?')) return;
    try {
      await api.archiveHabit(id);
      toast.success('Hábito removido');
      await load();
    } catch {
      toast.error('Erro ao excluir hábito');
    }
  }, [load]);

  const areaHabits = LIFE_AREAS.map((area) => ({
    area,
    habits: habits.filter((h) => h.lifeArea === area.key),
  })).filter((g) => g.habits.length > 0);

  const isToday = date === todayStr;
  const displayLabel = isToday
    ? 'Hoje'
    : date === addDays(todayStr, -1)
    ? 'Ontem'
    : formatDisplayDate(date);

  const totalHabits = habits.length;
  const doneHabits = habits.filter((h) => h.isCompletedToday).length;

  return (
    <PremiumPage>
      <PremiumHeader
        title="Hábitos"
        subtitle={ready && totalHabits > 0 ? `${doneHabits}/${totalHabits} concluídos hoje` : 'RPG de vida'}
        actions={
          <button className="premium-btn" onClick={() => setShowCreateModal(true)}>
            + Novo hábito
          </button>
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

      {/* Radar */}
      <PremiumCard>
        {!ready ? <SkeletonBlock lines={1} height={300} /> : <HabitRadar stats={radar} />}
      </PremiumCard>

      {/* Progress bar summary */}
      {ready && totalHabits > 0 && (
        <div style={{ padding: '0 2px', marginBottom: 4 }}>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%', borderRadius: 99, background: 'var(--accent)',
                width: `${Math.round((doneHabits / totalHabits) * 100)}%`,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Habits by area */}
      {!ready ? (
        <PremiumCard><SkeletonBlock lines={4} height={52} /></PremiumCard>
      ) : habits.length === 0 ? (
        <PremiumCard>
          <EmptyState
            title="Nenhum hábito para este dia"
            description='Crie o primeiro hábito clicando em "+ Novo hábito"'
          />
        </PremiumCard>
      ) : (
        <PremiumCard>
          {areaHabits.map(({ area, habits: aHabits }) => (
            <HabitAreaSection
              key={area.key}
              area={area}
              habits={aHabits}
              date={date}
              onLog={handleLog}
              onUndo={handleUndo}
              onRecaiu={handleRecaiu}
              onUndoRecaiu={handleUndoRecaiu}
              onEdit={setEditingHabit}
              onArchive={handleArchive}
              onDelete={handleDelete}
              busy={busy}
            />
          ))}
        </PremiumCard>
      )}

      {/* Analysis */}
      {allHabits.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button
            className="premium-btn-secondary"
            onClick={() => setAnalysisOpen(!analysisOpen)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Análise {analysisOpen ? '▴' : '▾'}
          </button>
          {analysisOpen && (
            <div style={{ marginTop: 8 }}>
              <PremiumCard><HabitAnalysis habits={allHabits} /></PremiumCard>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <HabitCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreate={() => { setShowCreateModal(false); load(); }}
        />
      )}
      {editingHabit && (
        <HabitEditModal
          habit={editingHabit}
          onClose={() => setEditingHabit(null)}
          onSave={() => { setEditingHabit(null); load(); }}
        />
      )}
    </PremiumPage>
  );
}
