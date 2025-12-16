<!--
Source: Project-specific (not synced from reference repos)
Last updated: [Maintain manually - this file is project-specific]
Applicability: Plugin

IMPORTANT: This file contains project-specific information and can override
general guidance in other .agents files. When syncing updates from reference
repos, this file is preserved and not overwritten.
-->

# Project Context: Sample Plugin

## Project Overview

This is the **Obsidian Sample Plugin** - a reference/template plugin that demonstrates basic Obsidian plugin API functionality. It serves as:

- A learning resource for new plugin developers
- A template for creating new Obsidian plugins
- A reference implementation for common plugin patterns

**Current functionality:**
- Adds a ribbon icon that shows a Notice when clicked
- Adds a command "Open Sample Modal" which opens a Modal
- Adds a plugin setting tab to the settings page
- Registers a global click event and outputs 'click' to the console
- Registers a global interval which logs 'setInterval' to the console

## Important Project-Specific Details

- **Project Type**: Template/Reference plugin (not intended for production use)
- **Purpose**: Educational and template purposes
- **Status**: Maintained by Obsidian team as a reference implementation
- This plugin demonstrates basic patterns that other plugins can learn from

## Maintenance Tasks

- **README.md**: When asked to update documentation or when making significant changes, review and update `README.md` to ensure it accurately reflects the current state of the project, including features, installation instructions, and usage examples.
- Keep the sample functionality simple and clear for educational purposes
- Ensure all examples follow Obsidian best practices

## Project-Specific Conventions

- Code should remain simple and well-commented for educational purposes
- Examples should demonstrate one concept clearly rather than complex integrations
- Follow the standard Obsidian plugin structure (main.ts, manifest.json, styles.css)

## Project-Specific References

If this project references specific plugins or themes that are relevant to its development, document them here. These should be symlinked in `.ref/plugins/` or `.ref/themes/` as needed.

**Example structure**:
- `.ref/plugins/plugin-name/` - Reference to a specific plugin that demonstrates patterns used in this project
- `.ref/themes/theme-name/` - Reference to a specific theme that demonstrates patterns used in this project

**Note**: The 6 core Obsidian projects (obsidian-api, obsidian-sample-plugin, obsidian-developer-docs, obsidian-plugin-docs, obsidian-sample-theme, eslint-plugin) are always relevant and should be in every project's `.ref` folder. Only document project-specific plugins/themes here.

**Current project-specific references**: None currently.

## Overrides (Optional)

None currently. This project follows the general `.agents` guidance.

## Key Files and Their Purposes

- `main.ts` - Main plugin entry point with sample functionality
- `manifest.json` - Plugin metadata and configuration
- `styles.css` - Plugin-specific styles (currently minimal)
- `README.md` - Project documentation and usage instructions
- `package.json` - Node.js dependencies and build scripts
- `esbuild.config.mjs` - Build configuration for TypeScript compilation
- `version-bump.mjs` - Script for version management
- `versions.json` - Version compatibility mapping

## Development Notes

- This is a template project - when used as a template, developers should customize `project-context.md` with their own project details
- The `.agents` folder structure is designed to be reusable across projects
- When syncing updates from reference repos, only general `.agents` files are updated; `project-context.md` is preserved

### When to Consider Using `.agents/.context/` Directory

If your project needs project-specific versions of multiple `.agents` files (e.g., custom `build-workflow.md`, `code-patterns.md`, etc.), consider creating a `.agents/.context/` directory structure. This advanced feature is optional and only needed for complex projects. See `AGENTS.md` for details on the `.context/` directory structure.

