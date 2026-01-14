import { TFile } from 'obsidian';
import { PropertyOverFileNamePlugin } from '../types';
import { getFrontmatter } from '../utils/frontmatter';

/**
 * Bookmark Service
 * 
 * Hooks into Obsidian's internal Bookmarks plugin to customize the default
 * title when creating a new bookmark for a note.
 */
export class BookmarkService {
  private plugin: PropertyOverFileNamePlugin;
  private isHooked = false;
  private mutationObserver?: MutationObserver;

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Update bookmarks hook based on settings
   */
  updateBookmarks() {
    if (this.plugin.settings.enableForBookmarks && !this.isHooked) {
      this.hookBookmarks();
    } else if (!this.plugin.settings.enableForBookmarks && this.isHooked) {
      this.unhookBookmarks();
    }
  }

  /**
   * Hook into bookmark functionality using DOM observation
   */
  private hookBookmarks() {
    // Check if modal is already present
    const existingModal = document.querySelector('.modal');
    if (existingModal instanceof HTMLElement) {
      this.handleModalAppearance(existingModal);
    }

    // Set up mutation observer to watch for bookmark modals
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // The modal might be the node itself or inside it
            const modalEl = node.classList.contains('modal') ? node : node.querySelector('.modal') as HTMLElement;
            if (modalEl) {
              this.handleModalAppearance(modalEl);
            }
          }
        });
      }
    });

    // Start observing the document body for new modals
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.isHooked = true;
  }

  /**
   * Handle when a modal appears
   */
  private handleModalAppearance(modalEl: HTMLElement) {
    let attempts = 0;
    const maxAttempts = 30; // Try for up to 1.5 seconds

    const tryIdentifyAndPopulate = async () => {
      const titleEl = modalEl.querySelector('.modal-title');
      const titleText = titleEl?.textContent?.toLowerCase() || '';
      
      // Look for indicators that this is a bookmark modal
      const isBookmarkModal = titleText.includes('bookmark') || 
                             modalEl.querySelector('input[placeholder*="bookmark"]') !== null ||
                             modalEl.querySelector('input[placeholder*="Bookmark"]') !== null;

      if (isBookmarkModal) {
        // Find the "Title" and "Path" input fields
        const settingItems = modalEl.querySelectorAll('.setting-item');
        let titleInput: HTMLInputElement | null = null;
        let pathInput: HTMLInputElement | null = null;

        settingItems.forEach(item => {
          const nameEl = item.querySelector('.setting-item-name');
          const nameText = nameEl?.textContent?.toLowerCase().trim() || '';
          if (nameText === 'title') {
            titleInput = item.querySelector('input[type="text"]') as HTMLInputElement;
          } else if (nameText === 'path') {
            pathInput = item.querySelector('input[type="text"]') as HTMLInputElement;
          }
        });

        // Fallback: if we can't find by label, the bookmark modal usually has Path first, Title second
        if (!titleInput) {
          const allInputs = modalEl.querySelectorAll('input[type="text"]');
          if (allInputs.length >= 2) {
            pathInput = allInputs[0] as HTMLInputElement;
            titleInput = allInputs[1] as HTMLInputElement;
          }
        }

        // If we found the title input, but it's empty or has the default filename, try to populate it
        if (titleInput) {
          // Identify the file
          let file = this.plugin.app.workspace.getActiveFile();
          
          // Use path input value if available for better accuracy
          if (pathInput && pathInput.value) {
            const path = pathInput.value;
            const abstractFile = this.plugin.app.vault.getAbstractFileByPath(path) || 
                                this.plugin.app.vault.getAbstractFileByPath(path + '.md') ||
                                this.plugin.app.vault.getAbstractFileByPath(path + '.mdx');
            if (abstractFile instanceof TFile) {
              file = abstractFile;
            }
          }

          if (file) {
            const frontmatter = await getFrontmatter(this.plugin.app, file, this.plugin.settings);
            const propertyValue = frontmatter?.[this.plugin.settings.propertyKey];

            if (propertyValue !== undefined && propertyValue !== null) {
              let displayValue = '';
              if (typeof propertyValue === 'string') {
                displayValue = propertyValue;
              } else if (typeof propertyValue === 'number' || typeof propertyValue === 'boolean') {
                displayValue = String(propertyValue);
              }

              if (displayValue && displayValue.trim() !== '') {
                // Only overwrite if it matches the filename or is empty (don't overwrite user edits)
                const currentValue = titleInput.value;
                const isDefault = currentValue === '' || currentValue === file.basename || currentValue === file.name;
                
                if (isDefault) {
                  titleInput.value = displayValue;
                  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                  titleInput.select();
                  return true; // Success
                }
              }
            }
          }
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(() => void tryIdentifyAndPopulate(), 50);
      }
      return false;
    };

    void tryIdentifyAndPopulate();
  }

  /**
   * Stop observing for bookmark modals
   */
  private unhookBookmarks() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = undefined;
    }
    this.isHooked = false;
  }

  /**
   * Cleanup on unload
   */
  onunload() {
    this.unhookBookmarks();
  }
}
