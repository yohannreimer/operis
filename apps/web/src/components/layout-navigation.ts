import {
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarClock,
  LayoutDashboard,
  ListTodo,
  NotebookPen,
  Settings,
  Target,
  type LucideIcon,
} from 'lucide-react';

export type ShellLink = {
  to: string;
  label: string;
  caption: string;
  icon: LucideIcon;
};

export type ShellGroup = {
  id: 'plan' | 'organize' | 'evolve';
  label: 'Planejar' | 'Organizar' | 'Evoluir';
  links: ShellLink[];
};

export const shellGroups: ShellGroup[] = [
  {
    id: 'plan',
    label: 'Planejar',
    links: [
      { to: '/hoje', label: 'Hoje', caption: 'Execução diária', icon: CalendarCheck2 },
      { to: '/agenda', label: 'Agenda', caption: 'Compromissos', icon: CalendarClock },
    ],
  },
  {
    id: 'organize',
    label: 'Organizar',
    links: [
      { to: '/tarefas', label: 'Tarefas', caption: 'Backlog e inbox', icon: ListTodo },
      { to: '/projetos', label: 'Projetos', caption: 'Entregas ativas', icon: BriefcaseBusiness },
      { to: '/frentes', label: 'Frentes', caption: 'Estratégia e frentes', icon: Building2 },
      { to: '/notas', label: 'Notas', caption: 'Segundo cérebro', icon: NotebookPen },
    ],
  },
  {
    id: 'evolve',
    label: 'Evoluir',
    links: [
      { to: '/habitos', label: 'Hábitos', caption: 'Ritual e consistência', icon: Target },
      { to: '/dashboard', label: 'Dashboard', caption: 'Métricas e ritual', icon: LayoutDashboard },
    ],
  },
];

export const settingsLink: ShellLink = {
  to: '/configuracoes',
  label: 'Configurações',
  caption: 'Conta e sistema',
  icon: Settings,
};

export const shellLinks = [...shellGroups.flatMap((group) => group.links), settingsLink];

export function getMobilePrimaryLinks() {
  const primaryRoutes = ['/hoje', '/agenda', '/tarefas', '/habitos'];
  return primaryRoutes.map((route) => shellLinks.find((link) => link.to === route)!).filter(Boolean);
}

export function getMobileMoreLinks() {
  const moreRoutes = ['/projetos', '/frentes', '/notas', '/dashboard', '/configuracoes'];
  return moreRoutes.map((route) => shellLinks.find((link) => link.to === route)!).filter(Boolean);
}

export function getActiveShellRoute(pathname: string) {
  if (pathname === '/inbox' || pathname.startsWith('/inbox/')) {
    return shellLinks.find((link) => link.to === '/hoje') ?? shellLinks[0]!;
  }
  return shellLinks.find((link) =>
    pathname === link.to || pathname.startsWith(`${link.to}/`)
  ) ?? shellLinks[0]!;
}
