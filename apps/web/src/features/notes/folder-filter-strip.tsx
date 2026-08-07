import { Clock3, Folder, Inbox, Pin } from 'lucide-react';

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
    'folders' | 'foldersError' | 'selectedView' | 'setSelectedView'
  >;
}) {
  const folders = controller.folders.filter((folder) => !folder.parentId && !folder.archivedAt);

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
      </nav>
      {controller.foldersError ? (
        <p className="notes-resource-error">{controller.foldersError}</p>
      ) : null}
    </div>
  );
}
