import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const Layout = lazy(() => import('./components/layout').then((module) => ({ default: module.Layout })));
const DashboardPage = lazy(() => import('./pages/dashboard').then((module) => ({ default: module.DashboardPage })));
const HojePage = lazy(() => import('./pages/hoje').then((module) => ({ default: module.HojePage })));
const ProjetosPage = lazy(() => import('./pages/projetos').then((module) => ({ default: module.ProjetosPage })));
const TarefasPage = lazy(() => import('./pages/tarefas').then((module) => ({ default: module.TarefasPage })));
const NotasPage = lazy(() => import('./pages/notas').then((module) => ({ default: module.NotasPage })));
const AgendaPage = lazy(() => import('./pages/agenda').then((module) => ({ default: module.AgendaPage })));
const HabitosPage = lazy(() => import('./pages/habitos').then((module) => ({ default: module.HabitosPage })));

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
          <Route path="/notas/*" element={<NotasPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="hoje" element={<HojePage />} />
            <Route path="amanha" element={<Navigate to="/hoje" replace />} />
            <Route path="ritual" element={<Navigate to="/" replace />} />
            <Route path="workspaces" element={<Navigate to="/projetos" replace />} />
            <Route path="workspaces/:workspaceId" element={<Navigate to="/projetos" replace />} />
            <Route path="projetos" element={<ProjetosPage />} />
            <Route path="projetos/:projectId" element={<ProjetosPage />} />
            <Route path="tarefas" element={<TarefasPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="habitos" element={<HabitosPage />} />
            <Route path="inbox" element={<Navigate to="/tarefas" replace />} />
            <Route path="gamificacao" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
