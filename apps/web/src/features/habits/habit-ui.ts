import { Brain, Briefcase, Dumbbell, Heart, Leaf, TrendingUp, type LucideIcon } from 'lucide-react';
import type { HabitFrequency, HabitLifeArea, RecurrenceDay } from '../../api';

export type LifeAreaDefinition = {
  key: HabitLifeArea;
  label: string;
  icon: LucideIcon;
  color: string;
};

export const LIFE_AREAS: LifeAreaDefinition[] = [
  { key: 'corpo', label: 'Corpo', icon: Dumbbell, color: '#e07c4a' },
  { key: 'mente', label: 'Mente', icon: Brain, color: '#818cf8' },
  { key: 'trabalho', label: 'Trabalho', icon: Briefcase, color: '#5bb98c' },
  { key: 'relacoes', label: 'Relações', icon: Heart, color: '#d46464' },
  { key: 'financas', label: 'Finanças', icon: TrendingUp, color: '#d4a843' },
  { key: 'crescimento', label: 'Crescimento', icon: Leaf, color: '#7dd3fc' },
];

export const AREA_MAP = Object.fromEntries(LIFE_AREAS.map((area) => [area.key, area])) as Record<HabitLifeArea, LifeAreaDefinition>;
export const ALL_DAYS: RecurrenceDay[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
export const DAY_LABELS: Record<RecurrenceDay, string> = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };
export const FREQUENCY_LABELS: Record<HabitFrequency, string> = {
  daily: 'Todos os dias', weekly: 'Por semana', monthly: 'Por mês', specific_days: 'Dias específicos'
};

export function habitIncrement(unit: string | null) {
  if (unit?.toLowerCase().includes('pág')) return 10;
  if (unit === 'min' || unit?.toLowerCase().includes('minuto')) return 5;
  return 1;
}
