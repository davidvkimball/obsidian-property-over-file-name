# AI Agent Instructions

This file serves as the **project-specific entry point** for AI agents working on this Obsidian plugin project. General-purpose instructions are located in the [`.agents`](.agents/) directory.

**Note**: The `.agents/` directory contains guidance files tailored for Obsidian plugin development. Some files are plugin-specific, while others are shared with theme development.

---

## Project Context

<!--
Source: Project-specific (not synced from reference repos)
Last updated: [Maintain manually - this file is project-specific]
Applicability: Plugin
-->

### Project Overview

Property Over File Name is an Obsidian plugin that displays note properties (e.g., `title` from frontmatter) instead of file names across various Obsidian UI components. This is particularly useful for content management systems where notes have human-readable titles that differ from their file names.

The plugin integrates with multiple Obsidian UI components:
- **Link Suggester**: Shows property-based titles when typing `[[`
- **Quick Switcher**: Displays property titles in search results
- **Graph View**: Uses property titles for node labels
- **Tab Titles**: Shows property titles in tab headers
- **Backlinks Panel**: Displays property titles in linked mentions
- **Window Frame**: Shows property title in browser title bar
- **File Explorer**: Displays property titles for files and folders (with folder note support)
- **Drag & Drop**: Uses property titles when dragging notes

The plugin is configurable with a default property key of `title`, supports fuzzy and simple search modes, includes file names and aliases in search results, and provides folder note compatibility.

