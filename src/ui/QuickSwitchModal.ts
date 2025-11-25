import { App, FuzzySuggestModal, MarkdownView, Notice, TFile, prepareFuzzySearch, prepareSimpleSearch, FuzzyMatch, sortSearchResults, SearchResult } from 'obsidian';
import { QuickSwitchItem, CachedFileData, SearchMatchReason, PropertyOverFileNamePlugin, WorkspaceInternal, QuickSwitcherPluginInstance, UnresolvedLinkItem, NewNoteItem, AppInternal } from '../types';
import { buildFileCache } from '../utils/search';

export class QuickSwitchModal extends FuzzySuggestModal<QuickSwitchItem['item']> {
  private plugin: PropertyOverFileNamePlugin;
  private fileCache: Map<string, CachedFileData> = new Map();
  private recentFiles: TFile[] = [];
  private searchTimeout: number | null = null;
  private matchReasons: Map<string, SearchMatchReason> = new Map();

  constructor(app: App, plugin: PropertyOverFileNamePlugin) {
    super(app);
    this.plugin = plugin;
    this.limit = 8; // Limit to 8 items for comfortable display
    
    // Set placeholder based on setting
    if (this.plugin.settings.enableForQuickSwitcher) {
      this.setPlaceholder('Type to search notes by title or file name...');
    } else {
      this.setPlaceholder('Type to search files...');
    }
    
    this.buildFileCache();
    this.updateRecentFiles();
    this.addKeyboardNavigation();
    this.addFooter();
    
    // Only add scoping class when enabled
    if (this.plugin.settings.enableForQuickSwitcher) {
      this.containerEl.addClass('property-over-filename-modal');
    }
  }

