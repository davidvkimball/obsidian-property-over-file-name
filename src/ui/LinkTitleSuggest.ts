import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, MarkdownView, Notice, TFile, prepareFuzzySearch, prepareSimpleSearch, SearchResult, sortSearchResults } from 'obsidian';
import { SuggestionItem, CachedFileData, EditorSuggestInternal, SearchMatchReason, PropertyOverFileNamePlugin, VaultInternal, QuickSwitcherPluginInstance, AppInternal } from '../types';
import { buildFileCache } from '../utils/search';

export class LinkTitleSuggest extends EditorSuggest<SuggestionItem> {
  private plugin: PropertyOverFileNamePlugin;
  private fileCache: Map<string, CachedFileData> = new Map();
  private searchTimeout: number | null = null;
  private matchReasons: Map<string, SearchMatchReason> = new Map();

  constructor(plugin: PropertyOverFileNamePlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.buildFileCache();
  }

  open(): void {
    super.open();
    const el = (this as EditorSuggestInternal).suggestEl;
    if (el) {
      // Add scoping class to prevent CSS from affecting other suggestion systems
      el.addClass('property-over-filename-suggestion');
      
      if (!el.querySelector('.prompt-instructions')) {
        const instructions = el.createDiv({ cls: 'prompt-instructions' });
        instructions.createDiv({ cls: 'prompt-instruction' }).setText('Type # to link heading');
        instructions.createDiv({ cls: 'prompt-instruction' }).setText('Type ^ to link blocks');
        instructions.createDiv({ cls: 'prompt-instruction' }).setText('Type | to change display text');
      }
    }
    
    // Add keyboard navigation improvements
    this.addKeyboardNavigation();
  }

