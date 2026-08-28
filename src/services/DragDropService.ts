import { TFile, MarkdownView, Editor } from "obsidian";
import { PropertyOverFileNamePlugin } from "../types";
import { getFrontmatterSync } from "../utils/frontmatter";

export class DragDropService {
  private plugin: PropertyOverFileNamePlugin;
  private lastDropTime: number = 0;
  private lastDropData: string | null = null;
  private readonly DROP_DEBOUNCE_MS = 100; // Prevent duplicate processing within 100ms

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  /**
   * Returns true only when this drop is one the plugin claims, so the caller
   * knows whether to call preventDefault(). A drop of an image or any other
   * non-note file is not ours, and preventing default on it would stop
   * Obsidian from embedding the file at all.
   */
  handleDragDrop(event: DragEvent, editor: Editor): boolean {
    // CRITICAL: Capture dataTransfer synchronously in a local variable
    // The event.dataTransfer can become null/undefined after the event handler completes,
    // so we must capture it immediately and use the local reference
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return false;
    }

    // Get the dragged note from the event synchronously.
    // This must be done during the event, not in setTimeout.
    // Use the captured dataTransfer reference, not event.dataTransfer.
    const filePath = this.resolveDroppedNotePath(dataTransfer.getData('text/plain'));

    if (!filePath) {
      // Not a note drag. Most commonly an image or document being dropped in,
      // which Obsidian must be left to embed itself.
      return false;
    }

    // Prevent duplicate processing if both handlers fire for the same drop
    const now = Date.now();
    if (now - this.lastDropTime < this.DROP_DEBOUNCE_MS && this.lastDropData === filePath) {
      return false;
    }
    this.lastDropTime = now;
    this.lastDropData = filePath;

