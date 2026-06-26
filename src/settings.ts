import { PluginSettings } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
  propertyKey: 'title',
  enableForLinking: true,
  enableForQuickSwitcher: true,
  includeFilenameInSearch: true,
  includeAliasesInSearch: true,
  enableForDragDrop: true,
  useSimpleSearch: false,
  enableForGraphView: true,
  enableForTabs: true,
  enableForExplorer: false,
  folderNoteFilename: '',
  enableForWindowFrame: true,
  enableForBookmarks: true,
  enableForProperties: true,
  enableMdxSupport: false,
  quickSwitcherExcludedBehavior: 'deemphasize',
  linkSuggesterExcludedBehavior: 'deemphasize',
  hideUnresolvedLinks: false,
};

export function validateSettings(settings: PluginSettings): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!settings.propertyKey || settings.propertyKey.trim() === '') {
    errors.push('Property key cannot be empty');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
