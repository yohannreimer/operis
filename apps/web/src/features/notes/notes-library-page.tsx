import { FilePlus2, Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, type NoteType } from '../../api';
import { FolderFilterStrip } from './folder-filter-strip';
import { NotesList } from './notes-list';
import { QuickCapture } from './quick-capture';
import { useNotesLibrary } from './use-notes-library';
import './notes.css';

export function NotesLibraryPage() {
  const navigate = useNavigate();
  const controller = useNotesLibrary();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const templates: Array<{ label: string; title: string; type: NoteType; content?: string }> = [
    { label: 'Nota em branco', title: 'Sem título', type: 'geral' },
    { label: 'Reunião', title: 'Nova reunião', type: 'geral', content: '## Pauta\n\n## Decisões\n\n## Próximos passos' },
    { label: 'Ideia', title: 'Nova ideia', type: 'conteudo', content: '## Ideia\n\n## Por que importa\n\n## Próximo experimento' }
  ];

  async function createFromTemplate(template: (typeof templates)[number]) {
    if (creating) return;
    setCreating(true);
    try {
      const note = await api.createNote({
        title: template.title,
        type: template.type,
        content: template.content ?? null,
        contentText: template.content ?? null
      });
      controller.addCaptured(note);
      navigate(`/notas/${note.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="notes-library-page">
      <header className="notes-library-header">
        <div>
          <span className="notes-library-eyebrow">Segundo cérebro</span>
          <h1>Notas</h1>
          <p>Capture rápido. Desenvolva apenas o que merece atenção.</p>
        </div>
        <div className="notes-library-header-actions">
          <label className="notes-library-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar em notas"
              placeholder="Buscar"
              value={controller.query}
              onChange={(event) => controller.setQuery(event.currentTarget.value)}
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="notes-library-action-row">
            <button type="button" className="notes-subtle-button" onClick={() => setAdvancedOpen((value) => !value)}>
              <SlidersHorizontal size={15} aria-hidden="true" />
              Busca avançada
            </button>
            <button type="button" className="notes-primary-button" onClick={() => setTemplatesOpen(true)}>
              <FilePlus2 size={15} aria-hidden="true" />
              Nova nota
            </button>
          </div>
        </div>
      </header>

      <div className="notes-library-content">
        {advancedOpen ? (
          <section className="notes-advanced-search" aria-label="Busca avançada">
            <label>
              <input
                type="checkbox"
                aria-label="Somente notas longas"
                checked={controller.longOnly ?? false}
                onChange={(event) => controller.setLongOnly(event.currentTarget.checked)}
              />
              Somente notas longas
            </label>
            <label>
              Atualizadas depois de
              <input
                type="date"
                aria-label="Atualizadas depois de"
                value={controller.updatedAfter ?? ''}
                onChange={(event) => controller.setUpdatedAfter(event.currentTarget.value)}
              />
            </label>
          </section>
        ) : null}
        <QuickCapture
          onCaptured={controller.addCaptured}
          onOpen={(note) => navigate(`/notas/${note.id}`)}
        />
        <FolderFilterStrip controller={controller} />
        <div className="notes-list-heading">
          <span>{controller.selectedView === 'recent' ? 'Recentes' : 'Notas'}</span>
          <small>{controller.rows.length}</small>
        </div>
        <NotesList
          rows={controller.rows}
          loading={controller.loading}
          error={controller.notesError}
          query={controller.query}
          onRetry={controller.reload}
        />
      </div>

      {templatesOpen ? (
        <div className="notes-modal-backdrop" role="presentation" onMouseDown={() => setTemplatesOpen(false)}>
          <section
            className="notes-modal notes-template-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Escolher template"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="notes-modal-heading">
              <div><small>Nova nota</small><h2>Como você quer começar?</h2></div>
              <button type="button" aria-label="Fechar templates" onClick={() => setTemplatesOpen(false)}><X size={18} /></button>
            </div>
            <div className="notes-template-grid">
              {templates.map((template) => (
                <button key={template.label} type="button" disabled={creating} onClick={() => void createFromTemplate(template)}>
                  <FilePlus2 size={18} aria-hidden="true" />
                  <span>{template.label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
