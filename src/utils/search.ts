import { TFile, MetadataCache, App } from 'obsidian';
import { CachedFileData, PluginSettings } from '../types';
import { isFileTypeSupported } from './frontmatter';

export function fuzzyMatch(str: string, query: string): boolean {
  let i = 0;
  const lowerStr = str.toLowerCase();
  const lowerQuery = query.toLowerCase();
  for (const char of lowerQuery) {
    i = lowerStr.indexOf(char, i) + 1;
    if (i === 0) return false;
  }
  return true;
}

export function getMatchScore(display: string, query: string, basename: string, includeFilenameInSearch: boolean): number {
  let score = 0;
  const lowerDisplay = display.toLowerCase();
  const lowerBasename = basename.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  // Exact matches get highest score
  if (lowerDisplay === lowerQuery) score += 1000;
  else if (lowerBasename === lowerQuery) score += 900;
  
  // Starts with query gets high score
  else if (lowerDisplay.startsWith(lowerQuery)) score += 100;
  else if (includeFilenameInSearch && lowerBasename.startsWith(lowerQuery)) score += 80;
  
  // Contains query gets medium score
  else if (lowerDisplay.includes(lowerQuery)) score += 50;
  else if (includeFilenameInSearch && lowerBasename.includes(lowerQuery)) score += 30;
  
  // Word boundary matches get bonus
  const wordBoundaryRegex = new RegExp(`\\b${lowerQuery}`, 'i');
  if (wordBoundaryRegex.test(lowerDisplay)) score += 20;
  if (includeFilenameInSearch && wordBoundaryRegex.test(lowerBasename)) score += 15;
  
  // Penalty for very long names
  const lengthPenalty = Math.max(0, (display.length - query.length) * 0.1);
  score -= lengthPenalty;
  
  return Math.max(0, score);
}

export async function buildFileCache(
  files: TFile[], 
  metadataCache: MetadataCache,
  app: App,
  propertyKey: string,
  settings: PluginSettings
): Promise<Map<string, CachedFileData>> {
  const cache = new Map<string, CachedFileData>();
  const { getFrontmatter } = await import('./frontmatter');
  
  // Process files in parallel for better performance
  await Promise.all(files.map(async (file) => {
    // Skip unsupported file types
    if (!isFileTypeSupported(file.extension, settings)) {
      return;
    }

    // Use sync version for .md files, async for .mdx files
    let frontmatter: Record<string, unknown> | null;
    if (file.extension === 'md') {
      // For .md files, use metadata cache (fast sync access)
      const fileCache = app.metadataCache.getFileCache(file);
      frontmatter = fileCache?.frontmatter || null;
    } else {
      // MDX files need async reading
      frontmatter = await getFrontmatter(app, file, settings);
    }

    let displayName = file.basename;
    let isCustomDisplay = false;
    let aliases: string[] = [];

    if (frontmatter && frontmatter[propertyKey] !== undefined && frontmatter[propertyKey] !== null) {
      const propertyValueRaw = frontmatter[propertyKey];
      let propertyValue: string;
      if (typeof propertyValueRaw === 'string') {
        propertyValue = propertyValueRaw.trim();
      } else if (typeof propertyValueRaw === 'number' || typeof propertyValueRaw === 'boolean') {
        propertyValue = String(propertyValueRaw).trim();
      } else {
        // Skip objects/arrays - they can't be used as display names
        propertyValue = '';
      }
      if (propertyValue && propertyValue !== '') {
        displayName = propertyValue;
        isCustomDisplay = true;
      }
    }

    if (frontmatter?.aliases) {
      const aliasesRaw = frontmatter.aliases as unknown;
      aliases = Array.isArray(aliasesRaw) ? aliasesRaw.map(a => String(a)) : [String(aliasesRaw)];
      aliases = aliases.map(alias => alias.trim()).filter(alias => alias !== '');
    }

    cache.set(file.path, {
      file,
      displayName,
      aliases,
      lastModified: file.stat.mtime,
      isCustomDisplay
    });
  }));
  
  return cache;
}
