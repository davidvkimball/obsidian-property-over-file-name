import { TFile, App } from 'obsidian';
import { PluginSettings } from '../types';
import { getFrontmatter } from './frontmatter';

/**
 * Simple cache for frontmatter data to support sync contexts like graph view
 * This cache gets populated asynchronously when files are read
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
