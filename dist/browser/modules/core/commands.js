document.currentScript.__ezygridRegister("core/commands", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistry = void 0;
exports.createDefaultCommands = createDefaultCommands;
/**
 * Command registry (§34.4): toolbars, menus and keyboard bindings all
 * consume the same command definitions.
 */
class CommandRegistry {
    commands = new Map();
    register(command) {
        this.commands.set(command.id, command);
    }
    get(id) {
        return this.commands.get(id);
    }
    all() {
        return [...this.commands.values()];
    }
    execute(id, ctx) {
        const command = this.commands.get(id);
        if (!command)
            return false;
        if (command.isEnabled && !command.isEnabled(ctx))
            return false;
        command.execute(ctx);
        return true;
    }
    /** Match a keyboard event against registered shortcuts ("Mod+C" style). */
    matchShortcut(event) {
        const mod = event.ctrlKey || event.metaKey;
        for (const command of this.commands.values()) {
            if (!command.shortcut)
                continue;
            const parts = command.shortcut.split('+').map((p) => p.trim());
            const needsMod = parts.some((p) => p.toLowerCase() === 'mod');
            const needsShift = parts.some((p) => p.toLowerCase() === 'shift');
            const key = parts[parts.length - 1];
            if (needsMod !== mod)
                continue;
            if (needsShift !== event.shiftKey)
                continue;
            if (key.toLowerCase() === event.key.toLowerCase())
                return command;
        }
        return undefined;
    }
}
exports.CommandRegistry = CommandRegistry;
/** Phase 2 default command set; extensions may register more. */
function createDefaultCommands(hooks) {
    return [
        { id: 'edit.undo', title: 'Undo', shortcut: 'Mod+Z', execute: (ctx) => ctx.workbook.undo() },
        { id: 'edit.redo', title: 'Redo', shortcut: 'Mod+Y', execute: (ctx) => ctx.workbook.redo() },
        { id: 'clipboard.copy', title: 'Copy', shortcut: 'Mod+C', execute: hooks.copy },
        { id: 'clipboard.cut', title: 'Cut', shortcut: 'Mod+X', execute: hooks.cut },
        { id: 'clipboard.paste', title: 'Paste', shortcut: 'Mod+V', execute: hooks.paste },
        { id: 'cells.fillDown', title: 'Fill down', shortcut: 'Mod+D', execute: hooks.fillDown },
    ];
}

});
