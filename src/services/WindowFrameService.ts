import { TFile } from 'obsidian';
import { PropertyOverFileNamePlugin, WorkspaceExt } from '../types';
import { getFrontmatter } from '../utils/frontmatter';

/**
 * Window Frame Service
 *
 * Writes the active file's `title` (or configured) property to the OS window
 * title bar. We do NOT rely on overriding `workspace.updateTitle` — that's an
 * undocumented internal that has come and gone across Obsidian versions, and
 * when it isn't there our writes never ran. Instead we listen to the events
 * that Obsidian's own title logic fires off, compute our title, and write it
 * directly to `workspace.rootSplit.doc.title`. A short deferred re-write
 * guards against Obsidian's internal handler running synchronously *after*
 * ours and overwriting back to the filename.
 */
export class WindowFrameService {
  private plugin: PropertyOverFileNamePlugin;
  private enabled: boolean = false;
  private eventsRegistered: boolean = false;

  /**
   * Last property-based title we resolved, keyed by file path. Used so a
   * transient `getFileCache` miss can't downgrade a correct title back to
   * the filename.
   */
  private lastKnownTitles: Map<string, string> = new Map();

  /** Pending deferred re-write timer (debounced). */
  private deferredTimer: number | null = null;

  /**
   * Legacy override of `workspace.updateTitle`. We keep this for older
   * Obsidian versions that do still call into it (defense in depth) but the
   * event-driven path is what makes the feature actually work.
   */
  private originalUpdateTitle: (() => void) | null = null;

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Returns the Document for the main Obsidian window. Obsidian exposes
   * `workspace.rootSplit.doc` for exactly this purpose — using bare
   * `document` would be flagged by the popout-window lint, and
   * `activeDocument` would follow whatever popout has focus.
   */
  private getMainDocument(): Document {
    return this.plugin.app.workspace.rootSplit.doc;
  }

  /**
   * Resolve the title text for the currently active file. Returns '' if
   * there's no active file or we don't want to touch the title.
   */
  private getActiveFileTitle(): string {
    const activeFile = this.plugin.app.workspace.getActiveFile();
    if (!(activeFile instanceof TFile)) return '';

    const propertyKey = this.plugin.settings.propertyKey;

    if (activeFile.extension === 'md') {
      const fileCache = this.plugin.app.metadataCache.getFileCache(activeFile);
      const propertyValue = fileCache?.frontmatter?.[propertyKey] as string | undefined;
      if (propertyValue) {
        this.lastKnownTitles.set(activeFile.path, String(propertyValue));
        return String(propertyValue);
      }
      // Prefer a previously-resolved good value so a transient cache miss
      // doesn't reset the OS title to the slug.
      const remembered = this.lastKnownTitles.get(activeFile.path);
      if (remembered) return remembered;
      return activeFile.basename;
    }

    if (activeFile.extension === 'mdx' && this.plugin.settings.enableMdxSupport) {
      const remembered = this.lastKnownTitles.get(activeFile.path);
      if (remembered) {
        void this.refreshMdxTitle(activeFile);
        return remembered;
      }
      void this.refreshMdxTitle(activeFile);
      return activeFile.basename;
    }

    return activeFile.basename;
  }

  /** MDX needs an async file read; cache the resolved value for next time. */
  private async refreshMdxTitle(file: TFile): Promise<void> {
    try {
      const frontmatter = await getFrontmatter(this.plugin.app, file, this.plugin.settings);
      const propertyValue = frontmatter?.[this.plugin.settings.propertyKey] as string | undefined;
      if (propertyValue) {
        const prev = this.lastKnownTitles.get(file.path);
        this.lastKnownTitles.set(file.path, String(propertyValue));
        if (this.enabled && prev !== String(propertyValue)) {
          this.applyTitle();
        }
      }
    } catch {
      // Best-effort; we'll retry on the next event.
    }
  }

  /**
   * Format the resolved property text into the "Title - Vault" form Obsidian
   * itself uses, preferring the app's internal helper when it's available.
   */
  private formatTitle(title: string): string {
    const app = this.plugin.app as { getAppTitle?: (title: string) => string };
    if (typeof app.getAppTitle === 'function') {
      return app.getAppTitle(title);
    }
    const vaultName = this.plugin.app.vault.getName();
    return `${title} - ${vaultName}`;
  }

