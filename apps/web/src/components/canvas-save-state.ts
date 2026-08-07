export type CanvasSaveStateProps<TData extends object> = {
  onSave: (data: TData) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
  registerFlush?: (flush: () => Promise<void>) => void;
  readOnly?: boolean;
};
