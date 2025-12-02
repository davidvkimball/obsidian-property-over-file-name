import { TFile, MarkdownView, Editor } from "obsidian";
import { PropertyOverFileNamePlugin } from "../types";

export class DragDropService {
  private plugin: PropertyOverFileNamePlugin;
  private lastDropTime: number = 0;
  private lastDropData: string | null = null;
  private readonly DROP_DEBOUNCE_MS = 100; // Prevent duplicate processing within 100ms

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  handleDragDrop(event: DragEvent, editor: Editor): void {
    // CRITICAL: Capture dataTransfer synchronously in a local variable
    // The event.dataTransfer can become null/undefined after the event handler completes,
    // so we must capture it immediately and use the local reference
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      console.warn('[PropertyOverFileName] handleDragDrop: dataTransfer is undefined');
      return;
    }

    // Get the file path from the drag event synchronously
    // This must be done during the event, not in setTimeout
    // Use the captured dataTransfer reference, not event.dataTransfer
    const filePath = dataTransfer.getData('text/plain');
    
    if (!filePath || !filePath.endsWith('.md')) {
      return;
    }

    // Prevent duplicate processing if both handlers fire for the same drop
    const now = Date.now();
    if (now - this.lastDropTime < this.DROP_DEBOUNCE_MS && this.lastDropData === filePath) {
      console.log('[PropertyOverFileName] handleDragDrop: Ignoring duplicate drop event');
      return;
    }
    this.lastDropTime = now;
    this.lastDropData = filePath;

    // Find the file in the vault
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      console.warn('[PropertyOverFileName] handleDragDrop: File not found:', filePath);
      return;
    }

    // Get the display name from frontmatter (only if property exists)
    const displayName = this.getDisplayName(file);

    // Only replace link if the file has the property
    // Otherwise, let Obsidian use default behavior (no display text)
    if (displayName !== null) {
      // Don't prevent default - let Obsidian insert the default link first
      // Then we'll replace it with our custom display text
      setTimeout(() => {
        this.replaceLastInsertedLink(file, displayName, editor);
      }, 50);
    }
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
      console.warn('[PropertyOverFileName] handleDOMDrop: dataTransfer is undefined');
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
          actualFilePath = decodeURIComponent(fileParam) + '.md';
        } else {
          return;
        }
      } catch (e) {
        console.warn('[PropertyOverFileName] handleDOMDrop: Failed to parse obsidian:// URL:', e);
        return;
      }
    } else if (!filePath.endsWith('.md')) {
      return;
    }

    // Prevent duplicate processing if both handlers fire for the same drop
    const now = Date.now();
    if (now - this.lastDropTime < this.DROP_DEBOUNCE_MS && this.lastDropData === actualFilePath) {
      console.log('[PropertyOverFileName] handleDOMDrop: Ignoring duplicate drop event');
      return;
    }
    this.lastDropTime = now;
    this.lastDropData = actualFilePath;

    // Find the file in the vault
    const file = this.plugin.app.vault.getAbstractFileByPath(actualFilePath);
    
    if (!file || !(file instanceof TFile)) {
      console.warn('[PropertyOverFileName] handleDOMDrop: File not found:', actualFilePath);
      return;
    }

    // Get the display name from frontmatter (only if property exists)
    const displayName = this.getDisplayName(file);

    // Only replace link if the file has the property
    // Otherwise, let Obsidian use default behavior (no display text)
    if (displayName !== null) {
      // Don't prevent default - let Obsidian insert the default link first
      // Then we'll replace it with our custom display text
      setTimeout(() => {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.editor) {
          this.replaceLastInsertedLink(file, displayName, activeView.editor);
        }
      }, 50);
    }
  }

  private getDisplayName(file: TFile): string | null {
    const fileCache = this.plugin.app.metadataCache.getFileCache(file);
    const frontmatter = fileCache?.frontmatter;
    
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

  private replaceLastInsertedLink(file: TFile, displayName: string, editor: Editor): void {
    const content = editor.getValue();
    const cursor = editor.getCursor();
    
    // Look for the most recently inserted link near the cursor
    const lines = content.split('\n');
    const currentLine = lines[cursor.line];
    
    // Find wiki links or markdown links on the current line
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    
    let match;
    let lastMatch = null;
    
    // Find the last wiki link on the current line
    while ((match = wikiLinkRegex.exec(currentLine)) !== null) {
      lastMatch = match;
    }
    
    if (lastMatch) {
      const linkPath = lastMatch[1];
      const newLinkText = `[[${linkPath}|${displayName}]]`;
      const startPos = { line: cursor.line, ch: lastMatch.index };
      const endPos = { line: cursor.line, ch: lastMatch.index + lastMatch[0].length };
      editor.replaceRange(newLinkText, startPos, endPos);
      return;
    }
    
    // Reset regex for markdown links
    markdownLinkRegex.lastIndex = 0;
    
    // Find the last markdown link on the current line
    while ((match = markdownLinkRegex.exec(currentLine)) !== null) {
      lastMatch = match;
    }
    
    if (lastMatch) {
      const linkUrl = lastMatch[2];
      const newLinkText = `[${displayName}](${linkUrl})`;
      const startPos = { line: cursor.line, ch: lastMatch.index };
      const endPos = { line: cursor.line, ch: lastMatch.index + lastMatch[0].length };
      editor.replaceRange(newLinkText, startPos, endPos);
    }
  }
}
