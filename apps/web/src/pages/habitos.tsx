import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

// Area order for hexagon: corpo(top), mente(top-right), financas(bottom-right),
// crescimento(bottom), relacoes(bottom-left), trabalho(top-left)
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

interface HabitRadarProps {
  stats: HabitRadarStats | null;
}

function HabitRadar({ stats }: HabitRadarProps) {
  const angles = RADAR_AREAS.map((_, i) => (Math.PI * (270 + 60 * i)) / 180);

  const gridLevels = [2, 4, 6, 8, 10];

  function makePolygon(levels: number[]) {
    return levels
      .map((lvl, i) => {
        const r = levelToRadius(lvl);
        const { x, y } = polarToXY(angles[i], r);
        return `${x},${y}`;
      })
      .join(' ');
  }

  const areaLevels = RADAR_AREAS.map((area) => stats?.[area]?.level ?? 1);
  const filledPolygon = makePolygon(areaLevels);

  return (
    <svg viewBox={`-50 -40 ${RADAR_SIZE + 100} ${RADAR_SIZE + 80}`} className="habit-radar-svg">
      {/* Grid lines */}
      {gridLevels.map((gl) => {
        const pts = angles
          .map((angle) => {
            const r = levelToRadius(gl);
            const { x, y } = polarToXY(angle, r);
            return `${x},${y}`;
          })
          .join(' ');
        return (
          <polygon
            key={gl}
            points={pts}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        );
      })}

      {/* Axis lines */}
      {angles.map((angle, i) => {
        const outer = polarToXY(angle, RADAR_MAX_RADIUS);
        return (
          <line
            key={i}
            x1={RADAR_CENTER}
            y1={RADAR_CENTER}
            x2={outer.x}
            y2={outer.y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        );
      })}

      {/* SVG defs — gradient + glow filter */}
      <defs>
        <radialGradient id="radar-fill-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(224,124,74,0.35)" />
          <stop offset="60%" stopColor="rgba(129,140,248,0.2)" />
          <stop offset="100%" stopColor="rgba(91,185,140,0.1)" />
        </radialGradient>
        <filter id="radar-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Filled polygon — gradient fill */}
      <polygon
        points={filledPolygon}
        fill="url(#radar-fill-gradient)"
        stroke="none"
      />
      {/* Stroke polygon with glow */}
      <polygon
        points={filledPolygon}
        fill="none"
        stroke="rgba(224,124,74,0.7)"
        strokeWidth={1.5}
        filter="url(#radar-glow)"
      />
      {/* Vertex dots — colored per area */}
      {RADAR_AREAS.map((area, i) => {
        const lvl = stats?.[area]?.level ?? 1;
        const r = levelToRadius(lvl);
        const { x, y } = polarToXY(angles[i], r);
        return (
          <circle
            key={`dot-${area}`}
            cx={x}
            cy={y}
            r={4}
            fill={AREA_MAP[area].color}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
            filter="url(#radar-glow)"
          />
        );
      })}

      {/* Labels */}
      {RADAR_AREAS.map((area, i) => {
        const angle = angles[i];
        const labelRadius = RADAR_MAX_RADIUS + 32;
        const { x, y } = polarToXY(angle, labelRadius);
        const info = AREA_MAP[area];
        const level = stats?.[area]?.level ?? 1;
        const textAnchor =
          x < RADAR_CENTER - 10 ? 'end' : x > RADAR_CENTER + 10 ? 'start' : 'middle';

        return (
          <g key={area}>
            <text
              x={x}
              y={y - 6}
              textAnchor={textAnchor}
              fontSize={11}
              fill="rgba(255,255,255,0.85)"
              fontWeight="600"
            >
              {info.emoji} {info.label}
            </text>
            <text
              x={x}
              y={y + 8}
              textAnchor={textAnchor}
              fontSize={10}
              fill={info.color}
              fontWeight="700"
            >
              Nv.{level}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── HabitRow ─────────────────────────────────────────────────────────────────

interface HabitRowProps {
  stat: HabitTodayStat;
  date: string;
  onLog: (id: string, value?: number) => Promise<void>;
  onRecaiu: (id: string) => Promise<void>;
  busy: boolean;
}

function HabitRow({ stat, date: _date, onLog, onRecaiu, busy }: HabitRowProps) {
  const { type, title, streak, currentLog, periodProgress, isCompletedToday, dailyTarget, unit } = stat;

  if (type === 'binary') {
    return (
      <div className="habit-row">
        <button
          className={`habit-row-check ${isCompletedToday ? 'done' : ''}`}
          onClick={() => onLog(stat.id)}
          disabled={busy}
          title={isCompletedToday ? 'Marcar como não feito' : 'Marcar como feito'}
          aria-label={isCompletedToday ? `${title}: feito. Clique para desfazer` : `Marcar ${title} como feito`}
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
        {streak > 1 && (
          <span className="habit-streak">🔥 {streak}</span>
        )}
        <div className="habit-row-actions">
          <button
            className={`habit-btn-done ${isCompletedToday ? 'done' : ''}`}
            onClick={() => onLog(stat.id)}
            disabled={busy}
          >
            {isCompletedToday ? '✓ Feito' : 'Feito'}
          </button>
        </div>
      </div>
    );
  }

  if (type === 'quantitative') {
    const current = currentLog?.value ?? 0;
    const target = dailyTarget ?? 1;
    const pct = Math.min(100, Math.round((current / target) * 100));
    const isComplete = pct >= 100;
    const incrementUnit = unit === 'páginas' ? 10 : unit === 'copos' ? 1 : 1;
    const incrementLabel = unit ? `+${incrementUnit} ${unit}` : `+${incrementUnit}`;

    return (
      <div className="habit-row">
        <div className="habit-row-info">
          <div className={`habit-row-title ${isComplete ? 'done-title' : ''}`}>
            {stat.icon ? `${stat.icon} ` : ''}{title}
          </div>
          <div className="habit-progress-bar">
            <div
              className={`habit-progress-fill ${isComplete ? 'complete' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="habit-row-sub">
            {current} / {target} {unit ?? ''}{periodProgress ? ` · ${periodProgress.done}/${periodProgress.target} este ${stat.frequencyType === 'weekly' ? 'semana' : 'mês'}` : ''}
          </div>
        </div>
        {streak > 1 && (
          <span className="habit-streak">🔥 {streak}</span>
        )}
        <div className="habit-row-actions">
          <button
            className="habit-btn-increment"
            onClick={() => onLog(stat.id, incrementUnit)}
            disabled={busy}
            title={incrementLabel}
          >
            {incrementLabel}
          </button>
        </div>
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
        <button
          className="habit-btn-recaiu"
          onClick={() => onRecaiu(stat.id)}
          disabled={busy || recaiu}
        >
          {recaiu ? 'Recaído' : 'Recaí'}
        </button>
      </div>
    </div>
  );
}

// ─── HabitAreaSection ─────────────────────────────────────────────────────────

interface HabitAreaSectionProps {
  area: (typeof LIFE_AREAS)[number];
  habits: HabitTodayStat[];
  date: string;
  onLog: (id: string, value?: number) => Promise<void>;
  onRecaiu: (id: string) => Promise<void>;
  busy: boolean;
}

function HabitAreaSection({ area, habits, date, onLog, onRecaiu, busy }: HabitAreaSectionProps) {
  const done = habits.filter((h) => h.isCompletedToday).length;
  const allDone = done === habits.length;

  return (
    <div
      className="habit-area-section"
      style={{ borderLeftColor: area.color }}
    >
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
          onRecaiu={onRecaiu}
          busy={busy}
        />
      ))}
    </div>
  );
}

// ─── HabitCreateModal ─────────────────────────────────────────────────────────

interface HabitCreateModalProps {
  onClose: () => void;
  onCreate: () => void;
}

function HabitCreateModal({ onClose, onCreate }: HabitCreateModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState('');
  const [lifeArea, setLifeArea] = useState<HabitLifeArea | null>(null);
  const [type, setType] = useState<HabitType | null>(null);
  const [frequencyType, setFrequencyType] = useState<HabitFrequency>('daily');
  const [frequencyTarget, setFrequencyTarget] = useState(3);
  const [specificDays, setSpecificDays] = useState<RecurrenceDay[]>([]);
  const [unit, setUnit] = useState('');
  const [dailyTarget, setDailyTarget] = useState<number | ''>('');
  const [icon, setIcon] = useState('');
  const [saving, setSaving] = useState(false);

  const canGoToStep2 = Boolean(title.trim() && lifeArea && type);
  const canGoToStep3 = type === 'quantitative';

  async function handleSubmit() {
    if (!lifeArea || !type) return;
    setSaving(true);
    try {
      await api.createHabit({
        title: title.trim(),
        lifeArea,
        type,
        frequencyType,
        frequencyTarget: frequencyType === 'weekly' || frequencyType === 'monthly' ? frequencyTarget : 1,
        specificDays: frequencyType === 'specific_days' ? specificDays : [],
        unit: unit.trim() || undefined,
        dailyTarget: dailyTarget !== '' ? Number(dailyTarget) : undefined,
        icon: icon.trim() || undefined,
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
    if (step === 1 && canGoToStep2) {
      if (canGoToStep3) {
        setStep(2);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      if (type === 'quantitative') {
        setStep(3);
      } else {
        handleSubmit();
      }
    } else {
      handleSubmit();
    }
  }

  const typeOptions: Array<{ key: HabitType; icon: string; label: string; desc: string }> = [
    { key: 'binary', icon: '✓', label: 'Binário', desc: 'Feito ou não feito' },
    { key: 'quantitative', icon: '📊', label: 'Quantitativo', desc: 'Mede quantidade' },
    { key: 'vice', icon: '🚫', label: 'Vício', desc: 'Dias sem recair' },
  ];

  return (
    <div className="habit-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="habit-modal">
        {/* Step dots */}
        <div className="habit-modal-steps">
          {([1, 2, ...(type === 'quantitative' ? [3] : [])] as number[]).map((s) => (
            <div
              key={s}
              className={`habit-modal-step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`}
            />
          ))}
          <span className="habit-modal-step-label">
            {step === 1 && 'Definição'}
            {step === 2 && 'Frequência'}
            {step === 3 && 'Meta'}
          </span>
        </div>
        <div className="habit-modal-title">
          {step === 1 && 'Novo hábito'}
          {step === 2 && 'Com que frequência?'}
          {step === 3 && 'Qual é a meta diária?'}
        </div>

        {step === 1 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Nome do hábito
              </label>
              <input
                className="premium-input"
                placeholder="Ex: Exercício, Leitura, Meditação..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                Emoji (opcional)
              </label>
              <input
                className="premium-input"
                placeholder="💪"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                style={{ width: 80 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                Área da vida
              </label>
              <div className="habit-area-grid">
                {LIFE_AREAS.map((area) => (
                  <button
                    key={area.key}
                    className={`habit-area-btn ${lifeArea === area.key ? 'selected' : ''}`}
                    style={{ '--area-color': area.color } as React.CSSProperties}
                    onClick={() => setLifeArea(area.key)}
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
                {typeOptions.map((opt) => (
                  <button
                    key={opt.key}
                    className={`habit-type-btn ${type === opt.key ? 'selected' : ''}`}
                    onClick={() => setType(opt.key)}
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

        {step === 2 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                Frequência
              </label>
              {(['daily', 'weekly', 'monthly', 'specific_days'] as HabitFrequency[]).map((freq) => {
                const labels: Record<HabitFrequency, string> = {
                  daily: 'Diário',
                  weekly: 'Semanal',
                  monthly: 'Mensal',
                  specific_days: 'Dias específicos',
                };
                return (
                  <label
                    key={freq}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="frequency"
                      value={freq}
                      checked={frequencyType === freq}
                      onChange={() => setFrequencyType(freq)}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{labels[freq]}</span>
                  </label>
                );
              })}
            </div>

            {(frequencyType === 'weekly' || frequencyType === 'monthly') && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  Quantidade por {frequencyType === 'weekly' ? 'semana' : 'mês'}
                </label>
                <input
                  type="number"
                  className="premium-input"
                  min={1}
                  max={frequencyType === 'weekly' ? 7 : 31}
                  value={frequencyTarget}
                  onChange={(e) => setFrequencyTarget(Number(e.target.value))}
                  style={{ width: 100 }}
                />
              </div>
            )}

            {frequencyType === 'specific_days' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                  Selecione os dias
                </label>
                <div className="habit-days-grid">
                  {ALL_DAYS.map((day) => (
                    <button
                      key={day}
                      className={`habit-day-btn ${specificDays.includes(day) ? 'selected' : ''}`}
                      onClick={() =>
                        setSpecificDays((prev) =>
                          prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                        )
                      }
                    >
                      {DAY_LABELS[day]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Unidade (ex: páginas, copos, km)
              </label>
              <input
                className="premium-input"
                placeholder="páginas"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Meta diária
              </label>
              <input
                type="number"
                className="premium-input"
                placeholder="50"
                value={dailyTarget}
                onChange={(e) => setDailyTarget(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ width: 120 }}
              />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          {step > 1 && (
            <button
              className="premium-btn-secondary"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              disabled={saving}
            >
              Voltar
            </button>
          )}
          <button className="premium-btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            className="premium-btn"
            onClick={nextStep}
            disabled={saving || (step === 1 && !canGoToStep2)}
          >
            {saving ? 'Salvando...' : step === 3 || (step === 2 && type !== 'quantitative') ? 'Criar hábito' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HabitAnalysis ────────────────────────────────────────────────────────────

interface HabitAnalysisProps {
  habits: Habit[];
}

function HabitAnalysis({ habits }: HabitAnalysisProps) {
  const [selectedHabit, setSelectedHabit] = useState<string | null>(habits[0]?.id ?? null);
  const [heatmapData, setHeatmapData] = useState<{ logs: HabitLog[]; startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    if (!selectedHabit) return;
    api.getHabitHeatmap(selectedHabit, 365).then((data) => setHeatmapData(data)).catch(() => {});
  }, [selectedHabit]);

  if (habits.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Nenhum hábito ainda.</p>;
  }

  const logSet = new Set(heatmapData?.logs.map((l) => l.date) ?? []);
  const logValues = new Map(heatmapData?.logs.map((l) => [l.date, l.value]) ?? []);

  // Build 365 days grid
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
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginRight: 8 }}>Hábito:</label>
        <select
          className="premium-input"
          value={selectedHabit ?? ''}
          onChange={(e) => setSelectedHabit(e.target.value)}
          style={{ display: 'inline-block', width: 'auto' }}
        >
          {habits.map((h) => (
            <option key={h.id} value={h.id}>{h.title}</option>
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
    } catch {
      toast.error('Erro ao carregar hábitos');
    } finally {
      setReady(true);
    }
  }, [date]);

  useEffect(() => {
    setReady(false);
    load();
  }, [load]);

  const handleLog = useCallback(
    async (id: string, value?: number) => {
      setBusy(true);
      try {
        await api.logHabit(id, { date, value });
        await load();
      } catch {
        toast.error('Erro ao registrar hábito');
      } finally {
        setBusy(false);
      }
    },
    [date, load]
  );

  const handleRecaiu = useCallback(
    async (id: string) => {
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
    },
    [date, load]
  );

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

  return (
    <PremiumPage>
      <PremiumHeader
        title="Hábitos"
        actions={
          <button className="premium-btn" onClick={() => setShowCreateModal(true)}>
            + Novo hábito
          </button>
        }
      />

      {/* Date nav */}
      <div className="habit-date-nav">
        <button
          className="habit-date-nav-btn"
          onClick={() => setDate(addDays(date, -1))}
          aria-label="Dia anterior"
        >
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
        <button
          className="habit-date-nav-btn"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= todayStr}
          aria-label="Próximo dia"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Radar */}
      <PremiumCard>
        {!ready ? (
          <SkeletonBlock lines={1} height={300} />
        ) : (
          <HabitRadar stats={radar} />
        )}
      </PremiumCard>

      {/* Today habits */}
      {!ready ? (
        <PremiumCard>
          <SkeletonBlock lines={4} height={52} />
        </PremiumCard>
      ) : habits.length === 0 ? (
        <PremiumCard>
          <EmptyState
            title="Nenhum hábito ainda"
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
              onRecaiu={handleRecaiu}
              busy={busy}
            />
          ))}
        </PremiumCard>
      )}

      {/* Analysis toggle */}
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
              <PremiumCard>
                <HabitAnalysis habits={allHabits} />
              </PremiumCard>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <HabitCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreate={() => {
            setShowCreateModal(false);
            load();
          }}
        />
      )}
    </PremiumPage>
  );
}
