import { ArrowDown, ArrowUp, Archive, Clock3, Folder, FolderCog, Inbox, Pencil, Pin, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { api, type NoteFolder } from '../../api';
import type { NotesLibraryController } from './use-notes-library';

const syntheticFilters = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'pinned', label: 'Fixadas', icon: Pin },
  { id: 'recent', label: 'Recentes', icon: Clock3 }
] as const;

export function FolderFilterStrip({
  controller
}: {
  controller: Pick<
    NotesLibraryController,
    'folders' | 'foldersError' | 'selectedView' | 'setSelectedView' | 'reload'
  >;
}) {
  const folders = controller.folders.filter((folder) => !folder.parentId && !folder.archivedAt);
  const [managerOpen, setManagerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);

  const orderedFolders = useMemo(() => {
    const active = controller.folders.filter((folder) => !folder.archivedAt);
    const output: Array<NoteFolder & { depth: number }> = [];
    const visit = (parent: string | null, depth: number) => {
      active
        .filter((folder) => (folder.parentId ?? null) === parent)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .forEach((folder) => {
          output.push({ ...folder, depth });
          visit(folder.id, depth + 1);
        });
    };
    visit(null, 0);
    return output;
  }, [controller.folders]);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await controller.reload();
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    const cleanName = name.trim();
    if (!cleanName) return;
    await run(() => api.createNoteFolder({ name: cleanName, parentId: parentId || null }));
    setName('');
    setParentId('');
    setCreateOpen(false);
  }

  function move(folder: NoteFolder, direction: -1 | 1) {
    const siblings = orderedFolders.filter((candidate) => candidate.parentId === folder.parentId);
    const index = siblings.findIndex((candidate) => candidate.id === folder.id);
    const target = siblings[index + direction];
    if (!target) return;
    const reordered = [...siblings];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    void run(async () => {
      await Promise.all(reordered.map((candidate, sortOrder) =>
        api.updateNoteFolder(candidate.id, { sortOrder })
      ));
    });
  }

  return (
    <div className="notes-folder-filter-wrap">
      <nav className="notes-folder-filter" aria-label="Pastas de notas">
        {syntheticFilters.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={controller.selectedView === id ? 'active' : ''}
            aria-current={controller.selectedView === id ? 'page' : undefined}
            onClick={() => controller.setSelectedView(id)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
        <span className="notes-folder-filter-separator" aria-hidden="true" />
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={controller.selectedView === folder.id ? 'active' : ''}
            aria-current={controller.selectedView === folder.id ? 'page' : undefined}
            onClick={() => controller.setSelectedView(folder.id)}
          >
            <Folder size={15} aria-hidden="true" />
            {folder.name}
          </button>
        ))}
        <span className="notes-folder-filter-separator" aria-hidden="true" />
        <button type="button" onClick={() => setManagerOpen(true)}>
          <FolderCog size={15} aria-hidden="true" />
          Gerenciar pastas
        </button>
      </nav>
      {controller.foldersError ? (
        <p className="notes-resource-error">{controller.foldersError}</p>
      ) : null}
      {managerOpen ? (
        <div className="notes-modal-backdrop" role="presentation" onMouseDown={() => setManagerOpen(false)}>
          <section className="notes-modal notes-folder-manager" role="dialog" aria-modal="true" aria-label="Gerenciar pastas" onMouseDown={(event) => event.stopPropagation()}>
            <div className="notes-modal-heading">
              <div><small>Biblioteca</small><h2>Gerenciar pastas</h2></div>
              <button type="button" aria-label="Fechar gerenciador de pastas" onClick={() => setManagerOpen(false)}><X size={18} /></button>
            </div>

            {createOpen ? (
              <div className="notes-folder-create-form">
                <label>Nome<input autoFocus value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
                <label>Pasta superior<select value={parentId} onChange={(event) => setParentId(event.currentTarget.value)}><option value="">Nenhuma</option>{orderedFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
                <button type="button" disabled={busy || !name.trim()} onClick={() => void createFolder()}>Criar pasta</button>
              </div>
            ) : (
              <button type="button" className="notes-new-folder-button" onClick={() => setCreateOpen(true)}><Plus size={16} aria-hidden="true" />Nova pasta</button>
            )}

            <div className="notes-folder-manager-list">
              {orderedFolders.map((folder) => (
                <div key={folder.id} className="notes-folder-manager-row" style={{ paddingLeft: `${10 + folder.depth * 18}px` }}>
                  <Folder size={16} aria-hidden="true" />
                  {editingId === folder.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); const value = editingName.trim(); if (value) void run(() => api.updateNoteFolder(folder.id, { name: value })); setEditingId(null); }}>
                      <input aria-label={`Novo nome de ${folder.name}`} autoFocus value={editingName} onChange={(event) => setEditingName(event.currentTarget.value)} />
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="notes-folder-manager-select"
                      onClick={() => { controller.setSelectedView(folder.id); setManagerOpen(false); }}
                    >
                      {folder.name}
                    </button>
                  )}
                  <div className="notes-folder-row-actions">
                    <button type="button" aria-label={`Renomear ${folder.name}`} onClick={() => { setEditingId(folder.id); setEditingName(folder.name); }}><Pencil size={14} /></button>
                    <button type="button" aria-label={`Mover ${folder.name} para cima`} disabled={busy} onClick={() => move(folder, -1)}><ArrowUp size={14} /></button>
                    <button type="button" aria-label={`Mover ${folder.name} para baixo`} disabled={busy} onClick={() => move(folder, 1)}><ArrowDown size={14} /></button>
                    <button type="button" aria-label={`Arquivar ${folder.name}`} disabled={busy} onClick={() => void run(() => api.updateNoteFolder(folder.id, { archived: true }))}><Archive size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
