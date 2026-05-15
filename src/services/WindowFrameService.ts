import { TFile } from 'obsidian';
import { PropertyOverFileNamePlugin, WorkspaceExt } from '../types';
import { getFrontmatter } from '../utils/frontmatter';

/**
 * Window Frame Service
 *
 * Handles displaying property-based title in the browser window title bar.
 * Overrides workspace.updateTitle() to use the frontmatter property instead
 * of the file name.
 */
export class WindowFrameService {
  private plugin: PropertyOverFileNamePlugin;
  private originalUpdateTitle: (() => void) | null = null;
  private enabled: boolean = false;
  /**
   * Per-file path → last property-based title we resolved for it. Used so a
   * transient cache miss (e.g. right after Obsidian focuses the window before
   * the metadata cache has settled) doesn't downgrade a correct title back to
   * the filename.
   */
  private lastKnownTitles: Map<string, string> = new Map();
  private eventsRegistered: boolean = false;
  private retryTimer: number | null = null;

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Returns the Document for the main Obsidian window. We need this (not the
   * bare `document` global and not `activeDocument`, which follows whichever
   * popout is focused) so that writing to `.title` updates the OS title of the
   * main app window. Obsidian exposes `workspace.rootSplit.doc` for exactly
   * this purpose.
   */
  private getMainDocument(): Document {
    return this.plugin.app.workspace.rootSplit.doc;
  }

  /**
   * Get the title for the active file. Returns an empty string if no file is
   * active, the basename if the property isn't available, or the property
   * value when it is. Property hits are cached per file path so a later
   * cache-miss (returns null) doesn't blow away a previously-correct title.
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
      // Cache miss: prefer a previously-resolved good value over the filename
      // so a transient null doesn't reset the OS title to the slug.
      const remembered = this.lastKnownTitles.get(activeFile.path);
      if (remembered) {
        // Schedule a refresh in case the property has genuinely been cleared.
        this.scheduleRetry();
        return remembered;
      }
      // First time seeing this file and the cache is empty. Schedule a retry
      // and return the basename for now.
      this.scheduleRetry();
      return activeFile.basename;
    }

    if (activeFile.extension === 'mdx' && this.plugin.settings.enableMdxSupport) {
      const remembered = this.lastKnownTitles.get(activeFile.path);
      if (remembered) {
        // Keep the cache fresh in the background, but return the good value now.
        void this.refreshMdxTitle(activeFile);
        return remembered;
      }
      void this.refreshMdxTitle(activeFile);
      return activeFile.basename;
    }

    return activeFile.basename;
  }

  /**
   * Async helper for the MDX path: read the file, cache the property value if
   * we find one, then trigger another title update so the window picks up the
   * fresh value.
   */
  private async refreshMdxTitle(file: TFile): Promise<void> {
    try {
      const frontmatter = await getFrontmatter(this.plugin.app, file, this.plugin.settings);
      const propertyValue = frontmatter?.[this.plugin.settings.propertyKey] as string | undefined;
      if (propertyValue) {
        const prev = this.lastKnownTitles.get(file.path);
        this.lastKnownTitles.set(file.path, String(propertyValue));
        if (this.enabled && prev !== String(propertyValue)) {
          this.updateTitle();
        }
      }
    } catch {
      // Best-effort; we'll retry on the next event.
    }
  }

  /**
   * Schedules a single deferred re-run of `updateTitle`. Coalesced so we don't
   * stack retries when several events fire in quick succession.
   */
  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (this.enabled) {
        this.updateTitle();
      }
    }, 150);
  }

  /**
   * Override updateTitle to use property-based title
   */
  private updateTitle() {
    if (!this.enabled) {
      if (this.originalUpdateTitle) {
        this.originalUpdateTitle();
      }
      return;
    }

    const title = this.getActiveFileTitle();
    if (title) {
      // Get the app title format (usually "Title - Vault Name")
      // Try to use Obsidian's getAppTitle method if available
      const app = this.plugin.app as { getAppTitle?: (title: string) => string };
      const mainDoc = this.getMainDocument();
      if (typeof app.getAppTitle === 'function') {
        mainDoc.title = app.getAppTitle(title);
      } else {
        // Fallback: format manually
        const vaultName = this.plugin.app.vault.getName();
        mainDoc.title = `${title} - ${vaultName}`;
      }
    } else {
      // Fallback to original behavior
      if (this.originalUpdateTitle) {
        this.originalUpdateTitle();
      }
    }
  }

  /**
   * Enable the window frame feature
   */
  enable() {
    if (this.enabled) {
      return;
    }

    const workspace = this.plugin.app.workspace as WorkspaceExt;
    if (workspace.updateTitle) {
      // Store original method
      this.originalUpdateTitle = workspace.updateTitle.bind(workspace);

      // Override with our method
      workspace.updateTitle = this.updateTitle.bind(this);

      this.enabled = true;

      // Update immediately. Done after `enabled = true` so getActiveFileTitle()
      // can populate the cache on the first pass.
      this.updateTitle();
    }
  }

  /**
   * Disable the window frame feature
   */
  disable() {
    if (!this.enabled) {
      return;
    }

    const workspace = this.plugin.app.workspace as WorkspaceExt;
    if (workspace.updateTitle && this.originalUpdateTitle) {
      // Restore original method
      workspace.updateTitle = this.originalUpdateTitle;

      // Update to restore original title
      workspace.updateTitle();

      this.originalUpdateTitle = null;
      this.enabled = false;
    }
  }

  /**
   * Register events for window frame updates. Idempotent — only attaches
   * listeners on the first call. The plugin lifecycle (registerEvent) handles
   * cleanup on unload.
   */
  registerEvents() {
    if (this.eventsRegistered) return;
    if (!this.plugin.settings.enableForWindowFrame) {
      return;
    }
    this.eventsRegistered = true;

    // Update when active file changes (new file opened in the workspace)
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', () => {
        if (this.enabled) {
          this.updateTitle();
        }
      })
    );

    // Update when the active leaf changes. `file-open` doesn't fire when you
    // click between tabs/panes that already have files loaded, so without this
    // the OS title stays stuck on whatever was set last.
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('active-leaf-change', () => {
        if (this.enabled) {
          this.updateTitle();
        }
      })
    );

    // Update when metadata changes — but only for the file we're currently
    // showing in the title, so a write to some other file doesn't fire a
    // pointless re-render here. (The handler's still cheap; this is mostly
    // about correctness if the active file changed since the last render.)
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', (file) => {
        if (!this.enabled) return;
        // Invalidate the per-file cache so the next read picks up the fresh
        // property value (or its absence).
        this.lastKnownTitles.delete(file.path);
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile && activeFile.path === file.path) {
          this.updateTitle();
        }
      })
    );

    // When the full vault index settles, take one more pass — handles the
    // startup case where the active file was already open but its cache
    // wasn't ready when we first wrote the title.
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('resolved', () => {
        if (this.enabled) {
          this.updateTitle();
        }
      })
    );
  }

  /**
   * Update window frame when settings change
   */
  updateWindowFrame() {
    if (this.plugin.settings.enableForWindowFrame) {
      this.enable();
      this.registerEvents();
    } else {
      this.disable();
    }
  }

  /**
   * Cleanup on unload
   */
  onunload() {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.lastKnownTitles.clear();
    this.disable();
  }
}
