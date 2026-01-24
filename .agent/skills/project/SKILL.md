---
name: project
description: Project-specific architecture, maintenance tasks, and unique conventions for Property over File Name.
---

# Property over File Name Project Skill

Search, display, and insert notes using a specified note property instead of the file name. This plugin overrides standard Obsidian behavior to prioritize metadata values (like `title` or `display-name`) in the UI.

## Core Architecture

- **UI Interception**: Modifies standard Obsidian search, suggest, and view components to display property values.
- **Metadata Indexing**: Logic to efficiently retrieve and map property values to file names across the vault.
- **Rich Suggestion Layer**: Uses a 10KB `styles.css` for custom suggestion menus and modal overlays.

## Project-Specific Conventions

- **Property Priority**: Logic assumes that metadata contains the "True" name of the note for UI purposes.
- **Seamless Override**: Aims to feel like a native Obsidian feature but with property-first logic.
- **High Performance**: Optimized for fast lookups in large vaults where file name mapping is required.

## Key Files

- `src/main.ts`: Core logic for suggest modal overrides and property lookups.
- `manifest.json`: Plugin identification and id (`property-over-file-name`).
- `styles.css`: Custom styling for property-aware suggestion lists and views.
- `esbuild.config.mjs`: Standard production build script.

## Maintenance Tasks

- **Suggest API**: Monitor changes to the Obsidian `AbstractSuggestModal` and related internal components.
- **Cache Integrity**: Verify that property-to-filename mappings are updated correctly during metadata changes.
- **Selector Stability**: Audit UI overrides after major Obsidian interface updates.
