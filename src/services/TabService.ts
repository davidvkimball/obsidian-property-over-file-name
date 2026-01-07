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

import { MarkdownView, WorkspaceLeaf, EventRef } from 'obsidian';
import { PropertyOverFileNamePlugin } from '../types';
import { getFrontmatter } from '../utils/frontmatter';

export class TabService {
  private plugin: PropertyOverFileNamePlugin;
  private leafEventRefs: Map<WorkspaceLeaf, EventRef> = new Map();

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Renames all markdown tabs to use the configured property value
   * Falls back to file basename if property is not found
   * EXACT copy of the working implementation from obsidian-title-only-tab
   */
  renameTabs() {
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
        void leaf.setViewState({ type: state.type, state: state.state });
      }

      if (view?.file) {
        const file = view.file;
        // Use async version to support MDX files
        void (async () => {
          const frontmatter = await getFrontmatter(this.plugin.app, file, this.plugin.settings);
          const propertyValue = frontmatter?.[this.plugin.settings.propertyKey] as string | undefined;
          const tabHeaderEl = (leaf as { tabHeaderEl?: HTMLElement }).tabHeaderEl;

          if (tabHeaderEl) {
            // Always mark tabs as processed so they're not dimmed (even when feature is disabled)
            tabHeaderEl.setAttribute('data-pov-title-set', 'true');
            
            // Only change the title if the feature is enabled
            if (this.plugin.settings.enableForTabs) {
              const titleEl = tabHeaderEl.querySelector('.workspace-tab-header-inner-title');
              const displayText = propertyValue ? String(propertyValue) : file.basename;
              if (titleEl) {
                titleEl.setText(displayText);
              }

              tabHeaderEl.setAttribute('aria-label', displayText);
              tabHeaderEl.setAttribute('title', displayText);
            }
          }
        })();
      }
    });
  }

  /**
   * Register pinned-change event listeners on all markdown leaves
   * This ensures tab titles are re-applied when tabs are pinned/unpinned
   */
  private registerLeafListeners() {
    const currentLeaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    const currentLeafSet = new Set(currentLeaves);

    // Register listeners on new leaves
    currentLeaves.forEach((leaf) => {
      if (!this.leafEventRefs.has(leaf)) {
        // Register pinned-change listener with a delay to let Obsidian finish DOM updates
        const eventRef = leaf.on('pinned-change', () => {
          // Use requestAnimationFrame for better timing with DOM updates
          requestAnimationFrame(() => {
            // Small additional delay to ensure Obsidian has finished updating
            setTimeout(() => {
              void this.renameTabs();
            }, 50);
          });
        });
        this.leafEventRefs.set(leaf, eventRef);
      }
    });

    // Clean up listeners for leaves that no longer exist
    for (const [leaf, eventRef] of this.leafEventRefs.entries()) {
      if (!currentLeafSet.has(leaf)) {
        leaf.offref(eventRef);
        this.leafEventRefs.delete(leaf);
      }
    }
  }

  /**
   * Register event listeners for tab renaming
   * EXACT copy of the working implementation from obsidian-title-only-tab
   */
  registerEvents() {
    this.renameTabs();

    // Register leaf-level pinned-change listeners
    this.registerLeafListeners();

    this.plugin.registerEvent(
      this.plugin.app.workspace.on('layout-change', () => {
        void this.renameTabs();
        // Re-register leaf listeners to catch newly created leaves
        this.registerLeafListeners();
      })
    );

    this.plugin.registerEvent(
      this.plugin.app.workspace.on('active-leaf-change', () => this.renameTabs())
    );

    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', () => this.renameTabs())
    );

    this.plugin.registerEvent(
      this.plugin.app.vault.on('rename', () => this.renameTabs())
    );

    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', () => this.renameTabs())
    );
  }

  /**
   * Update tabs (public method for manual updates)
   */
  updateTabs() {
    void this.renameTabs();
  }

  /**
   * Cleanup on unload
   */
  onunload() {
    // Unregister all leaf-level event listeners
    for (const [leaf, eventRef] of this.leafEventRefs.entries()) {
      leaf.offref(eventRef);
    }
    this.leafEventRefs.clear();
  }
}
