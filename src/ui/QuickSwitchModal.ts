import { App, FuzzySuggestModal, MarkdownView, Notice, TFile, prepareFuzzySearch, prepareSimpleSearch, FuzzyMatch, sortSearchResults, SearchResult, PaneType } from 'obsidian';
import { QuickSwitchItem, CachedFileData, SearchMatchReason, PropertyOverFileNamePlugin, WorkspaceInternal, QuickSwitcherPluginInstance, UnresolvedLinkItem, NewNoteItem, AppInternal } from '../types';
import { buildFileCache, isExcluded } from '../utils/search';
import { getFrontmatterSync } from '../utils/frontmatter';

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

    void this.buildFileCache();
    this.updateRecentFiles();
    this.addKeyboardNavigation();
    this.enableHoverAfterPointerMove();
    this.addFooter();

    // Only add scoping class when enabled
    if (this.plugin.settings.enableForQuickSwitcher) {
      this.containerEl.addClass('property-over-filename-modal');
    }
  }

  /**
   * Only let hover highlight a row once the pointer has actually moved. If the
   * switcher opens under a resting cursor, the row beneath it would otherwise
   * highlight exactly like the keyboard selection and two rows would look
   * selected at once. Moving the mouse afterwards behaves normally.
   */
  private enableHoverAfterPointerMove(): void {
    const activate = () => {
      this.containerEl.addClass('pofn-pointer-active');
      this.containerEl.removeEventListener('mousemove', activate);
    };
    this.containerEl.addEventListener('mousemove', activate);
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

    // The base SuggestModal only binds plain Enter. Without these the modifier
    // combinations never reach onChooseItem at all, so Ctrl+Enter,
    // Ctrl+Alt+Enter and Shift+Enter did nothing. Mod is Ctrl on Windows and
    // Linux and Cmd on macOS, matching the default quick switcher.
    this.scope.register(['Mod'], 'Enter', (evt) => {
      this.chooseSelected(evt);
      return false;
    });
    this.scope.register(['Mod', 'Alt'], 'Enter', (evt) => {
      this.chooseSelected(evt);
      return false;
    });
    this.scope.register(['Shift'], 'Enter', (evt) => {
      this.chooseSelected(evt);
      return false;
    });
    // Mod+Shift+Enter acts on what was typed, not on what is highlighted, so
    // it cannot go through chooseSelected like the others.
    this.scope.register(['Mod', 'Shift'], 'Enter', (evt) => {
      this.chooseFromQuery(evt);
      return false;
    });
  }

  /**
   * Mod+Shift+Enter opens an exact match in a new tab, and otherwise creates a
   * note named after the query in a new tab, which is what the core switcher
   * does. It deliberately ignores the highlighted row: typing "amz" while a
   * fuzzy result like "Amazing" is highlighted should create "amz", not open
   * the highlighted note.
   */
  private chooseFromQuery(evt: KeyboardEvent): void {
    const query = this.inputEl.value.trim();
    if (!query) {
      this.chooseSelected(evt);
      return;
    }

    const existing = this.findExactMatch(query);
    this.close();

    if (existing) {
      void this.app.workspace.getLeaf('tab').openFile(existing);
      return;
    }

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const sourcePath = activeView?.file?.path || '';
    void this.app.workspace.openLinkText(query, sourcePath, 'tab').catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Error creating note: ${message}`);
    });
  }

  /**
   * A note whose title, file name or alias is exactly the query. The file name
   * is always checked, even when it is excluded from search, so this can never
   * create a second note beside one that already carries that name.
   */
  private findExactMatch(query: string): TFile | null {
    const lower = query.toLowerCase();
    for (const { file, displayName, aliases } of this.fileCache.values()) {
      if (displayName.toLowerCase() === lower) return file;
      if (file.basename.toLowerCase() === lower) return file;
      if (this.plugin.settings.includeAliasesInSearch && aliases.some(a => a.toLowerCase() === lower)) return file;
    }
    return null;
  }

  /**
   * Hand the highlighted suggestion to onChooseItem along with the real
   * keyboard event, so the modifier branches there can act on it. `chooser` is
   * internal to SuggestModal and not in the public typings, so it is accessed
   * defensively: if it is ever missing the shortcut simply does nothing rather
   * than throwing inside a key handler.
   */
  private chooseSelected(evt: KeyboardEvent): void {
    const chooser = (this as unknown as {
      chooser?: { useSelectedItem?: (e: KeyboardEvent) => void };
    }).chooser;
    chooser?.useSelectedItem?.(evt);
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
        { command: 'ctrl shift ↵', action: 'to create in new tab' },
        { command: 'esc', action: 'to dismiss' }
      ];

      instructions.forEach(({ command, action }) => {
        const instruction = footer.createDiv({ cls: 'prompt-instruction' });
        instruction.createSpan({ cls: 'prompt-instruction-command', text: command });
        instruction.createSpan({ text: action });
      });
    }
  }

  async buildFileCache(): Promise<void> {
    const files = this.getFilteredFiles();
    this.fileCache = await buildFileCache(
      files,
      this.app.metadataCache,
      this.app,
      this.plugin.settings.propertyKey,
      this.plugin.settings
    );
  }

  private async updateFileCache(file: TFile): Promise<void> {
    const { getFrontmatter, isFileTypeSupported } = await import('../utils/frontmatter');

    // Keep non-note types such as canvas and base in the cache so they stay
    // searchable. They have no property to read, so they display under their
    // file name.
    if (!isFileTypeSupported(file.extension, this.plugin.settings)) {
      this.fileCache.set(file.path, {
        file,
        displayName: file.basename,
        aliases: [],
        lastModified: file.stat.mtime,
        isCustomDisplay: false
      });
      return;
    }

    const frontmatter = await getFrontmatter(this.app, file, this.plugin.settings);
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
      const aliasesRaw = frontmatter.aliases as unknown;
      aliases = Array.isArray(aliasesRaw) ? aliasesRaw.map(a => String(a)) : [String(aliasesRaw)];
      aliases = aliases.map(alias => alias.trim()).filter(alias => alias !== '');
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

    // Filter out excluded files unless behavior is 'ignore'
    const behavior = this.plugin.settings.quickSwitcherExcludedBehavior;
    if (behavior !== 'ignore') {
      recentFiles = recentFiles.filter(file => !isExcluded(file, this.app));
    }

    // Filter based on Quick Switcher settings BEFORE backfilling
    // Apply the same rules the suggestion list uses, so recents cannot show a
    // file type the switcher options exclude.
    const showAllFileTypes = quickSwitcherOptions?.showAllFileTypes ?? false;
    if (!showAllFileTypes) {
      recentFiles = recentFiles.filter(file =>
        showAttachments ? (this.isNoteFile(file) || this.isAttachment(file)) : this.isNoteFile(file)
      );
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
        // Notes only, matching the core switcher's default backfill.
        const allSupportedFiles = this.app.vault
          .getFiles()
          .filter((f): f is TFile => f instanceof TFile && this.isNoteFile(f));
        const behavior = this.plugin.settings.quickSwitcherExcludedBehavior;
        const additionalFiles = allSupportedFiles
          .filter(file => !existingPaths.has(file.path))
          .filter(file => behavior === 'ignore' || !isExcluded(file, this.app))
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

    // Mirror the core switcher exactly: notes by default, plus attachments or
    // every file type as its own options dictate.
    let files = this.app.vault
      .getFiles()
      .filter((f): f is TFile => f instanceof TFile && this.isNoteFile(f));

    if (quickSwitcherOptions?.showAllFileTypes) {
      // Every file in the vault, which is where canvas and base files appear.
      files = this.app.vault.getFiles().filter((file): file is TFile => file instanceof TFile);
    } else if (quickSwitcherOptions?.showAttachments) {
      files = this.app.vault
        .getFiles()
        .filter((file): file is TFile =>
          file instanceof TFile && (this.isNoteFile(file) || this.isAttachment(file))
        );
    }
    // If showAttachments is false or we can't access options, only show markdown files (and MDX if enabled)

    return files;
  }

  /**
   * What the core switcher lists by default, which is notes only. Canvas and
   * base files are not included here on purpose: core treats them as other
   * file types and reveals them through "Show all file types", so listing them
   * unconditionally would show more than core does.
   */
  private isNoteFile(file: TFile): boolean {
    const ext = file.extension.toLowerCase();
    if (ext === 'md') return true;
    return ext === 'mdx' && this.plugin.settings.enableMdxSupport;
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
    } catch {
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
    // Try to get from cache first (fast, works for both MD and MDX if cached)
    const cached = this.fileCache.get(file.path);
    if (cached) {
      return cached.displayName;
    }

    // Fallback: use sync version for .md files, or return basename for .mdx (will be cached async)
    const frontmatter = getFrontmatterSync(this.app, file, this.plugin.settings);

    if (frontmatter) {
      const propertyValue = frontmatter[this.plugin.settings.propertyKey];
      if (propertyValue !== undefined && propertyValue !== null) {
        const trimmed = typeof propertyValue === 'string' ? propertyValue.trim() : (typeof propertyValue === 'number' || typeof propertyValue === 'boolean' ? String(propertyValue) : '').trim();
        if (trimmed !== '') {
          return trimmed;
        }
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
      window.clearTimeout(this.searchTimeout);
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

      // Score the title, the file name and every alias, then keep the best.
      // Aliases used to be tried only when nothing else matched, so a fuzzy
      // file name hit could pre-empt an exact alias: searching FYI matched the
      // initials of "For Your Information" and the row then showed the file
      // name or title rather than the alias that was actually searched for.
      const candidates: { type: 'title' | 'filename' | 'alias'; result: SearchResult; alias?: string }[] = [];

      if (isCustomDisplay) {
        const titleMatch = search(displayName);
        if (titleMatch && titleMatch.matches.length > 0) {
          candidates.push({ type: 'title', result: titleMatch });
        }
      }

      // When the note has no property the display name is the file name, so
      // this doubles as the title search for those notes.
      if (this.plugin.settings.includeFilenameInSearch || !isCustomDisplay) {
        const filenameMatch = search(file.basename);
        if (filenameMatch && filenameMatch.matches.length > 0) {
          // Downranked so a title or alias hit of equal quality wins.
          candidates.push({ type: 'filename', result: { ...filenameMatch, score: filenameMatch.score - 1 } });
        }
      }

      if (this.plugin.settings.includeAliasesInSearch) {
        for (const alias of aliases) {
          const aliasMatch = search(alias);
          if (aliasMatch && aliasMatch.matches.length > 0) {
            candidates.push({ type: 'alias', result: { ...aliasMatch, score: aliasMatch.score - 1 }, alias });
          }
        }
      }

      // Let a non-note be found by its type, so "canvas" or "base" reaches
      // those files. Downranked further than the other fields so it never
      // outranks a real name match.
      if (!this.isNoteFile(file)) {
        const extMatch = search(file.extension.toLowerCase());
        if (extMatch && extMatch.matches.length > 0) {
          candidates.push({ type: 'filename', result: { ...extMatch, score: extMatch.score - 2 } });
        }
      }

      let bestMatch: SearchResult | null = null;
      for (const candidate of candidates) {
        if (bestMatch && candidate.result.score <= bestMatch.score) continue;
        bestMatch = candidate.result;
        matchReason.matchedInTitle = candidate.type === 'title';
        matchReason.matchedInFilename = candidate.type === 'filename';
        matchReason.matchedInAlias = candidate.type === 'alias';
        matchReason.matchedAliasText = candidate.type === 'alias' ? candidate.alias : undefined;
      }

      // If we have any match, add to results
      if (bestMatch && bestMatch.matches.length > 0) {
        // If query is empty, never show excluded files unless behavior is 'ignore'
        if (!searchQuery) {
          const behavior = this.plugin.settings.quickSwitcherExcludedBehavior;
          if (behavior !== 'ignore' && isExcluded(file, this.app)) {
            continue;
          }
        }

        results.push({ item: file, match: bestMatch });
        this.matchReasons.set(file.path, matchReason);
      }
    }

    // Add unresolved links if "Show existing only" is disabled
    // This matches Quick Switch ++ behavior: unresolved: !settings.showExistingOnly
    const quickSwitcherOptions = this.getQuickSwitcherOptions();
    const showExistingOnly = this.plugin.settings.hideUnresolvedLinks || (quickSwitcherOptions?.showExistingOnly ?? false);

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

      // Post-sort: move excluded files to the end (stable sort)
      const behavior = this.plugin.settings.quickSwitcherExcludedBehavior;
      if (behavior !== 'ignore') {
        results.sort((a, b) => {
          const aFile = a.item instanceof TFile ? a.item : null;
          const bFile = b.item instanceof TFile ? b.item : null;
          const aExcluded = aFile ? isExcluded(aFile, this.app) : false;
          const bExcluded = bFile ? isExcluded(bFile, this.app) : false;

          if (aExcluded && !bExcluded) return 1;
          if (!aExcluded && bExcluded) return -1;
          return 0;
        });
      }

      // Filter out unresolved links if "Show existing only" is enabled
      // Unresolved links are items with isUnresolved property, but keep "create new note" options
      let filteredResults = results;

      // Filter out excluded files if behavior is 'hide'
      if (behavior === 'hide') {
        filteredResults = filteredResults.filter(r => {
          return !(r.item instanceof TFile && isExcluded(r.item, this.app));
        });
      }
      if (showExistingOnly) {
        filteredResults = filteredResults.filter(r => {
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

      // Always add new note option if no results
      // "Show existing only" only affects showing unresolved links, not creating new notes
      if (filteredResults.length === 0 && searchQuery) {
        const newItem: NewNoteItem = { isNewNote: true, newName: searchQuery };
        filteredResults.push({
          item: newItem,
          match: { score: 1000, matches: [[0, searchQuery.length]] },
        });
      }

      return filteredResults.slice(0, this.limit);
    } catch {
      new Notice('Error updating quick switcher suggestions. Please check console for details.');
      return [];
    }
  }

  renderSuggestion(suggestion: FuzzyMatch<QuickSwitchItem['item']>, el: HTMLElement): void {
    const { item } = suggestion;

    // Check if this item is an excluded file
    if (item instanceof TFile && this.plugin.settings.quickSwitcherExcludedBehavior === 'deemphasize' && isExcluded(item, this.app)) {
      el.addClass('mod-excluded');
    }

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
      // Show the alias whenever the alias is what matched. This used to be
      // limited to notes without the property, so a note with a title showed
      // that title even though the query matched an alias.
      if (matchReason?.matchedInAlias && matchReason.matchedAliasText) {
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

    // Tag anything that is not a note with its extension, the way the core
    // switcher does, so a canvas, base or PDF is not mistaken for a note. Done
    // once here because the branches above build several different layouts.
    if (item instanceof TFile && !this.isNoteFile(item)) {
      const aux = el.querySelector('.suggestion-aux') ?? el.createDiv({ cls: 'suggestion-aux' });
      aux.createSpan({
        cls: 'suggestion-flair pofn-extension-flair',
        text: item.extension.toLowerCase()
      });
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
    const svg = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('svg-icon', 'lucide-type');

    const polyline1 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline1.setAttribute('points', '4 7 4 4 20 4 20 7');
    svg.appendChild(polyline1);

    const line1 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '9');
    line1.setAttribute('y1', '20');
    line1.setAttribute('x2', '15');
    line1.setAttribute('y2', '20');
    svg.appendChild(line1);

    const line2 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '12');
    line2.setAttribute('y1', '4');
    line2.setAttribute('x2', '12');
    line2.setAttribute('y2', '20');
    svg.appendChild(line2);

    container.appendChild(svg);
  }

  private createFileIcon(container: HTMLElement): void {
    const svg = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('svg-icon', 'lucide-file-text');

    const path = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z');
    svg.appendChild(path);

    const polyline1 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline1.setAttribute('points', '14,2 14,8 20,8');
    svg.appendChild(polyline1);

    const line1 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '16');
    line1.setAttribute('y1', '13');
    line1.setAttribute('x2', '8');
    line1.setAttribute('y2', '13');
    svg.appendChild(line1);

    const line2 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '16');
    line2.setAttribute('y1', '17');
    line2.setAttribute('x2', '8');
    line2.setAttribute('y2', '17');
    svg.appendChild(line2);

    const polyline2 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline2.setAttribute('points', '10,9 9,9 8,9');
    svg.appendChild(polyline2);

    container.appendChild(svg);
  }

  private createForwardIcon(container: HTMLElement): void {
    const svg = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('svg-icon', 'lucide-forward');

    const polyline = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '15 17 20 12 15 7');
    svg.appendChild(polyline);

    const path = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 18v-2a4 4 0 0 1 4-4h12');
    svg.appendChild(path);

    container.appendChild(svg);
  }

  private createFilePlusIcon(container: HTMLElement): void {
    const svg = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('svg-icon', 'lucide-file-plus');

    const path = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z');
    svg.appendChild(path);

    const polyline = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '14,2 14,8 20,8');
    svg.appendChild(polyline);

    const line1 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '12');
    line1.setAttribute('y1', '18');
    line1.setAttribute('x2', '12');
    line1.setAttribute('y2', '12');
    svg.appendChild(line1);

    const line2 = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
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
    const propertyValue = frontmatter?.[this.plugin.settings.propertyKey] as unknown;
    if (propertyValue === undefined || propertyValue === null) {
      return false;
    }
    const strValue = typeof propertyValue === 'string' ? propertyValue : (typeof propertyValue === 'number' || typeof propertyValue === 'boolean' ? String(propertyValue) : '');
    return strValue.trim() !== '';
  }

  private isUsingAlias(file: TFile): boolean {
    // Check if this file has aliases and if we're currently searching
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    const aliases = frontmatter?.aliases as unknown;

    if (!aliases) return false;

    // For now, show alias icon if the file has aliases and we're not using a custom property
    const isUsingCustomProperty = this.isUsingCustomProperty(file);
    return !isUsingCustomProperty && Boolean(aliases);
  }

  onChooseItem(item: QuickSwitchItem['item'], evt: MouseEvent | KeyboardEvent): void {
    // Handle unresolved links - create the file using openLinkText to respect new note location settings
    if ('isUnresolved' in item && item.isUnresolved) {
      const unresolvedText = item.unresolvedText;
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const sourcePath = activeView?.file?.path || '';

      // Use openLinkText which respects Obsidian's default new note location settings
      void this.app.workspace.openLinkText(unresolvedText, sourcePath).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        new Notice(`Error creating note: ${message}`);
      });
      return;
    }

    if ('isNewNote' in item) {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const sourcePath = activeView?.file?.path || '';

      // Honour the same modifiers used for opening an existing note, so
      // creating one lands where the core switcher would put it. Without a
      // pane argument a new note always replaced the current tab.
      const keyEvent = evt instanceof KeyboardEvent ? evt : null;
      const createModKey = !!keyEvent && (keyEvent.ctrlKey || keyEvent.metaKey);
      let newLeaf: PaneType | false = false;
      if (createModKey && keyEvent?.altKey) {
        newLeaf = 'split';
      } else if (createModKey) {
        newLeaf = 'tab';
      }

      // openLinkText respects Obsidian's default new note location settings.
      void this.app.workspace.openLinkText(item.newName, sourcePath, newLeaf).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        new Notice(`Error creating note: ${message}`);
      });
    } else if (item instanceof TFile) {
      // Handle different modifier keys like default Obsidian
      // Cmd stands in for Ctrl on macOS, matching the default quick switcher.
      const modKey = evt instanceof KeyboardEvent && (evt.ctrlKey || evt.metaKey);
      if (evt instanceof KeyboardEvent) {
        if (modKey && evt.altKey) {
          // Open to the right. This needs an explicit split; getLeaf(true) only
          // opens a new tab.
          const leaf = this.app.workspace.getLeaf('split', 'vertical');
          void leaf.openFile(item);
        } else if (modKey) {
          // Open in a new tab. getLeaf() with no argument returns the existing
          // leaf, which reopened the note in the current tab and looked like
          // nothing happened.
          void this.app.workspace.getLeaf('tab').openFile(item);
        } else if (evt.shiftKey) {
          // Create new note with the exact search query, like default quick switcher
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
          const sourcePath = activeView?.file?.path || '';
          const currentQuery = this.inputEl.value.trim();

          if (currentQuery) {
            void this.app.workspace.openLinkText(currentQuery, sourcePath).catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              new Notice(`Error creating note: ${message}`);
            });
          } else {
            // Default: open in current tab if search query is empty
            void this.app.workspace.getLeaf().openFile(item);
          }
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

