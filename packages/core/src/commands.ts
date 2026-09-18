import type { Workbook, Worksheet } from './workbook.js';
import type { SelectionService } from './selection.js';

export interface CommandContext {
  workbook: Workbook;
  worksheet: Worksheet;
  selection: SelectionService;
}

export interface Command {
  id: string;
  title: string;
  shortcut?: string;
  isEnabled?(ctx: CommandContext): boolean;
  isSelected?(ctx: CommandContext): boolean;
  execute(ctx: CommandContext): void;
}

/**
 * Command registry (§34.4): toolbars, menus and keyboard bindings all
 * consume the same command definitions.
 */
export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  all(): Command[] {
    return [...this.commands.values()];
  }

  execute(id: string, ctx: CommandContext): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    if (command.isEnabled && !command.isEnabled(ctx)) return false;
    command.execute(ctx);
    return true;
  }

  /** Match a keyboard event against registered shortcuts ("Mod+C" style). */
  matchShortcut(event: KeyboardEvent): Command | undefined {
    const mod = event.ctrlKey || event.metaKey;
    for (const command of this.commands.values()) {
      if (!command.shortcut) continue;
      const parts = command.shortcut.split('+').map((p) => p.trim());
      const needsMod = parts.some((p) => p.toLowerCase() === 'mod');
      const needsShift = parts.some((p) => p.toLowerCase() === 'shift');
      const key = parts[parts.length - 1]!;
      if (needsMod !== mod) continue;
      if (needsShift !== event.shiftKey) continue;
      if (key.toLowerCase() === event.key.toLowerCase()) return command;
    }
    return undefined;
  }
}

/** Phase 2 default command set; extensions may register more. */
export function createDefaultCommands(
  hooks: {
    copy: (ctx: CommandContext) => void;
    cut: (ctx: CommandContext) => void;
    paste: (ctx: CommandContext) => void;
    fillDown: (ctx: CommandContext) => void;
  },
): Command[] {
  return [
    { id: 'edit.undo', title: 'Undo', shortcut: 'Mod+Z', execute: (ctx) => ctx.workbook.undo() },
    { id: 'edit.redo', title: 'Redo', shortcut: 'Mod+Y', execute: (ctx) => ctx.workbook.redo() },
    { id: 'clipboard.copy', title: 'Copy', shortcut: 'Mod+C', execute: hooks.copy },
    { id: 'clipboard.cut', title: 'Cut', shortcut: 'Mod+X', execute: hooks.cut },
    { id: 'clipboard.paste', title: 'Paste', shortcut: 'Mod+V', execute: hooks.paste },
    { id: 'cells.fillDown', title: 'Fill down', shortcut: 'Mod+D', execute: hooks.fillDown },
  ];
}
