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

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Get the title for the active file
   */
  private getActiveFileTitle(): string {
    const activeFile = this.plugin.app.workspace.getActiveFile();
    if (activeFile instanceof TFile) {
      // For MD files, use metadata cache (fast sync access)
      if (activeFile.extension === 'md') {
        const fileCache = this.plugin.app.metadataCache.getFileCache(activeFile);
        const propertyValue = fileCache?.frontmatter?.[this.plugin.settings.propertyKey] as string | undefined;
        if (propertyValue) {
          return String(propertyValue);
        }
        return activeFile.basename;
      }
      
      // For MDX files, trigger async read and return filename for now
      // The title will update once the cache is populated
      if (activeFile.extension === 'mdx' && this.plugin.settings.enableMdxSupport) {
        void (async () => {
          const frontmatter = await getFrontmatter(this.plugin.app, activeFile, this.plugin.settings);
          const propertyValue = frontmatter?.[this.plugin.settings.propertyKey] as string | undefined;
          if (propertyValue) {
            // Update title asynchronously
            const app = this.plugin.app as { getAppTitle?: (title: string) => string };
            if (typeof app.getAppTitle === 'function') {
              document.title = app.getAppTitle(String(propertyValue));
            } else {
              const vaultName = this.plugin.app.vault.getName();
              document.title = `${String(propertyValue)} - ${vaultName}`;
            }
          }
        })();
        return activeFile.basename; // Return filename immediately, will update async
      }
      
      return activeFile.basename;
    }
    return '';
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
      if (typeof app.getAppTitle === 'function') {
        document.title = app.getAppTitle(title);
      } else {
        // Fallback: format manually
        const vaultName = this.plugin.app.vault.getName();
        document.title = `${title} - ${vaultName}`;
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
      
      // Update immediately
      this.updateTitle();
      
      this.enabled = true;
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
   * Register events for window frame updates
   */
  registerEvents() {
    if (!this.plugin.settings.enableForWindowFrame) {
      return;
    }

    // Update when active file changes
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', () => {
        if (this.enabled) {
          this.updateTitle();
        }
      })
    );

    // Update when metadata changes
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', () => {
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
    this.disable();
  }
}

