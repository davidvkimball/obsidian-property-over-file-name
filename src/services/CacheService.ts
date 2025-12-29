import { TFile } from "obsidian";
import { EditorSuggest, PropertyOverFileNamePlugin } from "../types";

export class CacheService {
  private plugin: PropertyOverFileNamePlugin;
  private suggest?: EditorSuggest;

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  setSuggest(suggest: EditorSuggest) {
    this.suggest = suggest;
  }

  invalidateCache(file: TFile): void {
    if (this.suggest) {
      // updateFileCache is now async, but we can't await here
      // The cache will be updated asynchronously
      void this.suggest.updateFileCache(file);
    }
  }

  rebuildCache(): void {
    if (this.suggest) {
      // buildFileCache is now async, but we can't await here
      // The cache will be rebuilt asynchronously
      void this.suggest.buildFileCache();
    }
  }
}
