/**
 * Tab Service
 * 
 * This file contains code adapted from the Title-only Tab plugin by tristone13th.
 * Original source: https://github.com/tristone13th/obsidian-title-only-tab
 * 
 * The code has been modified to integrate with the Property Over File Name plugin
 * and use the plugin's property key setting instead of hardcoded "title" property.
 * 
 * Original code is licensed under MIT. This file is also licensed under GPLv3.
 */

import { MarkdownView, WorkspaceLeaf } from 'obsidian';
import { PropertyOverFileNamePlugin } from '../types';

export class TabService {
  private plugin: PropertyOverFileNamePlugin;
  private observer: MutationObserver | null = null;
  private originalSetText: ((text: string) => void) | null = null;
  private modifiedElements: WeakSet<HTMLElement> = new WeakSet();

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Renames all markdown tabs to use the configured property value
   * Falls back to file basename if property is not found
   */
  async renameTabs() {
    // First, mark ALL tabs as processed to ensure they're visible
    // This includes tabs from other plugins (GridExplorer, HomeTab, etc.)
    // Query all tab headers from the DOM to catch all tabs regardless of type
    const allTabHeaders = document.querySelectorAll('.workspace-tab-header');
    allTabHeaders.forEach((tabHeader) => {
      (tabHeader as HTMLElement).setAttribute('data-pov-processed', 'true');
    });
    
    // Also mark tabs from known leaf types to ensure coverage
    // This helps catch tabs that might be created before DOM is ready
    const knownViewTypes = ['markdown', 'graph', 'localgraph', 'backlink', 'file-explorer'];
    for (const viewType of knownViewTypes) {
      const leaves = this.plugin.app.workspace.getLeavesOfType(viewType);
      leaves.forEach((leaf) => {
        const tabHeaderEl = (leaf as any).tabHeaderEl as HTMLElement | undefined;
        if (tabHeaderEl) {
          tabHeaderEl.setAttribute('data-pov-processed', 'true');
        }
      });
    }
    
    if (!this.plugin.settings.enableForTabs) {
      return;
    }
    
    // Now process only markdown leaves for renaming
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');

    leaves.forEach((leaf) => {
      /*
       * When Obsidian first opens, due to lazy loading, the view may not have
       * a file property. We need to manually trigger a reload. By using setViewState
       * to reapply the view state, we force the view to reinitialize and load the
       * corresponding file, thus populating the file property. If many tabs are open,
       * this may slightly increase startup time.
       */
      const view = leaf.view as MarkdownView;
      const state = leaf.getViewState();
      if (state.state?.file && !view?.file) {
        leaf.setViewState({ type: state.type, state: state.state });
      }

        if (view?.file) {
          const file = view.file;
          const cache = this.plugin.app.metadataCache.getFileCache(file);
          const propertyValue = cache?.frontmatter?.[this.plugin.settings.propertyKey];
          const tabHeaderEl = (leaf as any).tabHeaderEl as HTMLElement | undefined;
          
          /*
           * Possible alternatives (from deepseek-r1)
           *
           * Method 2: Find via Obsidian official API
           * 1. const tabHeaderEl = this.app.workspace.getActiveTabHeader(view.leaf);
           *
           * Method 3: Deep DOM traversal (better compatibility)
           * 2. const tabHeaderEl = this.findTabHeaderByView(view);
           */
          if (tabHeaderEl) {
            const titleEl = tabHeaderEl.querySelector('.workspace-tab-header-inner-title');
            if (titleEl) {
              // Always ensure we have a non-empty title
              const titleText = (propertyValue && String(propertyValue).trim()) || file.basename || '';
              if (titleText) {
                titleEl.setText(titleText);
              }
            }

            // Set accessibility attributes - always ensure non-empty
            const titleText = (propertyValue && String(propertyValue).trim()) || file.basename || '';
            if (titleText) {
              tabHeaderEl.setAttribute('aria-label', titleText);
              tabHeaderEl.setAttribute('title', titleText);
            }
            // Mark as processed to show the title (prevents flicker)
            tabHeaderEl.setAttribute('data-pov-processed', 'true');
          }
        }
    });
  }

