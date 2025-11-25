# Property Over File Name Plugin

Enhances Obsidian's link suggester and Quick Switcher to use frontmatter properties (e.g., `title`) instead of file names for note titles, with optional file name and alias searching.

Particularly helpful when used in conjunction wth [Astro Composer](https://github.com/davidvkimball/obsidian-astro-composer) Obsidian plugin.

## Made for Vault CMS

Part of the [Vault CMS](https://github.com/davidvkimball/vault-cms) project.

## Features
- Displays frontmatter property (e.g., `title`) in link suggester (`[[`) and Quick Switcher (`Ctrl+O`).
- Supports creating new notes via link suggester and Quick Switcher.
- Configurable to include file names and aliases in fuzzy searches.
- Fully local, no network requests, respects user privacy.

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
- **Settings**:
  - Go to **Settings → Property Over File Name**.
  - **Property key**: Set the frontmatter property for titles (default: `title`).
  - **When linking notes**: Enable/disable property-based titles in link suggester.
  - **In Quick Switcher**: Enable/disable property-based titles in Quick Switcher.
  - **Include file name in fuzzy searches**: Include note file names in search results.
  - **Include aliases in fuzzy searches**: Include frontmatter `aliases` in search results.

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
- Quick Switcher shows `My Custom Title (note)` (if file name differs and search enabled).

## Development
- Build: `npm install && npm run build`
- Test: Copy `main.js` and `manifest.json` to plugin folder, reload Obsidian.
- Issues: Check console (`Ctrl+Shift+I`) for errors like `Error setting cursor`.

## License

This project is licensed under the GNU General Public License v3.0 (GPLv3).

The graph view functionality is adapted from the [Node Masquerade](https://github.com/Kapirklaa/obsidian-node-masquerade) plugin by ElsaTam, which is also licensed under GPLv3. The code has been modified to integrate with this plugin and use the property key setting.

See [LICENSE](LICENSE) for the full license text.
