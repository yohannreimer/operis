import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  PremiumCard,
  PremiumHeader,
  PremiumPage,
} from '../components/premium-ui';

type LoadState = 'loading' | 'idle' | 'saving' | 'error';

export function ConfiguracoesPage() {
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch current phone on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchPhone() {
      setLoadState('loading');
      setLoadError(null);
      try {
        const result = await api.getUserPhone();
        if (!cancelled) {
          setLinkedPhone(result.phoneNumber);
          setLoadState('idle');
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Erro ao carregar número.');
          setLoadState('error');
        }
      }
    }

    fetchPhone();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLink() {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setActionError('Informe um número de telefone.');
      return;
    }

    setActionError(null);
    setLoadState('saving');

    try {
      await api.linkPhone(trimmed);
      const result = await api.getUserPhone();
      setLinkedPhone(result.phoneNumber);
      setInputValue('');
      setLoadState('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao vincular número.';
      // Detect conflict: 409 error message matches the API error string
      if (message.includes('Número já cadastrado por outro usuário') || message.includes('já cadastrado')) {
        setActionError('Esse número já está cadastrado por outro usuário');
      } else {
        setActionError(message);
      }
      setLoadState('idle');
    }
  }

  async function handleUnlink() {
    setActionError(null);
    setLoadState('saving');

    try {
      await api.unlinkPhone();
      setLinkedPhone(null);
      setLoadState('idle');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao desvincular número.');
      setLoadState('idle');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleLink();
    }
  }

  const isLoading = loadState === 'loading';
  const isSaving = loadState === 'saving';
  const disabled = isLoading || isSaving;

  return (
    <PremiumPage>
      <PremiumHeader title="Configurações" />

      <PremiumCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>WhatsApp</div>
          <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 8 }}>
            Vincule seu número de WhatsApp para usar o assistente via mensagem.
          </div>

          {isLoading && (
            <div style={{ fontSize: 13, opacity: 0.5 }}>Carregando...</div>
          )}

          {!isLoading && loadState === 'error' && (
            <div style={{ fontSize: 13, color: 'var(--color-danger, #e55)' }}>
              {loadError}
            </div>
          )}

          {!isLoading && loadState !== 'error' && linkedPhone === null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="5511999999999"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setActionError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={disabled}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border, #333)',
                    background: 'var(--color-surface, #1a1a1a)',
                    color: 'inherit',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleLink}
                  disabled={disabled}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--color-accent, #4f7cff)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSaving ? 'Vinculando...' : 'Vincular'}
                </button>
              </div>
              {actionError && (
                <div style={{ fontSize: 13, color: 'var(--color-danger, #e55)' }}>
                  {actionError}
                </div>
              )}
            </div>
          )}

          {!isLoading && loadState !== 'error' && linkedPhone !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border, #333)',
                    background: 'var(--color-surface, #1a1a1a)',
                    fontSize: 14,
                    fontFamily: 'monospace',
                  }}
                >
                  {linkedPhone}
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={disabled}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border, #333)',
                    background: 'transparent',
                    color: 'var(--color-danger, #e55)',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSaving ? 'Desvinculando...' : 'Desvincular'}
                </button>
              </div>
              {actionError && (
                <div style={{ fontSize: 13, color: 'var(--color-danger, #e55)' }}>
                  {actionError}
                </div>
              )}
            </div>
          )}
        </div>
      </PremiumCard>
    </PremiumPage>
  );
}
