import { TFile, App } from 'obsidian';
import { PluginSettings } from '../types';
import { getFrontmatter } from './frontmatter';

/**
 * Simple cache for frontmatter data to support sync contexts like graph view.
 * 
 * **What format is expected:**
 * It stores a Map where keys are file paths and values are either a `Record<string, unknown>` 
 * containing the parsed YAML frontmatter, or `null` if no frontmatter exists or parsing failed.
 * 
 * **Why it's separate from Obsidian's metadata cache:**
 * Obsidian's `metadataCache` specifically targets `.md` files. This plugin adds support for `.mdx` files,
 * which Obsidian treats as plain text. This separate cache allows us to store manually parsed
 * frontmatter for MDX files so it can be accessed synchronously in performance-critical contexts 
 * like the graph view's node rendering.
 * 
 * **Known limitations:**
 * - **Manual Parsing:** Uses a basic regex to extract frontmatter from MDX files, which might not 
 *   support all edge cases of YAML block detection that Obsidian's native parser handles.
 * - **Async Nature:** Population is asynchronous. Contexts requiring synchronous access (like graph nodes) 
 *   must handle `undefined` results by triggering an async load and relying on a future refresh.
 * - **Memory:** It resides entirely in memory and is invalidated on file modification or rename.
 */
class FrontmatterCache {
  private cache = new Map<string, Record<string, unknown> | null>();
  private pending = new Map<string, Promise<Record<string, unknown> | null>>();

  async get(app: App, file: TFile, settings: PluginSettings): Promise<Record<string, unknown> | null> {
    const key = file.path;

    // Return cached value if available
    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    // If already pending, wait for it
    if (this.pending.has(key)) {
      return await this.pending.get(key)!;
    }

    // Start reading
    const promise = getFrontmatter(app, file, settings);
    this.pending.set(key, promise);

    try {
      const result = await promise;
      this.cache.set(key, result);
      return result;
    } finally {
      this.pending.delete(key);
    }
  }

  getSync(key: string): Record<string, unknown> | null | undefined {
    return this.cache.get(key);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    this.pending.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }
}

// Global cache instance
export const frontmatterCache = new FrontmatterCache();