  private addKeyboardNavigation(): void {
    const el = (this as EditorSuggestInternal).suggestEl;
    if (!el) return;

    // Add escape key handling
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!this.plugin.settings.enableForLinking) return null;
    const line = editor.getLine(cursor.line).substring(0, cursor.ch);
    const match = /\[\[([^#^|\]]*)$/.exec(line);
    if (match) {
      return {
        start: { line: cursor.line, ch: line.lastIndexOf('[[') },
        end: cursor,
        query: match[1],
      };
    }
    return null;
  }

  buildFileCache(): void {
    this.fileCache = buildFileCache(
      this.app.vault.getMarkdownFiles(),
      this.app.metadataCache,
      this.plugin.settings.propertyKey
    );
  }

  updateFileCache(file: TFile): void {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    let displayName = file.basename;
    let isCustomDisplay = false;
    let aliases: string[] = [];

    if (frontmatter && frontmatter[this.plugin.settings.propertyKey] !== undefined && frontmatter[this.plugin.settings.propertyKey] !== null) {
      const propertyValue = String(frontmatter[this.plugin.settings.propertyKey]).trim();
      if (propertyValue !== '') {
        displayName = propertyValue;
        isCustomDisplay = true;
      }
    }

    if (frontmatter?.aliases) {
      aliases = Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [frontmatter.aliases];
      aliases = aliases.map(alias => String(alias).trim()).filter(alias => alias !== '');
    }

    this.fileCache.set(file.path, {
      file,
      displayName,
      aliases,
      lastModified: file.stat.mtime,
      isCustomDisplay
    });
  }

  getSuggestions(context: EditorSuggestContext): SuggestionItem[] {
    const query = context.query.trim();
    return this.performSearch(query);
  }

  private performSearch(query: string): SuggestionItem[] {
    // If no query, show all files
    if (!query || query.trim() === '') {
      const suggestions: SuggestionItem[] = [];
      for (const cachedData of this.fileCache.values()) {
        suggestions.push({ 
          file: cachedData.file, 
          display: cachedData.displayName, 
          isCustomDisplay: cachedData.isCustomDisplay 
        });
      }
      return suggestions;
    }

    // Use simple search for large vaults if enabled, otherwise use fuzzy search
    const search = this.plugin.settings.useSimpleSearch 
      ? prepareSimpleSearch(query)
      : prepareFuzzySearch(query);
    
    // Create a structure compatible with sortSearchResults
    interface SearchableSuggestion {
      item: SuggestionItem;
      match: SearchResult;
    }
    
    const searchableSuggestions: SearchableSuggestion[] = [];
    this.matchReasons.clear(); // Clear previous match reasons

    // Use cached data for much faster search
    for (const cachedData of this.fileCache.values()) {
      const { file, displayName, aliases, isCustomDisplay } = cachedData;
      
      // Track which fields caused the match
      const matchReason: SearchMatchReason = {
        matchedInTitle: false,
        matchedInFilename: false,
        matchedInAlias: false
      };
      
      // Primary match: search title/property first
      let primaryMatch = search(displayName);
      let bestMatch: SearchResult | null = primaryMatch;
      let matchType: 'title' | 'filename' | 'alias' | null = null;
      
      if (primaryMatch && primaryMatch.matches.length > 0) {
        matchReason.matchedInTitle = true;
        matchType = 'title';
      } else {
        // Secondary match: search filename (with downranking)
        if (this.plugin.settings.includeFilenameInSearch && file.basename !== displayName) {
          const filenameMatch = search(file.basename);
          if (filenameMatch && filenameMatch.matches.length > 0) {
            matchReason.matchedInFilename = true;
            // Downrank filename matches by -1
            bestMatch = { ...filenameMatch, score: filenameMatch.score - 1 };
            matchType = 'filename';
          }
        }
        
        // Tertiary match: search aliases (with downranking)
        if (!matchType && this.plugin.settings.includeAliasesInSearch && aliases.length > 0) {
          for (const alias of aliases) {
            const aliasMatch = search(alias);
            if (aliasMatch && aliasMatch.matches.length > 0) {
              matchReason.matchedInAlias = true;
              // Downrank alias matches by -1
              bestMatch = { ...aliasMatch, score: aliasMatch.score - 1 };
              matchType = 'alias';
              break;
            }
          }
        }
      }
      
      // If we have any match, add to results
      if (bestMatch && bestMatch.matches.length > 0) {
        const suggestion: SuggestionItem = { 
          file, 
          display: displayName, 
          isCustomDisplay 
        };
        searchableSuggestions.push({ item: suggestion, match: bestMatch });
        this.matchReasons.set(file.path, matchReason);
      }
    }

    // Add unresolved links if "Show existing only" is disabled
    // This matches Quick Switch ++ behavior: unresolved: !settings.showExistingOnly
    const quickSwitcherOptions = this.getQuickSwitcherOptions();
    const showExistingOnly = quickSwitcherOptions?.showExistingOnly ?? false;
    
    if (!showExistingOnly) {
      // Get unresolved links from metadata cache (like Quick Switch ++ does)
      const { unresolvedLinks } = this.app.metadataCache;
      const unresolvedSet = new Set<string>();
      
      // Collect all unresolved links from all files
      for (const sourcePath in unresolvedLinks) {
        const links = Object.keys(unresolvedLinks[sourcePath]);
        links.forEach(link => unresolvedSet.add(link));
      }
      
      // Search unresolved links and add matches
      for (const unresolved of unresolvedSet) {
        const unresolvedMatch = search(unresolved);
        if (unresolvedMatch && unresolvedMatch.matches.length > 0) {
          // Add as a suggestion without a file (unresolved link)
          searchableSuggestions.push({
            item: {
              display: unresolved,
              isCustomDisplay: false,
              // No file property means it's unresolved
            },
            match: unresolvedMatch
          });
        }
      }
    }

    // Use Obsidian's native sorting for exact vanilla compatibility
    sortSearchResults(searchableSuggestions);
    
    // Extract suggestions from sorted results
    let suggestions = searchableSuggestions.map(s => s.item);
    
    // Filter out unresolved links if "Show existing only" is enabled
    // Unresolved links are items without a file property
    if (showExistingOnly) {
      suggestions = suggestions.filter(s => s.file !== undefined);
    }

    // Link suggester should NOT show "create new note" option - that's Quick Switcher behavior
    // But if there are no matches and there's a query, show "No match found" like vanilla Obsidian
    if (suggestions.length === 0 && query) {
      suggestions.push({
        display: 'No match found',
        isCustomDisplay: false,
        isNoMatch: true
      });
    }
    
    return suggestions;
  }

  renderSuggestion(suggestion: SuggestionItem, el: HTMLElement): void {
    el.empty();
    
    if (suggestion.isNoMatch) {
      // For "No match found", show just the text
      el.setText(suggestion.display);
      return;
    }
    
    if (suggestion.file) {
      // Get the match reason for this file
      const matchReason = this.matchReasons.get(suggestion.file.path);
      const shouldShowIcon = matchReason && (matchReason.matchedInTitle || matchReason.matchedInFilename || matchReason.matchedInAlias);
      
      if (shouldShowIcon) {
        // Add mod-complex class to match Obsidian's structure
        el.addClass('mod-complex');

        // Create the main suggestion container
        const suggestionContent = el.createDiv({ cls: 'suggestion-content' });
        
        // Main title
        const titleEl = suggestionContent.createDiv({ cls: 'suggestion-title' });
        titleEl.setText(suggestion.display);
        
        // File path below
        const pathEl = suggestionContent.createDiv({ cls: 'suggestion-note' });
        pathEl.setText(suggestion.file.path.replace('.md', ''));
        
        // Add suggestion-aux with appropriate icon based on match reason
        const suggestionAux = el.createDiv({ cls: 'suggestion-aux' });
        const suggestionFlair = suggestionAux.createSpan({ 
          cls: 'suggestion-flair', 
          attr: { 'aria-label': this.getIconLabel(matchReason) } 
        });
        
        // Determine icon based on priority: title > file name > alias
        if (matchReason.matchedInTitle) {
          // Type icon for title/property matches
          this.createTypeIcon(suggestionFlair);
        } else if (matchReason.matchedInFilename) {
          // File icon for file name matches
          this.createFileIcon(suggestionFlair);
        } else if (matchReason.matchedInAlias) {
          // Arrow icon for alias matches
          this.createForwardIcon(suggestionFlair);
        }
      } else {
        // For normal file name results, show like default Obsidian (no icon)
        const content = el.createDiv({ cls: 'suggestion-content' });
        content.createDiv({ cls: 'suggestion-title', text: suggestion.display });
        content.createDiv({ cls: 'suggestion-note', text: suggestion.file.path.replace('.md', '') });
      }
    }
  }

  private getIconLabel(matchReason: SearchMatchReason): string {
    if (matchReason.matchedInTitle) {
      return 'Title/Property Match';
    } else if (matchReason.matchedInFilename) {
      return 'File Name Match';
    } else if (matchReason.matchedInAlias) {
      return 'Alias Match';
    }
    return 'Match';
  }

  private createTypeIcon(container: HTMLElement): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('svg-icon', 'lucide-type');
    
    const polyline1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline1.setAttribute('points', '4 7 4 4 20 4 20 7');
    svg.appendChild(polyline1);
    
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '9');
    line1.setAttribute('y1', '20');
    line1.setAttribute('x2', '15');
    line1.setAttribute('y2', '20');
    svg.appendChild(line1);
    
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '12');
    line2.setAttribute('y1', '4');
    line2.setAttribute('x2', '12');
    line2.setAttribute('y2', '20');
    svg.appendChild(line2);
    
    container.appendChild(svg);
  }

