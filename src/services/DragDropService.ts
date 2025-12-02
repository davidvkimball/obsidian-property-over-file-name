import { TFile, MarkdownView, Editor } from "obsidian";
import { PropertyOverFileNamePlugin } from "../types";

export class DragDropService {
  private plugin: PropertyOverFileNamePlugin;

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  handleDragDrop(event: DragEvent, editor: Editor): void {
    // Get the file path from the drag event
    // When dragging from Obsidian file explorer, data is in text/plain format
    const filePath = event.dataTransfer?.getData('text/plain');
    
    if (!filePath || !filePath.endsWith('.md')) {
      return;
    }

    // Find the file in the vault
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      return;
    }

    // Get the display name from frontmatter (only if property exists)
    const displayName = this.getDisplayName(file);

    // Only replace link if the file has the property
    // Otherwise, let Obsidian use default behavior (no display text)
    if (displayName !== null) {
      // Don't prevent default - let Obsidian insert the default link first
      // Then we'll replace it with our custom display text
      // Use retry mechanism in case Obsidian hasn't finished inserting the link yet
      this.replaceLinkWithRetry(file, displayName, editor, 0);
    }
  }

  handleDOMDrop(event: DragEvent): void {
    // Check if we're dropping on an editor
    const target = event.target as HTMLElement;
    
    if (!target || !target.closest('.cm-editor')) {
      return;
    }

    // Get the file path from the drag event
    const filePath = event.dataTransfer?.getData('text/plain');
    
    if (!filePath) {
      return;
    }

    // Parse Obsidian URL format: obsidian://open?vault=...&file=...
    let actualFilePath = filePath;
    if (filePath.startsWith('obsidian://open?')) {
      const url = new URL(filePath);
      const fileParam = url.searchParams.get('file');
      if (fileParam) {
        actualFilePath = decodeURIComponent(fileParam) + '.md';
      } else {
        return;
      }
    } else if (!filePath.endsWith('.md')) {
      return;
    }

    // Find the file in the vault
    const file = this.plugin.app.vault.getAbstractFileByPath(actualFilePath);
    
    if (!file || !(file instanceof TFile)) {
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
          this.replaceLinkWithRetry(file, displayName, activeView.editor, 0);
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

  /**
   * Replace the last inserted link with custom display name
   * Returns true if replacement was successful, false otherwise
   */
  private replaceLastInsertedLink(file: TFile, displayName: string, editor: Editor): boolean {
    const content = editor.getValue();
    const cursor = editor.getCursor();
    
    // Look for the most recently inserted link near the cursor
    // Search a few lines around the cursor in case link was inserted on a different line
    const lines = content.split('\n');
    const searchRadius = 3;
    const startLine = Math.max(0, cursor.line - searchRadius);
    const endLine = Math.min(lines.length - 1, cursor.line + searchRadius);
    
    const filePathWithoutExt = file.path.replace('.md', '');
    
    // Find wiki links or markdown links near the cursor
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    
    let bestMatch: { match: RegExpMatchArray; line: number; type: 'wiki' | 'markdown' } | null = null;
    let bestDistance = Infinity;
    
    // Search lines around cursor for links matching the file
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const line = lines[lineNum];
      if (!line) continue;
      
      // Check for wiki links
      wikiLinkRegex.lastIndex = 0;
      let match;
      while ((match = wikiLinkRegex.exec(line)) !== null) {
        const linkPath = match[1].split('|')[0]; // Get path part (before | if display text exists)
        // Verify this link matches the file we're looking for
        if (linkPath === filePathWithoutExt) {
          const distance = Math.abs(lineNum - cursor.line);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = { match, line: lineNum, type: 'wiki' };
          }
        }
      }
      
      // Check for markdown links
      markdownLinkRegex.lastIndex = 0;
      while ((match = markdownLinkRegex.exec(line)) !== null) {
        const linkUrl = match[2];
        // Verify this link matches the file we're looking for
        // Try both encoded and decoded versions
        let matches = linkUrl === file.path;
        if (!matches) {
          try {
            matches = decodeURIComponent(linkUrl) === file.path;
          } catch (e) {
            // If decoding fails, ignore
          }
        }
        
        if (matches) {
          const distance = Math.abs(lineNum - cursor.line);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = { match, line: lineNum, type: 'markdown' };
          }
        }
      }
    }
    
    if (bestMatch) {
      const { match, line, type } = bestMatch;
      
      if (match.index === undefined) {
        return false;
      }
      
      if (type === 'wiki') {
        const linkPath = match[1].split('|')[0]; // Get path part
        const newLinkText = `[[${linkPath}|${displayName}]]`;
        const startPos = { line, ch: match.index };
        const endPos = { line, ch: match.index + match[0].length };
        editor.replaceRange(newLinkText, startPos, endPos);
      } else {
        // markdown link
        const linkUrl = match[2];
        const newLinkText = `[${displayName}](${linkUrl})`;
        const startPos = { line, ch: match.index };
        const endPos = { line, ch: match.index + match[0].length };
        editor.replaceRange(newLinkText, startPos, endPos);
        return true;
      }
    }
    
    return false; // Link not found
  }

  /**
   * Replace link with retry mechanism to handle race conditions
   * where Obsidian hasn't finished inserting the link yet
   */
  private replaceLinkWithRetry(file: TFile, displayName: string, editor: Editor, attempt: number): void {
    const maxAttempts = 3;
    const delay = 100; // 100ms between attempts

    if (attempt >= maxAttempts) {
      // Give up after max attempts
      return;
    }

    // Try to find and replace the link
    const found = this.replaceLastInsertedLink(file, displayName, editor);
    
    if (!found && attempt < maxAttempts - 1) {
      // Link not found yet, retry after delay
      setTimeout(() => {
        this.replaceLinkWithRetry(file, displayName, editor, attempt + 1);
      }, delay);
    }
  }
}
