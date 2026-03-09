import {
  CSSProperties,
  DragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bold,
  BookOpen,
  Eye,
  EyeOff,
  Flag,
  Heading1,
  Heading2,
  Heading3,
  History,
  Italic,
  Layers3,
  Mic,
  Pilcrow,
  Save,
  Sparkles,
  Strikethrough,
  Trash2
} from 'lucide-react';

import {
  api,
  Note,
  NoteFolder,
  NoteRevision,
  NotesTranscriptionCapabilities,
  NoteType,
  Project,
  Task,
  Workspace
} from '../api';
import { EmptyState, PremiumCard, SkeletonBlock } from '../components/premium-ui';

type FolderScope = 'all' | 'unfiled' | string;
type FolderModalMode = 'create' | 'rename';
type NoteSortMode = 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc';
type AutoSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type SmartCollectionId = 'all' | 'pinned' | 'recent' | 'linked' | 'inbox' | 'longform';

type NoteTemplate = {
  id: string;
  title: string;
  subtitle: string;
  type: NoteType;
  tags: string[];
  content: string;
};

type NoteTemplateKind = 'base' | 'custom';
type NoteTemplateRecord = NoteTemplate & {
  kind: NoteTemplateKind;
};

type TemplateModalMode = 'create' | 'edit';

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  snippet?: string;
  run?: () => void | Promise<void>;
};

type WriterColorOption = {
  id: string;
  label: string;
  value: string;
};

type WriterInlineFormatState = {
  heading: 0 | 1 | 2 | 3;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  color: string;
};

type RelatedReason = {
  label: string;
  hint?: string;
};

type EditorSnapshot = {
  title: string;
  content: string;
  type: NoteType;
  tagsRaw: string;
  pinned: boolean;
  noteFolderId: string;
  linkWorkspaceId: string;
  linkProjectId: string;
  linkTaskId: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: {
    results: ArrayLike<{
      isFinal: boolean;
      0: {
        transcript: string;
      };
    }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const PEOPLE_TEMPLATE = `# Gestão de pessoas

## Estagiários
| Nome | Área | Nível atual | Próxima reunião | Observação |
|---|---|---|---|---|
|  |  |  |  |  |

## Vendedores
| Nome | Pipeline | Conversão | Próxima ação | Observação |
|---|---|---|---|---|
|  |  |  |  |  |`;

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  inbox: 'Inbox',
  geral: 'Geral',
  pessoas: 'Pessoas',
  conteudo: 'Conteúdo',
  produto: 'Produto',
  conclusao_tarefa: 'Pós-tarefa',
  referencia: 'Referência'
};

const DEFAULT_FOLDER_COLOR = '#4f7cff';
const RECENT_WINDOW_DAYS = 7;
const LONGFORM_MIN_CHARS = 1200;
const CUSTOM_NOTE_TEMPLATES_STORAGE_KEY = 'execution-os.custom-note-templates.v1';
const PLACEHOLDER_NOTE_TITLES = new Set(['nova nota', 'sem título', 'sem titulo']);
const TEXT_TOKEN_STOP_WORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'a',
  'o',
  'e',
  'em',
  'para',
  'por',
  'com',
  'sem',
  'que',
  'na',
  'no',
  'um',
  'uma',
  'ao',
  'à',
  'as',
  'os'
]);

const AUTO_ACCENT_MAP: Record<string, string> = {
  voce: 'você',
  voces: 'vocês',
  tambem: 'também',
  nao: 'não',
  ja: 'já',
  ate: 'até',
  sera: 'será',
  estao: 'estão',
  so: 'só',
  alem: 'além',
  atraves: 'através',
  possivel: 'possível',
  estrategia: 'estratégia',
  operacao: 'operação',
  acao: 'ação',
  execucao: 'execução',
  revisao: 'revisão',
  conclusao: 'conclusão',
  inicio: 'início',
  negociacao: 'negociação',
  intuicao: 'intuição'
};

const WRITER_COLOR_OPTIONS: WriterColorOption[] = [
  { id: 'base', label: 'Padrão', value: '#0f172a' },
  { id: 'blue', label: 'Azul', value: '#1d4ed8' },
  { id: 'green', label: 'Verde', value: '#15803d' },
  { id: 'amber', label: 'Laranja', value: '#b45309' },
  { id: 'red', label: 'Vermelho', value: '#b91c1c' },
  { id: 'violet', label: 'Roxo', value: '#6d28d9' }
];

const ENABLE_AUTO_ACCENT = false;

const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'ceo-weekly-brief',
    title: 'Briefing semanal CEO',
    subtitle: 'Prioridades, riscos e decisões da semana',
    type: 'produto',
    tags: ['ritual', 'ceo', 'semanal'],
    content: `# Briefing semanal

## Objetivo da semana
- Resultado principal:
- Entrega crítica:

## Riscos que exigem atenção
1.
2.
3.

## Decisões executivas
- Decisão:
- Motivo:
- Próximo passo:

## Compromissos de execução
- [ ] Compromisso 1
- [ ] Compromisso 2
- [ ] Compromisso 3`
  },
  {
    id: 'meeting-1-1',
    title: '1:1 com colaborador',
    subtitle: 'Status, bloqueios e próximos passos',
    type: 'pessoas',
    tags: ['pessoas', 'reuniao', '1:1'],
    content: `# 1:1

## Contexto
- Pessoa:
- Data:
- Objetivo:

## O que evoluiu
- 

## Bloqueios
- 

## Próximas ações
- [ ] 
- [ ] 

## Feedback final
- `
  },
  {
    id: 'content-playbook',
    title: 'Playbook de conteúdo',
    subtitle: 'Ideia, narrativa e distribuição',
    type: 'conteudo',
    tags: ['conteudo', 'autoridade', 'playbook'],
    content: `# Conteúdo estratégico

## Tese central
- 

## Gancho
- 

## Estrutura
1.
2.
3.

## CTA
- 

## Distribuição
- Canal:
- Frequência:
- Métrica principal:`
  },
  {
    id: 'project-retro',
    title: 'Retro de projeto',
    subtitle: 'Lições e ajustes de execução',
    type: 'produto',
    tags: ['projeto', 'retro', 'aprendizado'],
    content: `# Retro de projeto

## Resultado real
- 

## O que funcionou
- 

## O que não funcionou
- 

## Gargalo dominante
- 

## Mudança de sistema para próxima rodada
- `
  },
  {
    id: 'decision-log',
    title: 'Log de decisão estratégica',
    subtitle: 'Registrar decisão e consequência esperada',
    type: 'referencia',
    tags: ['decisao', 'estrategia'],
    content: `# Decisão estratégica

## Decisão
- 

## Contexto
- 

## Hipótese
- 

## Métrica de validação
- 

## Prazo de revisão
- `
  }
];

function noteExcerpt(note: Note) {
  const content = extractPlainText(note.content ?? '').trim();
  if (!content) {
    return 'Sem conteúdo';
  }

  return content.length <= 130 ? content : `${content.slice(0, 130)}...`;
}

function isRecentDate(value?: string | null, windowDays = RECENT_WINDOW_DAYS) {
  if (!value) {
    return false;
  }

  const dateValue = new Date(value).getTime();
  if (Number.isNaN(dateValue)) {
    return false;
  }

  const diffMs = Date.now() - dateValue;
  return diffMs <= windowDays * 24 * 60 * 60 * 1000;
}

function getChecklistProgress(content?: string | null) {
  if (!content) {
    return {
      total: 0,
      done: 0,
      percent: 0
    };
  }

  const rows = content.match(/^- \[( |x|X)\]/gm) ?? [];
  if (rows.length === 0) {
    return {
      total: 0,
      done: 0,
      percent: 0
    };
  }

  const done = rows.filter((row) => row.toLowerCase().includes('[x]')).length;
  return {
    total: rows.length,
    done,
    percent: Math.round((done / rows.length) * 100)
  };
}

function parseTags(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
    )
  );
}

function preserveWordCasing(source: string, replacement: string) {
  if (!source) {
    return replacement;
  }
  if (source === source.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (source[0] === source[0].toUpperCase()) {
    return `${replacement[0]?.toUpperCase() ?? ''}${replacement.slice(1)}`;
  }
  return replacement;
}

function applyAutoAccent(raw: string) {
  let value = raw;
  Object.entries(AUTO_ACCENT_MAP).forEach(([plain, accented]) => {
    const regex = new RegExp(`\\b${plain}\\b`, 'gi');
    value = value.replace(regex, (match) => preserveWordCasing(match, accented));
  });
  return value;
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return 'sem data';
  }

  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) {
    return 'sem atualização';
  }

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function noteTypeLabel(type: NoteType) {
  return NOTE_TYPE_LABELS[type] ?? 'Geral';
}

function displayNoteTitle(title?: string | null) {
  const normalized = (title ?? '').trim();
  return normalized.length > 0 ? normalized : 'Sem título';
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function normalizedTagText(raw: string) {
  return parseTags(raw).join('|');
}

function normalizeTextTokens(raw: string) {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TEXT_TOKEN_STOP_WORDS.has(token));
}

function createTokenSetForNote(note: Note) {
  return new Set(
    normalizeTextTokens(
      `${note.title} ${(note.tags ?? []).join(' ')} ${extractPlainText((note.content ?? '').slice(0, 420))}`
    )
  );
}

function isPlaceholderNoteTitle(title?: string | null) {
  return PLACEHOLDER_NOTE_TITLES.has((title ?? '').trim().toLowerCase());
}

function escapeHtml(raw: string) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function hasHtmlTags(raw: string) {
  return /<\/?[a-z][^>]*>/i.test(raw);
}

function plainTextToHtml(raw: string) {
  return escapeHtml(raw).replace(/\n/g, '<br>');
}

function normalizeEditorContent(raw: string) {
  if (!raw) {
    return '';
  }
  return hasHtmlTags(raw) ? raw : plainTextToHtml(raw);
}

function extractPlainText(raw: string) {
  if (!raw) {
    return '';
  }
  if (!hasHtmlTags(raw)) {
    return raw;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return raw.replace(/<[^>]*>/g, ' ');
  }
  const container = document.createElement('div');
  container.innerHTML = raw;
  return container.textContent ?? '';
}

function extractPlainTextWithBreaks(raw: string) {
  if (!raw) {
    return '';
  }
  if (!hasHtmlTags(raw)) {
    return raw;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|ul|ol|section|article|blockquote)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const container = document.createElement('div');
  container.innerHTML = normalizeEditorContent(raw);
  let output = '';

  const blockTags = new Set([
    'p',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'section',
    'article',
    'blockquote',
    'ul',
    'ol'
  ]);

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += node.textContent ?? '';
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const tag = node.tagName.toLowerCase();

    if (tag === 'br') {
      output += '\n';
      return;
    }

    if (tag === 'li') {
      const hasPrefix = output.length === 0 || output.endsWith('\n');
      if (!hasPrefix) {
        output += '\n';
      }
      output += '- ';
      node.childNodes.forEach(walk);
      output += '\n';
      return;
    }

    node.childNodes.forEach(walk);

    if (blockTags.has(tag)) {
      output += '\n';
    }
  };

  container.childNodes.forEach(walk);

  return output
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function appendPlainTextToContent(current: string, addition: string) {
  const chunk = addition.trim();
  if (!chunk) {
    return current;
  }
  if (!current.trim()) {
    return hasHtmlTags(current) ? plainTextToHtml(chunk) : chunk;
  }
  if (hasHtmlTags(current)) {
    return `${current}<br><br>${plainTextToHtml(chunk)}`;
  }
  return `${current.trim()}\n\n${chunk}`;
}

function sanitizeFileName(raw: string) {
  const base = raw.trim().toLowerCase().replace(/\s+/g, '-');
  const cleaned = base.replace(/[^a-z0-9-_]/g, '');
  return cleaned.length > 0 ? cleaned : 'nota';
}

function normalizeCssColor(raw: string | null | undefined) {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) {
    return '';
  }

  if (value.startsWith('#')) {
    if (value.length === 4) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    return value;
  }

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .slice(0, 3)
      .map((part) => Math.max(0, Math.min(255, Number(part.trim()) || 0)));
    if (parts.length === 3) {
      return `#${parts
        .map((part) => part.toString(16).padStart(2, '0'))
        .join('')}`;
    }
  }

  return value;
}

function getTextareaCaretPosition(textarea: HTMLTextAreaElement, caret: number) {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const styleKeys = [
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'MozTabSize'
  ] as const;

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';

  styleKeys.forEach((key) => {
    const value = computed.getPropertyValue(key);
    if (value) {
      mirror.style.setProperty(key, value);
    }
  });

  const safeCaret = Math.max(0, Math.min(caret, textarea.value.length));
  mirror.textContent = textarea.value.slice(0, safeCaret);
  marker.textContent = textarea.value.slice(safeCaret, safeCaret + 1) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;
  document.body.removeChild(mirror);

  return { top, left };
}

