import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useState } from 'react';
import {
  AlarmClock,
  Calendar,
  CalendarX2,
  Check,
  Clock,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';

import {
  api,
  Commitment,
  CommitmentStatus,
  CommitmentType,
  RecurrenceDay,
  Workspace
} from '../api';
import {
  EmptyState,
  PremiumCard,
  PremiumHeader,
  PremiumPage,
  SkeletonBlock
} from '../components/premium-ui';

// ─── constants ───────────────────────────────────────────────────────────────

const DAY_LABELS: Record<RecurrenceDay, string> = {
  seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom'
};
const ALL_DAYS: RecurrenceDay[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const DAY_PRESETS = [
  { label: 'Seg–Sex', days: ['seg', 'ter', 'qua', 'qui', 'sex'] as RecurrenceDay[] },
  { label: 'Seg, Qua, Sex', days: ['seg', 'qua', 'sex'] as RecurrenceDay[] },
  { label: 'Ter, Qui', days: ['ter', 'qui'] as RecurrenceDay[] },
  { label: 'Todo dia', days: ALL_DAYS },
  { label: 'Fim de semana', days: ['sab', 'dom'] as RecurrenceDay[] },
];

// ─── animation variants ───────────────────────────────────────────────────────

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } }
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.16 } }
};

const detailVariants = {
  hidden: { opacity: 0, height: 0 },
  show: { opacity: 1, height: 'auto' as const, transition: { duration: 0.2, ease: EASE_OUT } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.15 } }
};

const overlayVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.15 } }
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.15 } }
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function statusDotClass(s: CommitmentStatus) {
  if (s === 'ativo') return 'agenda-status-dot agenda-status-dot--ativo';
  if (s === 'pausado') return 'agenda-status-dot agenda-status-dot--pausado';
  return 'agenda-status-dot agenda-status-dot--encerrado';
}

function statusLabel(s: CommitmentStatus) {
  return s === 'ativo' ? 'Ativo' : s === 'pausado' ? 'Pausado' : 'Encerrado';
}

function statusPillClass(s: CommitmentStatus) {
  if (s === 'ativo') return 'agenda-status-pill agenda-status-pill--ativo';
  if (s === 'pausado') return 'agenda-status-pill agenda-status-pill--pausado';
  return 'agenda-status-pill agenda-status-pill--encerrado';
}

function areSameDays(a: RecurrenceDay[], b: RecurrenceDay[]) {
  return a.length === b.length && a.every(d => b.includes(d));
}

// ─── form state ───────────────────────────────────────────────────────────────

type FormState = {
  title: string;
  description: string;
  type: CommitmentType;
  startTime: string;
  durationMin: string;
  recurrenceDays: RecurrenceDay[];
  date: string;
  recurrenceEnd: string;
  workspaceId: string;
};

function blankForm(defaultType?: CommitmentType): FormState {
  return {
    title: '',
    description: '',
    type: defaultType ?? 'variavel',
    startTime: '',
    durationMin: '',
    recurrenceDays: [],
    date: todayISO(),
    recurrenceEnd: '',
    workspaceId: ''
  };
}

// ─── CommitmentRow ────────────────────────────────────────────────────────────

type RowProps = {
  commitment: Commitment;
  onEdit: (c: Commitment) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (c: Commitment) => void;
};

