import { MarkdownView, TFile } from 'obsidian';
import { PropertyOverFileNamePlugin } from '../types';

/**
 * Backlink Service
 * 
 * Handles displaying property titles instead of file names in:
 * - Embedded backlinks (Linked mentions footer in each note)
 * - Dedicated backlinks panel
 * - Outgoing links
 */
export class BacklinkService {
  private plugin: PropertyOverFileNamePlugin;
  private observer?: MutationObserver;
  private processedElements: WeakSet<HTMLElement> = new WeakSet();
  private modifiedElements: WeakSet<HTMLElement> = new WeakSet();
  private originalTextContentDescriptors: Map<HTMLElement, PropertyDescriptor> = new Map();

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Get display name from file's frontmatter property
   */
  private async getDisplayName(file: TFile): Promise<string | null> {
    if (!this.plugin.settings.enableForBacklinks) {
      return null;
    }

    const { getFrontmatter, isFileTypeSupported } = await import('../utils/frontmatter');

    // Skip unsupported file types
    if (!isFileTypeSupported(file.extension, this.plugin.settings)) {
      return null;
    }

    const frontmatter = await getFrontmatter(this.plugin.app, file, this.plugin.settings);

    if (frontmatter && frontmatter[this.plugin.settings.propertyKey] !== undefined && frontmatter[this.plugin.settings.propertyKey] !== null) {
      const propertyValue = String(frontmatter[this.plugin.settings.propertyKey]).trim();
      if (propertyValue !== '') {
        return propertyValue;
      }
    }

    return null;
  }

  /**
   * Update all backlink displays
   */
  updateBacklinks(): void {
    if (!this.plugin.settings.enableForBacklinks) {
      this.stopObserving();
      return;
    }

    // Update embedded backlinks in all markdown views
    this.updateEmbeddedBacklinks();

    // Update dedicated backlinks panel
    void this.updateDedicatedBacklinksPanel();

    // Start observing for future changes
    this.startObserving();
  }

  /**
   * Update embedded backlinks in markdown views
   */
  private updateEmbeddedBacklinks(): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
      if (!(leaf.view instanceof MarkdownView)) {
        continue;
      }