  private addKeyboardNavigation(): void {
    // Add escape key handling
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  private addFooter(): void {
    // Find the .prompt container and add footer inside it
    const promptContainer = this.containerEl.querySelector('.prompt');
    if (promptContainer) {
      const footer = promptContainer.createDiv({ cls: 'prompt-instructions' });
      // Create navigation instructions using DOM API
      const instructions = [
        { command: '↑↓', action: 'to navigate' },
        { command: '↵', action: 'to open' },
        { command: 'ctrl ↵', action: 'to open in new tab' },
        { command: 'ctrl alt ↵', action: 'to open to the right' },
        { command: 'shift ↵', action: 'to create' },
        { command: 'esc', action: 'to dismiss' }
      ];
      
      instructions.forEach(({ command, action }) => {
        const instruction = footer.createDiv({ cls: 'prompt-instruction' });
        instruction.createSpan({ cls: 'prompt-instruction-command', text: command });
        instruction.createSpan({ text: action });
      });
    }
  }

  buildFileCache(): void {
    const files = this.getFilteredFiles();
    this.fileCache = buildFileCache(
      files,
      this.app.metadataCache,
      this.plugin.settings.propertyKey
    );
  }

  private updateFileCache(file: TFile): void {
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

  private updateRecentFiles(): void {
    // Use Obsidian's internal recent files mechanism for perfect compatibility
    let recentFiles: TFile[] = [];
    
    const workspace = this.app.workspace as unknown as WorkspaceInternal & { recentFileTracker?: { getLastOpenFiles(): string[] } };
    
    // Check Quick Switcher settings to determine what file types to include
    const quickSwitcherOptions = this.getQuickSwitcherOptions();
    const showAttachments = quickSwitcherOptions?.showAttachments ?? true;
    
    // Access Obsidian's recentFileTracker to get the same files as default quick switcher
    if (workspace.recentFileTracker?.getLastOpenFiles) {
      const lastOpenFiles = workspace.recentFileTracker.getLastOpenFiles();
      
      // Convert file paths to TFile objects
      recentFiles = lastOpenFiles
        .map((filePath: string) => this.app.vault.getAbstractFileByPath(filePath))
        .filter((file: unknown): file is TFile => file instanceof TFile);
    }
    
    // Fallback if recentFileTracker is not available
    if (recentFiles.length === 0) {
      const openFiles = this.app.workspace.getLeavesOfType('markdown')
        .map(leaf => leaf.view)
        .filter((view): view is MarkdownView => view instanceof MarkdownView)
        .map(view => view.file)
        .filter((file): file is TFile => file !== null)
        .filter((file, index, self) => self.indexOf(file) === index);
      
      recentFiles = [...openFiles];
    }
    
    // Filter based on Quick Switcher settings BEFORE backfilling
    if (!showAttachments) {
      // Filter out attachments - only show markdown files
      recentFiles = recentFiles.filter(file => file.extension === 'md');
    }
    
    // Always backfill to 8 items (or as many as available)
    const targetCount = 8;
    const existingPaths = new Set(recentFiles.map(f => f.path));
    
    if (recentFiles.length < targetCount) {
      if (showAttachments) {
        // Include all file types (markdown + attachments)
        const allFiles = this.app.vault.getFiles().filter((file): file is TFile => file instanceof TFile);
        const additionalFiles = allFiles
          .filter(file => !existingPaths.has(file.path))
          .slice(0, targetCount - recentFiles.length);
        recentFiles.push(...additionalFiles);
      } else {
        // Only markdown files
        const allMarkdownFiles = this.app.vault.getMarkdownFiles();
        const additionalFiles = allMarkdownFiles
          .filter(file => !existingPaths.has(file.path))
          .slice(0, targetCount - recentFiles.length);
        recentFiles.push(...additionalFiles);
      }
    }
    
    // Limit to 8 files
    this.recentFiles = recentFiles.slice(0, targetCount);
  }

  getItems(): QuickSwitchItem['item'][] {
    return this.getFilteredFiles();
  }

  private getFilteredFiles(): TFile[] {
    const quickSwitcherOptions = this.getQuickSwitcherOptions();
    
    // Start with markdown files
    let files = this.app.vault.getMarkdownFiles();
    
    // If we can access Quick Switcher options and attachments are enabled, include them
    if (quickSwitcherOptions?.showAttachments) {
      const allFiles = this.app.vault.getFiles().filter((file): file is TFile => file instanceof TFile);
      // Include markdown files and attachments
      files = allFiles.filter(file => 
        file.extension === 'md' || this.isAttachment(file)
      );
    }
    // If showAttachments is false or we can't access options, only show markdown files (default behavior)

    return files;
  }

  private isAttachment(file: TFile): boolean {
    const attachmentExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf', 'mp4', 'mp3', 'wav', 'ogg', 'webm'];
    return attachmentExtensions.includes(file.extension.toLowerCase());
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

  getItemText(item: QuickSwitchItem['item']): string {
    if ('isNewNote' in item) {
      return item.newName; // Just return the name, Obsidian will handle the "Enter to create" text
    }
    
    if ('isUnresolved' in item) {
      return item.unresolvedText;
    }
    
    // When disabled, show just the file name like default Obsidian
    if (!this.plugin.settings.enableForQuickSwitcher) {
      return item.basename;
    }
    
    const display = this.getDisplayName(item);
    return display;
  }

  getDisplayName(file: TFile): string {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    const propertyValue = frontmatter?.[this.plugin.settings.propertyKey];
    if (propertyValue !== undefined && propertyValue !== null) {
      const trimmed = String(propertyValue).trim();
      if (trimmed !== '') {
        return trimmed;
      }
    }
    return file.basename;
  }

  getSuggestions(query: string): FuzzyMatch<QuickSwitchItem['item']>[] {
    if (!this.plugin.settings.enableForQuickSwitcher) {
      // When disabled, use default Obsidian behavior - show all files with default search
      const searchQuery = query.trim();
      
      if (!searchQuery) {
        // Show recent files like default Obsidian
        return this.getRecentFilesResults();
      }
      
      // Use default Obsidian search - just show files with file name matching
      const files = this.getFilteredFiles();
      const search = this.plugin.settings.useSimpleSearch 
        ? prepareSimpleSearch(searchQuery)
        : prepareFuzzySearch(searchQuery);
      const results: FuzzyMatch<QuickSwitchItem['item']>[] = [];
      
      for (const file of files) {
        const match = search(file.basename) ?? { score: 0, matches: [] };
        if (match.matches.length > 0) {
          results.push({ item: file, match });
        }
      }
      
      // Use Obsidian's native sorting for exact vanilla compatibility
      sortSearchResults(results);
      
      // Always add new note option if no results
      // "Show existing only" only affects showing unresolved links, not creating new notes
      if (results.length === 0) {
        const newItem: NewNoteItem = { isNewNote: true, newName: searchQuery };
        results.push({
          item: newItem,
          match: { score: 1000, matches: [[0, searchQuery.length]] },
        });
      }
      
      return results.slice(0, this.limit);
    }

    const searchQuery = query.trim();
    
    // Clear previous timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // If no query, show recent files
    if (!searchQuery) {
      return this.getRecentFilesResults();
    }

    return this.performSearch(searchQuery);
  }

  private getRecentFilesResults(): FuzzyMatch<QuickSwitchItem['item']>[] {
    // Update recent files (this already handles filtering and backfilling)
    this.updateRecentFiles();
    
    // Clear match reasons for recent files since they're not search results
    this.matchReasons.clear();
    
    // Return the recent files (already filtered and backfilled in updateRecentFiles)
    return this.recentFiles.map(file => ({
      item: file,
      match: { score: 1000, matches: [] }
    }));
  }

  private performSearch(searchQuery: string): FuzzyMatch<QuickSwitchItem['item']>[] {
    // Use simple search for large vaults if enabled, otherwise use fuzzy search
    const search = this.plugin.settings.useSimpleSearch 
      ? prepareSimpleSearch(searchQuery)
      : prepareFuzzySearch(searchQuery);
    const results: FuzzyMatch<QuickSwitchItem['item']>[] = [];
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
      
      // Primary match: search title/property first (only if note has custom display)
      let primaryMatch: SearchResult | null = null;
      let bestMatch: SearchResult | null = null;
      let matchType: 'title' | 'filename' | 'alias' | null = null;
      
      if (isCustomDisplay) {
        // Only search title/property if note actually has a custom property
        primaryMatch = search(displayName);
        if (primaryMatch && primaryMatch.matches.length > 0) {
          matchReason.matchedInTitle = true;
          bestMatch = primaryMatch;
          matchType = 'title';
        }
      }
      
      // If no title match (or note doesn't have property), search filename
      if (!matchType) {
        // Search filename if it's different from displayName, or if note doesn't have property
        if (this.plugin.settings.includeFilenameInSearch && file.basename !== displayName) {
          const filenameMatch = search(file.basename);
          if (filenameMatch && filenameMatch.matches.length > 0) {
            matchReason.matchedInFilename = true;
            // Downrank filename matches by -1
            bestMatch = { ...filenameMatch, score: filenameMatch.score - 1 };
            matchType = 'filename';
          }
        } else if (!isCustomDisplay) {
          // If note doesn't have property, displayName equals filename, so search filename
          const filenameMatch = search(file.basename);
          if (filenameMatch && filenameMatch.matches.length > 0) {
            matchReason.matchedInFilename = true;
            bestMatch = filenameMatch;
            matchType = 'filename';
          }
        }
      }
      
      // Tertiary match: search aliases (with downranking)
      if (!matchType && this.plugin.settings.includeAliasesInSearch && aliases.length > 0) {
        for (const alias of aliases) {
          const aliasMatch = search(alias);
          if (aliasMatch && aliasMatch.matches.length > 0) {
            matchReason.matchedInAlias = true;
            matchReason.matchedAliasText = alias; // Store which alias matched
            // Downrank alias matches by -1
            bestMatch = { ...aliasMatch, score: aliasMatch.score - 1 };
            matchType = 'alias';
            break;
          }
        }
      }
      
      // If we have any match, add to results
      if (bestMatch && bestMatch.matches.length > 0) {
        results.push({ item: file, match: bestMatch });
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
          // Use a special object to represent unresolved links
          const unresolvedItem: UnresolvedLinkItem = { isUnresolved: true, unresolvedText: unresolved };
          results.push({
            item: unresolvedItem,
            match: unresolvedMatch
          });
        }
      }
    }

    try {
      // Use Obsidian's native sorting for exact vanilla compatibility
      sortSearchResults(results);
      
      // Filter out unresolved links if "Show existing only" is enabled
      // Unresolved links are items with isUnresolved property, but keep "create new note" options
      let filteredResults = results;
      if (showExistingOnly) {
        filteredResults = results.filter(r => {
          // Keep files and new note items, filter out unresolved links
          return r.item instanceof TFile || ('isNewNote' in r.item && r.item.isNewNote === true);
        });
      }

      // Check for exact matches in existing files
      const lowerQuery = searchQuery.toLowerCase();
      let exactMatch = filteredResults.some(r => 
        r.item instanceof TFile && (
          this.getDisplayName(r.item).toLowerCase() === lowerQuery ||
          (this.plugin.settings.includeFilenameInSearch && r.item.basename.toLowerCase() === lowerQuery) ||
          (this.plugin.settings.includeAliasesInSearch && this.fileCache.get(r.item.path)?.aliases.some(alias => alias.toLowerCase() === lowerQuery))
        )
      );
      
      // Also check unresolved links if they're being shown
      if (!showExistingOnly && !exactMatch) {
        const { unresolvedLinks } = this.app.metadataCache;
        const unresolvedSet = new Set<string>();
        for (const sourcePath in unresolvedLinks) {
          const links = Object.keys(unresolvedLinks[sourcePath]);
          links.forEach(link => unresolvedSet.add(link));
        }
        // Check if query exactly matches any unresolved link
        exactMatch = Array.from(unresolvedSet).some(link => link.toLowerCase() === lowerQuery);
      }

      // Always add new note option if no exact match exists
      // "Show existing only" only affects showing unresolved links, not creating new notes
      if (!exactMatch && searchQuery) {
        const newItem: NewNoteItem = { isNewNote: true, newName: searchQuery };
        filteredResults.unshift({
          item: newItem,
          match: { score: 1000, matches: [[0, searchQuery.length]] },
        });
      }

      return filteredResults.slice(0, this.limit);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      new Notice('Error updating quick switcher suggestions. Please check console for details.');
      return [];
    }
  }

  renderSuggestion(suggestion: FuzzyMatch<QuickSwitchItem['item']>, el: HTMLElement): void {
    const { item } = suggestion;
    
    // Handle unresolved links - show file-plus icon instead of "Enter to create" text
    if ('isUnresolved' in item && item.isUnresolved) {
      const unresolvedText = item.unresolvedText;
      el.empty();
      el.addClass('mod-complex');
      const suggestionContent = el.createDiv({ cls: 'suggestion-content' });
      const suggestionTitle = suggestionContent.createDiv({ cls: 'suggestion-title' });
      suggestionTitle.setText(unresolvedText);
      const suggestionAux = el.createDiv({ cls: 'suggestion-aux' });
      const suggestionFlair = suggestionAux.createSpan({ 
        cls: 'suggestion-flair', 
        attr: { 'aria-label': 'Unresolved link - Enter to create' } 
      });
      this.createFilePlusIcon(suggestionFlair);
      return;
    }
    
    const text = this.getItemText(item);
    
    if ('isNewNote' in item) {
      // For new notes, use the exact HTML structure from default Obsidian
      el.empty();
      el.addClass('mod-complex');
      
      // Main suggestion content
      const suggestionContent = el.createDiv({ cls: 'suggestion-content' });
      const suggestionTitle = suggestionContent.createDiv({ cls: 'suggestion-title' });
      suggestionTitle.setText(text);
      
      // Add "Enter to create" text on the right using the correct class
      const suggestionAux = el.createDiv({ cls: 'suggestion-aux' });
      const suggestionAction = suggestionAux.createSpan({ cls: 'suggestion-action' });
      suggestionAction.setText('Enter to create');
      
      return;
    }

    // When disabled, use default Obsidian styling (no custom classes or icons)
    if (!this.plugin.settings.enableForQuickSwitcher) {
      // Use default Obsidian single-line display
      if (item instanceof TFile) {
        el.setText(item.path.replace('.md', ''));
      } else {
        el.setText(text);
      }
    } else {
      // When enabled, use our custom styling with icons
      // Only show icons for TFile items, not unresolved links
      if (!(item instanceof TFile)) {
        el.setText(text);
        return;
      }
      
      // Check if this file has a custom property
      const cachedData = this.fileCache.get(item.path);
      const isCustomDisplay = cachedData?.isCustomDisplay ?? false;
      const matchReason = this.matchReasons.get(item.path);
      
      // Special case: notes without property that matched via alias should show alias with icon
      if (!isCustomDisplay && matchReason?.matchedInAlias && matchReason.matchedAliasText) {
        // Show alias as main text, filename below, with alias icon (like default Obsidian)
        el.addClass('mod-complex');
        const suggestionContent = el.createDiv({ cls: 'suggestion-content' });
        
        // Main title - show the alias that matched
        const titleEl = suggestionContent.createDiv({ cls: 'suggestion-title' });
        titleEl.setText(matchReason.matchedAliasText);
        
        // File path below
        const pathEl = suggestionContent.createDiv({ cls: 'suggestion-note' });
        pathEl.setText(item.path.replace('.md', ''));
        
        // Add suggestion-aux with alias icon
        const suggestionAux = el.createDiv({ cls: 'suggestion-aux' });
        const suggestionFlair = suggestionAux.createSpan({ 
          cls: 'suggestion-flair', 
          attr: { 'aria-label': 'Alias Match' } 
        });
        this.createForwardIcon(suggestionFlair);
      } else if (isCustomDisplay) {
        // Notes with the property - keep existing behavior
        const shouldShowIcon = matchReason && (matchReason.matchedInTitle || matchReason.matchedInFilename || matchReason.matchedInAlias);
        
        if (shouldShowIcon) {
          // Add mod-complex class to match Obsidian's structure
          el.addClass('mod-complex');

          // Create the main suggestion container
          const suggestionContent = el.createDiv({ cls: 'suggestion-content' });
          
          // Main title
          const titleEl = suggestionContent.createDiv({ cls: 'suggestion-title' });
          titleEl.setText(text);
          
          // File path below
          const pathEl = suggestionContent.createDiv({ cls: 'suggestion-note' });
          pathEl.setText(item.path.replace('.md', ''));
          
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
          // Note has property but no match reason (e.g., recent files)
          // Show complex layout with icon if using property-based title
          el.addClass('mod-complex');
          const suggestionContent = el.createDiv({ cls: 'suggestion-content' });
          const titleEl = suggestionContent.createDiv({ cls: 'suggestion-title' });
          titleEl.setText(text);
          const pathEl = suggestionContent.createDiv({ cls: 'suggestion-note' });
          pathEl.setText(item.path.replace('.md', ''));
          
          // Show "T" icon for property-based titles
          const suggestionAux = el.createDiv({ cls: 'suggestion-aux' });
          const suggestionFlair = suggestionAux.createSpan({ 
            cls: 'suggestion-flair', 
            attr: { 'aria-label': 'Property-based title' } 
          });
          this.createTypeIcon(suggestionFlair);
        }
      } else {
        // For notes without the property (and not matched via alias), show simple display (no icon, no duplicate name)
        el.setText(text);
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

  private createFilePlusIcon(container: HTMLElement): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('svg-icon', 'lucide-file-plus');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z');
    svg.appendChild(path);
    
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '14,2 14,8 20,8');
    svg.appendChild(polyline);
    
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '12');
    line1.setAttribute('y1', '18');
    line1.setAttribute('x2', '12');
    line1.setAttribute('y2', '12');
    svg.appendChild(line1);
    
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '9');
    line2.setAttribute('y1', '15');
    line2.setAttribute('x2', '15');
    line2.setAttribute('y2', '15');
    svg.appendChild(line2);
    
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

  onChooseItem(item: QuickSwitchItem['item'], evt: MouseEvent | KeyboardEvent): void {
    // Handle unresolved links - create the file using openLinkText to respect new note location settings
    if ('isUnresolved' in item && item.isUnresolved) {
      const unresolvedText = item.unresolvedText;
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const sourcePath = activeView?.file?.path || '';
      
      // Use openLinkText which respects Obsidian's default new note location settings
      void this.app.workspace.openLinkText(unresolvedText, sourcePath).catch((err) => {
        new Notice(`Error creating note: ${err.message}`);
      });
      return;
    }
    
    if ('isNewNote' in item) {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const sourcePath = activeView?.file?.path || '';
      
      // Use openLinkText which respects Obsidian's default new note location settings
      void this.app.workspace.openLinkText(item.newName, sourcePath).catch((err) => {
        new Notice(`Error creating note: ${err.message}`);
      });
    } else if (item instanceof TFile) {
      // Handle different modifier keys like default Obsidian
      if (evt instanceof KeyboardEvent) {
        if (evt.ctrlKey && evt.altKey) {
          // Open to the right
          const leaf = this.app.workspace.getLeaf(true);
          void leaf.openFile(item);
        } else if (evt.ctrlKey) {
          // Open in new tab
          void this.app.workspace.getLeaf().openFile(item);
        } else if (evt.shiftKey) {
          // Create new note (this shouldn't happen for existing files, but keeping for consistency)
          void this.app.workspace.getLeaf().openFile(item);
        } else {
          // Default: open in current tab
          void this.app.workspace.getLeaf().openFile(item);
        }
      } else {
        // Mouse click: default behavior
        void this.app.workspace.getLeaf().openFile(item);
      }
    }
  }
}

