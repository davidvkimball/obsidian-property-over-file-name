import { App, PluginSettingTab, Setting, SettingGroup } from 'obsidian';
import { ExcludedFilesBehavior, PropertyOverFileNamePlugin } from '../types';


export class SettingTab extends PluginSettingTab {
  plugin: PropertyOverFileNamePlugin;
  public icon = 'lucide-type';

  constructor(app: App, plugin: PropertyOverFileNamePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // 1.13.0+: framework calls this and skips display().
  // Pre-1.13.0: this method is not invoked; display() below runs as before.
  // See https://docs.obsidian.md/plugins/guides/migrate-declarative-settings
  getSettingDefinitions() {
    return [
      {
        name: 'Property key',
        desc: 'The property to use as the display title. Falls back to the file name when no property is set for that item.',
        // Render: value is trimmed with a fallback and the change refreshes every component.
        render: (setting: Setting) => {
          setting.addText(text => text
            .setPlaceholder('Title')
            .setValue(this.plugin.settings.propertyKey)
            .onChange(async value => {
              this.plugin.settings.propertyKey = value.trim() || 'title';
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateLinkSuggester();
              this.plugin.updateGraphView();              this.plugin.updateTabs();
              this.plugin.updateExplorer();
              this.plugin.updateWindowFrame();
              this.plugin.updateBookmarks();
            }));
        },
      },
      {
        name: 'When linking notes',
        desc: 'Enable property-based titles in the link suggester.',
        // Render: side effect (link suggester refresh).
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableForLinking)
            .onChange(async value => {
              this.plugin.settings.enableForLinking = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateLinkSuggester();
            }));
        },
      },
      {
        name: 'In quick switcher',
        desc: 'Enable property-based titles in the quick switcher.',
        // Render: save goes through saveSettings with the previous state so the quick switcher only re-registers when the value changes.
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableForQuickSwitcher)
            .onChange(async value => {
              const prevQuickSwitcherState = this.plugin.settings.enableForQuickSwitcher;
              this.plugin.settings.enableForQuickSwitcher = value;
              await this.plugin.saveSettings(prevQuickSwitcherState);
            }));
        },
      },
      {
        name: 'In properties',
        desc: 'Enable property-based titles in the property link suggester.',
        // Render: side effect (properties refresh).
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableForProperties)
            .onChange(async value => {
              this.plugin.settings.enableForProperties = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateProperties();
            }));
        },
      },
      {
        name: 'Include file name in fuzzy searches',
        desc: 'Include note file names in fuzzy search results for link suggester and quick switcher.',
        control: { type: 'toggle' as const, key: 'includeFilenameInSearch' },
      },
      {
        name: 'Include aliases in fuzzy searches',
        desc: 'Include property aliases in fuzzy search results for link suggester and quick switcher.',
        control: { type: 'toggle' as const, key: 'includeAliasesInSearch' },
      },
      {
        name: 'Hide unresolved links',
        desc: 'Only show notes that already exist. Hides unresolved links (placeholders for notes that have been referenced but never created) from quick switcher and link suggester results.',
        control: { type: 'toggle' as const, key: 'hideUnresolvedLinks' },
      },
      {
        name: 'When dragging notes',
        desc: 'Use property-based titles when dragging notes from the file explorer.',
        control: { type: 'toggle' as const, key: 'enableForDragDrop' },
      },
      {
        name: 'When naming bookmarks',
        desc: 'Automatically use the configured property value as the default name when creating a bookmark.',
        // Render: side effect (bookmarks refresh).
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableForBookmarks)
            .onChange(async value => {
              this.plugin.settings.enableForBookmarks = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateBookmarks();
            }));
        },
      },
      {
        name: 'In graph view',
        desc: 'Use the property instead of the file name as the note\'s title in graph view.',
        // Render: save goes through saveSettings, which always refreshes the graph view.
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableForGraphView)
            .onChange(async value => {
              this.plugin.settings.enableForGraphView = value;
              await this.plugin.saveSettings();
            }));
        },
      },
      {
        name: 'In tab titles',
        desc: 'Use the property instead of the file name in tab titles.',
        // Render: save goes through saveSettings with the previous tab state so tabs only re-register when the value changes.
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableForTabs)
            .onChange(async value => {
              const prevTabState = this.plugin.settings.enableForTabs;
              this.plugin.settings.enableForTabs = value;
              await this.plugin.saveSettings(undefined, prevTabState);
            }));
        },
      },
      {
        name: 'In window frame title',
        desc: 'Use the property instead of the file name in the browser window title bar.',
        // Render: side effect (window frame refresh).
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableForWindowFrame)
            .onChange(async value => {
              this.plugin.settings.enableForWindowFrame = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateWindowFrame();
            }));
        },
      },
      {
        name: 'In file explorer',
        desc: 'Use the property instead of the file name in the file explorer.',
        // Render: side effect (explorer refresh). Toggling this shows or hides the folder note file name row below,
        // so refresh the DOM state to re-evaluate that row's visible predicate.
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableForExplorer)
            .onChange(async value => {
              this.plugin.settings.enableForExplorer = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateExplorer();
              // Re-run the visible predicate so the folder note file name row appears
              // or disappears. refreshDomState exists on Obsidian 1.13.0+, which is the
              // only version that calls getSettingDefinitions in the first place.
              const refresh = (this as unknown as { refreshDomState?: () => void }).refreshDomState;
              if (refresh) refresh.call(this);
            }));
        },
      },
      {
        name: 'Folder note file name',
        desc: 'If a folder contains a file with this name that has the configured property, the folder will display that property value instead. This ensures compatibility with folder notes plugins. Leave blank to disable.',
        // Shown only when the file explorer integration is enabled.
        visible: () => this.plugin.settings.enableForExplorer,
        // Render: value is trimmed and the change refreshes the explorer.
        render: (setting: Setting) => {
          setting.addText(text => text
            .setPlaceholder('Index')
            .setValue(this.plugin.settings.folderNoteFilename)
            .onChange(async value => {
              this.plugin.settings.folderNoteFilename = value.trim();
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateExplorer();
            }));
        },
      },
      {
        name: 'Use simple search',
        desc: 'Instead of using fuzzy search, simple search provides better performance with very large vaults (thousands of files).',
        control: { type: 'toggle' as const, key: 'useSimpleSearch' },
      },
      {
        name: 'Excluded files in quick switcher',
        desc: 'How files in Obsidian\'s "excluded files" list should behave in the quick switcher.',
        // Render: side effect (quick switcher refresh).
        render: (setting: Setting) => {
          setting.addDropdown(dropdown => dropdown
            .addOptions({
              deemphasize: 'Deemphasize (move to bottom & gray out)',
              hide: 'Hide entirely',
              ignore: 'Ignore (treat as normal files)',
            })
            .setValue(this.plugin.settings.quickSwitcherExcludedBehavior)
            .onChange(async value => {
              this.plugin.settings.quickSwitcherExcludedBehavior = value as ExcludedFilesBehavior;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateQuickSwitcher();
            }));
        },
      },
      {
        name: 'Excluded files in link suggester',
        desc: 'How files in Obsidian\'s "excluded files" list should behave in the link suggester.',
        // Render: side effect (link suggester refresh).
        render: (setting: Setting) => {
          setting.addDropdown(dropdown => dropdown
            .addOptions({
              deemphasize: 'Deemphasize (move to bottom & gray out)',
              hide: 'Hide entirely',
              ignore: 'Ignore (treat as normal files)',
            })
            .setValue(this.plugin.settings.linkSuggesterExcludedBehavior)
            .onChange(async value => {
              this.plugin.settings.linkSuggesterExcludedBehavior = value as ExcludedFilesBehavior;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateLinkSuggester();
            }));
        },
      },
      {
        name: 'Enable mdx file support',
        desc: 'Enable support for .mdx files. When enabled, the plugin will read properties from mdx files manually (Obsidian\'s metadata cache only works for .md files).',
        // Render: save goes through saveSettings and the change rebuilds the cache and refreshes every component.
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableMdxSupport)
            .onChange(async value => {
              this.plugin.settings.enableMdxSupport = value;
              await this.plugin.saveSettings();
              // Rebuild cache and refresh all components when MDX support is toggled
              this.plugin.rebuildCache();
              this.plugin.updateLinkSuggester();
              this.plugin.updateQuickSwitcher();
              this.plugin.updateGraphView();              this.plugin.updateTabs();
              this.plugin.updateExplorer();
              this.plugin.updateWindowFrame();
              this.plugin.updateBookmarks();
            }));
        },
      },
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Add scoping class to prevent CSS from affecting other settings
    containerEl.addClass('property-over-filename-settings');

    // Create a single settings group with no heading (following UI Tweaker pattern)
    const generalGroup = new SettingGroup(containerEl);

    generalGroup.addSetting(setting => {
      setting
        .setName('Property key')
        .setDesc('The property to use as the display title. Falls back to the file name when no property is set for that item.')
        .addText(text =>
          text
            .setPlaceholder('Title')
            .setValue(this.plugin.settings.propertyKey)
            .onChange(async value => {
              this.plugin.settings.propertyKey = value.trim() || 'title';
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateLinkSuggester();
              this.plugin.updateGraphView();              this.plugin.updateTabs();
              this.plugin.updateExplorer();
              this.plugin.updateWindowFrame();
              this.plugin.updateBookmarks();
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('When linking notes')
        .setDesc('Enable property-based titles in the link suggester.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForLinking)
            .onChange(async value => {
              this.plugin.settings.enableForLinking = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateLinkSuggester();
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('In quick switcher')
        .setDesc('Enable property-based titles in the quick switcher.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForQuickSwitcher)
            .onChange(async value => {
              const prevQuickSwitcherState = this.plugin.settings.enableForQuickSwitcher;
              this.plugin.settings.enableForQuickSwitcher = value;
              await this.plugin.saveSettings(prevQuickSwitcherState);
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('In properties')
        .setDesc('Enable property-based titles in the property link suggester.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForProperties)
            .onChange(async value => {
              this.plugin.settings.enableForProperties = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateProperties();
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('Include file name in fuzzy searches')
        .setDesc('Include note file names in fuzzy search results for link suggester and quick switcher.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.includeFilenameInSearch)
            .onChange(async value => {
              this.plugin.settings.includeFilenameInSearch = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('Include aliases in fuzzy searches')
        .setDesc('Include property aliases in fuzzy search results for link suggester and quick switcher.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.includeAliasesInSearch)
            .onChange(async value => {
              this.plugin.settings.includeAliasesInSearch = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('Hide unresolved links')
        .setDesc('Only show notes that already exist. Hides unresolved links (placeholders for notes that have been referenced but never created) from quick switcher and link suggester results.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.hideUnresolvedLinks)
            .onChange(async value => {
              this.plugin.settings.hideUnresolvedLinks = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('When dragging notes')
        .setDesc('Use property-based titles when dragging notes from the file explorer.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForDragDrop)
            .onChange(async value => {
              this.plugin.settings.enableForDragDrop = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('When naming bookmarks')
        .setDesc('Automatically use the configured property value as the default name when creating a bookmark.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForBookmarks)
            .onChange(async value => {
              this.plugin.settings.enableForBookmarks = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateBookmarks();
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('In graph view')
        .setDesc('Use the property instead of the file name as the note\'s title in graph view.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForGraphView)
            .onChange(async value => {
              this.plugin.settings.enableForGraphView = value;
              await this.plugin.saveSettings();
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('In tab titles')
        .setDesc('Use the property instead of the file name in tab titles.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForTabs)
            .onChange(async value => {
              const prevTabState = this.plugin.settings.enableForTabs;
              this.plugin.settings.enableForTabs = value;
              await this.plugin.saveSettings(undefined, prevTabState);
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('In window frame title')
        .setDesc('Use the property instead of the file name in the browser window title bar.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForWindowFrame)
            .onChange(async value => {
              this.plugin.settings.enableForWindowFrame = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateWindowFrame();
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('In file explorer')
        .setDesc('Use the property instead of the file name in the file explorer.')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableForExplorer)
            .onChange(async value => {
              this.plugin.settings.enableForExplorer = value;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateExplorer();
              this.display(); // Refresh to show/hide folder note setting
            })
        );
    });

    // Show folder note file name setting only if explorer is enabled
    if (this.plugin.settings.enableForExplorer) {
      generalGroup.addSetting(setting => {
        setting
          .setName('Folder note file name')
          .setDesc('If a folder contains a file with this name that has the configured property, the folder will display that property value instead. This ensures compatibility with folder notes plugins. Leave blank to disable.')
          .addText(text =>
            text
              .setPlaceholder('Index')
              .setValue(this.plugin.settings.folderNoteFilename)
              .onChange(async value => {
                this.plugin.settings.folderNoteFilename = value.trim();
                await this.plugin.saveData(this.plugin.settings);
                this.plugin.updateExplorer();
              })
          );
      });
    }

    generalGroup.addSetting(setting => {
      setting
        .setName('Use simple search')
        .setDesc('Instead of using fuzzy search, simple search provides better performance with very large vaults (thousands of files).')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.useSimpleSearch)
            .onChange(async value => {
              this.plugin.settings.useSimpleSearch = value;
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('Excluded files in quick switcher')
        .setDesc('How files in Obsidian\'s "excluded files" list should behave in the quick switcher.')
        .addDropdown(dropdown =>
          dropdown
            .addOptions({
              deemphasize: 'Deemphasize (move to bottom & gray out)',
              hide: 'Hide entirely',
              ignore: 'Ignore (treat as normal files)',
            })
            .setValue(this.plugin.settings.quickSwitcherExcludedBehavior)
            .onChange(async value => {
              this.plugin.settings.quickSwitcherExcludedBehavior = value as ExcludedFilesBehavior;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateQuickSwitcher();
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('Excluded files in link suggester')
        .setDesc('How files in Obsidian\'s "excluded files" list should behave in the link suggester.')
        .addDropdown(dropdown =>
          dropdown
            .addOptions({
              deemphasize: 'Deemphasize (move to bottom & gray out)',
              hide: 'Hide entirely',
              ignore: 'Ignore (treat as normal files)',
            })
            .setValue(this.plugin.settings.linkSuggesterExcludedBehavior)
            .onChange(async value => {
              this.plugin.settings.linkSuggesterExcludedBehavior = value as ExcludedFilesBehavior;
              await this.plugin.saveData(this.plugin.settings);
              this.plugin.updateLinkSuggester();
            })
        );
    });

    generalGroup.addSetting(setting => {
      setting
        .setName('Enable mdx file support')
        .setDesc('Enable support for .mdx files. When enabled, the plugin will read properties from mdx files manually (Obsidian\'s metadata cache only works for .md files).')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableMdxSupport)
            .onChange(async value => {
              this.plugin.settings.enableMdxSupport = value;
              await this.plugin.saveSettings();
              // Rebuild cache and refresh all components when MDX support is toggled
              this.plugin.rebuildCache();
              this.plugin.updateLinkSuggester();
              this.plugin.updateQuickSwitcher();
              this.plugin.updateGraphView();              this.plugin.updateTabs();
              this.plugin.updateExplorer();
              this.plugin.updateWindowFrame();
              this.plugin.updateBookmarks();
            })
        );
    });
  }
}
