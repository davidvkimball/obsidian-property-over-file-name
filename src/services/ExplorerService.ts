import { TFile, TFolder } from 'obsidian';
import { PropertyOverFileNamePlugin, TFileExplorerItem, TFileExplorerView } from '../types';

/**
 * Explorer Service
 * 
 * Handles displaying property-based titles in the file explorer.
 * Supports folder notes: if a folder contains a file matching the configured
 * folder note filename (e.g., "index.md") with a frontmatter title, the folder
 * will display that title instead of the folder name.
 */
export class ExplorerService {
  plugin: PropertyOverFileNamePlugin; // Public so ExplorerFileItemMutator can access it
  private explorerView: TFileExplorerView | null = null;
  private modified = new WeakMap<TFileExplorerItem, ExplorerFileItemMutator>();

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Get the file explorer view
   */
  private getExplorerView(): TFileExplorerView | null {
    if (this.explorerView === null) {
      const leaves = this.plugin.app.workspace.getLeavesOfType('file-explorer');
      if (leaves.length === 0) {
        return null;
      }
      const leaf = leaves[0];
      if (leaf && leaf.view) {
        // Type assertion through unknown to handle the interface mismatch
        this.explorerView = leaf.view as unknown as TFileExplorerView;
      }
    }
    return this.explorerView;
  }

  /**
   * Get folder note title for a folder
   * Returns the frontmatter title property from the folder note file if it exists
   */
  private getFolderNoteTitle(folder: TFolder): string | null {
    if (!this.plugin.settings.folderNoteFilename || 
        this.plugin.settings.folderNoteFilename.trim() === '') {
      return null;
    }

    const folderNoteFilename = this.plugin.settings.folderNoteFilename.trim();
    const folderNotePath = `${folder.path}/${folderNoteFilename}.md`;
    const folderNoteFile = this.plugin.app.vault.getAbstractFileByPath(folderNotePath);

    if (folderNoteFile instanceof TFile) {
      const cache = this.plugin.app.metadataCache.getFileCache(folderNoteFile);
      const propertyValue = cache?.frontmatter?.[this.plugin.settings.propertyKey] as string | undefined;
      if (propertyValue) {
        return String(propertyValue);
      }
    }

    return null;
  }

  /**
   * Resolve title for a file or folder
   * Public so ExplorerFileItemMutator can access it
   */
  async resolveTitle(item: TFileExplorerItem): Promise<string | null> {
    if (item.file instanceof TFile) {
      // For files, use property-based title
      const { getFrontmatter, isFileTypeSupported } = await import('../utils/frontmatter');
      
      // Skip unsupported file types
      if (!isFileTypeSupported(item.file.extension, this.plugin.settings)) {
        return null;
      }

      const frontmatter = await getFrontmatter(this.plugin.app, item.file, this.plugin.settings);
      const propertyValue = frontmatter?.[this.plugin.settings.propertyKey] as string | undefined;
      return propertyValue ? String(propertyValue) : null;
    } else if (item.file instanceof TFolder) {
      // For folders, check for folder note
      return this.getFolderNoteTitle(item.file);
    }
    return null;
  }

  /**
   * Update all file explorer items
   */
  private updateAllItems() {
    const view = this.getExplorerView();
    if (!view || !view.fileItems) {
      return;
    }

    const items = Object.values(view.fileItems);
    for (const item of items) {
      if (!this.modified.has(item)) {
        this.modified.set(item, new ExplorerFileItemMutator(item, this));
      }
      item.updateTitle();
    }
  }

  /**
   * Restore all original titles
   */
  private restoreAllItems() {
    const view = this.getExplorerView();
    if (!view || !view.fileItems) {
      return;
    }

    const items = Object.values(view.fileItems);
    for (const item of items) {
      if (this.modified.has(item)) {
        const mutator = this.modified.get(item);
        mutator?.destroy();
        this.modified.delete(item);
        item.updateTitle();
      }
    }
  }

  /**
   * Register events and initialize
   */
  registerEvents() {
    if (!this.plugin.settings.enableForExplorer) {
      return;
    }

    // Wait for layout to be ready
    this.plugin.app.workspace.onLayoutReady(() => {
      this.explorerView = null; // Reset to get fresh view
      this.updateAllItems();
    });

    // Update when layout changes
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('layout-change', () => {
        this.explorerView = null; // Reset to get fresh view
        if (this.plugin.settings.enableForExplorer) {
          this.updateAllItems();
        }
      })
    );

    // Update when metadata changes
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', () => {
        if (this.plugin.settings.enableForExplorer) {
          this.updateAllItems();
        }
      })
    );

    // Update when files are renamed
    this.plugin.registerEvent(
      this.plugin.app.vault.on('rename', () => {
        if (this.plugin.settings.enableForExplorer) {
          this.explorerView = null; // Reset to get fresh view
          setTimeout(() => this.updateAllItems(), 100);
        }
      })
    );
  }

  /**
   * Update explorer when settings change
   */
  updateExplorer() {
    if (this.plugin.settings.enableForExplorer) {
      this.explorerView = null; // Reset to get fresh view
      this.registerEvents();
      setTimeout(() => this.updateAllItems(), 100);
    } else {
      this.restoreAllItems();
    }
  }

  /**
   * Cleanup on unload
   */
  onunload() {
    this.restoreAllItems();
    this.explorerView = null;
  }
}

/**
 * Mutator for individual file explorer items
 * Hooks into updateTitle() to replace displayed text
 */
class ExplorerFileItemMutator {
  private originalUpdateTitle: () => void;
  private originalStartRename: (() => void) | undefined;

  constructor(
    private readonly item: TFileExplorerItem,
    private readonly service: ExplorerService
  ) {
    // Store original methods
    const proto = Object.getPrototypeOf(item) as { updateTitle: () => void; startRename?: () => void };
    this.originalUpdateTitle = proto.updateTitle.bind(item);
    this.originalStartRename = proto.startRename ? proto.startRename.bind(item) : undefined;

    // Override updateTitle
    item.updateTitle = this.updateTitle.bind(this);
    
    // Override startRename if it exists
    if (proto.startRename) {
      item.startRename = this.startRename.bind(this);
    }
  }

  private updateTitle() {
    // Call original to set up the element
    this.originalUpdateTitle();
    
    // Replace with property-based title if enabled
    if (this.service.plugin.settings.enableForExplorer) {
      void (async () => {
        const title = await this.service.resolveTitle(this.item);
        if (title && title.length > 0) {
          this.item.innerEl.setText(title);
        }
      })();
    }
  }

  private startRename() {
    // Restore original title for renaming
    this.item.innerEl.setText(this.item.getTitle());
    return this.originalStartRename?.();
  }

  destroy() {
    // Restore original methods
    const proto = Object.getPrototypeOf(this.item) as { startRename?: () => void };
    this.item.updateTitle = this.originalUpdateTitle;
    if (proto.startRename && this.originalStartRename) {
      this.item.startRename = this.originalStartRename;
    }
  }
}

