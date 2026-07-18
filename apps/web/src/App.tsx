import { Suspense, lazy, useCallback, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ClerkLoading, ClerkLoaded, useAuth } from '@clerk/react';
import { SignInPage } from './pages/sign-in-page';
import { LandingPage } from './pages/landing-page';
import { AuthSync } from './components/auth-sync';

const Layout = lazy(() => import('./components/layout').then((module) => ({ default: module.Layout })));
const DashboardPage = lazy(() => import('./pages/dashboard').then((module) => ({ default: module.DashboardPage })));
const HojePage = lazy(() => import('./pages/hoje').then((module) => ({ default: module.HojePage })));
const ProjetosPage = lazy(() => import('./pages/projetos').then((module) => ({ default: module.ProjetosPage })));
const WorkspacesPage = lazy(() => import('./pages/workspaces').then((module) => ({ default: module.WorkspacesPage })));
const TarefasPage = lazy(() => import('./pages/tarefas').then((module) => ({ default: module.TarefasPage })));
const InboxPage = lazy(() => import('./pages/inbox').then((module) => ({ default: module.InboxPage })));
const NotasPage = lazy(() => import('./pages/notas').then((module) => ({ default: module.NotasPage })));
const AgendaPage = lazy(() => import('./pages/agenda').then((module) => ({ default: module.AgendaPage })));
const HabitosPage = lazy(() => import('./pages/habitos').then((module) => ({ default: module.HabitosPage })));
const ConfiguracoesPage = lazy(() => import('./pages/configuracoes').then((module) => ({ default: module.ConfiguracoesPage })));

function RouteFallback() {
  return (
    <div className="route-fallback">
      <div className="premium-skeleton" style={{ height: 18 }} />
      <div className="premium-skeleton" style={{ height: 52 }} />
      <div className="premium-skeleton" style={{ height: 180 }} />
    </div>
  );
}

function ProductAccessFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity: 0.4, fontSize: 14 }}>Validando seu acesso...</div>
    </div>
  );
}

function ProtectedRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/notas/*" element={<NotasPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/inbox" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="hoje" element={<HojePage />} />
          <Route path="amanha" element={<Navigate to="/hoje" replace />} />
          <Route path="ritual" element={<Navigate to="/" replace />} />
          <Route path="frentes" element={<WorkspacesPage />} />
          <Route path="frentes/:workspaceId" element={<WorkspacesPage />} />
          <Route path="workspaces" element={<Navigate to="/frentes" replace />} />
          <Route path="workspaces/:workspaceId" element={<Navigate to="/frentes" replace />} />
          <Route path="projetos" element={<ProjetosPage />} />
          <Route path="projetos/:projectId" element={<ProjetosPage />} />
          <Route path="tarefas" element={<TarefasPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="habitos" element={<HabitosPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="gamificacao" element={<Navigate to="/" replace />} />
          <Route path="configuracoes" element={<ConfiguracoesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function AuthenticatedApp() {
  const [isProductAccessVerified, setIsProductAccessVerified] = useState(false);
  const markProductAccessVerified = useCallback(() => setIsProductAccessVerified(true), []);

  return (
    <>
      <AuthSync onProductAccessVerified={markProductAccessVerified} />
      {isProductAccessVerified ? <ProtectedRoutes /> : <ProductAccessFallback />}
    </>
  );
}

function AppRoutes() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return <AuthenticatedApp />;
  }

  return (
    <Routes>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="*" element={<Navigate to="/sign-in" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ClerkLoading>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ opacity: 0.4, fontSize: 14 }}>Carregando...</div>
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <AppRoutes />
      </ClerkLoaded>
    </BrowserRouter>
  );
}
