export type OperisTaskStatus = 'open' | 'done';

export type OperisBlockType =
  | 'operisDecision'
  | 'operisNextStep'
  | 'operisRisk'
  | 'operisInsight'
  | 'operisMeeting'
  | 'operisExecutiveChecklist'
  | 'operisLinkedTask'
  | 'operisArtifact';

export type OperisBlock = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: OperisBlock[];
};

export type SerializedNoteBlocks = {
  text: string;
  html: string;
  markdown: string;
  whatsapp: string;
};

export type OperisBlockEditorValue = SerializedNoteBlocks & {
  blocks: OperisBlock[];
};