      const embeddedBacklinks = leaf.view.containerEl.querySelector('.embedded-backlinks');
      if (embeddedBacklinks) {
        this.updateBacklinkContainer(embeddedBacklinks as HTMLElement);
      }
    }
  }

  /**
   * Update dedicated backlinks panel
   */
  private async updateDedicatedBacklinksPanel(): Promise<void> {
    const backlinksLeaves = this.plugin.app.workspace.getLeavesOfType('backlink');

    for (const leaf of backlinksLeaves) {
      await leaf.loadIfDeferred();

      if (leaf.view) {
        const container = (leaf.view as { containerEl?: HTMLElement }).containerEl;
        if (container) {
          // Find backlinks and outgoing links sections
          const backlinksContainer = container.querySelector('.backlinks-pane') || container.querySelector('.backlink-pane');
          if (backlinksContainer) {
            this.updateBacklinkContainer(backlinksContainer as HTMLElement);
          }

          // Also check for outgoing links
          const outgoingLinksContainer = container.querySelector('.outgoing-link-pane') || container.querySelector('.outgoing-links');
          if (outgoingLinksContainer) {
            this.updateBacklinkContainer(outgoingLinksContainer as HTMLElement);
          }
        }
      }
    }
  }

  /**
   * Extract file path from an element or its parent link
   */
  private extractFilePathFromElement(element: HTMLElement): TFile | null {
    const resolveFileFromPathLike = (rawPathLike: string): TFile | null => {
      let value = rawPathLike.trim();
      if (!value) return null;

      // Strip hash/query fragments from href-like values
      value = value.split('#')[0]?.split('?')[0] ?? value;

      // Normalize common Obsidian URL-ish prefixes
      if (value.startsWith('file://')) value = value.slice('file://'.length);
      if (value.startsWith('vault://')) value = value.slice('vault://'.length);

      // Handle app:// URLs by extracting pathname or `file` query param
      if (value.startsWith('app://') || value.startsWith('http://') || value.startsWith('https://')) {
        try {
          const url = new URL(value);
          const fileParam = url.searchParams.get('file');
          if (fileParam) {
            try {
              value = decodeURIComponent(fileParam);
            } catch {
              value = fileParam;
            }
          } else if (url.pathname) {
            value = url.pathname;
          }
        } catch {
          // Best-effort fallback to path-like parsing below
        }
      }

      // Decode any percent-encoding (relative paths can still be encoded)
      try {
        value = decodeURIComponent(value);
      } catch {
        // ignore decode errors
      }

      // Vault paths shouldn't start with `/` for `getAbstractFileByPath()`
      value = value.replace(/^\/+/, '');

      const lower = value.toLowerCase();
      const candidates: string[] = [];
      candidates.push(value);

      if (!lower.endsWith('.md') && !lower.endsWith('.mdx')) {
        candidates.push(`${value}.md`);
        if (this.plugin.settings.enableMdxSupport) {
          candidates.push(`${value}.mdx`);
        }
      }

      for (const candidate of candidates) {
        const file = this.plugin.app.vault.getAbstractFileByPath(candidate);
        if (file instanceof TFile) return file;
      }

      return null;
    };

    // Prefer `data-path` from the element, any ancestor, or a descendant.
    // Unlinked mentions sometimes render the filename text inside nested elements
    // while the actual `data-path` lives elsewhere in the row.
    const directDataPath = element.getAttribute('data-path');
    if (directDataPath) {
      const file = resolveFileFromPathLike(directDataPath);
      if (file) return file;
    }

    const ancestorWithDataPath = element.closest('[data-path]');
    if (ancestorWithDataPath) {
      const dataPath = ancestorWithDataPath.getAttribute('data-path');
      if (dataPath) {
        const file = resolveFileFromPathLike(dataPath);
        if (file) return file;
      }
    }

    const descendantWithDataPath = element.querySelector('[data-path]');
    if (descendantWithDataPath instanceof HTMLElement) {
      const dataPath = descendantWithDataPath.getAttribute('data-path');
      if (dataPath) {
        const file = resolveFileFromPathLike(dataPath);
        if (file) return file;
      }
    }

    // Try to find a link element (parent or child)
    const link = element.closest('a') || element.querySelector('a');
    if (link) {
      const href = link.getAttribute('href') ?? (link instanceof HTMLAnchorElement ? link.href : null);

      // Try data-href attribute (Obsidian sometimes uses this)
      const dataHref = link.getAttribute('data-href');
      if (dataHref) {
        const file = resolveFileFromPathLike(dataHref);
        if (file) return file;
      }

      if (href) {
        // Try obsidian:// URL format
        if (href.startsWith('obsidian://')) {
          try {
            const url = new URL(href);
            const fileParam = url.searchParams.get('file');
            if (fileParam) {
              const decodedPath = (() => {
                try {
                  return decodeURIComponent(fileParam);
                } catch {
                  return fileParam;
                }
              })();
              const file = resolveFileFromPathLike(decodedPath);
              if (file) return file;
            }
          } catch {
            // Ignore URL parsing errors
          }
        }

        // Try internal link format (e.g., ...#file/path/to/file)
        const internalLinkMatch = href.match(/#file\/([^?#]+)/);
        if (internalLinkMatch) {
          const filePath = (() => {
            try {
              return decodeURIComponent(internalLinkMatch[1]);
            } catch {
              return internalLinkMatch[1];
            }
          })();
          const file = resolveFileFromPathLike(filePath);
          if (file) return file;
        }

        // Finally, treat the href itself as a vault path-like string.
        const file = resolveFileFromPathLike(href);
        if (file) return file;
      }
    }

    // Try to match text content to a file path/basename
    const textContent = element.textContent?.trim();
    if (textContent) {
      // If the text looks like a path, try resolving it directly first.
      if (textContent.includes('/') || textContent.includes('\\')) {
        const resolved = resolveFileFromPathLike(textContent);
        if (resolved) return resolved;
      }

      // Otherwise treat it as a filename (with or without extension), and make collisions safe.
      const cleaned = textContent.replace(/\.(mdx|md)$/i, '').split(/[/\\]/).pop() ?? textContent;
      const basename = cleaned.trim();

      if (basename) {
        const allFiles = this.plugin.app.vault.getFiles().filter((f): f is TFile => {
          if (!(f instanceof TFile)) return false;
          if (f.extension === 'md') return true;
          return this.plugin.settings.enableMdxSupport && f.extension === 'mdx';
        });

        const matchingFiles = allFiles.filter(f => f.basename === basename);
        // If multiple files share the same basename (e.g. multiple `index.md`), don't guess.
        if (matchingFiles.length === 1) return matchingFiles[0];
      }
    }

    return null;
  }

  /**
   * Update a backlink container by replacing file names with property titles
   */
  private updateBacklinkContainer(container: HTMLElement): void {
    // Unlinked mentions are rendered as "search result match" spans and often do not
    // include `data-path` for the target note. In that case, the match text is usually
    // the backlinks target note's basename (e.g., `index`), so we can replace it using
    // the active file's property title (collision-safe).
    void (async () => {
      const activeFile = this.plugin.app.workspace.getActiveFile();
      if (!(activeFile instanceof TFile)) return;

      const displayName = await this.getDisplayName(activeFile);
      if (displayName === null) return; // property missing -> keep Obsidian default text

      const activeBasename = activeFile.basename;

      // Replace only the exact matched token.
      const matchTextEls = Array.from(
        container.querySelectorAll<HTMLElement>('.search-result-file-matched-text')
      );

      for (const el of matchTextEls) {
        const t = el.textContent?.trim();
        if (!t) continue;
        if (t === activeBasename || t === `${activeBasename}.md` || t === `${activeBasename}.mdx`) {
          el.textContent = displayName;
        }
      }
    })();

    // Find all potential file name elements in the container
    // Obsidian uses various selectors for backlink items
    const selectors = [
      '.tree-item-inner',
      '.backlink-title',
      '.backlink-file-link',
      '.outgoing-link-file-link',
      '.tree-item-self',
      '.nav-file-title',
      '[data-path]',
      'a.internal-link'
    ];

    const fileElements = new Set<HTMLElement>();

    // Collect all potential elements
    selectors.forEach(selector => {
      try {
        container.querySelectorAll(selector).forEach(el => {
          fileElements.add(el as HTMLElement);
        });
      } catch {
        // Ignore invalid selector errors
      }
    });

    fileElements.forEach((element) => {
      // Skip if already processed in this update cycle
      if (this.processedElements.has(element)) {
        return;
      }

      // Extract file from element
      const file = this.extractFilePathFromElement(element);
      if (file && file instanceof TFile) {
        this.updateElementWithFile(element, file);
      }
    });
  }

  /**
   * Update an element with file's display name
   */
  private updateElementWithFile(element: HTMLElement, file: TFile): void {
    void (async () => {
      const displayName = await this.getDisplayName(file);

      if (displayName === null) {
        // No property, use default behavior (file name)
        return;
      }

      // Mark as processed
      this.processedElements.add(element);
      element.setAttribute('data-pov-processed', 'true');

      // Find the text node or element that contains the file name
      const currentText = element.textContent?.trim() || '';
      const basename = file.basename;

      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Only touch text when it contains the note's basename or filename token(s).
      // For unlinked mentions, Obsidian often renders the basename inside a larger snippet,
      // so we do safe in-text token replacement instead of requiring exact equality.
      const escapedBasename = escapeRegExp(basename);
      const escapedFileName = escapeRegExp(file.name);

      // Replace bare basename when it's surrounded by non-alphanumeric chars and NOT followed by a dot
      // (avoids turning `index.html` into `Sample Folder-Based Post.html`).
      const bareBasenameTest = new RegExp(`(^|[^A-Za-z0-9])${escapedBasename}(?!\\\\.)(?=([^A-Za-z0-9]|$))`, 'i');
      const bareBasenameGlobal = new RegExp(`(^|[^A-Za-z0-9])${escapedBasename}(?!\\\\.)([^A-Za-z0-9]|$)`, 'gi');
      const fileNameGlobal = new RegExp(escapedFileName, 'g');

      const shouldUpdate =
        currentText.includes(file.name) ||
        bareBasenameTest.test(currentText) ||
        currentText.includes(`${basename}.md`) ||
        currentText.includes(`${basename}.mdx`);

      if (!shouldUpdate) return;

      const link = element.closest('a') || element.querySelector('a');
      const targetElement = link || element;

      const updateTextInElement = (el: HTMLElement): boolean => {
        if (!el) return false;
        let changed = false;

        try {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n: Node | null = walker.nextNode();
          while (n) {
            const textNode = n as Text;
            const before = textNode.textContent ?? '';
            if (!before) {
              n = walker.nextNode();
              continue;
            }

            let after = before;

            // Replace explicit filename first (e.g. `index.md` / `index.mdx`).
            if (after.includes(file.name)) {
              after = after.replace(fileNameGlobal, displayName);
            }

            // Replace bare basename tokens (e.g. `/index`, `_index_`, `index)`).
            after = after.replace(bareBasenameGlobal, (_match, p1: string, p2: string) => {
              // p2 is either a delimiter char or empty at end
              return `${p1}${displayName}${p2 ?? ''}`;
            });

            if (after !== before) {
              textNode.textContent = after;
              changed = true;
            }

            n = walker.nextNode();
          }
        } catch {
          // Best-effort: don't block other processing if DOM traversal fails
          return false;
        }

        return changed;
      };

      updateTextInElement(targetElement);
    })();
  }

  /**
   * Start observing DOM changes for backlinks
   */
  private startObserving(): void {
    if (this.observer) {
      return; // Already observing
    }

    // Override textContent on backlink elements to intercept immediately
    this.overrideBacklinkElements();

    let updateTimeout: ReturnType<typeof setTimeout> | null = null;

    this.observer = new MutationObserver((mutations) => {
      // Check if any mutations affect backlink containers
      let shouldUpdate = false;
      const newElements: HTMLElement[] = [];

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check for new elements that might be backlinks
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              const embeddedBacklinks = node.closest('.embedded-backlinks');
              const backlinksPanel = node.closest('.backlinks-pane, .backlink-pane, .outgoing-link-pane, .outgoing-links, .backlink-container');

              if (embeddedBacklinks || backlinksPanel) {
                shouldUpdate = true;
                // Find potential backlink elements in the new node
                const selectors = ['.tree-item-inner', '.backlink-title', '.backlink-file-link', '.outgoing-link-file-link', '.tree-item-self', '.nav-file-title', '[data-path]', 'a.internal-link'];
                selectors.forEach(selector => {
                  try {
                    const elements = node.querySelectorAll?.(selector);
                    elements?.forEach((el: Element) => {
                      if (el instanceof HTMLElement) {
                        newElements.push(el);
                      }
                    });
                  } catch {
                    // Ignore
                  }
                });
              }
            }
          }
        } else if (mutation.type === 'characterData') {
          const target = mutation.target;

          // Check if mutation is in a backlink container
          if (target instanceof HTMLElement) {
            const embeddedBacklinks = target.closest('.embedded-backlinks');
            const backlinksPanel = target.closest('.backlinks-pane, .backlink-pane, .outgoing-link-pane, .outgoing-links, .backlink-container');

            if (embeddedBacklinks || backlinksPanel) {
              shouldUpdate = true;
            }
          } else if (target.parentElement) {
            // Check parent element
            const embeddedBacklinks = target.parentElement.closest('.embedded-backlinks');
            const backlinksPanel = target.parentElement.closest('.backlinks-pane, .backlink-pane, .outgoing-link-pane, .outgoing-links, .backlink-container');

            if (embeddedBacklinks || backlinksPanel) {
              shouldUpdate = true;
            }
          }
        }
      }

      // Override new elements immediately and update them
      newElements.forEach(el => {
        this.overrideElementTextContent(el);
        // Also try to update immediately if we can extract the file
        const file = this.extractFilePathFromElement(el);
        if (file && file instanceof TFile) {
          this.updateElementWithFile(el, file);
        }
      });

      if (shouldUpdate) {
        // Clear processed elements cache when updating
        this.processedElements = new WeakSet();

        // Debounce updates to avoid excessive processing
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(() => {
          this.updateBacklinks();
          this.overrideBacklinkElements(); // Re-override in case new elements were added
          updateTimeout = null;
        }, 10); // Very short delay for faster updates
      }
    });

    // Observe the entire document for changes
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * Override textContent on all backlink elements
   */
  private overrideBacklinkElements(): void {
    const selectors = [
      '.tree-item-inner',
      '.backlink-title',
      '.backlink-file-link',
      '.outgoing-link-file-link',
      '.tree-item-self',
      '.nav-file-title',
      '[data-path]',
      'a.internal-link'
    ];

    const containers = [
      ...Array.from(document.querySelectorAll('.embedded-backlinks')),
      ...Array.from(document.querySelectorAll('.backlinks-pane')),
      ...Array.from(document.querySelectorAll('.backlink-pane')),
      ...Array.from(document.querySelectorAll('.outgoing-link-pane')),
      ...Array.from(document.querySelectorAll('.outgoing-links')),
      ...Array.from(document.querySelectorAll('.backlink-container'))
    ];

    containers.forEach(container => {
      selectors.forEach(selector => {
        try {
          container.querySelectorAll(selector).forEach(el => {
            if (el instanceof HTMLElement) {
              this.overrideElementTextContent(el);
            }
          });
        } catch {
          // Ignore invalid selector errors
        }
      });
    });
  }

  /**
   * Override textContent setter on an element to intercept Obsidian's updates
   */
  private overrideElementTextContent(element: HTMLElement): void {
    if (this.modifiedElements.has(element)) {
      return; // Already overridden
    }

    // Store original textContent descriptor if it exists
    const proto = Object.getPrototypeOf(element) as { textContent?: PropertyDescriptor };
    const originalDescriptor = Object.getOwnPropertyDescriptor(proto, 'textContent');

    if (originalDescriptor && originalDescriptor.set) {
      this.originalTextContentDescriptors.set(element, originalDescriptor);

      // Override textContent setter
      try {
        Object.defineProperty(element, 'textContent', {
          set: (value: string) => {
            // Check if this looks like a filename that should be replaced
            const file = this.extractFilePathFromElement(element);
            if (file && file instanceof TFile) {
              void (async () => {
                const displayName = await this.getDisplayName(file);
                if (displayName && (value === file.basename || value === file.name || value.endsWith(file.basename))) {
                  // Replace with property value using original setter
                  originalDescriptor.set!.call(element, displayName);
                  // Mark as processed
                  element.setAttribute('data-pov-processed', 'true');
                  this.processedElements.add(element);
                  return;
                }
                // Not a filename or no property, use original behavior
                originalDescriptor.set!.call(element, value);
              })();
              return;
            }

            // Not a filename or no property, use original behavior
            originalDescriptor.set!.call(element, value);
            // Mark as processed
            element.setAttribute('data-pov-processed', 'true');
          },
          // eslint-disable-next-line @typescript-eslint/unbound-method -- accessing property descriptor original setter
          get: originalDescriptor.get || (() => {
            // Fallback: access the native textContent property directly
            return Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'textContent')?.get?.call(element) as string || '';
          }),
          configurable: true,
          enumerable: true
        });
      } catch {
        // If override fails (e.g., property is not configurable), fall back to monitoring
        element.setAttribute('data-pov-processed', 'true');
      }
    } else {
      // Fallback: can't override, but mark as processed so CSS doesn't hide it
      // The mutation observer will catch and update it
      element.setAttribute('data-pov-processed', 'true');
    }

    this.modifiedElements.add(element);
  }

  /**
   * Stop observing DOM changes
   */
  private stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
  }

  /**
   * Handle layout changes
   */
  onLayoutChange(): void {
    if (this.plugin.settings.enableForBacklinks) {
      // Small delay to let Obsidian render first
      setTimeout(() => {
        this.updateBacklinks();
      }, 100);
    } else {
      this.stopObserving();
    }
  }

  /**
   * Handle file open events
   */
  onFileOpen(): void {
    if (this.plugin.settings.enableForBacklinks) {
      setTimeout(() => {
        this.updateEmbeddedBacklinks();
      }, 200);
    }
  }

  /**
   * Clean up on unload
   */
  onunload(): void {
    this.stopObserving();

    // Restore original textContent descriptors
    this.originalTextContentDescriptors.forEach((descriptor, element) => {
      try {
        Object.defineProperty(element, 'textContent', descriptor);
      } catch {
        // Ignore errors when restoring
      }
    });
    this.originalTextContentDescriptors.clear();
    this.modifiedElements = new WeakSet();
  }
}

