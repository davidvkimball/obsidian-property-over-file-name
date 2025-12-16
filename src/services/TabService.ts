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

import { MarkdownView } from 'obsidian';
import { PropertyOverFileNamePlugin } from '../types';

export class TabService {
  private plugin: PropertyOverFileNamePlugin;

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Renames all markdown tabs to use the configured property value
   * Falls back to file basename if property is not found
   * EXACT copy of the working implementation from obsidian-title-only-tab
   */
  async renameTabs() {
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

        if (tabHeaderEl) {
          // Always mark tabs as processed so they're not dimmed (even when feature is disabled)
          tabHeaderEl.setAttribute('data-pov-title-set', 'true');
          
          // Only change the title if the feature is enabled
          if (this.plugin.settings.enableForTabs) {
            const titleEl = tabHeaderEl.querySelector('.workspace-tab-header-inner-title');
            if (titleEl) {
              titleEl.setText(propertyValue || file.basename);
            }

            tabHeaderEl.setAttribute('aria-label', propertyValue || file.basename);
            tabHeaderEl.setAttribute('title', propertyValue || file.basename);
          }
        }
      }
    });
  }

  /**
   * Register event listeners for tab renaming
   * EXACT copy of the working implementation from obsidian-title-only-tab
   */
  async registerEvents() {
    await this.renameTabs();

    this.plugin.registerEvent(
      this.plugin.app.workspace.on('layout-change', () => this.renameTabs())
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
    this.renameTabs();
  }

  /**
   * Cleanup on unload
   */
  onunload() {
    // No cleanup needed - events are automatically unregistered by Obsidian
  }
}
