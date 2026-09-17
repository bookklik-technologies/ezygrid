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
  private plugins: EzygridPlugin[];

  constructor(plugins: EzygridPlugin[] = []) {
    this.plugins = plugins;
  }

  get names(): string[] {
    return this.plugins.map((p) => p.name);
  }

  /**
   * Run all plugin setups and return a disposer owning THIS attachment.
   * Renderer replacement on the same workbook no longer accumulates
   * disposers: each attachment disposes exactly what it created (F17).
   * If a plugin fails mid-run, already-set-up plugins are disposed first.
   */
  run(context: PluginContext): () => void {
    const disposers: (() => void)[] = [];
    for (const plugin of this.plugins) {
      try {
        const disposer = plugin.setup(context);
        if (typeof disposer === 'function') disposers.push(disposer);
      } catch (error) {
        for (const disposer of disposers.reverse()) {
          try {
            disposer();
          } catch {
            // plugin disposal errors are non-fatal
          }
        }
        throw new Error(`plugin "${plugin.name}" failed during setup: ${(error as Error).message}`);
      }
    }
    return () => {
      for (const disposer of disposers.reverse()) {
        try {
          disposer();
        } catch {
          // plugin disposal errors are non-fatal
        }
      }
      disposers.length = 0;
    };
  }

  /** Dispose every live attachment (workbook-lifetime teardown, F17). */
  private attachments: (() => void)[] = [];

  /**
   * Register an attachment so workbook teardown can dispose all of them.
   * Returns the attachment's own disposer.
   */
  attach(context: PluginContext): () => void {
    const disposer = this.run(context);
    this.attachments.push(disposer);
    return () => {
      disposer();
      const index = this.attachments.indexOf(disposer);
      if (index >= 0) this.attachments.splice(index, 1);
    };
  }

  destroy(): void {
    for (const disposer of this.attachments.reverse()) {
      try {
        disposer();
      } catch {
        // plugin disposal errors are non-fatal
      }
    }
    this.attachments.length = 0;
  }
}
