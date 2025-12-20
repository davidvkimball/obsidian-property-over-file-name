import { App, PluginSettingTab } from 'obsidian';
import { PropertyOverFileNamePlugin } from '../types';
import { createSettingsGroup } from '../utils/settings-compat';

export class SettingTab extends PluginSettingTab {
  plugin: PropertyOverFileNamePlugin;

  constructor(app: App, plugin: PropertyOverFileNamePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    // Add scoping class to prevent CSS from affecting other settings
    containerEl.addClass('property-over-filename-settings');

    // Create a single settings group with no heading (following UI Tweaker pattern)
    const generalGroup = createSettingsGroup(containerEl);

    generalGroup.addSetting((setting) => {
      setting
        .setName('Property key')
        .setDesc('The property to use as the display title. Falls back to the file name when no property is set for that item.')
        .addText((text) =>
          text
            .setPlaceholder('Title')
            .setValue(this.plugin.settings.propertyKey)
            .onChange(async (value) => {
              this.plugin.settings.propertyKey = value.trim() || 'title';
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateLinkSuggester();
              this.plugin.updateGraphView();
              this.plugin.updateBacklinks();
              this.plugin.updateTabs();
              this.plugin.updateExplorer();
              this.plugin.updateWindowFrame();
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('When linking notes')
        .setDesc('Enable property-based titles in the link suggester.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableForLinking)
            .onChange(async (value) => {
              this.plugin.settings.enableForLinking = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateLinkSuggester();
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('In quick switcher')
        .setDesc('Enable property-based titles in the quick switcher.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableForQuickSwitcher)
            .onChange(async (value) => {
              const prevQuickSwitcherState = this.plugin.settings.enableForQuickSwitcher;
              this.plugin.settings.enableForQuickSwitcher = value;
              await this.plugin.saveSettings(prevQuickSwitcherState);
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('Include file name in fuzzy searches')
        .setDesc('Include note file names in fuzzy search results for link suggester and quick switcher.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.includeFilenameInSearch)
            .onChange(async (value) => {
              this.plugin.settings.includeFilenameInSearch = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('Include aliases in fuzzy searches')
        .setDesc('Include property aliases in fuzzy search results for link suggester and quick switcher.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.includeAliasesInSearch)
            .onChange(async (value) => {
              this.plugin.settings.includeAliasesInSearch = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('When dragging notes')
        .setDesc('Use property-based titles when dragging notes from the file explorer.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableForDragDrop)
            .onChange(async (value) => {
              this.plugin.settings.enableForDragDrop = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('In graph view')
        .setDesc('Use the property instead of the file name as the note\'s title in graph view.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableForGraphView)
            .onChange(async (value) => {
              this.plugin.settings.enableForGraphView = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateGraphView();
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('In backlinks and outgoing links')
        .setDesc('Use the property instead of the file name in the linked mentions footer, dedicated backlinks panel, and outgoing links.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableForBacklinks)
            .onChange(async (value) => {
              this.plugin.settings.enableForBacklinks = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateBacklinks();
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('In tab titles')
        .setDesc('Use the property instead of the file name in tab titles.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableForTabs)
            .onChange(async (value) => {
              const prevTabState = this.plugin.settings.enableForTabs;
              this.plugin.settings.enableForTabs = value;
              await this.plugin.saveSettings(undefined, prevTabState);
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('In window frame title')
        .setDesc('Use the property instead of the file name in the browser window title bar.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableForWindowFrame)
            .onChange(async (value) => {
              this.plugin.settings.enableForWindowFrame = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateWindowFrame();
            })
        );
    });

    generalGroup.addSetting((setting) => {
      setting
        .setName('In file explorer')
        .setDesc('Use the property instead of the file name in the file explorer.')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableForExplorer)
            .onChange(async (value) => {
              this.plugin.settings.enableForExplorer = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateExplorer();
              this.display(); // Refresh to show/hide folder note setting
            })
        );
    });

    // Show folder note file name setting only if explorer is enabled
    if (this.plugin.settings.enableForExplorer) {
      generalGroup.addSetting((setting) => {
        setting
          .setName('Folder note file name')
          .setDesc('If a folder contains a file with this name that has the configured property, the folder will display that property value instead. This ensures compatibility with folder notes plugins. Leave blank to disable.')
          .addText((text) =>
            text
              .setPlaceholder('Index')
              .setValue(this.plugin.settings.folderNoteFilename)
              .onChange(async (value) => {
                this.plugin.settings.folderNoteFilename = value.trim();
                await this.plugin.saveData(this.plugin.settings);
                this.plugin.updateExplorer();
              })
          );
      });
    }

    generalGroup.addSetting((setting) => {
      setting
        .setName('Use simple search')
        .setDesc('Instead of using fuzzy search, simple search provides better performance with very large vaults (thousands of files).')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.useSimpleSearch)
            .onChange(async (value) => {
              this.plugin.settings.useSimpleSearch = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });
  }
}
