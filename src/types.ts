import { TFile, App, Plugin } from 'obsidian';

export interface PluginSettings {
  propertyKey: string;
  enableForLinking: boolean;
  enableForQuickSwitcher: boolean;
  includeFilenameInSearch: boolean;
  includeAliasesInSearch: boolean;
  enableForDragDrop: boolean;
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
}

export interface SuggestionItem {
  file?: TFile;
  display: string;
  isCustomDisplay: boolean;
  isNoMatch?: boolean;
}

export interface QuickSwitchItem {
  item: TFile | { isNewNote: boolean; newName: string };
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
}

// Plugin interface for type safety
export interface PropertyOverFileNamePlugin extends Plugin {
  settings: PluginSettings;
  suggest?: EditorSuggest;
  updateLinkSuggester(): void;
  updateQuickSwitcher(): void;
  rebuildCache(): void;
  saveSettings(prevQuickSwitcherState?: boolean): Promise<void>;
  saveData(data: PluginSettings): Promise<void>;
}

export interface EditorSuggest {
  updateFileCache(file: TFile): void;
  buildFileCache(): void;
}