function suggestTitleFromTranscription(input: {
  titleSuggestion?: string | null;
  structuredContent?: string | null;
  transcript?: string | null;
}) {
  const direct = (input.titleSuggestion ?? '').trim();
  if (direct.length > 0) {
    return direct;
  }

  const text = (input.structuredContent ?? input.transcript ?? '').trim();
  if (!text) {
    return '';
  }

  const firstLine = text
    .split('\n')
    .map((row) => row.trim())
    .find((row) => row.length > 0);

  if (!firstLine) {
    return '';
  }

  const stripped = firstLine.replace(/^[-*#>\d.\s]+/, '').trim();
  if (!stripped) {
    return '';
  }

  return stripped.length > 96 ? `${stripped.slice(0, 93).trim()}...` : stripped;
}

function buildMarkdownTable(columns: string[], rows: string[][]) {
  const safeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

  const header = `| ${columns.map((column) => safeCell(column) || 'Coluna').join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map((row) => {
    const values = columns.map((_, index) => safeCell(row[index] ?? ''));
    return `| ${values.join(' | ')} |`;
  });

  return [header, divider, ...bodyRows].join('\n');
}

function loadCustomTemplatesFromStorage() {
  if (typeof window === 'undefined') {
    return [] as NoteTemplate[];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_NOTE_TEMPLATES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const data = entry as Partial<NoteTemplate>;
        if (
          typeof data.id !== 'string' ||
          typeof data.title !== 'string' ||
          typeof data.subtitle !== 'string' ||
          typeof data.type !== 'string' ||
          typeof data.content !== 'string'
        ) {
          return null;
        }
        const validType = Object.keys(NOTE_TYPE_LABELS).includes(data.type) ? data.type : 'geral';
        return {
          id: data.id,
          title: data.title.trim() || 'Template sem título',
          subtitle: data.subtitle.trim() || 'Template personalizado',
          type: validType as NoteType,
          content: data.content,
          tags: Array.isArray(data.tags)
            ? data.tags
                .map((tag) => String(tag).trim().toLowerCase())
                .filter((tag) => tag.length > 0)
            : []
        } as NoteTemplate;
      })
      .filter((entry): entry is NoteTemplate => Boolean(entry));
  } catch {
    return [];
  }
}

function isFolderScope(scope: FolderScope): scope is string {
  return scope !== 'all' && scope !== 'unfiled';
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0');
  const rest = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function noteRevisionSourceLabel(source: string) {
  switch (source) {
    case 'create':
      return 'Criação';
    case 'manual':
      return 'Salvamento manual';
    case 'autosave':
      return 'Autosave';
    case 'checkpoint':
      return 'Checkpoint';
    case 'restore_backup':
      return 'Backup antes de restaurar';
    case 'restore_apply':
      return 'Restauração aplicada';
    case 'restore':
      return 'Restauração';
    case 'system':
      return 'Sistema';
    default:
      return source;
  }
}

export function NotasPage() {
  const navigate = useNavigate();
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const writerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const writerRichEditorRef = useRef<HTMLDivElement | null>(null);
  const noteSearchInputRef = useRef<HTMLInputElement | null>(null);
  const notesListRef = useRef<HTMLUListElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<NoteSortMode>('updated_desc');
  const [folderScope, setFolderScope] = useState<FolderScope>('all');
  const [smartCollection, setSmartCollection] = useState<SmartCollectionId>('all');
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);

  const [writerMode, setWriterMode] = useState(false);
  const [writerMetaOpen, setWriterMetaOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<NoteTemplate[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateModalMode, setTemplateModalMode] = useState<TemplateModalMode>('create');
  const [templateEditId, setTemplateEditId] = useState('');
  const [templateTitleDraft, setTemplateTitleDraft] = useState('');
  const [templateSubtitleDraft, setTemplateSubtitleDraft] = useState('');
  const [templateTypeDraft, setTemplateTypeDraft] = useState<NoteType>('geral');
  const [templateTagsDraft, setTemplateTagsDraft] = useState('');
  const [templateContentDraft, setTemplateContentDraft] = useState('');
  const [tableBuilderOpen, setTableBuilderOpen] = useState(false);
  const [tableColumns, setTableColumns] = useState<string[]>(['Campo', 'Valor']);
  const [tableRows, setTableRows] = useState<string[][]>([['', '']]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<FolderModalMode>('create');
  const [folderModalTitle, setFolderModalTitle] = useState('');
  const [folderNameDraft, setFolderNameDraft] = useState('');
  const [folderColorDraft, setFolderColorDraft] = useState(DEFAULT_FOLDER_COLOR);
  const [folderParentDraft, setFolderParentDraft] = useState('');
  const [folderModalBusy, setFolderModalBusy] = useState(false);

  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<NoteType>('geral');
  const [tagsRaw, setTagsRaw] = useState('');
  const [pinned, setPinned] = useState(false);
  const [noteFolderId, setNoteFolderId] = useState('');
  const [linkWorkspaceId, setLinkWorkspaceId] = useState('');
  const [linkProjectId, setLinkProjectId] = useState('');
  const [linkTaskId, setLinkTaskId] = useState('');
  const [editorBase, setEditorBase] = useState<EditorSnapshot | null>(null);

  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<
    'idle' | 'recording' | 'paused' | 'ready' | 'processing'
  >('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingMimeType, setRecordingMimeType] = useState('audio/webm');
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [transcriptionCapabilities, setTranscriptionCapabilities] =
    useState<NotesTranscriptionCapabilities | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);
  const [revisionPreviewId, setRevisionPreviewId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashRange, setSlashRange] = useState<{ start: number; end: number } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashMenuPosition, setSlashMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [writerFormatState, setWriterFormatState] = useState<WriterInlineFormatState>({
    heading: 0,
    bold: false,
    italic: false,
    strike: false,
    color: normalizeCssColor(WRITER_COLOR_OPTIONS[0]?.value ?? '#0f172a')
  });
  const [clipboardFeedback, setClipboardFeedback] = useState<'idle' | 'copy' | 'whatsapp'>('idle');
  const autoSaveTimerRef = useRef<number | null>(null);
  const clipboardFeedbackTimerRef = useRef<number | null>(null);

  const contentPlain = useMemo(() => extractPlainText(content), [content]);

  const voiceSupported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  const recordingSupported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    []
  );

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  );

  const childrenByParent = useMemo(() => {
    const bucket = new Map<string | null, NoteFolder[]>();

    folders.forEach((folder) => {
      const parentKey = folder.parentId && folderById.has(folder.parentId) ? folder.parentId : null;
      const rows = bucket.get(parentKey) ?? [];
      rows.push(folder);
      bucket.set(parentKey, rows);
    });

    return bucket;
  }, [folders, folderById]);

  const rootFolders = useMemo(() => {
    const rows = childrenByParent.get(null) ?? [];
    return [...rows].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.name.localeCompare(right.name, 'pt-BR');
    });
  }, [childrenByParent]);

  const descendantFolderIds = useMemo(() => {
    const memo = new Map<string, Set<string>>();

    const collect = (folderId: string): Set<string> => {
      const cached = memo.get(folderId);
      if (cached) {
        return cached;
      }

      const set = new Set<string>([folderId]);
      const children = childrenByParent.get(folderId) ?? [];

      children.forEach((child) => {
        collect(child.id).forEach((id) => set.add(id));
      });

      memo.set(folderId, set);
      return set;
    };

    folders.forEach((folder) => {
      collect(folder.id);
    });

    return memo;
  }, [folders, childrenByParent]);

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();

    folders.forEach((folder) => {
      const descendants = descendantFolderIds.get(folder.id) ?? new Set<string>([folder.id]);
      const count = notes.filter((note) => note.folderId && descendants.has(note.folderId)).length;
      map.set(folder.id, count);
    });

    return {
      all: notes.length,
      unfiled: notes.filter((note) => !note.folderId).length,
      byFolder: map
    };
  }, [descendantFolderIds, folders, notes]);

  const activeFolder = isFolderScope(folderScope) ? folderById.get(folderScope) ?? null : null;

  const folderScopedNotes = useMemo(() => {
    if (folderScope === 'all') {
      return notes;
    }

    if (folderScope === 'unfiled') {
      return notes.filter((note) => !note.folderId);
    }

    const descendants = descendantFolderIds.get(folderScope) ?? new Set([folderScope]);
    return notes.filter((note) => note.folderId && descendants.has(note.folderId));
  }, [descendantFolderIds, folderScope, notes]);

  const smartCollectionCounts = useMemo(() => {
    return {
      all: folderScopedNotes.length,
      pinned: folderScopedNotes.filter((note) => note.pinned).length,
      recent: folderScopedNotes.filter((note) => isRecentDate(note.updatedAt)).length,
      linked: folderScopedNotes.filter(
        (note) => Boolean(note.workspaceId || note.projectId || note.taskId)
      ).length,
      inbox: folderScopedNotes.filter((note) => note.type === 'inbox').length,
      longform: folderScopedNotes.filter(
        (note) => (note.content?.trim().length ?? 0) >= LONGFORM_MIN_CHARS
      ).length
    };
  }, [folderScopedNotes]);

  const scopedNotes = useMemo(() => {
    if (smartCollection === 'all') {
      return folderScopedNotes;
    }

    if (smartCollection === 'pinned') {
      return folderScopedNotes.filter((note) => note.pinned);
    }

    if (smartCollection === 'recent') {
      return folderScopedNotes.filter((note) => isRecentDate(note.updatedAt));
    }

    if (smartCollection === 'linked') {
      return folderScopedNotes.filter((note) => Boolean(note.workspaceId || note.projectId || note.taskId));
    }

    if (smartCollection === 'inbox') {
      return folderScopedNotes.filter((note) => note.type === 'inbox');
    }

    return folderScopedNotes.filter((note) => (note.content?.trim().length ?? 0) >= LONGFORM_MIN_CHARS);
  }, [folderScopedNotes, smartCollection]);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;
  const relatedNotes = useMemo(() => {
    if (!selectedNote) {
      return [] as Array<{
        note: Note;
        score: number;
        reasons: RelatedReason[];
      }>;
    }

    const selectedTagSet = new Set(selectedNote.tags.map((tag) => tag.toLowerCase()));
    const selectedTokens = createTokenSetForNote(selectedNote);

    return notes
      .filter((note) => note.id !== selectedNote.id && !note.archivedAt && !isPlaceholderNoteTitle(note.title))
      .map((note) => {
        let score = 0;
        const reasons: RelatedReason[] = [];

        const sameWorkspace = Boolean(selectedNote.workspaceId && note.workspaceId === selectedNote.workspaceId);
        const sameProject = Boolean(selectedNote.projectId && note.projectId === selectedNote.projectId);
        const sameTask = Boolean(selectedNote.taskId && note.taskId === selectedNote.taskId);
        const sameFolder = Boolean(selectedNote.folderId && note.folderId === selectedNote.folderId);

        const sharedTags = note.tags.filter((tag) => selectedTagSet.has(tag.toLowerCase()));
        if (sharedTags.length > 0) {
          score += sharedTags.length * 4;
          reasons.push({
            label: `${sharedTags.length} tag(s) em comum`,
            hint: sharedTags.slice(0, 12).map((tag) => `#${tag}`).join(', ')
          });
        }

        if (sameWorkspace) {
          score += 4;
          reasons.push({ label: 'mesma frente' });
        }

        if (sameProject) {
          score += 5;
          reasons.push({ label: 'mesmo projeto' });
        }

        if (sameTask) {
          score += 5;
          reasons.push({ label: 'mesma tarefa' });
        }

        if (sameFolder) {
          score += 2;
          reasons.push({ label: 'mesma pasta' });
        }

        const noteTokens = createTokenSetForNote(note);
        const sharedTerms = Array.from(selectedTokens).filter((token) => noteTokens.has(token));
        const lexicalOverlap = sharedTerms.length;
        if (lexicalOverlap >= 2) {
          score += Math.min(4, lexicalOverlap);
          reasons.push({
            label: `${lexicalOverlap} termo(s)-chave em comum`,
            hint: sharedTerms.slice(0, 12).join(', ')
          });
        }

        const hasHardSignal =
          sharedTags.length > 0 || sameWorkspace || sameProject || sameTask || lexicalOverlap >= 2;

        if (!hasHardSignal) {
          return {
            note,
            score: 0,
            reasons: []
          };
        }

        if (note.type === selectedNote.type) {
          score += 1;
          reasons.push({ label: 'mesmo tipo' });
        }

        if (isRecentDate(note.updatedAt)) {
          score += 1;
          reasons.push({ label: 'recente' });
        }

        return {
          note,
          score,
          reasons
        };
      })
      .filter((row) => row.score >= 4)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return new Date(right.note.updatedAt).getTime() - new Date(left.note.updatedAt).getTime();
      })
      .slice(0, 5);
  }, [notes, selectedNote]);

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedNoteId || !editorBase) {
      return false;
    }

    return (
      title !== editorBase.title ||
      content !== editorBase.content ||
      type !== editorBase.type ||
      normalizedTagText(tagsRaw) !== normalizedTagText(editorBase.tagsRaw) ||
      pinned !== editorBase.pinned ||
      noteFolderId !== editorBase.noteFolderId ||
      linkWorkspaceId !== editorBase.linkWorkspaceId ||
      linkProjectId !== editorBase.linkProjectId ||
      linkTaskId !== editorBase.linkTaskId
    );
  }, [
    selectedNoteId,
    editorBase,
    title,
    content,
    type,
    tagsRaw,
    pinned,
    noteFolderId,
    linkWorkspaceId,
    linkProjectId,
    linkTaskId
  ]);

  const sortedScopedNotes = useMemo(() => {
    const rows = [...scopedNotes];

    rows.sort((left, right) => {
      switch (sortMode) {
        case 'updated_asc':
          return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
        case 'title_asc':
          return left.title.localeCompare(right.title, 'pt-BR');
        case 'title_desc':
          return right.title.localeCompare(left.title, 'pt-BR');
        case 'updated_desc':
        default:
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }
    });

    return rows;
  }, [scopedNotes, sortMode]);

  const visibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type !== 'geral'),
    [workspaces]
  );

  const scopedProjects = useMemo(
    () =>
      linkWorkspaceId
        ? projects.filter((project) => project.workspaceId === linkWorkspaceId)
        : projects,
    [projects, linkWorkspaceId]
  );

  const scopedTasks = useMemo(() => {
    let rows = tasks;
    if (linkWorkspaceId) {
      rows = rows.filter((task) => task.workspaceId === linkWorkspaceId);
    }
    if (linkProjectId) {
      rows = rows.filter((task) => task.projectId === linkProjectId);
    }
    return rows.slice(0, 300);
  }, [tasks, linkWorkspaceId, linkProjectId]);

  const folderOptions = useMemo(() => {
    const result: Array<{ id: string; label: string }> = [];

    const walk = (folder: NoteFolder, depth: number, trail: Set<string>) => {
      if (trail.has(folder.id)) {
        return;
      }

      const nextTrail = new Set(trail);
      nextTrail.add(folder.id);
      const prefix = depth > 0 ? `${'· '.repeat(depth)}` : '';
      result.push({ id: folder.id, label: `${prefix}${folder.name}` });

      const children = [...(childrenByParent.get(folder.id) ?? [])].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }
        return left.name.localeCompare(right.name, 'pt-BR');
      });

      children.forEach((child) => walk(child, depth + 1, nextTrail));
    };

    rootFolders.forEach((folder) => walk(folder, 0, new Set()));
    return result;
  }, [childrenByParent, rootFolders]);

  const folderParentOptions = useMemo(() => {
    if (folderModalMode !== 'rename' || !activeFolder) {
      return folderOptions;
    }

    const blocked = descendantFolderIds.get(activeFolder.id) ?? new Set<string>([activeFolder.id]);
    return folderOptions.filter((option) => !blocked.has(option.id));
  }, [folderModalMode, activeFolder, descendantFolderIds, folderOptions]);

  const activeScopeLabel = useMemo(() => {
    if (folderScope === 'all') {
      return 'Biblioteca';
    }
    if (folderScope === 'unfiled') {
      return 'Sem pasta';
    }
    return activeFolder?.name ?? 'Pasta';
  }, [folderScope, activeFolder]);
  const activeCollectionLabel = useMemo(() => {
    switch (smartCollection) {
      case 'pinned':
        return 'Fixadas';
      case 'recent':
        return `Recentes (${RECENT_WINDOW_DAYS} dias)`;
      case 'linked':
        return 'Ligadas à execução';
      case 'inbox':
        return 'Inbox';
      case 'longform':
        return 'Longas';
      case 'all':
      default:
        return 'Todas';
    }
  }, [smartCollection]);

  const allTemplates = useMemo<NoteTemplateRecord[]>(
    () => [
      ...NOTE_TEMPLATES.map((template) => ({
        ...template,
        kind: 'base' as const
      })),
      ...customTemplates.map((template) => ({
        ...template,
        kind: 'custom' as const
      }))
    ],
    [customTemplates]
  );

  const slashCommands = useMemo<SlashCommand[]>(
    () => [
      {
        id: 'todo',
        label: '/todo',
        description: 'Inserir checklist simples',
        aliases: ['checklist', 'tarefa'],
        snippet: '- [ ] '
      },
      {
        id: 'checklist3',
        label: '/checklist',
        description: 'Inserir checklist de 3 itens',
        aliases: ['lista', 'execucao'],
        snippet: '- [ ] Item 1\n- [ ] Item 2\n- [ ] Item 3\n'
      },
      {
        id: 'table',
        label: '/tabela',
        description: 'Abrir construtor visual de tabela',
        aliases: ['table', 'grid'],
        run: () => openTableBuilder()
      },
      {
        id: 'decision',
        label: '/decisao',
        description: 'Template de decisão executiva',
        aliases: ['decision'],
        snippet:
          '## Decisão\n- O que foi decidido:\n- Motivo:\n- Próximo passo:\n- Métrica de validação:\n'
      },
      {
        id: 'retro',
        label: '/retro',
        description: 'Template de retrospectiva',
        aliases: ['review', 'aprendizado'],
        snippet: '## Retro rápida\n- Funcionou:\n- Não funcionou:\n- Ajuste imediato:\n'
      },
      {
        id: 'date',
        label: '/data',
        description: 'Inserir data atual',
        aliases: ['today', 'hoje'],
        snippet: `${new Date().toLocaleDateString('pt-BR')}\n`
      },
      {
        id: 'templates',
        label: '/templates',
        description: 'Abrir painel de templates',
        aliases: ['modelos', 'template'],
        run: () => setTemplatesOpen(true)
      },
      {
        id: 'details',
        label: '/detalhes',
        description: 'Alternar painel de detalhes',
        aliases: ['meta'],
        run: () => setWriterMetaOpen((current) => !current)
      },
      {
        id: 'save',
        label: '/save',
        description: 'Salvar nota e criar versão',
        aliases: ['salvar'],
        run: () => {
          if (!selectedNoteId || busy) {
            return;
          }
          void saveNoteChanges({
            source: 'manual'
          });
        }
      }
    ],
    [busy, selectedNoteId]
  );

  const filteredSlashCommands = useMemo(() => {
    if (!slashRange) {
      return [];
    }

    const query = slashQuery.trim();
    return slashCommands
      .filter((command) => {
        if (!query) {
          return true;
        }
        const haystack = `${command.label} ${command.description} ${command.aliases.join(' ')}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [slashCommands, slashQuery, slashRange]);

  const slashMenuOpen = Boolean(slashRange && filteredSlashCommands.length > 0);

  const revisionPreview = useMemo(
    () => revisions.find((revision) => revision.id === revisionPreviewId) ?? null,
    [revisions, revisionPreviewId]
  );

  function resolveFolderPath(folderId?: string | null) {
    if (!folderId) {
      return 'Sem pasta';
    }

    const names: string[] = [];
    const guard = new Set<string>();
    let cursor: string | null = folderId;

    while (cursor && folderById.has(cursor)) {
      if (guard.has(cursor)) {
        break;
      }
      guard.add(cursor);
      const folderEntry = folderById.get(cursor);
      if (!folderEntry) {
        break;
      }
      names.unshift(folderEntry.name);
      cursor = folderEntry.parentId ?? null;
    }

    return names.length > 0 ? names.join(' / ') : 'Sem pasta';
  }

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function releaseRecordingMedia(options?: { clearBlob?: boolean }) {
    clearRecordingTimer();

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // no-op
      }
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    recordingChunksRef.current = [];

    if (options?.clearBlob) {
      setRecordingBlob(null);
      setRecordingSeconds(0);
      setRecordingStatus('idle');
      setRecordingUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return '';
      });
    }
  }

  function resetRecordingForNewNote() {
    clearRecordingTimer();
    releaseRecordingMedia({ clearBlob: true });
    setRecordingOpen(false);
    setRecordingError(null);
    setRecordingSeconds(0);
    setRecordingStatus('idle');
  }

  async function blobToBase64(blob: Blob) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result ?? '');
        const commaIndex = raw.indexOf(',');
        resolve(commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw);
      };
      reader.onerror = () => reject(new Error('Falha ao converter áudio para base64.'));
      reader.readAsDataURL(blob);
    });
  }

  async function load() {
    try {
      setError(null);

      const [noteData, folderData, workspaceData, projectData, taskData] = await Promise.all([
        api.getNotes({
          q: search.trim() ? search.trim() : undefined,
          limit: 500
        }),
        api.getNoteFolders(),
        api.getWorkspaces(),
        api.getProjects(),
        api.getTasks()
      ]);

      const validWorkspaceIds = new Set(workspaceData.map((workspace) => workspace.id));
      const validProjectIds = new Set(projectData.map((project) => project.id));
      const validFolderIds = new Set(folderData.map((folder) => folder.id));

      setFolders(folderData);
      setWorkspaces(workspaceData);
      setProjects(projectData.filter((project) => validWorkspaceIds.has(project.workspaceId)));
      setTasks(
        taskData.filter(
          (task) =>
            validWorkspaceIds.has(task.workspaceId) &&
            (!task.projectId || validProjectIds.has(task.projectId))
        )
      );
      setNotes(
        noteData.filter(
          (note) => !note.folderId || validFolderIds.has(note.folderId)
        )
      );

      setExpandedFolderIds((current) => {
        if (current.length > 0) {
          return current;
        }
        return folderData
          .filter((folder) => !folder.parentId)
          .map((folder) => folder.id)
          .slice(0, 12);
      });
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }

  async function loadRevisions(noteId: string) {
    try {
      setHistoryBusy(true);
      const data = await api.getNoteRevisions(noteId, {
        limit: 40
      });
      setRevisions(data);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setHistoryBusy(false);
    }
  }

  function clearSlashState() {
    setSlashRange(null);
    setSlashQuery('');
    setSlashIndex(0);
    setSlashMenuPosition(null);
  }

  function syncSlashMenuPosition(cursor: number) {
    const textarea = writerTextareaRef.current;
    if (!textarea) {
      setSlashMenuPosition(null);
      return;
    }

    const caret = getTextareaCaretPosition(textarea, cursor);
    const menuWidth = 330;
    const gutter = 14;
    const maxLeft = Math.max(gutter, textarea.clientWidth - menuWidth - gutter);
    const nextLeft = Math.min(Math.max(caret.left + 8, gutter), maxLeft);
    const nextTop = Math.max(caret.top + 34, gutter);
    setSlashMenuPosition({
      top: nextTop,
      left: nextLeft
    });
  }

  function syncSlashMenuPositionFromEditor() {
    const editor = writerRichEditorRef.current;
    if (!editor) {
      setSlashMenuPosition(null);
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      const fallbackRect = editor.getBoundingClientRect();
      setSlashMenuPosition({
        top: 14,
        left: Math.min(14, Math.max(8, fallbackRect.width - 340))
      });
      return;
    }

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);

    let rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      marker.style.display = 'inline-block';
      marker.style.width = '1px';
      marker.style.height = '1em';
      range.insertNode(marker);
      rect = marker.getBoundingClientRect();
      marker.parentNode?.removeChild(marker);

      selection.removeAllRanges();
      selection.addRange(range);
    }

    const editorRect = editor.getBoundingClientRect();
    const menuWidth = Math.min(330, Math.max(220, editor.clientWidth - 24));
    const gutter = 10;
    const rawLeft = rect.left - editorRect.left + 8;
    const rawTop = rect.bottom - editorRect.top + 12;
    const maxLeft = Math.max(gutter, editor.clientWidth - menuWidth - gutter);
    const maxTop = Math.max(gutter, editor.clientHeight - 180);

    setSlashMenuPosition({
      top: Math.min(Math.max(rawTop, gutter), maxTop),
      left: Math.min(Math.max(rawLeft, gutter), maxLeft)
    });
  }

  function syncSlashContext(value: string, cursor: number) {
    const safeCursor = Math.max(0, Math.min(cursor, value.length));
    const lineStart = value.lastIndexOf('\n', safeCursor - 1) + 1;
    const segment = value.slice(lineStart, safeCursor);
    const match = segment.match(/^\/([a-z0-9-]*)$/i);

    if (!match) {
      clearSlashState();
      return;
    }

    setSlashRange({
      start: lineStart,
      end: safeCursor
    });
    setSlashQuery((match[1] ?? '').toLowerCase());
    setSlashIndex(0);
    syncSlashMenuPosition(safeCursor);
  }

  function insertSnippetAtCursor(snippet: string) {
    const richEditor = writerRichEditorRef.current;
    if (writerMode && richEditor) {
      richEditor.focus();
      const selection = window.getSelection();
      if (!selection) {
        return;
      }

      if (selection.rangeCount === 0 || !richEditor.contains(selection.anchorNode)) {
        const fallbackRange = document.createRange();
        fallbackRange.selectNodeContents(richEditor);
        fallbackRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(fallbackRange);
      }

      const range = selection.getRangeAt(0);
      range.deleteContents();

      const template = document.createElement('template');
      template.innerHTML = plainTextToHtml(snippet);
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);

      if (lastNode) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(lastNode);
        nextRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(nextRange);
      }

      setContent(richEditor.innerHTML);
      return;
    }

    const textarea = writerTextareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? start;
    const next = `${content.slice(0, start)}${snippet}${content.slice(end)}`;
    const cursor = start + snippet.length;

    setContent(next);
    setTimeout(() => {
      writerTextareaRef.current?.focus();
      writerTextareaRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  }

  function applyHeading(level: 1 | 2 | 3) {
    const richEditor = writerRichEditorRef.current;
    if (writerMode && richEditor) {
      richEditor.focus();
      document.execCommand('formatBlock', false, `H${level}`);
      setContent(richEditor.innerHTML);
      syncWriterFormatState();
      return;
    }
  }

  function applyParagraphReset() {
    const richEditor = writerRichEditorRef.current;
    if (writerMode && richEditor) {
      richEditor.focus();
      document.execCommand('formatBlock', false, 'P');
      setContent(richEditor.innerHTML);
      syncWriterFormatState();
    }
  }

  function applyStrikeThrough() {
    const richEditor = writerRichEditorRef.current;
    if (writerMode && richEditor) {
      richEditor.focus();
      document.execCommand('strikeThrough');
      setContent(richEditor.innerHTML);
      syncWriterFormatState();
    }
  }

  function applyBold() {
    const richEditor = writerRichEditorRef.current;
    if (writerMode && richEditor) {
      richEditor.focus();
      document.execCommand('bold');
      setContent(richEditor.innerHTML);
      syncWriterFormatState();
    }
  }

  function applyItalic() {
    const richEditor = writerRichEditorRef.current;
    if (writerMode && richEditor) {
      richEditor.focus();
      document.execCommand('italic');
      setContent(richEditor.innerHTML);
      syncWriterFormatState();
    }
  }

  function applyTextColor(color: string) {
    const richEditor = writerRichEditorRef.current;
    if (writerMode && richEditor) {
      richEditor.focus();
      document.execCommand('foreColor', false, color);
      setContent(richEditor.innerHTML);
      syncWriterFormatState();
    }
  }

  function syncWriterFormatState() {
    const richEditor = writerRichEditorRef.current;
    if (!writerMode || !richEditor) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setWriterFormatState((current) => {
        if (
          current.heading === 0 &&
          !current.bold &&
          !current.italic &&
          !current.strike &&
          current.color === normalizeCssColor(WRITER_COLOR_OPTIONS[0]?.value ?? '#0f172a')
        ) {
          return current;
        }
        return {
          heading: 0,
          bold: false,
          italic: false,
          strike: false,
          color: normalizeCssColor(WRITER_COLOR_OPTIONS[0]?.value ?? '#0f172a')
        };
      });
      return;
    }

    const anchorNode = selection.anchorNode;
    if (anchorNode && !richEditor.contains(anchorNode)) {
      return;
    }

    const range = selection.getRangeAt(0);
    const commonNode =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement)
        : range.commonAncestorContainer.parentElement;

    let heading: 0 | 1 | 2 | 3 = 0;
    let cursor: HTMLElement | null = commonNode ?? null;
    while (cursor && cursor !== richEditor) {
      const tag = cursor.tagName.toLowerCase();
      if (tag === 'h1') {
        heading = 1;
        break;
      }
      if (tag === 'h2') {
        heading = 2;
        break;
      }
      if (tag === 'h3') {
        heading = 3;
        break;
      }
      cursor = cursor.parentElement;
    }

    const nextState: WriterInlineFormatState = {
      heading,
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      strike: document.queryCommandState('strikeThrough'),
      color:
        normalizeCssColor(document.queryCommandValue('foreColor')) ||
        normalizeCssColor(WRITER_COLOR_OPTIONS[0]?.value ?? '#0f172a')
    };

    setWriterFormatState((current) => {
      if (
        current.heading === nextState.heading &&
        current.bold === nextState.bold &&
        current.italic === nextState.italic &&
        current.strike === nextState.strike &&
        current.color === nextState.color
      ) {
        return current;
      }
      return nextState;
    });
  }

  function getCaretTextOffset(root: HTMLElement) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.endContainer)) {
      return null;
    }
    const preRange = range.cloneRange();
    preRange.selectNodeContents(root);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
  }

  function setCaretTextOffset(root: HTMLElement, offset: number) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let node: Node | null = null;

    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= len;
    }

    const fallback = document.createRange();
    fallback.selectNodeContents(root);
    fallback.collapse(false);
    selection.removeAllRanges();
    selection.addRange(fallback);
  }

  function autoAccentInRichEditor(root: HTMLElement) {
    const caretOffset = getCaretTextOffset(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let changed = false;
    let node: Node | null = null;

    while ((node = walker.nextNode())) {
      const raw = node.nodeValue ?? '';
      const accented = applyAutoAccent(raw);
      if (accented !== raw) {
        node.nodeValue = accented;
        changed = true;
      }
    }

    if (changed && caretOffset !== null) {
      setCaretTextOffset(root, caretOffset);
    }
  }

  function openSlashMenu() {
    setSlashRange({ start: 0, end: 0 });
    setSlashQuery('');
    setSlashIndex(0);
    setSlashMenuPosition(null);
    window.requestAnimationFrame(() => {
      syncSlashMenuPositionFromEditor();
    });
  }

  function downloadTextFile(filename: string, body: string, mimeType: string) {
    const blob = new Blob([body], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function getNoteTextExportBody() {
    const safeTitle = title.trim() || 'Nova nota';
    const safeBody = extractPlainTextWithBreaks(content).trim();
    if (!safeBody) {
      return safeTitle;
    }
    return `${safeTitle}\n\n${safeBody}`;
  }

  function showClipboardFeedback(target: 'copy' | 'whatsapp') {
    setClipboardFeedback(target);
    if (clipboardFeedbackTimerRef.current) {
      window.clearTimeout(clipboardFeedbackTimerRef.current);
    }
    clipboardFeedbackTimerRef.current = window.setTimeout(() => {
      setClipboardFeedback('idle');
      clipboardFeedbackTimerRef.current = null;
    }, 1400);
  }

  function copyNoteContent() {
    const payload = getNoteTextExportBody();
    if (!payload.trim()) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(payload)
        .then(() => showClipboardFeedback('copy'))
        .catch(() => {
          setError('Não foi possível copiar automaticamente.');
        });
      return;
    }

    const input = document.createElement('textarea');
    input.value = payload;
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(input);
    if (ok) {
      showClipboardFeedback('copy');
    } else {
      setError('Não foi possível copiar automaticamente.');
    }
  }

  function exportNoteAsTxt() {
    const payload = getNoteTextExportBody();
    if (!payload.trim()) {
      return;
    }
    const filename = `${sanitizeFileName(title || 'nota')}.txt`;
    downloadTextFile(filename, payload, 'text/plain;charset=utf-8');
  }

  function exportNoteAsPdf() {
    const printableContent = normalizeEditorContent(content);
    const printableTitle = escapeHtml(title.trim() || 'Nova nota');
    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${printableTitle}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; color: #0f172a; line-height: 1.55; }
      h1,h2,h3 { margin: 0 0 12px; }
      .note-title { font-size: 28px; font-weight: 700; margin-bottom: 16px; }
      .note-content { font-size: 15px; }
    </style>
  </head>
  <body>
    <div class="note-title">${printableTitle}</div>
    <div class="note-content">${printableContent || '<p>Sem conteúdo.</p>'}</div>
  </body>
</html>`;

    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      window.setTimeout(() => {
        popup.print();
      }, 140);
      return;
    }

    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);

    const frameDoc = frame.contentWindow?.document;
    if (!frameDoc || !frame.contentWindow) {
      document.body.removeChild(frame);
      setError('Não foi possível preparar a exportação PDF neste navegador.');
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => {
        if (document.body.contains(frame)) {
          document.body.removeChild(frame);
        }
      }, 1000);
    }, 180);
  }

  function renderNodeToWhatsapp(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }

    if (!(node instanceof HTMLElement)) {
      return '';
    }

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(renderNodeToWhatsapp).join('');
    const cleaned = children.trim();

    if (tag === 'br') {
      return '\n';
    }
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      return cleaned ? `*${cleaned}*\n\n` : '';
    }
    if (tag === 'p' || tag === 'div') {
      return cleaned ? `${cleaned}\n\n` : '';
    }
    if (tag === 'strong' || tag === 'b') {
      return cleaned ? `*${cleaned}*` : '';
    }
    if (tag === 'em' || tag === 'i') {
      return cleaned ? `_${cleaned}_` : '';
    }
    if (tag === 's' || tag === 'strike' || tag === 'del') {
      return cleaned ? `~${cleaned}~` : '';
    }
    if (tag === 'li') {
      return cleaned;
    }
    if (tag === 'ul') {
      const lines = Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .map((child) => `• ${renderNodeToWhatsapp(child).trim()}`)
        .filter((row) => row.length > 2);
      return lines.length > 0 ? `${lines.join('\n')}\n\n` : '';
    }
    if (tag === 'ol') {
      const lines = Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .map((child, index) => `${index + 1}. ${renderNodeToWhatsapp(child).trim()}`)
        .filter((row) => row.length > 3);
      return lines.length > 0 ? `${lines.join('\n')}\n\n` : '';
    }

    return children;
  }

  function getWhatsAppExportBody() {
    const container = document.createElement('div');
    container.innerHTML = normalizeEditorContent(content);
    const body = Array.from(container.childNodes).map(renderNodeToWhatsapp).join('');
    const compactBody = body.replace(/\n{3,}/g, '\n\n').trim();
    const safeTitle = (title.trim() || 'Nova nota').trim();
    return compactBody ? `*${safeTitle}*\n\n${compactBody}` : `*${safeTitle}*`;
  }

  function exportNoteToWhatsApp() {
    const payload = getWhatsAppExportBody();
    if (!payload.trim()) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(payload)
        .then(() => showClipboardFeedback('whatsapp'))
        .catch(() => {
          setError('Não foi possível copiar a versão WhatsApp.');
        });
      return;
    }

    const input = document.createElement('textarea');
    input.value = payload;
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(input);
    if (ok) {
      showClipboardFeedback('whatsapp');
    } else {
      setError('Não foi possível copiar a versão WhatsApp.');
    }
  }

  function openTableBuilder() {
    setTableColumns(['Campo', 'Valor']);
    setTableRows([['', '']]);
    setTableBuilderOpen(true);
  }

  function updateTableColumn(index: number, value: string) {
    setTableColumns((current) => current.map((column, columnIndex) => (columnIndex === index ? value : column)));
  }

  function updateTableCell(rowIndex: number, columnIndex: number, value: string) {
    setTableRows((current) =>
      current.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cell))
          : row
      )
    );
  }

  function addTableColumn() {
    setTableColumns((current) => [...current, `Coluna ${current.length + 1}`]);
    setTableRows((current) => current.map((row) => [...row, '']));
  }

  function removeTableColumn(index: number) {
    setTableColumns((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
    setTableRows((current) =>
      current.map((row) => {
        if (row.length <= 1) {
          return row;
        }
        return row.filter((_, currentIndex) => currentIndex !== index);
      })
    );
  }

  function addTableRow() {
    setTableRows((current) => [...current, Array.from({ length: tableColumns.length }, () => '')]);
  }

  function removeTableRow(index: number) {
    setTableRows((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function insertTableFromBuilder() {
    const markdownTable = buildMarkdownTable(tableColumns, tableRows);
    insertSnippetAtCursor(`${markdownTable}\n`);
    setTableBuilderOpen(false);
  }

  function resetTemplateDraft() {
    setTemplateEditId('');
    setTemplateTitleDraft('');
    setTemplateSubtitleDraft('');
    setTemplateTypeDraft('geral');
    setTemplateTagsDraft('');
    setTemplateContentDraft('');
  }

  function openCreateTemplateModal() {
    setTemplateModalMode('create');
    resetTemplateDraft();
    if (selectedNote) {
      setTemplateTitleDraft(selectedNote.title.trim() || 'Template personalizado');
      setTemplateTypeDraft(selectedNote.type);
      setTemplateTagsDraft((selectedNote.tags ?? []).join(', '));
      setTemplateContentDraft((selectedNote.content ?? '').trim());
      setTemplateSubtitleDraft('Template criado a partir de nota');
    }
    setTemplateModalOpen(true);
  }

  function openEditTemplateModal(template: NoteTemplate) {
    setTemplateModalMode('edit');
    setTemplateEditId(template.id);
    setTemplateTitleDraft(template.title);
    setTemplateSubtitleDraft(template.subtitle);
    setTemplateTypeDraft(template.type);
    setTemplateTagsDraft(template.tags.join(', '));
    setTemplateContentDraft(template.content);
    setTemplateModalOpen(true);
  }

  function submitTemplateModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTemplate: NoteTemplate = {
      id:
        templateModalMode === 'edit' && templateEditId
          ? templateEditId
          : `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: templateTitleDraft.trim() || 'Template sem título',
      subtitle: templateSubtitleDraft.trim() || 'Template personalizado',
      type: templateTypeDraft,
      tags: parseTags(templateTagsDraft),
      content: templateContentDraft
    };

    if (templateModalMode === 'edit') {
      setCustomTemplates((current) =>
        current.map((template) => (template.id === templateEditId ? nextTemplate : template))
      );
    } else {
      setCustomTemplates((current) => [nextTemplate, ...current]);
    }

    setTemplateModalOpen(false);
    setTemplatesOpen(true);
    resetTemplateDraft();
  }

  function removeCustomTemplate(templateId: string) {
    const target = customTemplates.find((template) => template.id === templateId);
    const shouldDelete = window.confirm(
      `Excluir template "${target?.title ?? 'personalizado'}"?`
    );
    if (!shouldDelete) {
      return;
    }
    setCustomTemplates((current) => current.filter((template) => template.id !== templateId));
  }

  useEffect(() => {
    load();
  }, [search]);

  useEffect(() => {
    setCustomTemplates(loadCustomTemplatesFromStorage());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(CUSTOM_NOTE_TEMPLATES_STORAGE_KEY, JSON.stringify(customTemplates));
  }, [customTemplates]);

  useEffect(() => {
    api
      .getNotesTranscriptionCapabilities()
      .then((capabilities) => setTranscriptionCapabilities(capabilities))
      .catch(() =>
        setTranscriptionCapabilities({
          enabled: false,
          provider: 'disabled',
          maxAudioBytes: 10 * 1024 * 1024,
          maxAudioMB: 10
        })
      );
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      releaseRecordingMedia({ clearBlob: false });
    },
    []
  );

  useEffect(
    () => () => {
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
    },
    [recordingUrl]
  );

  useEffect(() => {
    if (isFolderScope(folderScope) && !folderById.has(folderScope)) {
      setFolderScope('all');
    }
  }, [folderById, folderScope]);

  useEffect(() => {
    if (!sortedScopedNotes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(sortedScopedNotes[0]?.id ?? '');
    }
  }, [sortedScopedNotes, selectedNoteId]);

  useEffect(() => {
    if (!selectedNote) {
      setTitle('');
      setContent('');
      setType('geral');
      setTagsRaw('');
      setPinned(false);
      setNoteFolderId(isFolderScope(folderScope) ? folderScope : '');
      setLinkWorkspaceId('');
      setLinkProjectId('');
      setLinkTaskId('');
      setEditorBase(null);
      setLastSavedAt(null);
      setAutoSaveStatus('idle');
      setRevisions([]);
      clearSlashState();
      return;
    }

    const snapshot: EditorSnapshot = {
      title: selectedNote.title,
      content: selectedNote.content ?? '',
      type: selectedNote.type,
      tagsRaw: (selectedNote.tags ?? []).join(', '),
      pinned: Boolean(selectedNote.pinned),
      noteFolderId: selectedNote.folderId ?? '',
      linkWorkspaceId: selectedNote.workspaceId ?? '',
      linkProjectId: selectedNote.projectId ?? '',
      linkTaskId: selectedNote.taskId ?? ''
    };

    setTitle(snapshot.title);
    setContent(snapshot.content);
    setType(snapshot.type);
    setTagsRaw(snapshot.tagsRaw);
    setPinned(snapshot.pinned);
    setNoteFolderId(snapshot.noteFolderId);
    setLinkWorkspaceId(snapshot.linkWorkspaceId);
    setLinkProjectId(snapshot.linkProjectId);
    setLinkTaskId(snapshot.linkTaskId);
    setEditorBase(snapshot);
    setLastSavedAt(selectedNote.updatedAt ?? null);
    setAutoSaveStatus('idle');
    clearSlashState();
  }, [selectedNoteId, folderScope]);

  useEffect(() => {
    if (!selectedNoteId) {
      setRevisions([]);
      setRevisionPreviewId('');
      return;
    }

    void loadRevisions(selectedNoteId);
  }, [selectedNoteId]);

  useEffect(() => {
    if (!revisionPreviewId) {
      return;
    }
    if (!revisions.some((revision) => revision.id === revisionPreviewId)) {
      setRevisionPreviewId('');
    }
  }, [revisionPreviewId, revisions]);

  useEffect(() => {
    if (linkProjectId && !scopedProjects.some((project) => project.id === linkProjectId)) {
      setLinkProjectId('');
    }
  }, [scopedProjects, linkProjectId]);

  useEffect(() => {
    if (linkTaskId && !scopedTasks.some((task) => task.id === linkTaskId)) {
      setLinkTaskId('');
    }
  }, [scopedTasks, linkTaskId]);

  useEffect(() => {
    if (!writerMode) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      writerRichEditorRef.current?.focus();
    }, 30);

    return () => window.clearTimeout(timeoutId);
  }, [writerMode, selectedNoteId]);

  useEffect(() => {
    if (!writerMode) {
      return;
    }
    const handler = () => syncWriterFormatState();
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [writerMode]);

  useEffect(() => {
    if (!writerMode) {
      return;
    }
    const editor = writerRichEditorRef.current;
    if (!editor) {
      return;
    }
    const normalized = normalizeEditorContent(content);
    if (editor.innerHTML !== normalized) {
      editor.innerHTML = normalized;
    }
  }, [writerMode, selectedNoteId, content]);

  useEffect(() => {
    if (!slashMenuOpen) {
      setSlashIndex(0);
      return;
    }

    setSlashIndex((current) => Math.min(current, filteredSlashCommands.length - 1));
  }, [slashMenuOpen, filteredSlashCommands.length]);

  useEffect(() => {
    if (!slashMenuOpen || !writerMode) {
      return;
    }

    window.requestAnimationFrame(() => {
      syncSlashMenuPositionFromEditor();
    });
  }, [slashMenuOpen, slashQuery, slashIndex, writerMode]);

  useEffect(() => {
    return () => {
      if (clipboardFeedbackTimerRef.current) {
        window.clearTimeout(clipboardFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!writerMode || !selectedNoteId || !hasUnsavedChanges || busy) {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        const saved = await saveNoteChanges({ silent: true, source: 'autosave' });
        if (saved) {
          setAutoSaveStatus('idle');
        } else {
          setAutoSaveStatus('error');
        }
      })();
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [writerMode, selectedNoteId, hasUnsavedChanges, busy, title, content, type, tagsRaw, pinned, noteFolderId, linkWorkspaceId, linkProjectId, linkTaskId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isSaveCommand = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
      if (!isSaveCommand) {
        return;
      }

      event.preventDefault();
      if (!selectedNoteId || busy) {
        return;
      }
      void saveNoteChanges({
        source: 'manual'
      });
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNoteId, busy, title, content, type, tagsRaw, pinned, noteFolderId, linkWorkspaceId, linkProjectId, linkTaskId]);

  useEffect(() => {
    if (!selectedNoteId || writerMode) {
      return;
    }
    const target = notesListRef.current?.querySelector<HTMLButtonElement>(
      `button[data-note-id="${selectedNoteId}"]`
    );
    target?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth'
    });
  }, [selectedNoteId, writerMode, sortedScopedNotes.length]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (writerMode || folderModalOpen || templateModalOpen || tableBuilderOpen) {
        return;
      }

      const key = event.key.toLowerCase();
      const typingTarget = isTypingTarget(event.target);

      if (!typingTarget && key === '/') {
        event.preventDefault();
        noteSearchInputRef.current?.focus();
        noteSearchInputRef.current?.select();
        return;
      }

      if (!typingTarget && key === 'n') {
        event.preventDefault();
        void createNote({
          focusWriter: true
        });
        return;
      }

      if (!typingTarget && (key === 'j' || key === 'arrowdown' || key === 'k' || key === 'arrowup')) {
        if (sortedScopedNotes.length === 0) {
          return;
        }

        event.preventDefault();
        const currentIndex = sortedScopedNotes.findIndex((note) => note.id === selectedNoteId);
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex =
          key === 'j' || key === 'arrowdown'
            ? Math.min(sortedScopedNotes.length - 1, baseIndex + 1)
            : Math.max(0, baseIndex - 1);
        setSelectedNoteId(sortedScopedNotes[nextIndex]?.id ?? selectedNoteId);
        return;
      }

      if (!typingTarget && key === 'enter' && selectedNoteId) {
        event.preventDefault();
        startWriterForNote(selectedNoteId);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    writerMode,
    folderModalOpen,
    templateModalOpen,
    tableBuilderOpen,
    sortedScopedNotes,
    selectedNoteId
  ]);

  function openCreateFolderModal(parentId: string | null) {
    setFolderModalMode('create');
    setFolderModalTitle(parentId ? 'Nova subpasta' : 'Nova pasta');
    setFolderNameDraft('');
    setFolderColorDraft(DEFAULT_FOLDER_COLOR);
    setFolderParentDraft(parentId ?? '');
    setFolderModalOpen(true);
  }

  function openRenameFolderModal() {
    if (!activeFolder) {
      return;
    }

    setFolderModalMode('rename');
    setFolderModalTitle('Renomear pasta');
    setFolderNameDraft(activeFolder.name);
    setFolderColorDraft(activeFolder.color ?? DEFAULT_FOLDER_COLOR);
    setFolderParentDraft(activeFolder.parentId ?? '');
    setFolderModalOpen(true);
  }

  function closeFolderModal() {
    if (folderModalBusy) {
      return;
    }
    setFolderModalOpen(false);
  }

  async function submitFolderModal(event: FormEvent) {
    event.preventDefault();

    if (!folderNameDraft.trim()) {
      setError('Informe um nome para a pasta.');
      return;
    }

    try {
      setFolderModalBusy(true);
      setBusy(true);

      if (folderModalMode === 'create') {
        const created = await api.createNoteFolder({
          name: folderNameDraft.trim(),
          color: folderColorDraft || DEFAULT_FOLDER_COLOR,
          parentId: folderParentDraft || null
        });

        setFolderScope(created.id);
        if (created.parentId) {
          setExpandedFolderIds((current) =>
            current.includes(created.parentId as string) ? current : [...current, created.parentId as string]
          );
        }
      } else if (activeFolder) {
        await api.updateNoteFolder(activeFolder.id, {
          name: folderNameDraft.trim(),
          color: folderColorDraft || DEFAULT_FOLDER_COLOR,
          parentId: folderParentDraft || null
        });
      }

      await load();
      setFolderModalOpen(false);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setFolderModalBusy(false);
      setBusy(false);
    }
  }

  async function deleteActiveFolder() {
    if (!activeFolder) {
      return;
    }

    const shouldDelete = window.confirm(
      `Excluir pasta "${activeFolder.name}"? Notas internas ficarão sem pasta e subpastas sobem de nível.`
    );
    if (!shouldDelete) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteNoteFolder(activeFolder.id);
      setFolderScope('all');
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveNoteToFolder(noteId: string, targetFolderId: string | null) {
    const note = notes.find((row) => row.id === noteId);
    if (!note) {
      return;
    }

    const currentFolder = note.folderId ?? null;
    if (currentFolder === targetFolderId) {
      return;
    }

    try {
      setBusy(true);
      await api.updateNote(noteId, {
        folderId: targetFolderId
      });

      if (selectedNoteId === noteId) {
        setNoteFolderId(targetFolderId ?? '');
      }

      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleNoteDragStart(event: DragEvent<HTMLButtonElement>, noteId: string) {
    event.dataTransfer.setData('application/x-notes-note-id', noteId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingNoteId(noteId);
  }

  function handleNoteDragEnd() {
    setDraggingNoteId(null);
    setFolderDropTarget(null);
  }

  async function handleFolderDrop(event: DragEvent<HTMLElement>, targetFolderId: string | null) {
    event.preventDefault();
    const dataId =
      event.dataTransfer.getData('application/x-notes-note-id') || draggingNoteId || '';
    if (!dataId) {
      return;
    }

    setFolderDropTarget(null);
    setDraggingNoteId(null);
    await moveNoteToFolder(dataId, targetFolderId);
  }

  async function createNote(options?: { focusWriter?: boolean; withPeopleTemplate?: boolean }) {
    if (recordingStatus === 'recording' || recordingStatus === 'paused') {
      const shouldStopRecording = window.confirm(
        'Há uma gravação em andamento. Deseja parar e abrir uma nova nota do zero?'
      );
      if (!shouldStopRecording) {
        return;
      }
    }

    try {
      setBusy(true);
      resetRecordingForNewNote();

      const created = await api.createNote({
        title: options?.withPeopleTemplate ? 'Gestão de pessoas' : 'Nova nota',
        content: options?.withPeopleTemplate ? PEOPLE_TEMPLATE : '',
        type: options?.withPeopleTemplate ? 'pessoas' : 'geral',
        tags: options?.withPeopleTemplate ? ['pessoas', 'gestao'] : [],
        folderId: isFolderScope(folderScope) ? folderScope : null
      });

      await load();
      setSelectedNoteId(created.id);
      resetRecordingForNewNote();
      if (options?.focusWriter ?? true) {
        setWriterMode(true);
        setWriterMetaOpen(false);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createNoteFromTemplate(template: NoteTemplate, focusWriter = true) {
    if (recordingStatus === 'recording' || recordingStatus === 'paused') {
      const shouldStopRecording = window.confirm(
        'Há uma gravação em andamento. Deseja parar e criar a nota por template?'
      );
      if (!shouldStopRecording) {
        return;
      }
    }

    try {
      setBusy(true);
      resetRecordingForNewNote();

      const created = await api.createNote({
        title: template.title,
        content: template.content,
        type: template.type,
        tags: template.tags,
        folderId: isFolderScope(folderScope) ? folderScope : null
      });

      await load();
      setSelectedNoteId(created.id);
      resetRecordingForNewNote();
      setWriterMode(focusWriter);
      setWriterMetaOpen(true);
      setTemplatesOpen(false);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function applyTemplateToCurrentNote(template: NoteTemplate, mode: 'append' | 'replace') {
    if (mode === 'replace') {
      const shouldReplace = window.confirm(
        'Substituir conteúdo atual pelo template selecionado?'
      );
      if (!shouldReplace) {
        return;
      }
      setContent(normalizeEditorContent(template.content));
    } else {
      setContent((current) => appendPlainTextToContent(current, template.content));
    }

    if (!title.trim()) {
      setTitle(template.title);
    }
    if (type === 'geral') {
      setType(template.type);
    }
    setTagsRaw((current) => mergeSuggestedTags(current, template.tags));
    setWriterMetaOpen(true);
  }

  async function createManualCheckpoint() {
    if (!selectedNoteId) {
      return;
    }

    try {
      setBusy(true);
      await api.createNoteRevision(selectedNoteId, {
        source: 'checkpoint'
      });
      await loadRevisions(selectedNoteId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreRevision(revisionId: string) {
    if (!selectedNoteId) {
      return;
    }

    const shouldRestore = window.confirm(
      'Restaurar esta versão da nota? Um backup da versão atual será salvo automaticamente.'
    );
    if (!shouldRestore) {
      return;
    }

    try {
      setBusy(true);
      const restored = await api.restoreNoteRevision(selectedNoteId, revisionId);
      await load();
      setSelectedNoteId(restored.id);
      await loadRevisions(restored.id);
      setWriterMetaOpen(true);
      setHistoryOpen(true);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreRevisionFromPreview(revisionId: string) {
    await restoreRevision(revisionId);
    setRevisionPreviewId('');
  }

  function applySlashCommand(command: SlashCommand) {
    if (command.snippet) {
      insertSnippetAtCursor(command.snippet);
    }

    if (command.run) {
      void command.run();
    }

    clearSlashState();
  }

  function handleWriterEditorKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const isPrimaryModifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (isPrimaryModifier && !event.shiftKey && !event.altKey && key === 'b') {
      event.preventDefault();
      applyBold();
      return;
    }

    if (isPrimaryModifier && !event.shiftKey && !event.altKey && key === 'i') {
      event.preventDefault();
      applyItalic();
      return;
    }

    const isSlashTrigger = event.key === '/' || event.code === 'Slash';
    if (
      isSlashTrigger &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      openSlashMenu();
      return;
    }

    if (!slashMenuOpen) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSlashIndex((current) => Math.min(current + 1, filteredSlashCommands.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSlashIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      clearSlashState();
      return;
    }

    if (event.key === 'Tab' || event.key === 'Enter') {
      const command = filteredSlashCommands[slashIndex] ?? filteredSlashCommands[0];
      if (!command) {
        return;
      }
      event.preventDefault();
      applySlashCommand(command);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      setSlashQuery((current) => {
        const next = current.slice(0, -1);
        window.requestAnimationFrame(() => {
          syncSlashMenuPositionFromEditor();
        });
        return next;
      });
      return;
    }

    if (/^[a-z0-9-]$/i.test(event.key)) {
      event.preventDefault();
      setSlashQuery((current) => {
        const next = `${current}${event.key.toLowerCase()}`;
        window.requestAnimationFrame(() => {
          syncSlashMenuPositionFromEditor();
        });
        return next;
      });
      return;
    }
  }

  async function saveNoteChanges(options?: {
    silent?: boolean;
    source?: 'manual' | 'autosave' | 'restore' | 'system';
  }) {
    if (!selectedNoteId) {
      return false;
    }

    if (!title.trim()) {
      if (!options?.silent) {
        setError('Informe um título para a nota.');
      }
      return false;
    }

    const nextSnapshot: EditorSnapshot = {
      title: title.trim(),
      content,
      type,
      tagsRaw,
      pinned,
      noteFolderId: noteFolderId || '',
      linkWorkspaceId: linkWorkspaceId || '',
      linkProjectId: linkProjectId || '',
      linkTaskId: linkTaskId || ''
    };

      const shouldLockUi = options?.source !== 'autosave';

    try {
      if (shouldLockUi) {
        setBusy(true);
      }
      const updatedNote = await api.updateNote(selectedNoteId, {
        title: nextSnapshot.title,
        content: nextSnapshot.content ? nextSnapshot.content : null,
        type,
        tags: parseTags(tagsRaw),
        pinned,
        folderId: noteFolderId || null,
        workspaceId: linkWorkspaceId || null,
        projectId: linkProjectId || null,
        taskId: linkTaskId || null,
        saveSource: options?.source ?? 'manual'
      });
      const normalizedSnapshot: EditorSnapshot = {
        title: updatedNote.title,
        content: updatedNote.content ?? '',
        type: updatedNote.type,
        tagsRaw: (updatedNote.tags ?? []).join(', '),
        pinned: Boolean(updatedNote.pinned),
        noteFolderId: updatedNote.folderId ?? '',
        linkWorkspaceId: updatedNote.workspaceId ?? '',
        linkProjectId: updatedNote.projectId ?? '',
        linkTaskId: updatedNote.taskId ?? ''
      };

      const isAutosave = options?.source === 'autosave';

      if (isAutosave) {
        setEditorBase(nextSnapshot);
      } else {
        setTitle(normalizedSnapshot.title);
        setContent(normalizedSnapshot.content);
        setType(normalizedSnapshot.type);
        setTagsRaw(normalizedSnapshot.tagsRaw);
        setPinned(normalizedSnapshot.pinned);
        setNoteFolderId(normalizedSnapshot.noteFolderId);
        setLinkWorkspaceId(normalizedSnapshot.linkWorkspaceId);
        setLinkProjectId(normalizedSnapshot.linkProjectId);
        setLinkTaskId(normalizedSnapshot.linkTaskId);
        setEditorBase(normalizedSnapshot);
      }

      setLastSavedAt(updatedNote.updatedAt ?? new Date().toISOString());
      if (!isAutosave) {
        setNotes((current) =>
          current.map((note) =>
            note.id === updatedNote.id
              ? {
                  ...note,
                  ...updatedNote
                }
              : note
          )
        );
      }
      if (!isAutosave && historyOpen && updatedNote.id === selectedNoteId) {
        void loadRevisions(updatedNote.id);
      }
      return true;
    } catch (requestError) {
      if (!options?.silent) {
        setError((requestError as Error).message);
      }
      return false;
    } finally {
      if (shouldLockUi) {
        setBusy(false);
      }
    }
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    await saveNoteChanges({
      source: 'manual'
    });
  }

  async function deleteNote(noteId: string) {
    const target = notes.find((note) => note.id === noteId);
    const shouldDelete = window.confirm(`Excluir a nota "${target?.title ?? 'selecionada'}"?`);
    if (!shouldDelete) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteNote(noteId);
      if (selectedNoteId === noteId) {
        setSelectedNoteId('');
      }
      await load();
      setWriterMode(false);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startWriterForNote(noteId: string) {
    if (selectedNoteId && selectedNoteId !== noteId && hasUnsavedChanges) {
      const shouldSwitch = window.confirm(
        'Você tem alterações não salvas na nota atual. Deseja trocar mesmo assim?'
      );
      if (!shouldSwitch) {
        return;
      }
    }

    setSelectedNoteId(noteId);
    setWriterMode(true);
  }

  function insertPeopleTemplate() {
    setType('pessoas');
    setTitle((current) => current.trim() || 'Gestão de pessoas');
    setContent((current) => appendPlainTextToContent(current, PEOPLE_TEMPLATE));
  }

  function stopVoiceCapture() {
    recognitionRef.current?.stop();
  }

  function startVoiceCapture() {
    if (!voiceSupported) {
      setError('Este navegador não suporta captura de voz nativa.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('API de voz indisponível.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
        let transcript = '';
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) {
            transcript += `${result[0].transcript} `;
          }
        }

        if (transcript.trim()) {
          setContent((current) => appendPlainTextToContent(current, transcript.trim()));
        }
      };

      recognition.onerror = () => {
        setError('Falha ao transcrever áudio. Tente novamente.');
        setVoiceListening(false);
      };

      recognition.onend = () => {
        setVoiceListening(false);
      };

      setVoiceListening(true);
      recognition.start();
    } catch {
      setError('Não foi possível iniciar o microfone no navegador atual.');
      setVoiceListening(false);
    }
  }

  async function startRobustRecording() {
    if (!recordingSupported) {
      setRecordingError('Gravação de áudio não suportada neste navegador.');
      return;
    }

    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
    }

    releaseRecordingMedia({ clearBlob: true });
    setRecordingError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ];

      const pickedMimeType =
        preferredTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';

      const recorder = pickedMimeType
        ? new MediaRecorder(stream, { mimeType: pickedMimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      setRecordingMimeType(pickedMimeType || recorder.mimeType || 'audio/webm');
      setRecordingBlob(null);
      setRecordingSeconds(0);
      setRecordingStatus('recording');

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, {
          type: pickedMimeType || recorder.mimeType || 'audio/webm'
        });

        setRecordingBlob(blob);
        const nextUrl = URL.createObjectURL(blob);
        setRecordingUrl(nextUrl);
        setRecordingStatus('ready');

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
      };

      recorder.onerror = () => {
        setRecordingError('Falha na gravação. Tente novamente.');
        setRecordingStatus('idle');
      };

      recorder.start(300);
      clearRecordingTimer();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (requestError) {
      setRecordingError((requestError as Error).message || 'Não foi possível iniciar a gravação.');
      releaseRecordingMedia({ clearBlob: true });
    }
  }

  function pauseRobustRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      return;
    }
    recorder.pause();
    clearRecordingTimer();
    setRecordingStatus('paused');
  }

  function resumeRobustRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') {
      return;
    }
    recorder.resume();
    clearRecordingTimer();
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);
    setRecordingStatus('recording');
  }

  function stopRobustRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }
    clearRecordingTimer();
    recorder.stop();
  }

  function discardRobustRecording() {
    setRecordingUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return '';
    });
    setRecordingBlob(null);
    setRecordingSeconds(0);
    setRecordingStatus('idle');
    setRecordingError(null);
  }

  function mergeSuggestedTags(rawCurrentTags: string, suggestedTags: string[]) {
    const merged = new Set<string>([
      ...parseTags(rawCurrentTags),
      ...suggestedTags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0)
    ]);
    return Array.from(merged).join(', ');
  }

  async function transcribeRobustRecording(mode: 'transcript' | 'note') {
    if (!recordingBlob) {
      return;
    }

    if (!transcriptionCapabilities?.enabled) {
      setRecordingError(
        'Transcrição IA não configurada no backend. Configure NOTES_TRANSCRIBE_WEBHOOK_URL.'
      );
      return;
    }

    try {
      setRecordingError(null);
      setRecordingStatus('processing');
      setBusy(true);

      const base64Audio = await blobToBase64(recordingBlob);
      const result = await api.transcribeNoteAudio({
        audioBase64: base64Audio,
        mimeType: recordingBlob.type || recordingMimeType,
        language: 'pt-BR',
        mode,
        context: title.trim() || null
      });

      const transcript = (result.transcript ?? '').trim();
      const structuredContent = (result.structuredContent ?? '').trim();
      const nextChunk =
        mode === 'note'
          ? structuredContent || transcript
          : transcript || structuredContent;

      if (!nextChunk) {
        setRecordingError('A transcrição retornou vazia. Tente novamente com áudio mais claro.');
        setRecordingStatus('ready');
        return;
      }

      setContent((current) => appendPlainTextToContent(current, nextChunk));

      const suggestedTitle = suggestTitleFromTranscription({
        titleSuggestion: result.titleSuggestion,
        structuredContent,
        transcript
      });
      if (
        suggestedTitle &&
        (
          !title.trim() ||
          isPlaceholderNoteTitle(title) ||
          (mode === 'note' && title.trim().length <= 4)
        )
      ) {
        setTitle(suggestedTitle);
      }

      if (result.tags.length > 0) {
        setTagsRaw((current) => mergeSuggestedTags(current, result.tags));
      }

      setWriterMetaOpen(true);
      setRecordingStatus('ready');
    } catch (requestError) {
      setRecordingError((requestError as Error).message || 'Erro ao processar gravação.');
      setRecordingStatus('ready');
    } finally {
      setBusy(false);
    }
  }

  function toggleFolderExpansion(folderId: string) {
    setExpandedFolderIds((current) =>
      current.includes(folderId)
        ? current.filter((id) => id !== folderId)
        : [...current, folderId]
    );
  }

  function backToOperes() {
    if (recordingStatus === 'recording' || recordingStatus === 'paused') {
      const shouldStopRecording = window.confirm(
        'Existe uma gravação em andamento. Deseja parar e sair?'
      );
      if (!shouldStopRecording) {
        return;
      }
      stopRobustRecording();
      releaseRecordingMedia({ clearBlob: false });
    }

    if (hasUnsavedChanges) {
      const shouldLeave = window.confirm(
        'Há alterações não salvas na nota atual. Deseja sair mesmo assim?'
      );
      if (!shouldLeave) {
        return;
      }
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  }

  function renderTemplatesPanel(options?: { writer?: boolean }) {
    if (!templatesOpen) {
      return null;
    }

    return (
      <section className="notes-template-panel">
        <header>
          <div>
            <strong>Templates executivos</strong>
            <small>
              {allTemplates.length} template(s): base + personalizados para acelerar sua escrita.
            </small>
          </div>
          <div className="notes-template-head-actions">
            <button type="button" className="ghost-button" onClick={openCreateTemplateModal}>
              Novo template
            </button>
            <button type="button" className="ghost-button" onClick={() => setTemplatesOpen(false)}>
              Fechar
            </button>
          </div>
        </header>

        <div className="notes-template-grid">
          {allTemplates.map((template) => (
            <article key={template.id} className="notes-template-card">
              <div>
                <h4>{template.title}</h4>
                <small>{template.subtitle}</small>
              </div>
              <div className="notes-template-meta">
                <span className={`notes-template-origin ${template.kind === 'custom' ? 'custom' : 'base'}`}>
                  {template.kind === 'custom' ? 'personalizado' : 'base'}
                </span>
                <span className="status-tag">{noteTypeLabel(template.type)}</span>
              </div>
              <div className="notes-template-tags">
                {template.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
                {template.tags.length === 0 && <span>#sem-tag</span>}
              </div>
              <footer>
                {!options?.writer && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void createNoteFromTemplate(template, true)}
                    disabled={busy}
                  >
                    Criar nota
                  </button>
                )}
                {options?.writer && selectedNote && (
                  <>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => applyTemplateToCurrentNote(template, 'append')}
                      disabled={busy}
                    >
                      Inserir abaixo
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTemplateToCurrentNote(template, 'replace')}
                      disabled={busy}
                    >
                      Substituir
                    </button>
                  </>
                )}
                {template.kind === 'custom' && (
                  <>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => openEditTemplateModal(template)}
                      disabled={busy}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => removeCustomTemplate(template.id)}
                      disabled={busy}
                    >
                      Excluir
                    </button>
                  </>
                )}
              </footer>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderFolderNode(folder: NoteFolder, depth: number, trail: Set<string>): ReactNode {
    if (trail.has(folder.id)) {
      return null;
    }

    const children = [...(childrenByParent.get(folder.id) ?? [])].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.name.localeCompare(right.name, 'pt-BR');
    });

    const hasChildren = children.length > 0;
    const expanded = expandedFolderIds.includes(folder.id);
    const isActive = folderScope === folder.id;
    const count = folderCounts.byFolder.get(folder.id) ?? 0;

    const nextTrail = new Set(trail);
    nextTrail.add(folder.id);

    const isDropTarget = folderDropTarget === folder.id && draggingNoteId !== null;

    return (
      <li key={folder.id}>
        <div
          className={`notes-folder-node ${isActive ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''}`}
          style={{ '--depth': depth } as CSSProperties}
          onDragOver={(event) => {
            if (!draggingNoteId) {
              return;
            }
            event.preventDefault();
            setFolderDropTarget(folder.id);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setFolderDropTarget((current) => (current === folder.id ? null : current));
          }}
          onDrop={(event) => void handleFolderDrop(event, folder.id)}
        >
          <button
            type="button"
            className="notes-folder-node-main"
            onClick={() => setFolderScope(folder.id)}
          >
            <span className="notes-folder-color" style={{ background: folder.color ?? DEFAULT_FOLDER_COLOR }} />
            <span className="notes-folder-node-label">{folder.name}</span>
            <strong>{count}</strong>
          </button>

          {hasChildren && (
            <button
              type="button"
              className="notes-folder-toggle"
              onClick={() => toggleFolderExpansion(folder.id)}
              title={expanded ? 'Recolher subpastas' : 'Expandir subpastas'}
              aria-label={expanded ? 'Recolher pasta' : 'Expandir pasta'}
            >
              {expanded ? '▾' : '▸'}
            </button>
          )}
        </div>

        {hasChildren && expanded && (
          <ul className="notes-folder-children">
            {children.map((child) => renderFolderNode(child, depth + 1, nextTrail))}
          </ul>
        )}
      </li>
    );
  }

  function renderTemplateModal() {
    if (!templateModalOpen) {
      return null;
    }

    return (
      <div
        className="notes-template-modal-backdrop"
        role="presentation"
        onClick={() => {
          setTemplateModalOpen(false);
          resetTemplateDraft();
        }}
      >
        <div
          className="notes-template-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="notes-template-modal-head">
            <h3>{templateModalMode === 'edit' ? 'Editar template' : 'Novo template personalizado'}</h3>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setTemplateModalOpen(false);
                resetTemplateDraft();
              }}
            >
              Fechar
            </button>
          </header>

          <form className="notes-template-modal-form" onSubmit={submitTemplateModal}>
            <div className="row-2">
              <label>
                Título
                <input
                  value={templateTitleDraft}
                  onChange={(event) => setTemplateTitleDraft(event.target.value)}
                  placeholder="Ex: Debrief semanal da operação"
                  required
                  autoFocus
                />
              </label>
              <label>
                Subtítulo
                <input
                  value={templateSubtitleDraft}
                  onChange={(event) => setTemplateSubtitleDraft(event.target.value)}
                  placeholder="Ex: Contexto rápido e decisões"
                />
              </label>
            </div>

            <div className="row-2">
              <label>
                Tipo
                <select
                  value={templateTypeDraft}
                  onChange={(event) => setTemplateTypeDraft(event.target.value as NoteType)}
                >
                  {Object.entries(NOTE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tags
                <input
                  value={templateTagsDraft}
                  onChange={(event) => setTemplateTagsDraft(event.target.value)}
                  placeholder="ceo, reuniao, decisao"
                />
              </label>
            </div>

            <label>
              Conteúdo do template
              <textarea
                className="notes-template-content"
                value={templateContentDraft}
                onChange={(event) => setTemplateContentDraft(event.target.value)}
                placeholder="Escreva o modelo base para reutilização."
                required
              />
            </label>

            <div className="notes-template-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setTemplateModalOpen(false);
                  resetTemplateDraft();
                }}
              >
                Cancelar
              </button>
              <button type="submit">{templateModalMode === 'edit' ? 'Salvar template' : 'Criar template'}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderRevisionPreviewModal() {
    if (!revisionPreview) {
      return null;
    }

    const isCurrentRevision = revisions[0]?.id === revisionPreview.id;
    const previewTitle = displayNoteTitle(revisionPreview.title);
    const previewContent = normalizeEditorContent(revisionPreview.content ?? '');
    const previewTagList = revisionPreview.tags ?? [];
    const currentTagList = parseTags(tagsRaw);
    const currentTitle = displayNoteTitle(title);
    const currentContent = normalizeEditorContent(content ?? '');

    const selectedPlain = extractPlainTextWithBreaks(revisionPreview.content ?? '').trim();
    const currentPlain = extractPlainTextWithBreaks(content ?? '').trim();
    const titleChanged = (revisionPreview.title ?? '').trim() !== (title ?? '').trim();
    const typeChanged = revisionPreview.type !== type;
    const pinChanged = Boolean(revisionPreview.pinned) !== Boolean(pinned);
    const tagsChanged = previewTagList.join('|') !== currentTagList.join('|');
    const contentChanged = selectedPlain !== currentPlain;
    const changedCount = [titleChanged, typeChanged, pinChanged, tagsChanged, contentChanged].filter(Boolean).length;
    const wordsSelected = selectedPlain.split(/\s+/).filter(Boolean).length;
    const wordsCurrent = currentPlain.split(/\s+/).filter(Boolean).length;

    return (
      <div
        className="notes-template-modal-backdrop"
        role="presentation"
        onClick={() => setRevisionPreviewId('')}
      >
        <div
          className="notes-template-modal notes-revision-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Pré-visualização da versão ${formatDateTimeLabel(revisionPreview.createdAt)}`}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="notes-template-modal-head">
            <div>
              <h3>Versão de {formatDateTimeLabel(revisionPreview.createdAt)}</h3>
              <small>
                {noteRevisionSourceLabel(revisionPreview.source)} • {changedCount} diferença(s) vs atual
              </small>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setRevisionPreviewId('')}
            >
              Fechar
            </button>
          </header>

          <section className="notes-revision-modal-body">
            <div className="notes-revision-compare-summary">
              <span className={`status-tag ${contentChanged ? 'atrasado' : 'feito'}`}>
                Conteúdo {contentChanged ? 'alterado' : 'igual'}
              </span>
              <span className={`status-tag ${titleChanged ? 'atrasado' : 'feito'}`}>
                Título {titleChanged ? 'alterado' : 'igual'}
              </span>
              <span className={`status-tag ${tagsChanged ? 'atrasado' : 'feito'}`}>
                Tags {tagsChanged ? 'alteradas' : 'iguais'}
              </span>
              <span className={`status-tag ${typeChanged ? 'atrasado' : 'feito'}`}>
                Tipo {typeChanged ? 'alterado' : 'igual'}
              </span>
              <span className={`status-tag ${pinChanged ? 'atrasado' : 'feito'}`}>
                Fixação {pinChanged ? 'alterada' : 'igual'}
              </span>
            </div>

            <section className="notes-revision-compare-grid">
              <article className="notes-revision-compare-card">
                <header>
                  <strong>Versão selecionada</strong>
                  <small>{formatDateTimeLabel(revisionPreview.createdAt)}</small>
                </header>
                <div className="notes-preview-meta-grid">
                  <small>
                    <strong>Título</strong>
                    <br />
                    {previewTitle}
                  </small>
                  <small>
                    <strong>Tipo</strong>
                    <br />
                    {noteTypeLabel(revisionPreview.type)}
                  </small>
                  <small>
                    <strong>Origem</strong>
                    <br />
                    {noteRevisionSourceLabel(revisionPreview.source)}
                  </small>
                  <small>
                    <strong>Fixada</strong>
                    <br />
                    {revisionPreview.pinned ? 'Sim' : 'Não'}
                  </small>
                </div>
                <div className="notes-revision-modal-tags">
                  {previewTagList.length > 0 ? (
                    previewTagList.map((tag) => (
                      <span key={`${revisionPreview.id}-${tag}`} className="status-tag">
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <small className="notes-related-empty">Sem tags nesta versão.</small>
                  )}
                </div>
                <section className="notes-revision-modal-content">
                  <header>
                    <strong>Conteúdo completo</strong>
                    <small>{wordsSelected} palavra(s)</small>
                  </header>
                  {previewContent ? (
                    <article dangerouslySetInnerHTML={{ __html: previewContent }} />
                  ) : (
                    <small className="notes-related-empty">Versão sem conteúdo.</small>
                  )}
                </section>
              </article>

              <article className="notes-revision-compare-card">
                <header>
                  <strong>Versão atual</strong>
                  <small>{formatDateTimeLabel(lastSavedAt ?? selectedNote?.updatedAt)}</small>
                </header>
                <div className="notes-preview-meta-grid">
                  <small>
                    <strong>Título</strong>
                    <br />
                    {currentTitle}
                  </small>
                  <small>
                    <strong>Tipo</strong>
                    <br />
                    {noteTypeLabel(type)}
                  </small>
                  <small>
                    <strong>Origem</strong>
                    <br />
                    Editor atual
                  </small>
                  <small>
                    <strong>Fixada</strong>
                    <br />
                    {pinned ? 'Sim' : 'Não'}
                  </small>
                </div>
                <div className="notes-revision-modal-tags">
                  {currentTagList.length > 0 ? (
                    currentTagList.map((tag) => (
                      <span key={`current-${tag}`} className="status-tag">
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <small className="notes-related-empty">Sem tags na versão atual.</small>
                  )}
                </div>
                <section className="notes-revision-modal-content">
                  <header>
                    <strong>Conteúdo completo</strong>
                    <small>{wordsCurrent} palavra(s)</small>
                  </header>
                  {currentContent ? (
                    <article dangerouslySetInnerHTML={{ __html: currentContent }} />
                  ) : (
                    <small className="notes-related-empty">Versão atual sem conteúdo.</small>
                  )}
                </section>
              </article>
            </section>
          </section>

          <div className="notes-template-modal-actions">
            <button type="button" className="ghost-button" onClick={() => setRevisionPreviewId('')}>
              Fechar
            </button>
            {!isCurrentRevision && (
              <button
                type="button"
                onClick={() => void restoreRevisionFromPreview(revisionPreview.id)}
                disabled={busy}
              >
                Restaurar esta versão
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderTableBuilderModal() {
    if (!tableBuilderOpen) {
      return null;
    }

    return (
      <div
        className="notes-table-builder-backdrop"
        role="presentation"
        onClick={() => setTableBuilderOpen(false)}
      >
        <div
          className="notes-table-builder-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="notes-table-builder-head">
            <div>
              <strong>Tabela visual</strong>
              <small>Monte a tabela em grade e insira no editor.</small>
            </div>
            <div className="inline-actions">
              <button type="button" className="ghost-button" onClick={() => setTableBuilderOpen(false)}>
                Cancelar
              </button>
              <button type="button" onClick={insertTableFromBuilder}>
                Inserir na nota
              </button>
            </div>
          </header>

          <div className="notes-table-builder-actions">
            <button type="button" className="ghost-button" onClick={addTableColumn}>
              + Coluna
            </button>
            <button type="button" className="ghost-button" onClick={addTableRow}>
              + Linha
            </button>
          </div>

          <section className="notes-table-builder-grid">
            <table>
              <thead>
                <tr>
                  {tableColumns.map((column, columnIndex) => (
                    <th key={`column-${columnIndex}`}>
                      <input
                        value={column}
                        onChange={(event) => updateTableColumn(columnIndex, event.target.value)}
                        placeholder={`Coluna ${columnIndex + 1}`}
                      />
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => removeTableColumn(columnIndex)}
                        disabled={tableColumns.length <= 1}
                      >
                        ×
                      </button>
                    </th>
                  ))}
                  <th className="actions-col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {tableColumns.map((_, columnIndex) => (
                      <td key={`cell-${rowIndex}-${columnIndex}`}>
                        <input
                          value={row[columnIndex] ?? ''}
                          onChange={(event) => updateTableCell(rowIndex, columnIndex, event.target.value)}
                          placeholder="Valor"
                        />
                      </td>
                    ))}
                    <td className="actions-col">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => removeTableRow(rowIndex)}
                        disabled={tableRows.length <= 1}
                      >
                        Remover linha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <main className="notes-app-shell">
        <header className="notes-app-topbar">
          <button type="button" className="ghost-button" onClick={backToOperes}>
            Voltar ao Operis
          </button>
        </header>
        <section className="notes-app-body">
          <PremiumCard title="Pastas">
            <SkeletonBlock lines={9} />
          </PremiumCard>
          <PremiumCard title="Notas">
            <SkeletonBlock lines={10} />
          </PremiumCard>
          <PremiumCard title="Preview">
            <SkeletonBlock lines={12} />
          </PremiumCard>
        </section>
      </main>
    );
  }

  if (writerMode) {
    return (
      <>
        <main className="notes-app-shell notes-app-shell-writer">
          <header className="notes-app-topbar notes-writer-toolbar">
            <div className="notes-writer-toolbar-scroll" role="toolbar" aria-label="Acoes da nota">
              <button
                type="button"
                className="notes-icon-button"
                title="Biblioteca"
                aria-label="Biblioteca"
                onClick={() => {
                  if (recordingStatus === 'recording' || recordingStatus === 'paused') {
                    const shouldStopRecording = window.confirm(
                      'Existe uma gravação em andamento. Deseja parar antes de voltar para a biblioteca?'
                    );
                    if (!shouldStopRecording) {
                      return;
                    }
                    stopRobustRecording();
                    releaseRecordingMedia({ clearBlob: false });
                  }

                  if (hasUnsavedChanges) {
                    const shouldClose = window.confirm(
                      'Há alterações não salvas. Deseja voltar para a biblioteca mesmo assim?'
                    );
                    if (!shouldClose) {
                      return;
                    }
                  }
                  setWriterMode(false);
                  setWriterMetaOpen(false);
                }}
              >
                <BookOpen size={18} />
              </button>
              <button
                type="button"
                className="notes-icon-button"
                title="Voltar ao Operis"
                aria-label="Voltar ao Operis"
                onClick={backToOperes}
              >
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                className={`notes-icon-button ${recordingOpen ? 'active' : ''}`}
                title={recordingOpen ? 'Ocultar gravacao robusta' : 'Gravacao robusta'}
                aria-label={recordingOpen ? 'Ocultar gravacao robusta' : 'Gravacao robusta'}
                onClick={() => setRecordingOpen((current) => !current)}
              >
                <Mic size={18} />
              </button>
              <button
                type="button"
                className={`notes-icon-button ${templatesOpen ? 'active' : ''}`}
                title={templatesOpen ? 'Ocultar templates' : 'Templates'}
                aria-label={templatesOpen ? 'Ocultar templates' : 'Templates'}
                onClick={() => setTemplatesOpen((current) => !current)}
              >
                <Layers3 size={18} />
              </button>
              <button
                type="button"
                className="notes-icon-button"
                title="Salvar template"
                aria-label="Salvar template"
                onClick={openCreateTemplateModal}
              >
                <Sparkles size={18} />
              </button>
              <button
                type="button"
                className={`notes-icon-button ${historyOpen ? 'active' : ''}`}
                title={historyOpen ? 'Ocultar historico' : 'Historico'}
                aria-label={historyOpen ? 'Ocultar historico' : 'Historico'}
                onClick={() => setHistoryOpen((current) => !current)}
              >
                <History size={18} />
              </button>
              <button
                type="button"
                className={`notes-icon-button ${writerMetaOpen ? 'active' : ''}`}
                title={writerMetaOpen ? 'Ocultar detalhes' : 'Detalhes'}
                aria-label={writerMetaOpen ? 'Ocultar detalhes' : 'Detalhes'}
                onClick={() => setWriterMetaOpen((current) => !current)}
              >
                {writerMetaOpen ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <button
                type="button"
                className="notes-icon-button"
                title="Criar checkpoint"
                aria-label="Criar checkpoint"
                onClick={() => void createManualCheckpoint()}
                disabled={busy || !selectedNoteId}
              >
                <Flag size={18} />
              </button>
              <button
                type="button"
                className="notes-icon-button success"
                title="Salvar nota"
                aria-label="Salvar nota"
                onClick={() => void saveNoteChanges({ source: 'manual' })}
                disabled={busy || !selectedNoteId}
              >
                <Save size={18} />
              </button>
              {selectedNote && (
                <button
                  type="button"
                  className="notes-icon-button danger"
                  title="Excluir nota"
                  aria-label="Excluir nota"
                  onClick={() => void deleteNote(selectedNote.id)}
                  disabled={busy}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="notes-writer-status-pills">
              <span className="status-tag">{noteTypeLabel(type)}</span>
              {pinned && <span className="status-tag feito">fixada</span>}
              <span className="status-tag">autosave</span>
              {autoSaveStatus === 'error' && <span className="status-tag atrasado">erro ao salvar</span>}
            </div>
          </header>

          {error && <p className="surface-error">{error}</p>}
          {renderTemplatesPanel({ writer: true })}

          {!selectedNote ? (
            <PremiumCard title="Sem nota selecionada" className="notes-writer-empty">
            <EmptyState
              title="Crie uma nota para começar"
              description="A escrita focada abre uma tela exclusiva para você pensar e produzir com zero distração."
              actionLabel="Criar nova nota"
              onAction={() => void createNote({ focusWriter: true })}
            />
            </PremiumCard>
          ) : (
            <section className="notes-writer-shell">
            <form className="notes-writer-form" onSubmit={saveNote}>
              <div className="notes-writer-meta-line">
                <span>Atualização: {formatDateTimeLabel(lastSavedAt ?? selectedNote.updatedAt)}</span>
                <span>
                  {contentPlain.trim().split(/\s+/).filter(Boolean).length} palavra(s) • {contentPlain.length} caractere(s)
                </span>
              </div>

              {recordingOpen && (
                <section className="notes-recording-panel">
                  <header>
                    <strong>Gravação robusta</strong>
                    <div className="inline-actions">
                      <span className="status-tag">{formatDuration(recordingSeconds)}</span>
                      <span className="status-tag">
                        {recordingStatus === 'recording'
                          ? 'gravando'
                          : recordingStatus === 'paused'
                            ? 'pausado'
                            : recordingStatus === 'processing'
                              ? 'processando'
                              : recordingStatus === 'ready'
                                ? 'pronto'
                                : 'inativo'}
                      </span>
                      <span className="status-tag">
                        IA:{' '}
                        {transcriptionCapabilities?.enabled
                          ? transcriptionCapabilities.provider
                          : 'não configurada'}
                      </span>
                    </div>
                  </header>

                  {!recordingSupported ? (
                    <p className="surface-warning">
                      Navegador sem suporte a `MediaRecorder`. Use um navegador compativel.
                    </p>
                  ) : (
                    <div className="notes-recording-actions">
                      {(recordingStatus === 'idle' || recordingStatus === 'ready') && (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => void startRobustRecording()}
                          disabled={busy}
                        >
                          {recordingStatus === 'ready' ? 'Regravar' : 'Iniciar gravação'}
                        </button>
                      )}

                      {recordingStatus === 'recording' && (
                        <>
                          <button type="button" className="ghost-button" onClick={pauseRobustRecording}>
                            Pausar
                          </button>
                          <button type="button" onClick={stopRobustRecording}>
                            Parar
                          </button>
                        </>
                      )}

                      {recordingStatus === 'paused' && (
                        <>
                          <button type="button" className="ghost-button" onClick={resumeRobustRecording}>
                            Retomar
                          </button>
                          <button type="button" onClick={stopRobustRecording}>
                            Finalizar gravação
                          </button>
                        </>
                      )}

                      {recordingStatus === 'ready' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void transcribeRobustRecording('note')}
                            disabled={busy || !recordingBlob}
                          >
                            Encaminhar para IA
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={discardRobustRecording}
                            disabled={busy}
                          >
                            Descartar áudio
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {recordingUrl && (
                    <audio className="notes-recording-audio" controls src={recordingUrl}>
                      Seu navegador não suporta áudio embutido.
                    </audio>
                  )}

                  {recordingBlob && (
                    <small>
                      Arquivo pronto: {(recordingBlob.size / 1024).toFixed(1)} KB •{' '}
                      {recordingBlob.type || recordingMimeType}
                    </small>
                  )}

                  {transcriptionCapabilities?.enabled === false && (
                    <p className="surface-warning">
                      Configure `NOTES_TRANSCRIBE_WEBHOOK_URL` no backend para habilitar transcrição robusta.
                    </p>
                  )}

                  {recordingError && <p className="surface-error">{recordingError}</p>}
                </section>
              )}

              <input
                className="notes-writer-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Título da nota"
                required
              />

              <div className="notes-writer-formatbar" role="toolbar" aria-label="Formatacao de texto">
                <div className="notes-writer-format-group">
                  <button
                    type="button"
                    className={`notes-icon-button ${writerFormatState.heading === 1 ? 'active' : ''}`}
                    title="Heading 1"
                    aria-label="Heading 1"
                    onClick={() => applyHeading(1)}
                  >
                    <Heading1 size={16} />
                  </button>
                  <button
                    type="button"
                    className={`notes-icon-button ${writerFormatState.heading === 2 ? 'active' : ''}`}
                    title="Heading 2"
                    aria-label="Heading 2"
                    onClick={() => applyHeading(2)}
                  >
                    <Heading2 size={16} />
                  </button>
                  <button
                    type="button"
                    className={`notes-icon-button ${writerFormatState.heading === 3 ? 'active' : ''}`}
                    title="Heading 3"
                    aria-label="Heading 3"
                    onClick={() => applyHeading(3)}
                  >
                    <Heading3 size={16} />
                  </button>
                  <button
                    type="button"
                    className="notes-icon-button"
                    title="Parágrafo normal"
                    aria-label="Parágrafo normal"
                    onClick={applyParagraphReset}
                  >
                    <Pilcrow size={16} />
                  </button>
                  <button
                    type="button"
                    className={`notes-icon-button ${writerFormatState.bold ? 'active' : ''}`}
                    title="Negrito"
                    aria-label="Negrito"
                    onClick={applyBold}
                  >
                    <Bold size={16} />
                  </button>
                  <button
                    type="button"
                    className={`notes-icon-button ${writerFormatState.italic ? 'active' : ''}`}
                    title="Itálico"
                    aria-label="Itálico"
                    onClick={applyItalic}
                  >
                    <Italic size={16} />
                  </button>
                  <button
                    type="button"
                    className={`notes-icon-button ${writerFormatState.strike ? 'active' : ''}`}
                    title="Tachado"
                    aria-label="Tachado"
                    onClick={applyStrikeThrough}
                  >
                    <Strikethrough size={16} />
                  </button>
                </div>

                <div className="notes-writer-color-palette" aria-label="Cores básicas">
                  {WRITER_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      className={`notes-color-chip ${
                        normalizeCssColor(color.value) === writerFormatState.color ? 'active' : ''
                      }`}
                      title={`Cor ${color.label}`}
                      aria-label={`Cor ${color.label}`}
                      onClick={() => applyTextColor(color.value)}
                    >
                      <span style={{ backgroundColor: color.value }} />
                    </button>
                  ))}
                </div>

                <div className="notes-writer-format-actions">
                  <button type="button" className="ghost-button" onClick={copyNoteContent} title="Copiar nota completa">
                    Copiar
                  </button>
                  <button type="button" className="ghost-button" onClick={exportNoteAsTxt} title="Exportar TXT">
                    TXT
                  </button>
                  <button type="button" className="ghost-button" onClick={exportNoteAsPdf} title="Exportar PDF">
                    PDF
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={exportNoteToWhatsApp}
                    title="Copiar formato WhatsApp"
                  >
                    WhatsApp
                  </button>
                  {clipboardFeedback !== 'idle' && (
                    <span className="notes-copy-feedback" role="status" aria-live="polite">
                      {clipboardFeedback === 'copy' ? 'Copiado' : 'WhatsApp copiado'}
                    </span>
                  )}
                </div>

              </div>

              <div className="notes-writer-quickblocks">
                <button type="button" className="ghost-button" onClick={() => insertSnippetAtCursor('- [ ] ')}>
                  + Checklist
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={openTableBuilder}
                >
                  + Tabela
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    insertSnippetAtCursor(
                      '## Decisão\n- O que foi decidido:\n- Motivo:\n- Próximo passo:\n'
                    )
                  }
                >
                  + Decisão
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    insertSnippetAtCursor('## Retro rápida\n- Funcionou:\n- Não funcionou:\n- Ajuste:\n')
                  }
                >
                  + Retro
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => insertSnippetAtCursor(`${new Date().toLocaleDateString('pt-BR')}\n`)}
                >
                  + Data
                </button>
              </div>

              <div className="notes-writer-editor-wrap">
                <div
                  ref={writerRichEditorRef}
                  className="notes-writer-editor"
                  contentEditable
                  role="textbox"
                  aria-multiline="true"
                  suppressContentEditableWarning
                  onKeyDown={handleWriterEditorKeyDown}
                  onInput={(event) => {
                    const editor = event.currentTarget;
                    if (ENABLE_AUTO_ACCENT) {
                      autoAccentInRichEditor(editor);
                    }
                    setContent(editor.innerHTML);
                    syncWriterFormatState();
                  }}
                  onMouseUp={syncWriterFormatState}
                  onKeyUp={syncWriterFormatState}
                  data-placeholder="Escreva livremente. Este espaço é seu segundo cérebro."
                />

                {slashMenuOpen && (
                  <section
                    className="notes-slash-menu notes-slash-menu-floating"
                    aria-label="Comandos rápidos"
                    style={
                      slashMenuPosition
                        ? { top: `${slashMenuPosition.top}px`, left: `${slashMenuPosition.left}px` }
                        : undefined
                    }
                  >
                    <ul>
                      {filteredSlashCommands.map((command, index) => (
                        <li key={command.id}>
                          <button
                            type="button"
                            className={index === slashIndex ? 'active' : ''}
                            onClick={() => applySlashCommand(command)}
                          >
                            <div>
                              <strong>{command.label}</strong>
                              <small>{command.description}</small>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {writerMetaOpen && (
                <section className="notes-writer-meta">
                  <div className="row-2">
                    <label>
                      Tipo
                      <select value={type} onChange={(event) => setType(event.target.value as NoteType)}>
                        <option value="geral">Geral</option>
                        <option value="inbox">Inbox</option>
                        <option value="pessoas">Pessoas</option>
                        <option value="conteudo">Conteúdo</option>
                        <option value="produto">Produto</option>
                        <option value="referencia">Referência</option>
                        <option value="conclusao_tarefa">Conclusão de tarefa</option>
                      </select>
                    </label>
                    <label>
                      Tags
                      <input
                        value={tagsRaw}
                        onChange={(event) => setTagsRaw(event.target.value)}
                        placeholder="ceo, estrategia, follow-up"
                      />
                    </label>
                  </div>

                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(event) => setPinned(event.target.checked)}
                    />
                    Fixar nota
                  </label>

                  <div className="notes-context-grid">
                    <label>
                      Pasta
                      <select value={noteFolderId} onChange={(event) => setNoteFolderId(event.target.value)}>
                        <option value="">Sem pasta</option>
                        {folderOptions.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Frente (opcional)
                      <select
                        value={linkWorkspaceId}
                        onChange={(event) => {
                          setLinkWorkspaceId(event.target.value);
                          setLinkProjectId('');
                          setLinkTaskId('');
                        }}
                      >
                        <option value="">Sem vínculo</option>
                        {visibleWorkspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Projeto (opcional)
                      <select
                        value={linkProjectId}
                        onChange={(event) => {
                          setLinkProjectId(event.target.value);
                          setLinkTaskId('');
                        }}
                      >
                        <option value="">Sem vínculo</option>
                        {scopedProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Tarefa (opcional)
                      <select value={linkTaskId} onChange={(event) => setLinkTaskId(event.target.value)}>
                        <option value="">Sem vínculo</option>
                        {scopedTasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="inline-actions">
                    <button type="button" className="ghost-button" onClick={insertPeopleTemplate}>
                      Inserir template pessoas
                    </button>
                  </div>

                  <section className="notes-related-section">
                    <header>
                      <strong>Relacionadas no segundo cérebro</strong>
                      <small>{relatedNotes.length} nota(s) com conexão forte</small>
                    </header>
                    {relatedNotes.length === 0 ? (
                      <small className="notes-related-empty">
                        Sem conexões fortes agora. Adicione tags e vínculos de frente/projeto/tarefa para melhorar.
                      </small>
                    ) : (
                      <ul className="notes-related-list">
                        {relatedNotes.map((row) => (
                          <li key={row.note.id}>
                            <div className="notes-related-head">
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => startWriterForNote(row.note.id)}
                              >
                                {displayNoteTitle(row.note.title)}
                              </button>
                              <span className="status-tag">score {row.score}</span>
                            </div>
                            <div className="notes-related-reasons">
                              {row.reasons.slice(0, 3).map((reason) => (
                                <span
                                  key={`${row.note.id}-${reason.label}`}
                                  title={reason.hint ?? reason.label}
                                >
                                  {reason.label}
                                </span>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </section>
              )}

              {historyOpen && (
                <section className="notes-revision-panel">
                  <header>
                    <div>
                      <strong>Histórico de versões</strong>
                      <small>
                        {revisions.length} versão(ões) • restauração com backup automático
                      </small>
                    </div>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          if (!selectedNoteId) {
                            return;
                          }
                          void loadRevisions(selectedNoteId);
                        }}
                        disabled={historyBusy}
                      >
                        Atualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => void createManualCheckpoint()}
                        disabled={busy || !selectedNoteId}
                      >
                        Criar checkpoint
                      </button>
                    </div>
                  </header>

                  {historyBusy ? (
                    <small className="notes-related-empty">Carregando histórico...</small>
                  ) : revisions.length === 0 ? (
                    <small className="notes-related-empty">Sem versões registradas.</small>
                  ) : (
                    <ul className="notes-revision-list">
                      {revisions.map((revision, index) => (
                        <li key={revision.id}>
                          <div>
                            <strong>{noteRevisionSourceLabel(revision.source)}</strong>
                            <small>{formatDateTimeLabel(revision.createdAt)}</small>
                            <small>
                              {displayNoteTitle(revision.title)} •{' '}
                              {extractPlainText(revision.content ?? '').slice(0, 80) || 'sem conteúdo'}
                            </small>
                          </div>
                          <div className="inline-actions">
                            {index === 0 && <span className="status-tag">Atual</span>}
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => setRevisionPreviewId(revision.id)}
                            >
                              Abrir
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </form>
            </section>
          )}
        </main>
        {renderTemplateModal()}
        {renderTableBuilderModal()}
        {renderRevisionPreviewModal()}
      </>
    );
  }

  return (
    <>
      <main className="notes-app-shell">
        <header className="notes-app-topbar">
        <div className="notes-app-brand">
          <button type="button" className="ghost-button" onClick={backToOperes}>
            Voltar ao Operis
          </button>
          <div>
            <strong>Notas</strong>
            <small>Segundo cérebro independente</small>
          </div>
        </div>
        <div className="inline-actions">
          <button
            type="button"
            className={templatesOpen ? 'ghost-button task-filter active' : 'ghost-button'}
            onClick={() => setTemplatesOpen((current) => !current)}
            disabled={busy}
          >
            {templatesOpen ? 'Ocultar templates' : 'Templates'}
          </button>
          <button type="button" className="ghost-button" onClick={() => openCreateFolderModal(null)} disabled={busy}>
            Nova pasta
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => openCreateFolderModal(activeFolder?.id ?? null)}
            disabled={busy || !activeFolder}
          >
            Nova subpasta
          </button>
          <button type="button" onClick={() => void createNote({ focusWriter: true })} disabled={busy}>
            Nova nota
          </button>
        </div>
      </header>

        {error && <p className="surface-error">{error}</p>}
        {renderTemplatesPanel()}

        <section className="notes-app-body">
        <aside className="notes-app-sidebar">
          <div className="notes-sidebar-head">
            <h3>Pastas</h3>
            <span>{folders.length} estrutura(s)</span>
          </div>

          <ul className="notes-folder-tree">
            <li>
              <button
                type="button"
                className={folderScope === 'all' ? 'active' : ''}
                onClick={() => setFolderScope('all')}
              >
                <span>Biblioteca</span>
                <strong>{folderCounts.all}</strong>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`${folderScope === 'unfiled' ? 'active' : ''} ${
                  folderDropTarget === 'unfiled' && draggingNoteId ? 'drop-target' : ''
                }`}
                onClick={() => setFolderScope('unfiled')}
                onDragOver={(event) => {
                  if (!draggingNoteId) {
                    return;
                  }
                  event.preventDefault();
                  setFolderDropTarget('unfiled');
                }}
                onDragLeave={() => {
                  setFolderDropTarget((current) => (current === 'unfiled' ? null : current));
                }}
                onDrop={(event) => void handleFolderDrop(event, null)}
              >
                <span>Sem pasta</span>
                <strong>{folderCounts.unfiled}</strong>
              </button>
            </li>
            {rootFolders.map((folder) => renderFolderNode(folder, 0, new Set()))}
          </ul>

          <div className="notes-sidebar-actions">
            <button type="button" className="ghost-button" onClick={openRenameFolderModal} disabled={!activeFolder || busy}>
              Renomear pasta
            </button>
            <button type="button" className="danger-button" onClick={deleteActiveFolder} disabled={!activeFolder || busy}>
              Excluir pasta
            </button>
          </div>
        </aside>

        <section className="notes-app-list">
          <div className="notes-list-headline">
            <div>
              <h3>{activeScopeLabel}</h3>
              <small>
                {sortedScopedNotes.length} nota(s) • coleção {activeCollectionLabel}
              </small>
            </div>
            <button type="button" className="ghost-button" onClick={() => void createNote({ focusWriter: true })}>
              + Nota
            </button>
          </div>

          <input
            ref={noteSearchInputRef}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por título, texto ou tag"
          />

          <div className="notes-smart-collections">
            {[
              { id: 'all', label: 'Todas', count: smartCollectionCounts.all },
              { id: 'pinned', label: 'Fixadas', count: smartCollectionCounts.pinned },
              { id: 'recent', label: 'Recentes', count: smartCollectionCounts.recent },
              { id: 'linked', label: 'Ligadas', count: smartCollectionCounts.linked },
              { id: 'inbox', label: 'Inbox', count: smartCollectionCounts.inbox },
              { id: 'longform', label: 'Longas', count: smartCollectionCounts.longform }
            ].map((collection) => (
              <button
                key={collection.id}
                type="button"
                className={`notes-smart-chip ${smartCollection === collection.id ? 'active' : ''}`}
                onClick={() => setSmartCollection(collection.id as SmartCollectionId)}
              >
                <span>{collection.label}</span>
                <strong>{collection.count}</strong>
              </button>
            ))}
          </div>

          <div className="notes-list-toolbar">
            <div className="notes-list-toolbar-hints">
              <span className="notes-list-toolbar-kicker">Atalhos</span>
              <small>/ buscar</small>
              <small>J/K navegar</small>
              <small>Enter abrir</small>
              <small>N nova nota</small>
            </div>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as NoteSortMode)}>
              <option value="updated_desc">Mais recentes</option>
              <option value="updated_asc">Mais antigas</option>
              <option value="title_asc">Título (A-Z)</option>
              <option value="title_desc">Título (Z-A)</option>
            </select>
          </div>

          {sortedScopedNotes.length === 0 ? (
            <EmptyState
              title="Sem notas aqui"
              description="Crie uma nota neste espaço ou selecione outra pasta."
              actionLabel="Nova nota"
              onAction={() => void createNote({ focusWriter: true })}
            />
          ) : (
            <ul className="notes-list" ref={notesListRef}>
              {sortedScopedNotes.map((note) => {
                const checklist = getChecklistProgress(note.content);
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      data-note-id={note.id}
                      aria-selected={selectedNoteId === note.id}
                      className={`${selectedNoteId === note.id ? 'active' : ''} ${
                        draggingNoteId === note.id ? 'dragging' : ''
                      }`}
                      onClick={() => setSelectedNoteId(note.id)}
                      draggable
                      onDragStart={(event) => handleNoteDragStart(event, note.id)}
                      onDragEnd={handleNoteDragEnd}
                    >
                      <div>
                        <strong>{displayNoteTitle(note.title)}</strong>
                        <small>{noteExcerpt(note)}</small>
                        <small className="notes-list-date">{resolveFolderPath(note.folderId)}</small>
                        <small className="notes-list-date">Atualizada em {formatDateLabel(note.updatedAt)}</small>
                        {checklist.total > 0 && (
                          <small className="notes-list-date">
                            Checklist: {checklist.done}/{checklist.total} ({checklist.percent}%)
                          </small>
                        )}
                      </div>
                      <div className="notes-row-meta">
                        <span className="status-tag">{noteTypeLabel(note.type)}</span>
                        {note.pinned && <span className="status-tag feito">fixada</span>}
                        {note.tags.length > 0 && <small className="notes-row-tag">#{note.tags[0]}</small>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="notes-app-preview">
          {!selectedNote ? (
            <PremiumCard title="Preview" subtitle="Selecione uma nota para abrir contexto">
              <EmptyState
                title="Nenhuma nota selecionada"
                description="Abra uma nota da lista para visualizar detalhes ou entrar no modo escrita."
              />
            </PremiumCard>
          ) : (
            <PremiumCard
              title={displayNoteTitle(selectedNote.title)}
              subtitle={`Atualizada em ${formatDateTimeLabel(selectedNote.updatedAt)}`}
              actions={
                <div className="inline-actions">
                  <button type="button" className="ghost-button" onClick={() => startWriterForNote(selectedNote.id)}>
                    Abrir modo escrita
                  </button>
                  <button type="button" className="danger-button" onClick={() => void deleteNote(selectedNote.id)}>
                    Excluir
                  </button>
                </div>
              }
            >
              <article className="notes-preview-article">
                <header className="notes-preview-header-meta">
                  <span className="status-tag">{noteTypeLabel(selectedNote.type)}</span>
                  {selectedNote.tags.length > 0 && (
                    <div className="notes-preview-tags">
                      {selectedNote.tags.slice(0, 10).map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                  )}
                </header>

                <div className="notes-preview-meta-grid">
                  <small>
                    <strong>Pasta:</strong> {resolveFolderPath(selectedNote.folderId)}
                  </small>
                  <small>
                    <strong>Frente:</strong> {selectedNote.workspace?.name ?? 'sem vínculo'}
                  </small>
                  <small>
                    <strong>Projeto:</strong> {selectedNote.project?.title ?? 'sem vínculo'}
                  </small>
                  <small>
                    <strong>Tarefa:</strong> {selectedNote.task?.title ?? 'sem vínculo'}
                  </small>
                </div>

                <div
                  className="notes-preview-content"
                  dangerouslySetInnerHTML={{
                    __html:
                      selectedNote.content?.trim()
                        ? normalizeEditorContent(selectedNote.content)
                        : '<p>Sem conteúdo.</p>'
                  }}
                />

                <section className="notes-related-section">
                  <header>
                    <strong>Notas relacionadas</strong>
                    <small>{relatedNotes.length} sugestão(ões) com conexão forte</small>
                  </header>
                  {relatedNotes.length === 0 ? (
                    <small className="notes-related-empty">
                      Sem correlações relevantes por enquanto.
                    </small>
                  ) : (
                    <ul className="notes-related-list">
                      {relatedNotes.map((row) => (
                        <li key={row.note.id}>
                          <div className="notes-related-head">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => setSelectedNoteId(row.note.id)}
                            >
                              {displayNoteTitle(row.note.title)}
                            </button>
                            <span className="status-tag">score {row.score}</span>
                          </div>
                          <div className="notes-related-reasons">
                            {row.reasons.slice(0, 3).map((reason) => (
                              <span
                                key={`${row.note.id}-${reason.label}`}
                                title={reason.hint ?? reason.label}
                              >
                                {reason.label}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </article>
            </PremiumCard>
          )}
        </section>
        </section>

        {folderModalOpen && (
          <div className="notes-folder-modal-backdrop" role="presentation" onClick={closeFolderModal}>
          <div className="notes-folder-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="notes-folder-modal-head">
              <h3>{folderModalTitle}</h3>
              <button type="button" className="ghost-button" onClick={closeFolderModal} disabled={folderModalBusy}>
                Fechar
              </button>
            </header>

            <form className="notes-folder-modal-form" onSubmit={(event) => void submitFolderModal(event)}>
              <label>
                Nome da pasta
                <input
                  value={folderNameDraft}
                  onChange={(event) => setFolderNameDraft(event.target.value)}
                  placeholder="Ex: Planejamento Q2"
                  autoFocus
                  required
                />
              </label>

              <div className="notes-folder-modal-row">
                <label>
                  Cor
                  <input
                    type="color"
                    value={folderColorDraft || DEFAULT_FOLDER_COLOR}
                    onChange={(event) => setFolderColorDraft(event.target.value)}
                  />
                </label>

                <label>
                  Pasta pai
                  <select value={folderParentDraft} onChange={(event) => setFolderParentDraft(event.target.value)}>
                    <option value="">Raiz</option>
                    {folderParentOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <footer className="notes-folder-modal-actions">
                <button type="button" className="ghost-button" onClick={closeFolderModal} disabled={folderModalBusy}>
                  Cancelar
                </button>
                <button type="submit" disabled={folderModalBusy}>
                  {folderModalMode === 'create' ? 'Criar pasta' : 'Salvar alterações'}
                </button>
              </footer>
            </form>
          </div>
          </div>
        )}
      </main>
      {renderTemplateModal()}
    </>
  );
}