  /**
   * Write our resolved title directly to the main window's document.title,
   * then schedule a deferred re-write. Obsidian's own title code can run
   * synchronously after our event handler returns; the deferred write
   * (next tick + a small backstop) wins that race.
   */
  private applyTitle(): void {
    if (!this.enabled) return;

    const title = this.getActiveFileTitle();
    if (!title) return;

    const formatted = this.formatTitle(title);
    const mainDoc = this.getMainDocument();
    mainDoc.title = formatted;

    // Defensive re-write: if Obsidian's own internal title logic runs after
    // ours on this turn of the event loop, we overwrite it on the next.
    if (this.deferredTimer !== null) {
      window.clearTimeout(this.deferredTimer);
    }
    this.deferredTimer = window.setTimeout(() => {
      this.deferredTimer = null;
      if (!this.enabled) return;
      const latest = this.getActiveFileTitle();
      if (!latest) return;
      const latestFormatted = this.formatTitle(latest);
      const doc = this.getMainDocument();
      if (doc.title !== latestFormatted) {
        doc.title = latestFormatted;
      }
    }, 80);
  }

  /**
   * Legacy override target. Some Obsidian builds still call
   * `workspace.updateTitle()` for title refreshes; if so, we route it
   * through `applyTitle`. If the property doesn't exist on this Obsidian
   * version, this method just won't be invoked, and the event-driven path
   * is what keeps the title correct.
   */
  private updateTitle(): void {
    this.applyTitle();
  }

  /**
   * Enable the feature: install the legacy override (if available) and
   * start observing events.
   */
  enable() {
    if (this.enabled) return;
    this.enabled = true;

    const workspace = this.plugin.app.workspace as WorkspaceExt;
    if (typeof workspace.updateTitle === 'function') {
      this.originalUpdateTitle = workspace.updateTitle.bind(workspace);
      workspace.updateTitle = this.updateTitle.bind(this);
    }

    // Make sure the registered listeners are actually attached.
    this.registerEvents();
    this.applyTitle();
  }

  /** Restore Obsidian's original behavior and stop touching the title. */
  disable() {
    if (!this.enabled) return;
    this.enabled = false;

    const workspace = this.plugin.app.workspace as WorkspaceExt;
    if (this.originalUpdateTitle && typeof workspace.updateTitle === 'function') {
      workspace.updateTitle = this.originalUpdateTitle;
      try {
        workspace.updateTitle();
      } catch {
        // Restoring is best-effort.
      }
    }
    this.originalUpdateTitle = null;

    if (this.deferredTimer !== null) {
      window.clearTimeout(this.deferredTimer);
      this.deferredTimer = null;
    }
  }

  /**
   * Register the workspace / metadata-cache events that should cause the
   * window title to refresh. Idempotent — Obsidian's `registerEvent`
   * handles cleanup on unload.
   */
  registerEvents() {
    if (this.eventsRegistered) return;
    if (!this.plugin.settings.enableForWindowFrame) return;
    this.eventsRegistered = true;

    // New file opened in the workspace.
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', () => {
        if (this.enabled) this.applyTitle();
      })
    );

    // Tab/pane focus change within a window. `file-open` doesn't fire for
    // this case, but the OS title needs to follow the active leaf.
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('active-leaf-change', () => {
        if (this.enabled) this.applyTitle();
      })
    );

    // The active file's metadata changed: invalidate our per-file memo and
    // re-apply if the change is for the file currently in the title.
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', (file) => {
        if (!this.enabled) return;
        this.lastKnownTitles.delete(file.path);
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile && activeFile.path === file.path) {
          this.applyTitle();
        }
      })
    );

    // Startup: take one more pass once the vault index has fully settled.
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('resolved', () => {
        if (this.enabled) this.applyTitle();
      })
    );

    // Layout changes — moving panes around can flip the active leaf without
    // firing `active-leaf-change` on some builds.
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('layout-change', () => {
        if (this.enabled) this.applyTitle();
      })
    );

    // Renames invalidate our per-file memo (the old path won't be hit
    // anymore; the new path needs a fresh read).
    this.plugin.registerEvent(
      this.plugin.app.vault.on('rename', (file, oldPath) => {
        const cached = this.lastKnownTitles.get(oldPath);
        this.lastKnownTitles.delete(oldPath);
        if (cached) this.lastKnownTitles.set(file.path, cached);
        if (this.enabled) this.applyTitle();
      })
    );

    // File deletions clear the memo entry.
    this.plugin.registerEvent(
      this.plugin.app.vault.on('delete', (file) => {
        this.lastKnownTitles.delete(file.path);
      })
    );
  }

  /** Update window frame when settings change */
  updateWindowFrame() {
    if (this.plugin.settings.enableForWindowFrame) {
      this.enable();
    } else {
      this.disable();
    }
  }

  /** Cleanup on unload */
  onunload() {
    if (this.deferredTimer !== null) {
      window.clearTimeout(this.deferredTimer);
      this.deferredTimer = null;
    }
    this.lastKnownTitles.clear();
    this.disable();
  }
}