This plugin is part of the [Vault CMS](https://github.com/davidvkimball/vault-cms) project and works particularly well with [Astro Composer](https://github.com/davidvkimball/obsidian-astro-composer).

### Important Project-Specific Details

- **Type**: Plugin
- **Purpose**: Display custom frontmatter properties instead of file names across Obsidian UI components
- **Status**: Beta (installed via BRAT or manually)
- **Min App Version**: 0.15.0
- **License**: GPL-3.0

**Key Features**:
- Property-based display in 8+ UI components (link suggester, quick switcher, graph view, tabs, backlinks, window frame, file explorer, drag & drop)
- Configurable property key (default: `title`)
- Supports folder notes with configurable filename pattern
- Fuzzy search with optional file name and alias inclusion
- Simple search mode for large vaults (thousands of files)
- Cache-based property retrieval for performance
- Event-driven updates to keep UI in sync with metadata changes

**Architecture**:
- **Service-based design**: Each UI component has its own service class (CacheService, QuickSwitcherService, GraphViewService, BacklinkService, TabService, ExplorerService, WindowFrameService, DragDropService)
- **Cache system**: Caches property values and display names for performance
- **Event-driven updates**: Metadata cache changes trigger automatic UI refreshes
- **Backward compatibility**: Uses SettingGroup with version checking (Obsidian 1.11.0+)

### Maintenance Tasks

- **Reference materials**: Keep the 6 core Obsidian projects in `.ref` synced (obsidian-api, obsidian-sample-plugin, obsidian-developer-docs, obsidian-plugin-docs, obsidian-sample-theme, eslint-plugin)
- **UI Tweaker reference**: Update `.ref/plugins/obsidian-ui-tweaker/` if the local project changes (it's a symlink to a local project)
- **Other references**: Monitor reference plugins in `.ref/plugins/` for updates if needed
- **Obsidian API changes**: Monitor for API changes, especially related to SettingGroup and UI component APIs
- **Dependencies**: Keep TypeScript, ESLint, and other devDependencies up to date
- **Testing**: Test on both desktop and mobile (plugin is not desktop-only)

### Project-Specific Conventions

- **Service-based architecture**: Each UI component has its own service class in `src/services/`
- **Cache-based property retrieval**: CacheService manages property caching for performance
- **Event-driven updates**: Metadata cache changes trigger automatic UI refreshes via event listeners
- **Settings organization**: Settings are organized by UI component (enableForLinking, enableForQuickSwitcher, etc.)
- **Type safety**: Extensive TypeScript interfaces for internal Obsidian APIs (WorkspaceInternal, EditorSuggest, etc.)
- **Conditional settings**: Some settings are conditionally displayed (e.g., folder note filename only when explorer is enabled)
- **Naming conventions**: Service classes use descriptive names ending in "Service" (e.g., QuickSwitcherService)
- **File organization**: 
  - `src/services/` - Service classes for UI components
  - `src/ui/` - UI components (settings tab, modals, suggesters)
  - `src/utils/` - Utility functions (search, settings compatibility)
  - `src/types.ts` - TypeScript type definitions
  - `src/settings.ts` - Default settings and validation

### Project-Specific References

- `.ref/plugins/obsidian-ui-tweaker/` - Reference for SettingGroup implementation pattern and settings compatibility utility
- `.ref/plugins/backlink-settings/` - Backlink implementation reference
- `.ref/plugins/front-matter-title-reference/` - Front matter title patterns and implementation
- `.ref/plugins/node-masquerade-reference/` - Graph view node title implementation
- `.ref/plugins/obsidian-title-only-tab/` - Tab renaming implementation (adapted for this plugin)
- `.ref/plugins/switch-plus-reference/` - Quick switcher patterns and implementation

**Note**: The 6 core Obsidian projects (obsidian-api, obsidian-sample-plugin, etc.) are always relevant and don't need to be listed here.

### Overrides (Optional)

None currently. This project follows the general `.agents` guidance.

### Key Files and Their Purposes

- **`src/main.ts`** - Plugin entry point, service initialization, event registration, and lifecycle management
- **`src/ui/SettingTab.ts`** - Settings UI implementation using SettingGroup with compatibility utility for backward compatibility
- **`src/utils/settings-compat.ts`** - Backward-compatible SettingGroup wrapper that uses `requireApiVersion('1.11.0')` to check for SettingGroup support
- **`src/services/CacheService.ts`** - Manages property caching for performance, invalidates cache on file changes
- **`src/services/QuickSwitcherService.ts`** - Handles quick switcher integration and property-based search
- **`src/services/GraphViewService.ts`** - Manages graph view node title updates
- **`src/services/BacklinkService.ts`** - Handles backlinks panel and linked mentions display
- **`src/services/TabService.ts`** - Manages tab title updates
- **`src/services/ExplorerService.ts`** - Handles file explorer display with folder note support
- **`src/services/WindowFrameService.ts`** - Manages browser window title bar updates
- **`src/services/DragDropService.ts`** - Handles drag and drop events for property-based titles
- **`src/ui/LinkTitleSuggest.ts`** - Custom editor suggester for link insertion with property-based titles
- **`src/ui/QuickSwitchModal.ts`** - Custom quick switcher modal implementation
- **`src/utils/search.ts`** - Search utilities for fuzzy and simple search modes
- **`src/settings.ts`** - Default settings configuration and validation
- **`src/types.ts`** - TypeScript type definitions for plugin settings, cached data, and internal Obsidian APIs
- **`src/commands/index.ts`** - Command registration

### Development Notes

- **SettingGroup usage**: The plugin uses SettingGroup (Obsidian 1.11.0+) with a compatibility utility (`src/utils/settings-compat.ts`) that falls back to manual heading creation for older Obsidian versions. This ensures backward compatibility while using modern UI patterns.

- **Service architecture**: Each UI component has its own service class that handles initialization, event registration, and cleanup. This modular approach makes the codebase maintainable and allows services to be enabled/disabled independently.

- **Cache system**: The CacheService caches property values and display names to avoid repeated metadata lookups. The cache is invalidated on file modifications, renames, and deletions, and rebuilt when the metadata cache changes.

- **Event-driven updates**: The plugin registers event listeners for metadata cache changes, file modifications, and workspace layout changes. These events trigger automatic UI refreshes to keep the display in sync with the actual data.

- **Conditional settings**: The folder note filename setting is conditionally displayed only when the file explorer feature is enabled. This is handled by re-rendering the settings tab when the explorer setting changes.

- **Search modes**: The plugin supports both fuzzy search (default) and simple search modes. Simple search provides better performance for very large vaults (thousands of files) but is less flexible than fuzzy search.

- **Type safety**: The plugin uses extensive TypeScript interfaces for internal Obsidian APIs (WorkspaceInternal, EditorSuggest, etc.) to provide type safety when accessing internal APIs.

- **Credits and adaptations**: 
  - Tab renaming functionality adapted from [Title-only Tab](https://github.com/tristone13th/obsidian-title-only-tab) plugin
  - Graph view functionality adapted from [Node Masquerade](https://github.com/Kapirklaa/obsidian-node-masquerade) plugin
  - Backlink, explorer, and window frame services adapted from [Front Matter Title](https://github.com/snezhig/obsidian-front-matter-title) plugin
  - All adapted code has been modified to use the user-defined property key setting instead of hardcoded "title" property

---

## Quick Start

**All general-purpose agent instructions are located in the [`.agents`](.agents/) directory**.

**Quick Commands**: See [quick-reference.md](.agents/quick-reference.md#quick-commands) for one-word commands like `build`, `sync`, `release ready?`, `summarize`, `bump the version`, etc. **AI Agents: Execute these commands automatically when users type them** (detailed execution instructions are in the Help sections below).

**New to this project?** Start here:

0. **Set up reference materials**: Check if `.ref` folder exists and has symlinks. If not, run the setup script:
   - **Windows**: `scripts\setup-ref-links.bat`
   - **macOS/Linux**: `./scripts/setup-ref-links.sh`
   - The script will automatically create `../.ref/obsidian-dev/` (if needed), clone the 6 core Obsidian projects (or update them if they already exist), and create symlinks

1. Read the **Project Context** section above for project-specific information and overrides

3. Read [project-overview.md](.agents/project-overview.md) to understand the structure

4. Check [environment.md](.agents/environment.md) for setup requirements

5. Review [common-tasks.md](.agents/common-tasks.md) for quick code snippets

6. See [code-patterns.md](.agents/code-patterns.md) for complete examples

7. Bookmark [quick-reference.md](.agents/quick-reference.md) for common commands

**Note**: For complex projects, see `.agents/.context/` directory (optional advanced feature).

## When to Check .ref Folder Setup

**AI Agents: Only check `.ref` folder setup when user explicitly asks about:**
- "What does the Obsidian API say about X?"
- "Check the latest Obsidian documentation"
- "What's the latest API?"
- "Look up [feature] in the Obsidian docs"
- "What does the Obsidian documentation say?"
- "Check obsidian-api for..."
- Similar explicit requests about API or documentation

**Do NOT check `.ref` automatically for regular coding tasks.** Most users may never need it, and it shouldn't be a barrier to getting work done.

**When triggered:**
1. Check if `.ref/obsidian-api` exists (note: this may be a symlink pointing to a central location)
2. If missing, run setup script: `scripts\setup-ref-links.bat` (Windows) or `./scripts/setup-ref-links.sh` (Unix)
3. If it exists but git commands fail, check if it's a symlink and navigate to the actual target location
4. Then proceed with the API/documentation lookup

**Quick check commands:**
- Windows: `Test-Path .ref/obsidian-api`
- Unix: `test -d .ref/obsidian-api`

## Help: Interactive Guidance

**When the user asks for "help"**:
1. **First, display the Quick Commands table**: Read and show the Quick Commands section from [quick-reference.md](.agents/quick-reference.md#quick-commands) (the table with all one-word commands)
2. **Then, present these additional options** below for more detailed workflows:

**When the user asks for "what's the latest"**, present these options and guide them based on their choice:

---

### Option 0: Check for Updates / "What's the Latest"

**Present this option when**: User explicitly asks "what's the latest", "check for updates", "what does the Obsidian documentation say", or wants to see what's new in reference repos.

**Important**: Updates are **optional**. The reference materials work fine with whatever version was cloned initially. Most users never need to update. This is only for users who want the latest documentation.

**Instructions for AI agent**:
1. **First, ensure `.ref` folder is set up**: Check if `.ref/obsidian-api` exists. If not, run the setup script first (see "When to Check .ref Folder Setup" above).
2. **Determine setup**: Check if `.ref` contains symlinks (see [sync-procedure.md](.agents/sync-procedure.md#step-1-determine-your-ref-setup) for how to check). If symlinks, note the target location (usually `..\.ref\obsidian-dev`).
3. **Check for updates** (read-only, safe):
   - **For core Obsidian projects**: Check `.ref/` root (all 6: obsidian-api, obsidian-sample-plugin, obsidian-developer-docs, obsidian-plugin-docs, obsidian-sample-theme, eslint-plugin)
   - **For project-specific repos**: Check `.ref/plugins/` or `.ref/themes/` (only if documented in this `AGENTS.md`)
4. **Use read-only git commands** (from actual target location if using symlinks):
   ```bash
   # If using symlinks, navigate to central location first (usually ..\.ref\obsidian-dev)
   # If using local clones, use .ref/obsidian-api directly
   cd ../.ref/obsidian-dev/obsidian-api  # or .ref/obsidian-api for local clones
   git fetch
   git log HEAD..origin/main --oneline  # Shows what's new
   ```
5. **Report findings**: Show what's new and ask if they want to pull updates
6. **Never automatically pull** - always ask first (see [agent-dos-donts.md](.agents/agent-dos-donts.md))

**Key files**: [ref-instructions.md](.agents/ref-instructions.md#checking-for-updates-to-reference-repos), [quick-sync-guide.md](.agents/quick-sync-guide.md), [sync-procedure.md](.agents/sync-procedure.md)

---

### Option 1: Sync Reference Documentation

**Present this option when**: User says "sync" or "quick sync" - they want to pull latest changes from all 6 core `.ref` repos.

**Instructions for AI agent** (execute automatically, don't just show commands):
1. **Determine setup**: Check if `.ref` contains symlinks (see [sync-procedure.md](.agents/sync-procedure.md#step-1-determine-your-ref-setup)). This determines where to run git commands.
2. **Execute git pull commands**: Actually run `git pull` for all 6 core repos:
   - Navigate to the actual target location (usually `../.ref/obsidian-dev` if using symlinks)
   - Run `git pull` in each of the 6 repos: obsidian-api, obsidian-sample-plugin, obsidian-developer-docs, obsidian-plugin-docs, obsidian-sample-theme, eslint-plugin
   - See [quick-sync-guide.md](.agents/quick-sync-guide.md) for exact commands
3. **Review changes**: Check git logs to see what changed in each repo (optional, but helpful)
4. **Update `.agents/` files**: If user wants, compare changes and update relevant files (optional)
5. **Update sync status**: Update `.agents/sync-status.json` with current date

**The 6 core Obsidian projects** (always relevant):
- obsidian-api
- obsidian-sample-plugin
- obsidian-developer-docs
- obsidian-plugin-docs
- obsidian-sample-theme
- eslint-plugin

**Key files**: [sync-procedure.md](.agents/sync-procedure.md), [quick-sync-guide.md](.agents/quick-sync-guide.md)

---

### Option 2: Add a Project to Your References

**Present this option when**: User says "add ref [name]" or "add ref [name] [URL/path]" - they want to reference another project.

**Instructions for AI agent** (execute automatically, don't just show commands):
1. **Parse the command**: Extract the name and optional URL/path from user input
   - If URL provided (starts with `http://`, `https://`, `git@`, etc.) → External repository
   - If path provided (starts with `../`, `./`, `/`, `C:\`, etc.) → Local project
   - If only name provided → Ask user: "Is this an external repository (GitHub, GitLab, etc.) or a local project path?"
   
2. **If external repository** (execute these steps):
   - **Determine type**: Is it a plugin, theme, or other project? (infer from URL or ask)
   - **Check if already exists**: Check `../.ref/obsidian-dev/plugins/<name>/` (for plugins), `../.ref/obsidian-dev/themes/<name>/` (for themes), or `../.ref/obsidian-dev/<name>/` (for other projects)
   - **Execute clone command** (NOT into a `.ref` subfolder!):
     - For plugins: Run `cd ../.ref/obsidian-dev/plugins && git clone <URL> <name>` → Creates `../.ref/obsidian-dev/plugins/<name>/` (the actual repo)
     - For themes: Run `cd ../.ref/obsidian-dev/themes && git clone <URL> <name>` → Creates `../.ref/obsidian-dev/themes/<name>/` (the actual repo)
     - For other projects: Run `cd ../.ref/obsidian-dev && git clone <URL> <name>` → Creates `../.ref/obsidian-dev/<name>/` (the actual repo)
   - **Execute symlink creation**: Create symlink at `.ref/plugins/<name>/` (or `.ref/themes/<name>/` or `.ref/<name>/`) pointing to the global location
   - **Document if project-specific**: Document in this `AGENTS.md` if it's project-specific
   
   **IMPORTANT**: Clone the repo directly into the target folder (e.g., `../.ref/obsidian-dev/plugins/plugin-name/`), NOT into a `.ref` subfolder. The repo folder name should match the project name.
   
3. **If local project** (execute these steps):
   - **Verify path exists**: Check that the local path exists
   - **Execute symlink creation**: Create symlink directly in project's `.ref/` folder pointing to the local project (e.g., `../my-other-plugin`)
   - **Do NOT** clone to global `.ref/obsidian-dev/` - this is project-specific
   - Document in this `AGENTS.md` if relevant

4. **Verify**: Check that the symlink was created and works (test by listing directory or reading a file)

**Key file**: [ref-instructions.md](.agents/ref-instructions.md) - See "Adding Additional References" section

---

### Option 3: Bump the Version

**Present this option when**: User says "bump the version", "bump version", or similar - they want to increment the version number.

**Instructions for AI agent** (execute automatically, don't just show commands):
1. **Parse the command**: Extract the version increment type from user input
   - If no type specified → Default to `patch` (bumps by 0.0.1)
   - If user specifies `patch`, `minor`, or `major` → Use that type
   - If user specifies an exact version (e.g., "1.2.3") → Use that version
   
2. **Execute version bump**:
   - Run `pnpm version <type>` where `<type>` is one of:
     - `patch` (default) - bumps patch version: 1.0.0 → 1.0.1
     - `minor` - bumps minor version: 1.0.0 → 1.1.0
     - `major` - bumps major version: 1.0.0 → 2.0.0
     - Or exact version: `1.2.3` (sets to that version)
   - The `pnpm version` command automatically:
     - Updates `package.json` version
     - Runs the `version` script in `package.json` (which updates `manifest.json` and `versions.json` via `version-bump.mjs`)
     - Stages `manifest.json` and `versions.json` for commit
   
3. **Verify**: Check that both `package.json` and `manifest.json` have the new version

**Examples**:
- `bump the version` → Runs `pnpm version patch` (default: 0.0.1 increment)
- `bump version minor` → Runs `pnpm version minor`
- `bump version major` → Runs `pnpm version major`
- `bump version 1.2.3` → Runs `pnpm version 1.2.3`

**Key files**: [versioning-releases.md](.agents/versioning-releases.md), `package.json`, `manifest.json`, `version-bump.mjs`

---

### Option 4: Start a New Plugin Project

**Present this option when**: User wants to create a new Obsidian plugin.

**Instructions for AI agent** - Follow this funnel:

1. **Plugin Funnel** - Ask these questions in order:
   - "What functionality do you want your plugin to provide?" (core purpose)
   - "Will it need user settings or configuration?" → If yes, point to [commands-settings.md](.agents/commands-settings.md)
   - "What will it interact with?" (vault files, editor, UI components, workspace)
   - "Do you need any external API integrations?" → If yes, review [security-privacy.md](.agents/security-privacy.md) for guidelines
   - "Will it work on mobile, or desktop-only?" → Point to [mobile.md](.agents/mobile.md) and `isDesktopOnly` in [manifest.md](.agents/manifest.md)

2. **After gathering answers**, guide them to:
   - [project-overview.md](.agents/project-overview.md) - Project structure
   - [environment.md](.agents/environment.md) - Setup and tooling
   - [file-conventions.md](.agents/file-conventions.md) - File organization
   - [common-tasks.md](.agents/common-tasks.md) - Code examples
   - [references.md](.agents/references.md) - Official documentation links
   - **Set up `.ref` folder**: Run the setup script (`scripts/setup-ref-links.bat` or `.sh`) to configure reference materials

**Key files**: [project-overview.md](.agents/project-overview.md), [common-tasks.md](.agents/common-tasks.md), [references.md](.agents/references.md), [ref-instructions.md](.agents/ref-instructions.md)

## Static vs. Project-Specific Files

**General `.agents` files** (most files in the `.agents/` directory):
- Are synced from reference repos (Sample Plugin, API, etc.)
- Should remain static and not be edited directly in plugin projects
- Provide guidance tailored for Obsidian plugin development
- Some files are plugin-specific, others are shared with theme development
- Can be updated by syncing from reference repositories

**Project-specific files**:
- **This `AGENTS.md` file** - Contains project-specific information and overrides (replaces the old `project-context.md`)
  - Contains project overview, specific details, maintenance tasks, and conventions
  - Can override general `.agents` guidance when project-specific needs differ
  - Is preserved when syncing updates from reference repos
- **`.agents/.context/` directory** - Optional advanced feature for complex projects
  - Use when you need project-specific versions of multiple `.agents` files
  - Only create files that differ from general guidance
  - Structure mirrors `.agents/` directory (e.g., `.context/build-workflow.md`, `.context/code-patterns.md`)
  - Entry point: `.agents/.context/AGENTS.md` (if it exists)

**Precedence**: When conflicts exist, project-specific files take precedence over general guidance.

## How to Use This Documentation

This documentation is organized into topic-based files in the `.agents/` directory. Most files are **general-purpose** and apply to all Obsidian plugins/themes. Some files are **project-specific** and can override general guidance.

**Key concepts**:
- **General files**: Synced from official Obsidian repos, provide standard guidance
- **Project-specific files**: This `AGENTS.md` file (and optional `.agents/.context/` directory) contain project-specific information
- **Precedence**: Project-specific files override general guidance when conflicts exist
- **`.ref` folder**: Contains symlinks to reference materials (not actual files). See [ref-instructions.md](.agents/ref-instructions.md) for details.
- **`.agents/` folder**: Contains general-purpose guidance files for Obsidian plugin and theme development

**Quick Links by Task**:
- **Starting a new project** → [project-overview.md](.agents/project-overview.md), [environment.md](.agents/environment.md), [file-conventions.md](.agents/file-conventions.md)
- **Making code changes** → [build-workflow.md](.agents/build-workflow.md) (run build after changes!), [common-tasks.md](.agents/common-tasks.md), [code-patterns.md](.agents/code-patterns.md)
- **Preparing for release** → [release-readiness.md](.agents/release-readiness.md) (comprehensive checklist), [versioning-releases.md](.agents/versioning-releases.md), [testing.md](.agents/testing.md)
- **Troubleshooting** → [troubleshooting.md](.agents/troubleshooting.md), [common-pitfalls.md](.agents/common-pitfalls.md), [build-workflow.md](.agents/build-workflow.md)
- **Quick reference** → [quick-reference.md](.agents/quick-reference.md) (one-page cheat sheet)

## Navigation

**When to use each file**:
- **Starting a new project** → See Quick Start above
- **Need to understand project structure** → [project-overview.md](.agents/project-overview.md)
- **Setting up development environment** → [environment.md](.agents/environment.md)
- **Looking for code examples** → [common-tasks.md](.agents/common-tasks.md) (quick) or [code-patterns.md](.agents/code-patterns.md) (comprehensive)
- **Troubleshooting issues** → [troubleshooting.md](.agents/troubleshooting.md) or [common-pitfalls.md](.agents/common-pitfalls.md)
- **Need a quick command reference** → [quick-reference.md](.agents/quick-reference.md)
- **Working with `.ref` folder** → [ref-instructions.md](.agents/ref-instructions.md)

### Project-Specific
- **This `AGENTS.md` file** - Project-specific information and overrides (simple, recommended)
- **`.agents/.context/` directory** - Optional project-specific structure for complex projects (advanced)

### Core Development
- **[project-overview.md](.agents/project-overview.md)** - Project structure, entry points, and artifacts (Plugin/Theme)
- **[environment.md](.agents/environment.md)** - Development environment and tooling (Plugin/Theme)
- **[file-conventions.md](.agents/file-conventions.md)** - File organization and folder structure (Plugin/Theme)
- **[coding-conventions.md](.agents/coding-conventions.md)** - Code standards and organization (Plugin)

### Configuration
- **[manifest.md](.agents/manifest.md)** - `manifest.json` rules and requirements (Plugin/Theme)
- **[commands-settings.md](.agents/commands-settings.md)** - Commands and settings patterns (Plugin)
- **[versioning-releases.md](.agents/versioning-releases.md)** - Versioning and GitHub release workflow (Both)

### Best Practices
- **[security-privacy.md](.agents/security-privacy.md)** - Security, privacy, and compliance guidelines (Both)
- **[ux-copy.md](.agents/ux-copy.md)** - UX guidelines and UI text conventions (Both)
- **[performance.md](.agents/performance.md)** - Performance optimization best practices (Both)
- **[mobile.md](.agents/mobile.md)** - Mobile compatibility considerations (Both)

### Development Workflow
- **[build-workflow.md](.agents/build-workflow.md)** - **CRITICAL**: Build commands to run after changes (Plugin/Theme)
- **[testing.md](.agents/testing.md)** - Testing and manual installation procedures (Plugin/Theme)
- **[release-readiness.md](.agents/release-readiness.md)** - Comprehensive release readiness checklist (Plugin)
- **[common-tasks.md](.agents/common-tasks.md)** - Code examples and common patterns - expanded with settings, modals, views, status bar, ribbon icons (Plugin/Theme)
- **[code-patterns.md](.agents/code-patterns.md)** - Comprehensive code patterns for settings tabs, modals, views, file operations, workspace events (Plugin)
- **[common-pitfalls.md](.agents/common-pitfalls.md)** - Common mistakes and gotchas to avoid (Plugin)
- **[troubleshooting.md](.agents/troubleshooting.md)** - Common issues, error messages, and debugging techniques (Both)
- **[quick-reference.md](.agents/quick-reference.md)** - One-page cheat sheet for common tasks and commands (Both)
- **[agent-dos-donts.md](.agents/agent-dos-donts.md)** - Specific do's and don'ts for AI agents (Both)
- **[summarize-commands.md](.agents/summarize-commands.md)** - How to generate commit messages and release notes

### Reference Materials
- **[references.md](.agents/references.md)** - External links and resources
- **[ref-instructions.md](.agents/ref-instructions.md)** - Instructions for using the `.ref` folder
- **[sync-procedure.md](.agents/sync-procedure.md)** - Procedure for syncing content from Sample Plugin and API
- **[sync-status.json](.agents/sync-status.json)** - Central tracking of sync dates and status
- **[quick-sync-guide.md](.agents/quick-sync-guide.md)** - Quick reference for pulling updates from reference repos

## Important: .ref Folder

The `.ref` folder contains **symlinks** to reference materials (not actual files). It's gitignored and acts as a "portal" to other locations on the computer.

**For AI Agents**:
- **Only when user explicitly asks about API/docs**: Check if `.ref/obsidian-api` exists. If not, run the setup script to create it (see "When to Check .ref Folder Setup" above)
- **When asked to reference something**: Actively search for it using `list_dir`, `glob_file_search`, or `read_file`
- **When adding references**: 
  - External repos → Clone to `../.ref/obsidian-dev/` (global), then symlink in project's `.ref/`
  - Local projects → Symlink directly in project's `.ref/` (don't clone to global)
- **The `.ref` folder may be hidden** by default in file explorers, but it exists in the project root

**Setup**: The setup scripts (`scripts/setup-ref-links.*`) automatically:
1. Create `../.ref/` if it doesn't exist
2. Create `../.ref/obsidian-dev/` subfolder if it doesn't exist
3. Clone the 6 core Obsidian projects to `../.ref/obsidian-dev/` if they don't exist, or pull latest changes if they do exist
4. Create `../.ref/obsidian-dev/plugins/` and `../.ref/obsidian-dev/themes/` folders
5. Create symlinks in the project's `.ref/` folder pointing to `../.ref/obsidian-dev/`

**Philosophy**: It "just works" out of the box. The reference materials are cloned once and work indefinitely. The setup scripts automatically update repos when run, so you can keep them up to date by simply re-running the setup script. Updates are optional and only needed if you want the latest documentation. Most users never update, and that's perfectly fine.

See [ref-instructions.md](.agents/ref-instructions.md) for complete details.

## Important: .agents Folder

The `.agents/` directory contains guidance files tailored for Obsidian plugin development. This directory structure provides:

- **Plugin-specific guidance**: Files like `code-patterns.md`, `commands-settings.md`, and `release-readiness.md` are plugin-only
- **Shared guidance**: Files like `build-workflow.md`, `file-conventions.md`, and `versioning-releases.md` have sections for both plugins and themes
- **Project-specific content**: This `AGENTS.md` file remains project-specific and contains project-specific information
- **Easy maintenance**: Files can be updated by syncing from reference repositories

**Note**: The `.agents/` folder may be hidden by default in some file explorers, but it exists in the project root.

## Source Attribution

Each file in `.agents` includes a header comment with:
- Source(s) of the information
- Last sync date (for reference; see [sync-status.json](.agents/sync-status.json) for authoritative dates)
- Update frequency guidance

**Central Sync Tracking**: All sync dates are tracked centrally in [sync-status.json](.agents/sync-status.json). When syncing content, update this file with the actual current date (never use placeholder dates).

## Updating Content

Content in the `.agents/` directory is based on:
- **Obsidian API** (`.ref/obsidian-api/obsidian.d.ts`) - **Authoritative source** for all API information
- Obsidian Sample Plugin repository - Implementation patterns and best practices
- Obsidian Sample Theme repository - Theme patterns
- Obsidian Plugin Docs and Developer Docs - General guidance (may be outdated, always verify against API)
- Community best practices

**Important**: The `obsidian-api` repository is the authoritative source. When information conflicts between API and documentation, the API takes precedence. Always check `.ref/obsidian-api/obsidian.d.ts` first, especially for new features (e.g., `SettingGroup` since 1.11.0).

Check the source attribution in each file header for update frequency guidance. When the Obsidian Sample Plugin, Sample Theme, or API documentation is updated, relevant files here should be reviewed and updated accordingly.

**See [sync-procedure.md](.agents/sync-procedure.md) for the standard procedure to sync content from the latest Sample Plugin, Sample Theme, and API updates.**

## General Purpose / Reusable

The `.agents` directory structure and content is designed to be **general-purpose and reusable** across Obsidian plugin and theme projects. The content is based on official Obsidian repositories and documentation, not project-specific code. You can:

- Copy this structure to other Obsidian projects
- Use it as a template for new projects
- Share it with other developers
- Adapt it for your specific needs

The only project-specific content is in:
- This `AGENTS.md` file - Project-specific information and overrides (maintained by developer)
- `.agents/.context/` directory - Optional project-specific structure for complex projects (if it exists)
- `ref-instructions.md` - OS-agnostic setup instructions that may need path adjustments

Everything else syncs from official Obsidian sources.

## Troubleshooting

**If `.ref` folder is missing or empty**:
- Run the setup script: `scripts\setup-ref-links.bat` (Windows) or `./scripts/setup-ref-links.sh` (macOS/Linux)
- The script will automatically set everything up

**If `.agents` folder is missing**:
- The `.agents/` folder should exist in the project root
- If it's missing, it may need to be created or restored from the project template

**If symlinks are broken**:
- Re-run the appropriate setup script - it will recreate the symlinks

**If you can't find a reference**:
- Check [ref-instructions.md](.agents/ref-instructions.md) for organization
- Check this `AGENTS.md` file for project-specific references
- Use `list_dir` or `glob_file_search` to search `.ref/` folder

**If build fails**:
- See [build-workflow.md](.agents/build-workflow.md) for build commands
- See [troubleshooting.md](.agents/troubleshooting.md) for common issues
- See [common-pitfalls.md](.agents/common-pitfalls.md) for common mistakes
