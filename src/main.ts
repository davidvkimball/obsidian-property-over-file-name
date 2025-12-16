import { Plugin, TFile } from 'obsidian';
import { PluginSettings, WorkspaceInternal, EditorSuggest } from './types';
import { DEFAULT_SETTINGS } from './settings';
import { LinkTitleSuggest } from './ui/LinkTitleSuggest';
import { SettingTab } from './ui/SettingTab';
import { registerCommands } from './commands';
import { QuickSwitcherService } from './services/QuickSwitcherService';
import { DragDropService } from './services/DragDropService';
import { CacheService } from './services/CacheService';
import { GraphViewService } from './services/GraphViewService';
import { BacklinkService } from './services/BacklinkService';
import { TabService } from './services/TabService';
import { ExplorerService } from './services/ExplorerService';
import { WindowFrameService } from './services/WindowFrameService';

export default class PropertyOverFileNamePlugin extends Plugin {
  settings!: PluginSettings;
  suggest?: LinkTitleSuggest;
  private quickSwitcherService!: QuickSwitcherService;
  private dragDropService!: DragDropService;
  private cacheService!: CacheService;
  private graphViewService!: GraphViewService;
  private backlinkService!: BacklinkService;
  private tabService!: TabService;
  private explorerService!: ExplorerService;
  private windowFrameService!: WindowFrameService;

  async onload() {
    await this.loadSettings();
    
    // Initialize services
    this.quickSwitcherService = new QuickSwitcherService(this);
    this.dragDropService = new DragDropService(this);
    this.cacheService = new CacheService(this);
    this.graphViewService = new GraphViewService(this);
    this.backlinkService = new BacklinkService(this);
    this.tabService = new TabService(this);
    this.explorerService = new ExplorerService(this);
    this.windowFrameService = new WindowFrameService(this);
    
    // Register tab service events and rename tabs immediately
    await this.tabService.registerEvents();
    
    // Register explorer and window frame services
    this.explorerService.registerEvents();
    this.windowFrameService.registerEvents();
    
    // Wait a bit for metadata cache to be fully populated
    setTimeout(() => {
      this.updateLinkSuggester();
      this.updateQuickSwitcher();
      this.updateBacklinks();
      this.updateTabs();
      this.updateExplorer();
      this.updateWindowFrame();
    }, 1000);

    // Set up graph view handling
    this.app.workspace.onLayoutReady(() => {
      this.graphViewService.onLayoutChange();
      this.backlinkService.onLayoutChange();
      this.tabService.renameTabs();
      this.updateExplorer();
      this.updateWindowFrame();
    });
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.graphViewService.onLayoutChange();
        this.backlinkService.onLayoutChange();
      })
    );

    // Set up backlinks handling
    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        this.backlinkService.onFileOpen();
      })
    );

    // Register file change events to invalidate cache
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.cacheService.invalidateCache(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.cacheService.invalidateCache(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.cacheService.invalidateCache(file);
        }
      })
    );

    // Register metadata cache change events to rebuild cache
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.cacheService.rebuildCache();
          // Refresh graph view when metadata changes (to update visible nodes)
          if (this.settings.enableForGraphView) {
            this.graphViewService.refreshGraphView();
          }
          // Refresh backlinks when metadata changes
          if (this.settings.enableForBacklinks) {
            this.backlinkService.updateBacklinks();
          }
          // Refresh explorer when metadata changes
          if (this.settings.enableForExplorer) {
            this.explorerService.updateExplorer();
          }
          // Refresh window frame when metadata changes
          if (this.settings.enableForWindowFrame) {
            this.windowFrameService.updateWindowFrame();
          }
        }
      })
    );

    this.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        // Rebuild cache when metadata cache is fully resolved
        this.cacheService.rebuildCache();
      })
    );

    // Register drag and drop event handling
    this.registerEvent(
      this.app.workspace.on('editor-drop', (event, editor) => {
        if (this.settings.enableForDragDrop) {
          this.dragDropService.handleDragDrop(event, editor);
        }
      })
    );

    // Also try DOM events as backup
    this.registerDomEvent(document, 'drop', (event) => {
      if (this.settings.enableForDragDrop) {
        this.dragDropService.handleDOMDrop(event);
      }
    });

    // Note: Mobile quick switcher is handled by the QuickSwitcherService
    // which overrides the 'switcher:open' command. The quick-preview event
    // was causing conflicts with normal typing, so we removed that approach.

    // Register commands
    registerCommands(this);

    // Add setting tab
    this.addSettingTab(new SettingTab(this.app, this));
  }

  updateLinkSuggester() {
    const editorSuggest = (this.app.workspace as WorkspaceInternal).editorSuggest;
    if (!editorSuggest) return;

    if (this.suggest) {
      editorSuggest.suggests = editorSuggest.suggests.filter((s: EditorSuggest) => s !== this.suggest);
      this.suggest = undefined;
    }

    if (this.settings.enableForLinking) {
      this.suggest = new LinkTitleSuggest(this);
      this.registerEditorSuggest(this.suggest);
      this.cacheService.setSuggest(this.suggest);
      editorSuggest.suggests = editorSuggest.suggests.filter((s: EditorSuggest) => !s.constructor.name.includes('LinkSuggest'));
      editorSuggest.suggests.unshift(this.suggest);
    }
  }

  updateQuickSwitcher() {
    this.quickSwitcherService.updateQuickSwitcher();
  }

  updateGraphView() {
    this.graphViewService.updateGraphView();
  }

  updateBacklinks() {
    this.backlinkService.updateBacklinks();
  }

  updateTabs() {
    this.tabService.updateTabs();
  }

  updateExplorer() {
    this.explorerService.updateExplorer();
  }

  updateWindowFrame() {
    this.windowFrameService.updateWindowFrame();
  }

  rebuildCache() {
    this.cacheService.rebuildCache();
  }

  onunload() {
    // Clean up editor suggester
    const editorSuggest = (this.app.workspace as WorkspaceInternal).editorSuggest;
    if (editorSuggest && this.suggest) {
      editorSuggest.suggests = editorSuggest.suggests.filter((s: EditorSuggest) => s !== this.suggest);
    }

    // Restore the original Quick Switcher command
    this.quickSwitcherService.restoreOriginalCommand();

    // Clean up graph view
    this.graphViewService.onunload();

    // Clean up backlinks service
    this.backlinkService.onunload();

    // Clean up tab service
    this.tabService.onunload();

    // Clean up explorer service
    this.explorerService.onunload();

    // Clean up window frame service
    this.windowFrameService.onunload();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(prevQuickSwitcherState?: boolean, prevTabState?: boolean) {
    await this.saveData(this.settings);
    // Only update components when relevant settings change
    if (prevQuickSwitcherState !== undefined && prevQuickSwitcherState !== this.settings.enableForQuickSwitcher) {
      this.updateQuickSwitcher();
    }
    if (prevTabState !== undefined && prevTabState !== this.settings.enableForTabs) {
      // Always re-register events to ensure tabs are marked as processed
      // (even when disabled, we need to mark tabs so they're visible)
      this.tabService.registerEvents();
      this.updateTabs();
    }
  }
}
