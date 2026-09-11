import type { Workbook, Worksheet } from './workbook.js';
import type { CommandRegistry } from './commands.js';
import type { GridRenderer } from './renderer.js';

/** Context handed to plugins (§44.3): public surfaces only, no internals. */
export interface PluginContext {
  workbook: Workbook;
  worksheet: Worksheet;
  /** Renderer command registry (available once a renderer attaches). */
  commands?: CommandRegistry;
  /** The renderer that triggered setup, when run from the grid. */
  renderer?: GridRenderer;
}

export interface EzygridPlugin {
  name: string;
  version: string;
  setup(ctx: PluginContext): void | (() => void);
}

/** Identity helper giving plugin authors a typed authoring surface (§44). */
export function definePlugin(plugin: EzygridPlugin): EzygridPlugin {
  return plugin;
}

export class PluginManager {
  private disposers: (() => void)[] = [];
  private plugins: EzygridPlugin[];

  constructor(plugins: EzygridPlugin[] = []) {
    this.plugins = plugins;
  }

  get names(): string[] {
    return this.plugins.map((p) => p.name);
  }

  /** Run all plugin setups; errors are surfaced with the plugin name. */
  run(context: PluginContext): void {
    for (const plugin of this.plugins) {
      try {
        const disposer = plugin.setup(context);
        if (typeof disposer === 'function') this.disposers.push(disposer);
      } catch (error) {
        throw new Error(`plugin "${plugin.name}" failed during setup: ${(error as Error).message}`);
      }
    }
  }

  destroy(): void {
    for (const disposer of this.disposers.reverse()) {
      try {
        disposer();
      } catch {
        // plugin disposal errors are non-fatal
      }
    }
    this.disposers.length = 0;
  }
}
