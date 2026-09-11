import type { Worksheet } from './workbook.js';

/**
 * Edit lifecycle (§13.1): idle → activate → beginEdit → validate → commit | cancel.
 * Phase 1 implements the text/number editor contract; overlay rendering arrives
 * with the DOM viewport, but the state machine and events are final now.
 */
export type EditMode = 'idle' | 'editing';

export interface EditSession {
  row: number;
  column: number;
  initial: string;
  mode: 'replace' | 'edit';
}

export interface EditEvents {
  onEditStart?: (session: EditSession) => void;
  onEditCancel?: (session: EditSession) => void;
  onCommit?: (session: EditSession, value: string) => void;
}

export class EditService {
  private mode: EditMode = 'idle';
  private events: EditEvents;

  constructor(events: EditEvents = {}) {
    this.events = events;
  }

  get editing(): boolean {
    return this.mode === 'editing';
  }

  get session(): EditSession | null {
    return this.session_ ?? null;
  }

  private session_: EditSession | null = null;

  beginEdit(sheet: Worksheet, row: number, column: number, initial?: string): EditSession {
    const raw = sheet.cells.getCell(row, column);
    const initialText =
      initial !== undefined
        ? initial
        : raw?.formula !== undefined
          ? raw.formula
          : raw?.raw === null || raw?.raw === undefined
            ? ''
            : String(raw.raw);
    this.session_ = { row, column, initial: initialText, mode: initial === undefined ? 'replace' : 'edit' };
    this.mode = 'editing';
    this.events.onEditStart?.(this.session_);
    return this.session_;
  }

  /** Commit the pending text; returns true when a value was written. */
  commit(sheet: Worksheet, text?: string): boolean {
    if (!this.session_) return false;
    const { row, column } = this.session_;
    const value = text ?? this.session_.initial;
    this.events.onCommit?.(this.session_, value);
    if (value !== '') {
      const parsed = value.startsWith('=') ? value : parseEditorValue(value);
      sheet.setValue(row, column, parsed);
    } else {
      sheet.setValue(row, column, null);
    }
    this.end();
    return true;
  }

  cancel(): boolean {
    if (!this.session_) return false;
    this.events.onEditCancel?.(this.session_);
    this.end();
    return true;
  }

  private end(): void {
    this.session_ = null;
    this.mode = 'idle';
  }
}

/** Typed-value parsing used when committing editor text into the model. */
export function parseEditorValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^(true|TRUE|True)$/.test(trimmed)) return true;
  if (/^(false|FALSE|False)$/.test(trimmed)) return false;
  return text;
}

