import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const Layout = lazy(() => import('./components/layout').then((module) => ({ default: module.Layout })));
const DashboardPage = lazy(() => import('./pages/dashboard').then((module) => ({ default: module.DashboardPage })));
const HojePage = lazy(() => import('./pages/hoje').then((module) => ({ default: module.HojePage })));
const AmanhaPage = lazy(() => import('./pages/amanha').then((module) => ({ default: module.AmanhaPage })));
const RitualPage = lazy(() => import('./pages/ritual').then((module) => ({ default: module.RitualPage })));
const WorkspacesPage = lazy(() => import('./pages/workspaces').then((module) => ({ default: module.WorkspacesPage })));
const ProjetosPage = lazy(() => import('./pages/projetos').then((module) => ({ default: module.ProjetosPage })));
const TarefasPage = lazy(() => import('./pages/tarefas').then((module) => ({ default: module.TarefasPage })));
const GamificacaoPage = lazy(() => import('./pages/gamificacao').then((module) => ({ default: module.GamificacaoPage })));

function RouteFallback() {
  return (
    <div className="route-fallback">
      <div className="premium-skeleton" style={{ height: 18 }} />
      <div className="premium-skeleton" style={{ height: 52 }} />
      <div className="premium-skeleton" style={{ height: 180 }} />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="hoje" element={<HojePage />} />
            <Route path="amanha" element={<AmanhaPage />} />
            <Route path="ritual" element={<RitualPage />} />
            <Route path="workspaces" element={<WorkspacesPage />} />
            <Route path="workspaces/:workspaceId" element={<WorkspacesPage />} />
            <Route path="projetos" element={<ProjetosPage />} />
            <Route path="projetos/:projectId" element={<ProjetosPage />} />
            <Route path="tarefas" element={<TarefasPage />} />
            <Route path="inbox" element={<Navigate to="/tarefas" replace />} />
            <Route path="gamificacao" element={<GamificacaoPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