function CommitmentRow({ commitment: c, onEdit, onDelete, onToggleStatus }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const isPaused = c.status === 'pausado';
  const isEnded = c.status === 'encerrado';

  return (
    <motion.div
      variants={rowVariants}
      layout
      className={`agenda-row ${isPaused || isEnded ? 'agenda-row--muted' : ''}`}
    >
      {/* Main tap area */}
      <button
        type="button"
        className="agenda-row-main"
        onClick={() => setExpanded(p => !p)}
        aria-expanded={expanded}
      >
        {/* Status indicator — dot for active, pill for paused/ended */}
        {c.status === 'ativo'
          ? <span className={statusDotClass(c.status)} aria-label="Ativo" />
          : <span className={statusPillClass(c.status)}>
              <span className={statusDotClass(c.status)} />
              {statusLabel(c.status)}
            </span>
        }

        {/* Type icon */}
        <span className="agenda-row-type-icon">
          {c.type === 'fixo' ? <RefreshCw size={13} /> : <Calendar size={13} />}
        </span>

        {/* Body */}
        <div className="agenda-row-body">
          <span className="agenda-row-title">{c.title}</span>
          <div className="agenda-row-meta">
            {c.type === 'fixo'
              ? c.recurrenceDays.map(d => (
                <span key={d} className="agenda-day-chip">{DAY_LABELS[d]}</span>
              ))
              : <span className="agenda-meta-item">
                  <Calendar size={10} />
                  {c.date ? formatDate(c.date.slice(0, 10)) : '—'}
                </span>
            }
            {c.startTime && (
              <span className="agenda-meta-item">
                <Clock size={10} /> {c.startTime}
                {c.durationMin ? ` · ${c.durationMin}min` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <motion.span
          className="agenda-row-chevron"
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          ›
        </motion.span>
      </button>

      {/* Detail panel */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            variants={detailVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="agenda-row-detail"
            style={{ overflow: 'hidden' }}
          >
            <div className="agenda-row-detail-inner">
              {c.description && (
                <p className="agenda-detail-desc">{c.description}</p>
              )}
              {c.type === 'fixo' && c.recurrenceEnd && (
                <p className="agenda-detail-info">
                  <CalendarX2 size={11} />
                  Encerra em {formatDate(c.recurrenceEnd.slice(0, 10))}
                </p>
              )}
              {c.exceptions.length > 0 && (
                <p className="agenda-detail-info">
                  {c.exceptions.length} exceção(ões) registrada(s)
                </p>
              )}

              <div className="agenda-row-actions">
                <button
                  type="button"
                  className="agenda-action-btn"
                  onClick={() => onEdit(c)}
                >
                  <Pencil size={12} /> Editar
                </button>
                <button
                  type="button"
                  className="agenda-action-btn"
                  onClick={() => onToggleStatus(c)}
                >
                  {c.status === 'ativo'
                    ? <><AlarmClock size={12} /> Pausar</>
                    : <><RotateCcw size={12} /> Reativar</>}
                </button>
                <button
                  type="button"
                  className="agenda-action-btn agenda-action-btn--danger"
                  onClick={() => onDelete(c.id)}
                >
                  <Trash2 size={12} /> Remover
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── CommitmentForm ───────────────────────────────────────────────────────────

type FormProps = {
  initial?: Commitment | null;
  defaultType?: CommitmentType;
  workspaces: Workspace[];
  onSave: (form: FormState, id?: string) => Promise<void>;
  onCancel: () => void;
};

function CommitmentForm({ initial, defaultType, workspaces, onSave, onCancel }: FormProps) {
  const [form, setForm] = useState<FormState>(() => {
    if (!initial) return blankForm(defaultType);
    return {
      title: initial.title,
      description: initial.description ?? '',
      type: initial.type,
      startTime: initial.startTime ?? '',
      durationMin: initial.durationMin != null ? String(initial.durationMin) : '',
      recurrenceDays: [...initial.recurrenceDays],
      date: initial.date?.slice(0, 10) ?? todayISO(),
      recurrenceEnd: initial.recurrenceEnd?.slice(0, 10) ?? '',
      workspaceId: initial.workspaceId ?? ''
    };
  });
  const [saving, setSaving] = useState(false);

  // Escape to close
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') onCancel();
  }

  function toggleDay(day: RecurrenceDay) {
    setForm(f => ({
      ...f,
      recurrenceDays: f.recurrenceDays.includes(day)
        ? f.recurrenceDays.filter(d => d !== day)
        : [...f.recurrenceDays, day]
    }));
  }

  function applyPreset(days: RecurrenceDay[]) {
    setForm(f => ({ ...f, recurrenceDays: days }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Título obrigatório'); return; }
    if (form.type === 'fixo' && form.recurrenceDays.length === 0) {
      toast.error('Selecione ao menos um dia'); return;
    }
    setSaving(true);
    try {
      await onSave(form, initial?.id);
    } finally {
      setSaving(false);
    }
  }

  const activePreset = DAY_PRESETS.find(p => areSameDays(p.days, form.recurrenceDays));

  return (
    <div onKeyDown={handleKeyDown}>
      <form className="agenda-form" onSubmit={handleSubmit}>
        {/* Header */}
        <div className="agenda-form-header">
          <div>
            <h3>{initial ? 'Editar compromisso' : 'Novo compromisso'}</h3>
            <p className="agenda-form-subtitle">
              {form.type === 'fixo' ? 'Recorrente — repete toda semana' : 'Pontual — data específica'}
            </p>
          </div>
          <button type="button" className="agenda-close-btn" onClick={onCancel} aria-label="Fechar">
            <X size={15} />
          </button>
        </div>

        {/* Type toggle */}
        <div className="agenda-type-toggle">
          <button
            type="button"
            className={`agenda-type-btn ${form.type === 'variavel' ? 'active' : ''}`}
            onClick={() => setForm(f => ({ ...f, type: 'variavel' }))}
          >
            <Calendar size={14} />
            <span>Pontual</span>
          </button>
          <button
            type="button"
            className={`agenda-type-btn ${form.type === 'fixo' ? 'active' : ''}`}
            onClick={() => setForm(f => ({ ...f, type: 'fixo' }))}
          >
            <RefreshCw size={14} />
            <span>Recorrente</span>
          </button>
        </div>

        {/* Section: O que */}
        <div className="agenda-form-section">
          <div className="agenda-form-field">
            <label htmlFor="ag-title">Título *</label>
            <input
              id="ag-title"
              className="agenda-input"
              placeholder="Ex: Academia, Reunião de equipe, Meditação…"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div className="agenda-form-field">
            <label htmlFor="ag-desc">Observações <span className="agenda-optional">opcional</span></label>
            <input
              id="ag-desc"
              className="agenda-input"
              placeholder="Detalhes adicionais…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>

        {/* Section: Quando */}
        <div className="agenda-form-section">
          <p className="agenda-form-section-label">Quando</p>

          {form.type === 'variavel' ? (
            <div className="agenda-form-field">
              <label htmlFor="ag-date">Data</label>
              <input
                id="ag-date"
                type="date"
                className="agenda-input"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
          ) : (
            <>
              {/* Presets */}
              <div className="agenda-form-field">
                <label>Presets</label>
                <div className="agenda-presets">
                  {DAY_PRESETS.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      className={`agenda-preset-btn ${activePreset?.label === p.label ? 'active' : ''}`}
                      onClick={() => applyPreset(p.days)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day grid */}
              <div className="agenda-form-field">
                <label>Dias da semana *</label>
                <div className="agenda-days-picker">
                  {ALL_DAYS.map(d => (
                    <button
                      key={d}
                      type="button"
                      className={`agenda-day-pick ${form.recurrenceDays.includes(d) ? 'active' : ''}`}
                      onClick={() => toggleDay(d)}
                    >
                      {form.recurrenceDays.includes(d) && <Check size={9} />}
                      {DAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="agenda-form-split">
                <div className="agenda-form-field">
                  <label htmlFor="ag-start-date">Início <span className="agenda-optional">opcional</span></label>
                  <input
                    id="ag-start-date"
                    type="date"
                    className="agenda-input"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="agenda-form-field">
                  <label htmlFor="ag-end-date">Encerra em <span className="agenda-optional">opcional</span></label>
                  <input
                    id="ag-end-date"
                    type="date"
                    className="agenda-input"
                    value={form.recurrenceEnd}
                    onChange={e => setForm(f => ({ ...f, recurrenceEnd: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Section: Horário */}
        <div className="agenda-form-section">
          <p className="agenda-form-section-label">Horário <span className="agenda-optional">opcional</span></p>
          <div className="agenda-form-split">
            <div className="agenda-form-field">
              <label htmlFor="ag-time">Início</label>
              <input
                id="ag-time"
                type="time"
                className="agenda-input"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div className="agenda-form-field">
              <label htmlFor="ag-dur">Duração (min)</label>
              <input
                id="ag-dur"
                type="number"
                min={1}
                max={1440}
                className="agenda-input"
                placeholder="60"
                value={form.durationMin}
                onChange={e => setForm(f => ({ ...f, durationMin: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Section: Frente */}
        {workspaces.length > 0 && (
          <div className="agenda-form-section">
            <div className="agenda-form-field">
              <label htmlFor="ag-ws">Frente <span className="agenda-optional">opcional</span></label>
              <select
                id="ag-ws"
                className="agenda-input"
                value={form.workspaceId}
                onChange={e => setForm(f => ({ ...f, workspaceId: e.target.value }))}
              >
                <option value="">Sem frente</option>
                {workspaces.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="agenda-form-footer">
          <button type="button" className="agenda-cancel-btn" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="agenda-save-btn" disabled={saving}>
            {saving
              ? 'Salvando…'
              : initial ? <><Check size={14} /> Salvar</>  : <><Plus size={14} /> Criar</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

type SectionProps = {
  title: string;
  subtitle: string;
  count: number;
  icon: React.ReactNode;
  onAdd: () => void;
  children: React.ReactNode;
};

function SectionCard({ title, subtitle, count, icon, onAdd, children }: SectionProps) {
  return (
    <PremiumCard
      title={title}
      subtitle={subtitle}
      actions={
        <button
          type="button"
          className="agenda-section-add"
          onClick={onAdd}
          title={`Adicionar ${title.toLowerCase()}`}
        >
          <Plus size={13} />
        </button>
      }
    >
      {count === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="agenda-section-empty"
        >
          <span className="agenda-section-empty-icon">{icon}</span>
          <p>Nenhum compromisso ainda</p>
          <button type="button" className="agenda-empty-add-btn" onClick={onAdd}>
            <Plus size={13} /> Adicionar
          </button>
        </motion.div>
      ) : (
        <motion.div
          className="agenda-list"
          variants={listVariants}
          initial="hidden"
          animate="show"
        >
          {children}
        </motion.div>
      )}
    </PremiumCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterType = 'todos' | CommitmentType;

export function AgendaPage() {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Commitment | null>(null);
  const [defaultFormType, setDefaultFormType] = useState<CommitmentType>('variavel');
  const [filterType, setFilterType] = useState<FilterType>('todos');

  const load = useCallback(async () => {
    const [cs, ws] = await Promise.all([
      api.getCommitments(),
      api.getWorkspaces()
    ]);
    setCommitments(cs);
    setWorkspaces(ws);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keyboard shortcut: N = new commitment
  useEffect(() => {
    function handleKey(e: globalThis.KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setEditing(null);
        setDefaultFormType('variavel');
        setShowForm(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  async function handleSave(form: FormState, id?: string) {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      startTime: form.startTime || null,
      durationMin: form.durationMin ? Number(form.durationMin) : null,
      recurrenceDays: form.type === 'fixo' ? form.recurrenceDays : [],
      date: form.date || null,
      recurrenceEnd: form.type === 'fixo' && form.recurrenceEnd ? form.recurrenceEnd : null,
      workspaceId: form.workspaceId || null
    };

    if (id) {
      await api.updateCommitment(id, payload);
      toast.success('Compromisso atualizado');
    } else {
      await api.createCommitment(payload);
      toast.success('Compromisso criado');
    }

    setShowForm(false);
    setEditing(null);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este compromisso permanentemente?')) return;
    await api.deleteCommitment(id, true);
    toast.success('Removido');
    await load();
  }

  async function handleToggleStatus(c: Commitment) {
    const next: CommitmentStatus = c.status === 'ativo' ? 'pausado' : 'ativo';
    await api.updateCommitment(c.id, { status: next });
    toast.success(next === 'ativo' ? 'Reativado' : 'Pausado');
    await load();
  }

  function openEdit(c: Commitment) {
    setEditing(c);
    setShowForm(true);
  }

  function openNew(type: CommitmentType) {
    setEditing(null);
    setDefaultFormType(type);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  const filtered = filterType === 'todos' ? commitments : commitments.filter(c => c.type === filterType);
  const fixos = filtered.filter(c => c.type === 'fixo');
  const variaveis = filtered.filter(c => c.type === 'variavel');
  const activeCount = commitments.filter(c => c.status === 'ativo').length;
  const fixoCount = commitments.filter(c => c.type === 'fixo').length;
  const varCount = commitments.filter(c => c.type === 'variavel').length;

  return (
    <PremiumPage>
      <PremiumHeader
        title="Agenda"
        subtitle={`${activeCount} ativo${activeCount !== 1 ? 's' : ''} · ${fixoCount} fixo${fixoCount !== 1 ? 's' : ''} · ${varCount} variável${varCount !== 1 ? 'eis' : ''}`}
        actions={
          <div className="agenda-header-actions">
            {/* Filter tabs */}
            <div className="agenda-filter-tabs">
              {(['todos', 'fixo', 'variavel'] as FilterType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`agenda-filter-tab ${filterType === t ? 'active' : ''}`}
                  onClick={() => setFilterType(t)}
                >
                  {t === 'todos' ? 'Todos' : t === 'fixo' ? 'Recorrentes' : 'Pontuais'}
                </button>
              ))}
            </div>

            {/* New button */}
            <button
              type="button"
              className="agenda-add-btn"
              onClick={() => openNew('variavel')}
              title="Novo compromisso (N)"
            >
              <Plus size={14} /> Novo
            </button>
          </div>
        }
      />

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            className="agenda-form-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={e => { if (e.target === e.currentTarget) closeForm(); }}
          >
            <motion.div
              className="agenda-form-card"
              variants={panelVariants}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <CommitmentForm
                initial={editing}
                defaultType={defaultFormType}
                workspaces={workspaces}
                onSave={handleSave}
                onCancel={closeForm}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <PremiumCard>
          <SkeletonBlock lines={5} height={56} />
        </PremiumCard>
      ) : commitments.length === 0 ? (
        <PremiumCard>
          <EmptyState
            title="Sua agenda está vazia"
            description="Adicione compromissos fixos (academia, reunião semanal) ou pontuais (consulta médica, viagem). Eles aparecem no Hoje e chegam via WhatsApp."
            actionLabel="+ Primeiro compromisso"
            onAction={() => openNew('variavel')}
          />
        </PremiumCard>
      ) : (
        <>
          {/* Recorrentes */}
          {(filterType === 'todos' || filterType === 'fixo') && (
            <SectionCard
              title="Recorrentes"
              subtitle="Repetem toda semana"
              count={fixos.length}
              icon={<RefreshCw size={22} />}
              onAdd={() => openNew('fixo')}
            >
              <AnimatePresence>
                {fixos.map(c => (
                  <CommitmentRow
                    key={c.id}
                    commitment={c}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggleStatus={handleToggleStatus}
                  />
                ))}
              </AnimatePresence>
            </SectionCard>
          )}

          {/* Pontuais */}
          {(filterType === 'todos' || filterType === 'variavel') && (
            <SectionCard
              title="Pontuais"
              subtitle="Datas específicas"
              count={variaveis.length}
              icon={<Calendar size={22} />}
              onAdd={() => openNew('variavel')}
            >
              <AnimatePresence>
                {variaveis.map(c => (
                  <CommitmentRow
                    key={c.id}
                    commitment={c}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggleStatus={handleToggleStatus}
                  />
                ))}
              </AnimatePresence>
            </SectionCard>
          )}
        </>
      )}

      {/* Keyboard hint */}
      {!showForm && commitments.length > 0 && (
        <p className="agenda-keyboard-hint">Pressione <kbd>N</kbd> para criar novo compromisso</p>
      )}
    </PremiumPage>
  );
}