  private createFileIcon(container: HTMLElement): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('svg-icon', 'lucide-file-text');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z');
    svg.appendChild(path);
    
    const polyline1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline1.setAttribute('points', '14,2 14,8 20,8');
    svg.appendChild(polyline1);
    
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '16');
    line1.setAttribute('y1', '13');
    line1.setAttribute('x2', '8');
    line1.setAttribute('y2', '13');
    svg.appendChild(line1);
    
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '16');
    line2.setAttribute('y1', '17');
    line2.setAttribute('x2', '8');
    line2.setAttribute('y2', '17');
    svg.appendChild(line2);
    
    const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline2.setAttribute('points', '10,9 9,9 8,9');
    svg.appendChild(polyline2);
    
    container.appendChild(svg);
  }

  private createForwardIcon(container: HTMLElement): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('svg-icon', 'lucide-forward');
    
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '15 17 20 12 15 7');
    svg.appendChild(polyline);
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 18v-2a4 4 0 0 1 4-4h12');
    svg.appendChild(path);
    
    container.appendChild(svg);
  }

  private isUsingCustomProperty(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    const propertyValue = frontmatter?.[this.plugin.settings.propertyKey];
    return propertyValue !== undefined && propertyValue !== null && String(propertyValue).trim() !== '';
  }

  private isUsingAlias(file: TFile): boolean {
    // Check if this file has aliases and if we're currently searching
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    const aliases = frontmatter?.aliases;
    
    if (!aliases) return false;
    
    // For now, show alias icon if the file has aliases and we're not using a custom property
    const isUsingCustomProperty = this.isUsingCustomProperty(file);
    return !isUsingCustomProperty && aliases;
  }

  selectSuggestion(suggestion: SuggestionItem, evt: MouseEvent | KeyboardEvent): void {
    // Don't do anything for "No match found"
    if (suggestion.isNoMatch) {
      return;
    }
    
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || !this.context) return;
    const editor = activeView.editor;
    const { start, end } = this.context;
    const line = editor.getLine(start.line);
    let endPos = end;
    if (line.slice(end.ch, end.ch + 2) === ']]') {
      endPos = { line: end.line, ch: end.ch + 2 };
    }
    
    // Handle existing file
    if (!suggestion.file) {
      return;
    }
    
    const vault = this.app.vault as unknown as VaultInternal;
    const useMarkdownLinks = vault.getConfig?.('useMarkdownLinks') ?? false;
    let linkText: string;

    if (useMarkdownLinks) {
      linkText = `[${suggestion.display}](${encodeURI(suggestion.file.path)})`;
    } else {
      const linkPath = suggestion.file.path.replace('.md', '');
      linkText = `[[${linkPath}|${suggestion.display}]]`;
    }
    editor.replaceRange(linkText, { line: start.line, ch: start.ch }, endPos);
    const newCursorPos = start.ch + linkText.length;
    try {
      editor.setCursor({ line: start.line, ch: newCursorPos });
    } catch (error) {
      console.error('Error setting cursor:', error);
      new Notice('Error setting cursor position. Please check console for details.');
    }
  }
  
  private getQuickSwitcherOptions(): QuickSwitcherPluginInstance['options'] | null {
    try {
      // Access the internal Quick Switcher plugin the same way Quick Switch ++ does
      const internalPlugins = (this.app as unknown as AppInternal).internalPlugins;
      if (!internalPlugins) return null;
      
      const switcherPlugin = internalPlugins.getPluginById?.('switcher');
      if (!switcherPlugin || !switcherPlugin.instance) {
        return null;
      }

      return switcherPlugin.instance.options || null;
    } catch (error) {
      console.warn('Property Over Filename: Could not access Quick Switcher options:', error);
      return null;
    }
  }
}