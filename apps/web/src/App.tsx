import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/layout';
import { DashboardPage } from './pages/dashboard';
import { HojePage } from './pages/hoje';
import { AmanhaPage } from './pages/amanha';
import { WorkspacesPage } from './pages/workspaces';
import { ProjetosPage } from './pages/projetos';
import { TarefasPage } from './pages/tarefas';
import { GamificacaoPage } from './pages/gamificacao';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="hoje" element={<HojePage />} />
          <Route path="amanha" element={<AmanhaPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="projetos" element={<ProjetosPage />} />
          <Route path="tarefas" element={<TarefasPage />} />
          <Route path="inbox" element={<Navigate to="/tarefas" replace />} />
          <Route path="gamificacao" element={<GamificacaoPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
