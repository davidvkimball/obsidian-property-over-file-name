import { TFile } from 'obsidian';
import type { PropertyOverFileNamePlugin } from '../types';
import { frontmatterCache } from '../utils/frontmatter-cache';

export class PropertiesService {
  private plugin: PropertyOverFileNamePlugin;
  private observer: MutationObserver | null = null;
  private isProcessing = false;

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  updateProperties(): void {
    if (this.plugin.settings.enableForProperties) {
      this.startObserver();
    } else {
      this.stopObserver();
    }
  }

  onunload(): void {
    this.stopObserver();
  }

  private startObserver(): void {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      // Prevent infinite loops if our DOM changes trigger mutations
      if (this.isProcessing) return;

      // Only run if we're focused inside a property value
      const activeEl = document.activeElement;
      if (!activeEl || !activeEl.closest('.metadata-property-value')) {
        return;
      }

      let hasSuggestionMutations = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasSuggestionMutations = true;
          break;
        }
      }

      if (!hasSuggestionMutations) return;

      this.processSuggestions();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });

    // Also process any existing suggestions
    this.processSuggestions();
  }

  private stopObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private processSuggestions(): void {
    if (!this.plugin.settings.enableForProperties) return;

    const popovers = document.querySelectorAll('.suggestion-container:not(.property-over-filename-suggestion)');
    if (popovers.length === 0) return;

    this.isProcessing = true;

    try {
      popovers.forEach(popover => {
        const items = popover.querySelectorAll('.suggestion-item:not(.is-property-patched)');
        
        items.forEach(item => {
          // Check if it's a file suggestion (usually has title and note)
          const titleEl = item.querySelector('.suggestion-title');
          const noteEl = item.querySelector('.suggestion-note');
          
          if (titleEl && titleEl.textContent) {
            let possiblePath = titleEl.textContent;
            
            if (noteEl && noteEl.textContent) {
              // Usually title is basename, note is folder path
              const folder = noteEl.textContent.trim();
              const basename = titleEl.textContent.trim();
              
              // Depending on Obsidian version, the path might be constructed differently
              if (folder.endsWith('/')) {
                possiblePath = folder + basename;
              } else if (folder !== '') {
                possiblePath = folder + '/' + basename;
              }
            }

            // Try to find the file
            const file = this.resolveFile(possiblePath);
            if (file) {
              const label = this.computeLabel(file);
              if (label) {
                // We found a custom property label! Let's update the DOM.
                titleEl.textContent = label;
                
                // If it's not already complex, make it complex so it renders nicely
                if (!item.classList.contains('mod-complex')) {
                  item.classList.add('mod-complex');
                }
              }
            }
          }
          
          // Mark as patched so we don't process it again
          item.classList.add('is-property-patched');
        });
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private resolveFile(possiblePath: string): TFile | null {
    // 1. Exact match with .md
    let file = this.plugin.app.metadataCache.getFirstLinkpathDest(possiblePath, '');
    if (file) return file;

    // 2. Exact match in vault
    const abstractFile = this.plugin.app.vault.getAbstractFileByPath(possiblePath + '.md');
    if (abstractFile instanceof TFile) return abstractFile;

    // 3. Exact match for mdx
    if (this.plugin.settings.enableMdxSupport) {
      const mdxFile = this.plugin.app.vault.getAbstractFileByPath(possiblePath + '.mdx');
      if (mdxFile instanceof TFile) return mdxFile;
    }

    // 4. Try just the path without adding .md in case it already has it
    const rawFile = this.plugin.app.vault.getAbstractFileByPath(possiblePath);
    if (rawFile instanceof TFile) return rawFile;

    return null;
  }

  private computeLabel(file: TFile): string | null {
    const propertyKey = this.plugin.settings.propertyKey?.trim() || 'title';

    if (file.extension === 'md') {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (fm && fm[propertyKey] !== undefined && fm[propertyKey] !== null) {
        const val = String(fm[propertyKey]).trim();
        if (val) return val;
      }
      return null;
    }

    if (file.extension === 'mdx' && this.plugin.settings.enableMdxSupport) {
      const cached = frontmatterCache.getSync(file.path);
      if (cached && typeof cached === 'object') {
        const propVal = cached[propertyKey];
        if (propVal !== undefined && propVal !== null) {
          let val = '';
          if (typeof propVal === 'string') val = propVal.trim();
          else if (typeof propVal === 'number' || typeof propVal === 'boolean') val = String(propVal).trim();
          if (val) return val;
        }
      }
      return null;
    }

    return null;
  }
}
