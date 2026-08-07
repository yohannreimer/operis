import { useState, type ComponentType } from 'react';
import {
  BadgeDollarSign,
  CalendarClock,
  CircleDollarSign,
  FlaskConical,
  Funnel,
  Goal,
  GraduationCap,
  Kanban,
  Landmark,
  PackageCheck,
  Repeat2,
  Scale,
  ShieldCheck,
  TrendingUp,
  Waypoints,
  type LucideIcon
} from 'lucide-react';

import type { MethodologyData, ProjectMethodology } from '../../api';
import type { ProjectCockpit } from './types';
import { MetricEngine } from './engines/metric-engine';
import { MilestoneEngine } from './engines/milestone-engine';
import { PipelineEngine } from './engines/pipeline-engine';
import { ExplorationEngine } from './engines/exploration-engine';
import { FunnelEngine } from './engines/funnel-engine';
import { CampaignEngine } from './engines/campaign-engine';
import { DecisionEngine } from './engines/decision-engine';
import { OkrEngine } from './engines/okr-engine';
import { RecurringEngine } from './engines/recurring-engine';

export type ProjectWizardValues = {
  methodology: ProjectMethodology | null;
  title: string;
  workspaceId: string;
  objective: string;
  timeHorizonEnd: string;
  methodologyData: MethodologyData;
  nextMove: string;
  nextMoveDestination: 'project' | 'backlog' | 'today';
};

export type ProjectEngineViewProps = {
  project: ProjectCockpit;
  data: MethodologyData;
  onReload: () => void;
};

export type EngineDefinition = {
  methodology: ProjectMethodology;
  canonicalMethodology: ProjectMethodology;
  intentLabel: string;
  methodLabel: string;
  description: string;
  icon: LucideIcon;
  primary: boolean;
  validateSetup(values: ProjectWizardValues): Record<string, string>;
  View: ComponentType<ProjectEngineViewProps>;
};

function PendingEngineView({ project }: ProjectEngineViewProps) {
  return <div className="project-engine-pending">Motor de {project.methodLabel} em preparação.</div>;
}

function requireDirection(values: ProjectWizardValues): Record<string, string> {
  return values.objective.trim().length >= 2
    ? {}
    : { objective: 'Escreva uma direção clara para o Projeto.' };
}

const definitions: Record<ProjectMethodology, EngineDefinition> = {} as Record<ProjectMethodology, EngineDefinition>;

function define(
  methodology: ProjectMethodology,
  intentLabel: string,
  methodLabel: string,
  description: string,
  icon: LucideIcon,
  primary: boolean
) {
  definitions[methodology] = {
    methodology,
    canonicalMethodology: methodology,
    intentLabel,
    methodLabel,
    description,
    icon,
    primary,
    validateSetup: requireDirection,
    View: PendingEngineView
  };
}

define('fourdx', 'Atingir uma meta', '4DX', 'Um placar claro e ações semanais que você controla.', TrendingUp, true);
define('entrega', 'Entregar algo', 'Marcos', 'Transforme uma entrega concreta numa sequência visível.', PackageCheck, true);
define('pipeline', 'Vender', 'Pipeline', 'Faça cada oportunidade avançar até o fechamento.', Kanban, true);
define('exploracao', 'Validar uma ideia', 'Experimentos', 'Colete evidências antes de investir pesado.', FlaskConical, true);
define('campanha', 'Executar um lançamento', 'Campanha', 'Orquestre prazo, canal e atividades críticas.', CalendarClock, true);
define('decisao', 'Tomar uma decisão', 'Matriz', 'Compare opções sem deixar a escolha se arrastar.', Scale, true);
define('okr', 'Coordenar vários resultados', 'OKR', 'Mantenha resultados-chave puxando a mesma direção.', Goal, true);

define('captacao', 'Captar recursos', 'Captação', 'Acompanhe conversas, valores e probabilidade.', Landmark, false);
define('mentoria', 'Desenvolver alguém', 'Mentoria', 'Sessões, aprendizados e compromissos em sequência.', GraduationCap, false);
define('autoridade', 'Construir autoridade', 'Provas', 'Acumule evidências públicas do seu trabalho.', ShieldCheck, false);
define('cenario', 'Preparar cenários', 'Cenários', 'Encontre ações robustas diante da incerteza.', Waypoints, false);
define('runway', 'Preservar caixa', 'Runway', 'Antecipe eventos e proteja meses de operação.', CircleDollarSign, false);
define('sistema_receita', 'Construir receita', 'Sistema de receita', 'Defina critérios para repetir o caminho da venda.', BadgeDollarSign, false);
define('funil', 'Melhorar conversão', 'Funil', 'Encontre e ataque a maior perda entre etapas.', Funnel, false);
define('processo', 'Manter um processo', 'Processo legado', 'Ciclo recorrente preservado para Projetos existentes.', Repeat2, false);

definitions.fourdx.View = MetricEngine;
definitions.entrega.View = MilestoneEngine;
definitions.autoridade.View = MilestoneEngine;
definitions.pipeline.View = PipelineEngine;
definitions.captacao.View = PipelineEngine;
definitions.sistema_receita.View = PipelineEngine;
definitions.exploracao.View = ExplorationEngine;
definitions.mentoria.View = ExplorationEngine;
definitions.funil.View = FunnelEngine;
definitions.campanha.View = CampaignEngine;
definitions.runway.View = CampaignEngine;
definitions.decisao.View = DecisionEngine;
definitions.cenario.View = DecisionEngine;
definitions.okr.View = OkrEngine;
definitions.processo.View = RecurringEngine;

function legacy(methodology: ProjectMethodology, canonical: ProjectMethodology) {
  definitions[methodology] = {
    ...definitions[canonical],
    methodology,
    canonicalMethodology: canonical,
    primary: false
  };
}

legacy('delivery', 'entrega');
legacy('launch', 'campanha');
legacy('discovery', 'exploracao');
legacy('growth', 'exploracao');

export const primaryMethodologies: ProjectMethodology[] = [
  'fourdx', 'entrega', 'pipeline', 'exploracao', 'campanha', 'decisao', 'okr'
];

export const advancedMethodologies: ProjectMethodology[] = [
  'captacao', 'mentoria', 'autoridade', 'cenario', 'runway', 'sistema_receita', 'funil'
];

export function getEngineDefinition(methodology: ProjectMethodology) {
  return definitions[methodology];
}

export function ProjectMethodologyPicker({
  value,
  onChange
}: {
  value: ProjectMethodology | null;
  onChange: (methodology: ProjectMethodology) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const visible = showAdvanced
    ? [...primaryMethodologies, ...advancedMethodologies]
    : primaryMethodologies;

  return (
    <div className="project-methodology-picker">
      <div className="project-methodology-grid">
        {visible.map((methodology) => {
          const definition = getEngineDefinition(methodology);
          const Icon = definition.icon;
          const selected = value === methodology;
          return (
            <button
              key={methodology}
              type="button"
              className="project-methodology-option"
              data-selected={selected || undefined}
              aria-pressed={selected}
              aria-label={`Escolher ${definition.intentLabel}`}
              onClick={() => onChange(methodology)}
            >
              <span className="project-methodology-option__icon"><Icon size={20} strokeWidth={1.8} /></span>
              <span className="project-methodology-option__copy">
                <strong>{definition.intentLabel}</strong>
                <small>{definition.methodLabel}</small>
                <span>{definition.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!showAdvanced && (
        <button type="button" className="project-methodology-more" onClick={() => setShowAdvanced(true)}>
          Ver todos os métodos
        </button>
      )}
    </div>
  );
}
