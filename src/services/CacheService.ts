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
      this.suggest.updateFileCache(file);
    }
  }

  rebuildCache(): void {
    if (this.suggest) {
      this.suggest.buildFileCache();
    }
  }
}
