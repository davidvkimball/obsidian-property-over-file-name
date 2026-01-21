import { TFile, App, parseYaml } from 'obsidian';
import { PluginSettings } from '../types';

/**
 * Get frontmatter from a file, supporting both .md (via metadata cache) and .mdx (via manual parsing)
 * 
 * This utility function handles the fact that Obsidian's metadataCache only works for .md files.
 * For .mdx files (when MDX support is enabled), we read the raw file content and parse the frontmatter manually.
 * 
 * @param app - Obsidian app instance
 * @param file - The file to get frontmatter from
 * @param settings - Plugin settings (to check enableMdxSupport)
 * @returns The frontmatter object, or null if not found/not supported
 */
export async function getFrontmatter(
  app: App,
  file: TFile,
  settings: PluginSettings
): Promise<Record<string, unknown> | null> {
  // For .md files, use Obsidian's metadata cache (fast and reliable)
  if (file.extension === 'md') {
    const fileCache = app.metadataCache.getFileCache(file);
    return fileCache?.frontmatter || null;
  }

  // For .mdx files, only process if MDX support is enabled
  if (file.extension === 'mdx' && settings.enableMdxSupport) {
    try {
      // Read raw file content (works for any file type)
      const content = await app.vault.read(file);

      // Extract frontmatter using regex (same format as .md files)
      // Match pattern: ---\n...content...\n--- (with or without trailing newline)
      const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
      const match = content.match(frontmatterRegex);

      if (match && match[1]) {
        const frontmatterText = match[1];
        // Parse YAML using Obsidian's parseYaml utility
        try {
          const parsed = parseYaml(frontmatterText) as Record<string, unknown> | null | undefined;
          return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (parseError) {
          console.error('MDX YAML parse error:', parseError);
          return null;
        }
      }

      return null;
    } catch (readError) {
      console.error('Error reading MDX file:', readError);
      return null;
    }
  }

  // For other file types or MDX when support is disabled, return null
  return null;
}

/**
 * Synchronous version that uses metadata cache for .md files
 * For .mdx files, returns null (use async version instead)
 * 
 * @param app - Obsidian app instance
 * @param file - The file to get frontmatter from
 * @param settings - Plugin settings (to check enableMdxSupport)
 * @returns The frontmatter object, or null if not found/not supported
 */
export function getFrontmatterSync(
  app: App,
  file: TFile,
  settings: PluginSettings
): Record<string, unknown> | null {
  // For .md files, use Obsidian's metadata cache
  if (file.extension === 'md') {
    const fileCache = app.metadataCache.getFileCache(file);
    return fileCache?.frontmatter || null;
  }

  // For .mdx files, we can't use sync version (need to read file)
  // Return null - caller should use async version if MDX support is needed
  if (file.extension === 'mdx' && settings.enableMdxSupport) {
    return null; // Indicates async version should be used
  }

  return null;
}

/**
 * Check if a file extension is supported based on settings
 * 
 * @param extension - File extension (without dot)
 * @param settings - Plugin settings
 * @returns True if the file type is supported
 */
export function isFileTypeSupported(extension: string, settings: PluginSettings): boolean {
  if (extension === 'md') {
    return true; // Always supported
  }
  if (extension === 'mdx') {
    return settings.enableMdxSupport;
  }
  return false;
}
