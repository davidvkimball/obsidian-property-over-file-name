import { TFile, TFolder, Plugin, Workspace } from 'obsidian';

export interface PluginSettings {
  propertyKey: string;
  enableForLinking: boolean;
  enableForQuickSwitcher: boolean;
  includeFilenameInSearch: boolean;
  includeAliasesInSearch: boolean;
  enableForDragDrop: boolean;
  useSimpleSearch: boolean;
  enableForGraphView: boolean;
  enableForBacklinks: boolean;
  enableForTabs: boolean;
  enableForExplorer: boolean;
  folderNoteFilename: string;
  enableForWindowFrame: boolean;
  enableMdxSupport: boolean;
}

export interface CachedFileData {
  file: TFile;
  displayName: string;
  aliases: string[];
  lastModified: number;
  isCustomDisplay: boolean;
}

export interface SearchMatchReason {
  matchedInTitle: boolean;
  matchedInFilename: boolean;
  matchedInAlias: boolean;
  matchedAliasText?: string; // The alias text that matched (for display purposes)
}

export interface SuggestionItem {
  file?: TFile;
  display: string;
  isCustomDisplay: boolean;
  isNoMatch?: boolean;
  isNewNote?: boolean;
  newName?: string;
}

export interface UnresolvedLinkItem {
  isUnresolved: true;
  unresolvedText: string;
}

export interface NewNoteItem {
  isNewNote: true;
  newName: string;
}

export type QuickSwitchItemType = TFile | NewNoteItem | UnresolvedLinkItem;

export interface QuickSwitchItem {
  item: QuickSwitchItemType;
  match: { score: number; matches: number[][] };
}

// Internal API interfaces for better type safety
export interface EditorSuggestInternal {
  suggestEl?: HTMLElement;
}

export interface VaultInternal {
  getConfig(key: string): boolean;
}

export interface WorkspaceInternal {
  editorSuggest?: {
    suggests: EditorSuggest[];
  };
}

export interface QuickSwitcherPluginInstance {
  id: string;
  options: {
    showAllFileTypes: boolean;
    showAttachments: boolean;
    showExistingOnly: boolean;
  };
}

export interface AppInternal {
  commands: {
    commands: Record<string, {
      id?: string;
      name?: string;
      icon?: string;
      hotkeys?: Array<{ modifiers: string[]; key: string }>;
      callback: () => void;
    }>;
  };
  internalPlugins?: {
    getPluginById?: (id: string) => {
      instance?: QuickSwitcherPluginInstance;
    } | null;
  };
}

// Plugin interface for type safety
export interface PropertyOverFileNamePlugin extends Plugin {
  settings: PluginSettings;
  suggest?: EditorSuggest;
  updateLinkSuggester(): void;
  updateQuickSwitcher(): void;
  updateGraphView(): void;
  updateBacklinks(): void;
  updateTabs(): void;
  updateExplorer(): void;
  updateWindowFrame(): void;
  rebuildCache(): void;
  saveSettings(prevQuickSwitcherState?: boolean, prevTabState?: boolean): Promise<void>;
  saveData(data: PluginSettings): Promise<void>;
}

export interface EditorSuggest {
  updateFileCache(file: TFile): void | Promise<void>;
  buildFileCache(): void | Promise<void>;
}

// File Explorer types
export interface TFileExplorerItem {
  file: TFile | TFolder;
  selfEl: HTMLDivElement;
  innerEl: HTMLDivElement;
  updateTitle(): void;
  startRename(): void;
  getTitle(): string;
}

export interface TFileExplorerView {
  fileItems: {
    [K: string]: TFileExplorerItem;
  };
}

export interface WorkspaceExt extends Workspace {
  updateTitle(): void;
}
