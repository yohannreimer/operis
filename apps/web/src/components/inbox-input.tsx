import { Building2, CornerDownLeft, Folder, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { InboxContext, Workspace } from '../api';
import { Button, IconButton } from './ui';

type ContextOption = {
  type: 'workspace' | 'inboxContext';
  id: string;
  name: string;
};

type Props = {
  workspaces: Workspace[];
  contexts: InboxContext[];
  inputRef?: React.RefObject<HTMLInputElement>;
  onSubmit: (content: string, workspaceId: string | null, inboxContextId: string | null) => void;
};

export function InboxInput({ workspaces, contexts, inputRef: externalRef, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [selectedContext, setSelectedContext] = useState<ContextOption | null>(null);
  const [autocomplete, setAutocomplete] = useState<ContextOption[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = externalRef ?? internalRef;

  // Detect @ trigger and filter options
  useEffect(() => {
    const atIdx = value.lastIndexOf('@');
    if (atIdx === -1) {
      setShowAutocomplete(false);
      return;
    }
    const query = value.slice(atIdx + 1).toLowerCase();

    const allOptions: ContextOption[] = [
      ...workspaces.map((w) => ({ type: 'workspace' as const, id: w.id, name: w.name })),
      ...contexts.map((c) => ({ type: 'inboxContext' as const, id: c.id, name: c.name })),
    ];

    const filtered = query
      ? allOptions.filter((o) =>
          o.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(query))
        )
      : allOptions;

    setAutocomplete(filtered);
    setAutocompleteIndex(0);
    setShowAutocomplete(filtered.length > 0);
  }, [value, workspaces, contexts]);

  function applyContext(option: ContextOption) {
    const atIdx = value.lastIndexOf('@');
    const cleaned = value.slice(0, atIdx).trimEnd();
    setValue(cleaned);
    setSelectedContext(option);
    setShowAutocomplete(false);
    ref.current?.focus();
  }

  function clearContext() {
    setSelectedContext(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex((i) => Math.min(i + 1, autocomplete.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const opt = autocomplete[autocompleteIndex];
        if (opt) applyContext(opt);
        return;
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
    }

    if (e.key === 'Enter' && !showAutocomplete) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    const content = value.trim();
    if (!content) return;

    const workspaceId = selectedContext?.type === 'workspace' ? selectedContext.id : null;
    const inboxContextId = selectedContext?.type === 'inboxContext' ? selectedContext.id : null;

    onSubmit(content, workspaceId, inboxContextId);
    setValue('');
    setSelectedContext(null);
  }

  return (
    <div className="inbox-input-container">
      <div className="inbox-input-row">
        {selectedContext && (
          <span className="inbox-input-context-tag">
            @{selectedContext.name}
            <IconButton
              type="button"
              size="sm"
              className="inbox-input-context-clear"
              onClick={clearContext}
              label="Remover contexto"
              icon={<X size={12} />}
            />
          </span>
        )}
        <input
          ref={ref}
          className="inbox-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedContext ? 'Digite e pressione Enter...' : 'Digite qualquer coisa... @frente'}
          autoComplete="off"
          aria-label="Capturar no Inbox"
        />
        <IconButton
          type="button"
          variant="tertiary"
          size="sm"
          className="inbox-input-submit"
          onClick={handleSubmit}
          disabled={!value.trim()}
          label="Criar item"
          icon={<CornerDownLeft />}
        />
      </div>

      {showAutocomplete && (
        <div className="inbox-autocomplete">
          {autocomplete.map((option, idx) => (
            <Button
              key={option.id}
              type="button"
              variant="tertiary"
              size="sm"
              className={`inbox-autocomplete-item${idx === autocompleteIndex ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyContext(option); }}
            >
              <span className="inbox-autocomplete-icon">
                {option.type === 'workspace' ? <Building2 aria-hidden="true" /> : <Folder aria-hidden="true" />}
              </span>
              {option.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