  /**
   * Register event listeners for tab renaming
   */
  registerEvents() {
    // Always start observing to mark tabs as processed (even when disabled)
    // This ensures tabs are visible even when the feature is off
    this.startObserving();

    if (!this.plugin.settings.enableForTabs) {
      // When disabled, still mark tabs as processed but don't register rename events
      this.renameTabs();
      return;
    }

    // Rename tabs when layout changes
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('layout-change', () => this.renameTabs())
    );

    // Rename tabs when active leaf changes
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('active-leaf-change', () => this.renameTabs())
    );

    // Rename tabs when a file is opened
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', () => this.renameTabs())
    );

    // Rename tabs when a file is renamed
    this.plugin.registerEvent(
      this.plugin.app.vault.on('rename', () => this.renameTabs())
    );

    // Rename tabs when metadata changes (frontmatter updated)
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', () => this.renameTabs())
    );
  }

  /**
   * Start observing DOM for new tab headers to rename them immediately
   * This prevents flickering by catching tabs before they're fully rendered
   */
  private startObserving() {
    if (this.observer) {
      return; // Already observing
    }

    // Override setText on title elements to intercept immediately
    // This is needed even when disabled to mark tabs as processed
    this.overrideSetText();
    
    // Also override any new title elements that get created
    setTimeout(() => {
      this.overrideSetText();
    }, 100);

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check if any added nodes are tab headers
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              // Check if it's a tab header or contains tab headers
              let tabHeader: HTMLElement | null = null;
              if (node.classList?.contains('workspace-tab-header')) {
                tabHeader = node;
              } else {
                tabHeader = node.querySelector?.('.workspace-tab-header') as HTMLElement | null;
              }
              
              if (tabHeader) {
                // Always mark as processed first to ensure visibility
                // (especially important for tabs from other plugins)
                tabHeader.setAttribute('data-pov-processed', 'true');
                // Override setText for this tab's title element
                this.overrideTitleElement(tabHeader);
                // Mark tab as processed (and rename if enabled)
                this.renameTab(tabHeader);
              }
            }
          }
        } else if (mutation.type === 'characterData') {
          // Check if mutation affects tab title text
          const target = mutation.target as Node;
          const titleEl = target.parentElement?.closest?.('.workspace-tab-header-inner-title');
          if (titleEl) {
            const tabHeader = titleEl.closest('.workspace-tab-header') as HTMLElement | null;
            if (tabHeader) {
              // Always mark as processed first to ensure visibility
              // (especially important for tabs from other plugins)
              tabHeader.setAttribute('data-pov-processed', 'true');
              // Override setText for this tab's title element
              this.overrideTitleElement(tabHeader);
              // Mark tab as processed (and rename if enabled)
              this.renameTab(tabHeader);
            }
          }
        }
      }
    });

    // Observe the entire document for tab-related changes
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  /**
   * Override setText method on title elements to intercept Obsidian's updates
   */
  private overrideSetText() {
    // Find all existing title elements and override them
    const titleElements = document.querySelectorAll('.workspace-tab-header-inner-title');
    titleElements.forEach((el) => {
      this.overrideTitleElement(el as HTMLElement);
    });
  }

  /**
   * Override setText on a specific title element
   */
  private overrideTitleElement(tabHeader: HTMLElement) {
    const titleEl = tabHeader.querySelector('.workspace-tab-header-inner-title') as HTMLElement | null;
    if (!titleEl || this.modifiedElements.has(titleEl)) {
      return; // Already overridden
    }

    // Store original setText if it exists
    const originalSetText = (titleEl as any).setText;
    if (originalSetText && typeof originalSetText === 'function') {
      (titleEl as any).pov_originalSetText = originalSetText;
      
      // Override setText to intercept and replace with property value
      (titleEl as any).setText = (text: string) => {
        // Always mark as processed first to ensure tab is visible
        tabHeader.setAttribute('data-pov-processed', 'true');
        
        // Check if we should replace it (only if feature is enabled)
        const shouldReplace = this.shouldReplaceTitle(tabHeader, text || '');
        
        // Always ensure we have a non-empty text to set
        const textToSet = shouldReplace.newText || text || '';
        
        if (textToSet.trim()) {
          // Replace with property value or fallback
          originalSetText.call(titleEl, textToSet.trim());
          tabHeader.setAttribute('aria-label', textToSet.trim());
          tabHeader.setAttribute('title', textToSet.trim());
        } else {
          // If we still don't have text, call original to maintain Obsidian's behavior
          // but only if the original text is not empty
          if (text && text.trim()) {
            originalSetText.call(titleEl, text.trim());
          }
        }
      };
      
      this.modifiedElements.add(titleEl);
    }
  }

  /**
   * Check if we should replace the title text with property value
   */
  private shouldReplaceTitle(tabHeader: HTMLElement, text: string): { newText: string | null } {
    if (!this.plugin.settings.enableForTabs) {
      return { newText: null };
    }

    // Find the leaf associated with this tab
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const leafTabHeaderEl = (leaf as any).tabHeaderEl as HTMLElement | undefined;
      if (leafTabHeaderEl === tabHeader) {
        const view = leaf.view as MarkdownView;
        if (view?.file) {
          const file = view.file;
          const cache = this.plugin.app.metadataCache.getFileCache(file);
          const propertyValue = cache?.frontmatter?.[this.plugin.settings.propertyKey];
          
          // If we have a property value, use it; otherwise use basename
          // Always ensure we have a non-empty fallback
          if (propertyValue && String(propertyValue).trim()) {
            return { newText: String(propertyValue).trim() };
          } else {
            // No property, use basename (which is what Obsidian would use)
            // Ensure basename is not empty
            const basename = file.basename || text || '';
            return { newText: basename || null };
          }
        }
        // If view exists but file doesn't yet, use the provided text as fallback
        // but only if it's not empty
        if (text && text.trim()) {
          return { newText: text.trim() };
        }
        break;
      }
    }
    
    // If we can't find the leaf/file, use the provided text if it's not empty
    // Otherwise return null to use Obsidian's default behavior
    if (text && text.trim()) {
      return { newText: text.trim() };
    }
    
    return { newText: null };
  }

  /**
   * Rename a specific tab header element
   */
  private renameTab(tabHeaderEl: HTMLElement) {
    // Always mark as processed to ensure tab is visible (even if feature is disabled)
    tabHeaderEl.setAttribute('data-pov-processed', 'true');
    
    if (!this.plugin.settings.enableForTabs) {
      return;
    }

    // Find the leaf associated with this tab
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const leafTabHeaderEl = (leaf as any).tabHeaderEl as HTMLElement | undefined;
      if (leafTabHeaderEl === tabHeaderEl) {
        const view = leaf.view as MarkdownView;
        if (view?.file) {
          const file = view.file;
          const cache = this.plugin.app.metadataCache.getFileCache(file);
          const propertyValue = cache?.frontmatter?.[this.plugin.settings.propertyKey];
          
          const titleEl = tabHeaderEl.querySelector('.workspace-tab-header-inner-title');
          if (titleEl) {
            // Always ensure we have a non-empty title
            const newText = (propertyValue && String(propertyValue).trim()) || file.basename || '';
            
            if (newText) {
              const currentText = titleEl.textContent || '';
              
              // Only update if different to avoid unnecessary DOM changes
              if (currentText !== newText) {
                titleEl.setText(newText);
                tabHeaderEl.setAttribute('aria-label', newText);
                tabHeaderEl.setAttribute('title', newText);
              }
            }
            // Mark as processed to show the title (prevents flicker)
            tabHeaderEl.setAttribute('data-pov-processed', 'true');
          }
        }
        break;
      }
    }
  }

  /**
   * Update tabs when settings change
   */
  updateTabs() {
    this.renameTabs();
  }

  /**
   * Cleanup on unload
   */
  onunload() {
    // Stop observing DOM changes
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // Restore original setText methods
    const titleElements = document.querySelectorAll('.workspace-tab-header-inner-title');
    titleElements.forEach((el) => {
      const titleEl = el as HTMLElement;
      if ((titleEl as any).pov_originalSetText) {
        (titleEl as any).setText = (titleEl as any).pov_originalSetText;
        delete (titleEl as any).pov_originalSetText;
      }
    });
    
    // Event listeners are automatically cleaned up by Obsidian's registerEvent
  }
}

