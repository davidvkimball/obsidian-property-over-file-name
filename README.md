# Property Over File Name Plugin

Search, display, and insert notes using a specified note property instead of the file name.

![property-over-file-name-preview](https://github.com/user-attachments/assets/60073f96-4855-47d0-88f5-b80fd03b4429)


Particularly helpful when used in conjunction wth [Astro Composer](https://github.com/davidvkimball/obsidian-astro-composer) Obsidian plugin.

## Made for Vault CMS

Part of the [Vault CMS](https://github.com/davidvkimball/vault-cms) project.

## Features
- Displays property (like `title`) in link suggester, quick switcher, graph view, tab titles, backlinks, window frame, and file explorer.
- Supports creating new notes via link suggester and quick switcher.
- Configurable to include file names and aliases in fuzzy searches.
- Simple search toggle for larger vaults.
- Works when dragging notes from file explorer into a note.
- Folder note file name support.

## Installation

Property Over File Name is not yet available in the Community plugins section. Install using [BRAT](https://github.com/TfTHacker/obsidian42-brat) or manually:

### BRAT

1. Download the [Beta Reviewers Auto-update Tester (BRAT)](https://github.com/TfTHacker/obsidian42-brat) plugin from the [Obsidian community plugins directory](https://obsidian.md/plugins?id=obsidian42-brat) and enable it.
2. In the BRAT plugin settings, select `Add beta plugin`.
3. Paste the following: `https://github.com/davidvkimball/obsidian-property-over-file-name` and select `Add plugin`.

### Manual

1. Download the latest release from the [Releases page](https://github.com/davidvkimball/obsidian-property-over-file-name/releases) and navigate to your Obsidian vault's `.obsidian/plugins/` directory.
2. Create a new folder called `alias-file-name-history` and ensure `manifest.json` and `main.js` are in there.
3. In Obsidian, go to Settings > Community plugins (enable it if you haven't already) and then enable "Property Over File Name."

## Usage
- **Link Suggester**: Type `[[` to see suggestions based on the frontmatter `title` (or configured property). Select a note to insert a link (e.g., `[[file name|Title]]` or `[Title](path)` for Markdown links).
- **Quick Switcher**: Press `Ctrl+O` to search notes by title (or file name/aliases if enabled). Select to open or create a note.
- **Settings**: Go to **Settings → Property Over File Name**.
  - **Property key**: Set the frontmatter property for titles (default: `title`).
  - **When linking notes**: Enable/disable property-based titles in link suggester.
  - **In Quick Switcher**: Enable/disable property-based titles in Quick Switcher.
  - **In tab titles**: Enable/disable property-based titles in tab headers.
  - **In graph view**: Enable/disable property-based titles in graph view.
  - **In backlinks**: Enable/disable property-based titles in backlinks panel.
  - **In window frame**: Enable/disable property-based titles in window title bar.
  - **In file explorer**: Enable/disable property-based titles in file explorer.
  - **Include file name in fuzzy searches**: Include note file names in search results.
  - **Include aliases in fuzzy searches**: Include frontmatter `aliases` in search results.
  - **Use simple search**: Toggle simple search mode for larger vaults.
  - **Folder note filename**: Specify filename pattern for folder notes.

### Example Note
```yaml
---
title: My Custom Title
aliases: [Alias1, Alias2]
---
Content...
```
- File name: `note.md`
- Link suggester shows `My Custom Title`; searchable by `My Custom Title`, `note` (if file name search enabled), or `Alias1`/`Alias2` (if alias search enabled).
- Quick switcher shows `My Custom Title (note)` (if file name differs and search enabled).
- Graph view, backlinks, tab titles, window frame, and file explorer show "My Custom Title" instead of "note.md" (when enabled).

## Development
- Build: `npm install && npm run build`
- Test: Copy `main.js`, `manifest.json`, and `styles/css` to plugin folder, reload Obsidian.
- Issues: Check console (`Ctrl+Shift+I`) for errors.

## Credits

The tab renaming functionality is adapted from the [Title-only Tab](https://github.com/tristone13th/obsidian-title-only-tab) plugin by tristone13th, which is licensed under MIT. The code has been modified to integrate with this plugin and use the user-defined property key setting instead of the hardcoded "title" property.

The graph view functionality is adapted from the [Node Masquerade](https://github.com/Kapirklaa/obsidian-node-masquerade) plugin by ElsaTam, which is also licensed under GPLv3. The code has been modified to integrate with this plugin and use the property key setting.

The backlink service (for embedded backlinks, backlinks panel, and outgoing links), explorer service (for file explorer with folder note support), and window frame service (for browser window title bar) are adapted from the [Front Matter Title](https://github.com/snezhig/obsidian-front-matter-title) plugin by snezhig. The code has been modified to integrate with this plugin and use the user-defined property key setting instead of the hardcoded "title" property.

## License

This project is licensed under the GNU General Public License v3.0 (GPLv3).

See [LICENSE](LICENSE) for the full license text.