    // Find the file in the vault
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      return false;
    }

    // For .md files, use synchronous logic (fast, immediate)
    // For .mdx files, use async logic with retries (needs file reading)
    if (file.extension === 'md') {
      const displayName = this.getDisplayNameSync(file);
      if (displayName !== null) {
        // Immediate replacement for .md files (no retries needed)
        window.setTimeout(() => {
          this.replaceLastInsertedLink(file, displayName, editor);
        }, 50); // Short delay just to let Obsidian insert the link first
      }
    } else if (file.extension === 'mdx' && this.plugin.settings.enableMdxSupport) {
      // Async logic with retries for .mdx files
      void (async () => {
        const displayName = await this.getDisplayName(file);

        if (displayName !== null) {
          // Use multiple attempts with increasing delays to catch the link insertion
          let attempts = 0;
          const maxAttempts = 5;
          const attemptReplace = () => {
            attempts++;
            const replaced = this.replaceLastInsertedLink(file, displayName, editor);
            if (!replaced && attempts < maxAttempts) {
              window.setTimeout(attemptReplace, 50 * attempts); // Increasing delay: 50ms, 100ms, 150ms, etc.
            }
          };
          window.setTimeout(attemptReplace, 150); // Start after 150ms
        }
      })();
    } else {
      return false;
    }

    return true;
  }

  /**
   * Work out which note a drag payload refers to.
   *
   * The payload is not always a bare vault path. Depending on the vault's link
   * format Obsidian hands over a wikilink, a Markdown link, or an obsidian://
   * URL, and the previous code required the string to end in .md, so every one
   * of those forms was rejected and the drag was never handled at all.
   *
   * Returns the vault path of the note, or null when the drop is not a note
   * this plugin should touch.
   */
  private resolveDroppedNotePath(raw: string): string | null {
    if (!raw) return null;
    let text = raw.trim();

    // obsidian://open?vault=...&file=<path>
    if (text.startsWith('obsidian://')) {
      try {
        const fileParam = new URL(text).searchParams.get('file');
        if (fileParam) text = fileParam;
      } catch {
        return null;
      }
    }

    // [[path/to/note|Alias]] or [[path/to/note]]
    const wiki = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(text);
    if (wiki && wiki[1]) text = wiki[1];

    // [Label](path/to/note.md)
    const md = /^\[[^\]]*\]\(([^)]+)\)$/.exec(text);
    if (md && md[1]) text = md[1];

    text = decodeURIComponent(text.trim());
    if (!text) return null;

    // Resolve through Obsidian so a shortest-form link, a relative path or a
    // path without its extension all land on the same file.
    const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(text, '');
    const path = resolved ? resolved.path : text;

    const isMd = path.endsWith('.md');
    const isMdx = path.endsWith('.mdx') && this.plugin.settings.enableMdxSupport;
    return isMd || isMdx ? path : null;
  }

  handleDOMDrop(event: DragEvent): void {
    // Check if we're dropping on an editor
    // Use multiple methods to detect editor context, as closest() can fail
    // when dropping on cm-line elements that aren't fully attached to DOM (large vault lag)
    const target = event.target as HTMLElement;
    
    // Method 1: Try DOM traversal (works when element is fully attached)
    const editorElement = target?.closest('.cm-editor');
    
    // Method 2: Fallback - check if there's an active markdown view with an editor
    // This works even when DOM traversal fails due to timing/lag issues in large vaults
    const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const hasActiveEditor = activeView && activeView.editor;
    
    // We need at least one of these to be true to proceed
    if (!editorElement && !hasActiveEditor) {
      // Not dropping on an editor or no active editor available
      return;
    }
    
    // If closest() failed but we have an active editor, we can still proceed
    // The activeView.editor will be used later in the setTimeout

    // CRITICAL: Capture dataTransfer synchronously in a local variable
    // The event.dataTransfer can become null/undefined after the event handler completes,
    // so we must capture it immediately and use the local reference
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    // Get the file path from the drag event synchronously
    // This must be done during the event, not in setTimeout
    // Use the captured dataTransfer reference, not event.dataTransfer
    const filePath = dataTransfer.getData('text/plain');
    
    if (!filePath) {
      return;
    }

    // Parse Obsidian URL format: obsidian://open?vault=...&file=...
    let actualFilePath = filePath;
    if (filePath.startsWith('obsidian://open?')) {
      try {
        const url = new URL(filePath);
        const fileParam = url.searchParams.get('file');
        if (fileParam) {
          const decodedPath = decodeURIComponent(fileParam);
          // Obsidian URLs might not include the extension
          // Try to find the file with both .md and .mdx extensions
          if (decodedPath.endsWith('.mdx')) {
            // Already has .mdx extension
            actualFilePath = decodedPath;
          } else if (decodedPath.endsWith('.md')) {
            // Already has .md extension
            actualFilePath = decodedPath;
          } else {
            // No extension - try .mdx first if MDX support is enabled, then fall back to .md
            if (this.plugin.settings.enableMdxSupport) {
              const mdxFile = this.plugin.app.vault.getAbstractFileByPath(decodedPath + '.mdx');
              if (mdxFile) {
                actualFilePath = decodedPath + '.mdx';
              } else {
                actualFilePath = decodedPath + '.md';
              }
            } else {
              actualFilePath = decodedPath + '.md';
            }
          }
        } else {
          return;
        }
      } catch {
        return;
      }
    } else if (!filePath.endsWith('.md') && !(filePath.endsWith('.mdx') && this.plugin.settings.enableMdxSupport)) {
      return;
    }

    // Prevent duplicate processing if both handlers fire for the same drop
    const now = Date.now();
    if (now - this.lastDropTime < this.DROP_DEBOUNCE_MS && this.lastDropData === actualFilePath) {
      return;
    }
    this.lastDropTime = now;
    this.lastDropData = actualFilePath;

    // Find the file in the vault
    const file = this.plugin.app.vault.getAbstractFileByPath(actualFilePath);
    
    if (!file || !(file instanceof TFile)) {
      return;
    }

    // Get the display name from frontmatter (only if property exists)
    (() => {
      // For .md files, use synchronous logic (fast, immediate)
      // For .mdx files, use async logic with retries (needs file reading)
      if (file.extension === 'md') {
        const displayName = this.getDisplayNameSync(file);
        if (displayName !== null) {
          // Immediate replacement for .md files (no retries needed)
          window.setTimeout(() => {
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.editor) {
              this.replaceLastInsertedLink(file, displayName, activeView.editor);
            }
          }, 50); // Short delay just to let Obsidian insert the link first
        }
      } else if (file.extension === 'mdx' && this.plugin.settings.enableMdxSupport) {
        // Async logic with retries for .mdx files
        void (async () => {
          const displayName = await this.getDisplayName(file);
          
          if (displayName !== null) {
            // Use multiple attempts with increasing delays to catch the link insertion
            let attempts = 0;
            const maxAttempts = 5;
            const attemptReplace = () => {
              attempts++;
              const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
              if (activeView && activeView.editor) {
                const replaced = this.replaceLastInsertedLink(file, displayName, activeView.editor);
                if (!replaced && attempts < maxAttempts) {
                  window.setTimeout(attemptReplace, 50 * attempts); // Increasing delay: 50ms, 100ms, 150ms, etc.
                }
              } else if (attempts < maxAttempts) {
                window.setTimeout(attemptReplace, 50 * attempts);
              }
            };
            window.setTimeout(attemptReplace, 150); // Start after 150ms
          }
        })();
      }
    })();
  }

  /**
   * Synchronous version for .md files (fast, immediate)
   */
  private getDisplayNameSync(file: TFile): string | null {
    if (file.extension !== 'md') {
      return null; // Only for .md files
    }

    const frontmatter = getFrontmatterSync(this.plugin.app, file, this.plugin.settings);
    
    if (frontmatter && frontmatter[this.plugin.settings.propertyKey] !== undefined && frontmatter[this.plugin.settings.propertyKey] !== null) {
      const propertyValue = String(frontmatter[this.plugin.settings.propertyKey]).trim();
      if (propertyValue !== '') {
        return propertyValue;
      }
    }

    return null; // No property - use default Obsidian behavior
  }

  /**
   * Async version for .mdx files (needs file reading)
   */
  private async getDisplayName(file: TFile): Promise<string | null> {
    const { getFrontmatter, isFileTypeSupported } = await import('../utils/frontmatter');
    
    // Skip unsupported file types
    if (!isFileTypeSupported(file.extension, this.plugin.settings)) {
      return null;
    }

    const frontmatter = await getFrontmatter(this.plugin.app, file, this.plugin.settings);
    
    // Only return display name if the property exists and has a value
    // Return null if property doesn't exist (to indicate we should use default behavior)
    if (frontmatter && frontmatter[this.plugin.settings.propertyKey] !== undefined && frontmatter[this.plugin.settings.propertyKey] !== null) {
      const propertyValue = String(frontmatter[this.plugin.settings.propertyKey]).trim();
      if (propertyValue !== '') {
        return propertyValue; // Use frontmatter title
      }
    }

    return null; // No property - use default Obsidian behavior
  }

  private replaceLastInsertedLink(file: TFile, displayName: string, editor: Editor): boolean {
    const content = editor.getValue();
    const cursor = editor.getCursor();
    
    // Look for the most recently inserted link near the cursor
    const lines = content.split('\n');
    const currentLine = lines[cursor.line];
    
    // Find wiki links or markdown links on the current line
    // Updated regex to handle MDX files - they might have .mdx extension in the link
    // Note: markdown links can have empty brackets: [](file.mdx)
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g; // Allow empty brackets with *
    
    let match;
    let lastMatch = null;
    
    // Find the last wiki link on the current line
    while ((match = wikiLinkRegex.exec(currentLine)) !== null) {
      lastMatch = match;
    }
    
    if (lastMatch) {
      const linkPath = lastMatch[1];
      // Check if this link matches our file (with or without extension)
      const filePathWithoutExt = file.path.replace(/\.(md|mdx)$/, '');
      const linkPathWithoutExt = linkPath.replace(/\.(md|mdx)$/, '');
      
      if (filePathWithoutExt === linkPathWithoutExt || file.path === linkPath || file.path.replace(/\.mdx$/, '.md') === linkPath) {
        const newLinkText = `[[${linkPath}|${displayName}]]`;
        const startPos = { line: cursor.line, ch: lastMatch.index };
        const endPos = { line: cursor.line, ch: lastMatch.index + lastMatch[0].length };
        editor.replaceRange(newLinkText, startPos, endPos);
        return true;
      }
    }
    
    // Reset regex for markdown links
    markdownLinkRegex.lastIndex = 0;
    lastMatch = null;
    
    // Find the last markdown link on the current line
    while ((match = markdownLinkRegex.exec(currentLine)) !== null) {
      lastMatch = match;
    }
    
    if (lastMatch) {
      const linkUrl = lastMatch[2];
      const linkUrlDecoded = decodeURIComponent(linkUrl);
      // Check if this link matches our file
      const filePathEncoded = encodeURI(file.path);
      const filePathWithoutExt = file.path.replace(/\.(md|mdx)$/, '');
      const linkUrlWithoutExt = linkUrlDecoded.replace(/\.(md|mdx)$/, '');
      
      // Check various matching scenarios
      const matches = 
        file.path === linkUrlDecoded || 
        filePathEncoded === linkUrl ||
        filePathWithoutExt === linkUrlWithoutExt ||
        file.path.replace(/\.mdx$/, '.md') === linkUrlDecoded ||
        file.path.replace(/\.md$/, '.mdx') === linkUrlDecoded ||
        // Handle relative paths - check if link URL matches file basename
        file.basename === linkUrlDecoded.replace(/\.(md|mdx)$/, '') ||
        file.basename + '.mdx' === linkUrlDecoded ||
        file.basename + '.md' === linkUrlDecoded ||
        // Handle paths with directory
        file.path.endsWith(linkUrlDecoded) ||
        linkUrlDecoded.endsWith(file.path);
      
      if (matches) {
        const newLinkText = `[${displayName}](${linkUrl})`;
        const startPos = { line: cursor.line, ch: lastMatch.index };
        const endPos = { line: cursor.line, ch: lastMatch.index + lastMatch[0].length };
        editor.replaceRange(newLinkText, startPos, endPos);
        return true;
      }
    } else {
      // Try searching a few lines around the cursor
      const searchRange = 3;
      for (let i = Math.max(0, cursor.line - searchRange); i <= Math.min(lines.length - 1, cursor.line + searchRange); i++) {
        const line = lines[i];
        const wikiMatches = [...line.matchAll(/\[\[([^\]]+)\]\]/g)];
        const markdownMatches = [...line.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)];
        
        // Check wiki links
        for (const wikiMatch of wikiMatches) {
          const linkPath = wikiMatch[1];
          const filePathWithoutExt = file.path.replace(/\.(md|mdx)$/, '');
          const linkPathWithoutExt = linkPath.replace(/\.(md|mdx)$/, '');
          
          if (filePathWithoutExt === linkPathWithoutExt || file.path === linkPath || file.path.replace(/\.mdx$/, '.md') === linkPath) {
            const newLinkText = `[[${linkPath}|${displayName}]]`;
            const matchIndex = wikiMatch.index ?? 0;
            const startPos = { line: i, ch: matchIndex };
            const endPos = { line: i, ch: matchIndex + wikiMatch[0].length };
            editor.replaceRange(newLinkText, startPos, endPos);
            return true;
          }
        }
        
        // Check markdown links
        for (const mdMatch of markdownMatches) {
          const linkUrl = mdMatch[2];
          // Handle both relative paths (big-test.mdx) and full paths (posts/big-test.mdx)
          const linkUrlDecoded = decodeURIComponent(linkUrl);
          const filePathWithoutExt = file.path.replace(/\.(md|mdx)$/, '');
          const linkUrlWithoutExt = linkUrlDecoded.replace(/\.(md|mdx)$/, '');
          
          // Check various matching scenarios
          const matches = 
            file.path === linkUrlDecoded || 
            encodeURI(file.path) === linkUrl ||
            file.path.replace(/\.mdx$/, '.md') === linkUrlDecoded ||
            file.path.replace(/\.md$/, '.mdx') === linkUrlDecoded ||
            filePathWithoutExt === linkUrlWithoutExt ||
            // Handle relative paths - check if link URL matches file basename
            file.basename === linkUrlDecoded.replace(/\.(md|mdx)$/, '') ||
            file.basename + '.mdx' === linkUrlDecoded ||
            file.basename + '.md' === linkUrlDecoded ||
            // Handle paths with directory
            file.path.endsWith(linkUrlDecoded) ||
            linkUrlDecoded.endsWith(file.path);
          
          if (matches) {
            const newLinkText = `[${displayName}](${linkUrl})`;
            const matchIndex = mdMatch.index ?? 0;
            const startPos = { line: i, ch: matchIndex };
            const endPos = { line: i, ch: matchIndex + mdMatch[0].length };
            editor.replaceRange(newLinkText, startPos, endPos);
            return true;
          }
        }
      }
    }
    
    return false;
  }
}
