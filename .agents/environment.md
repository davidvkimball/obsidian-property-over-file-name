<!--
Source: Based on Obsidian Sample Plugin and Sample Theme
Last synced: See sync-status.json for authoritative sync dates
Update frequency: Check Obsidian Sample Plugin and Sample Theme repos for updates
Applicability: Plugin / Theme
-->

# Environment & tooling

## Plugins

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

**Important for AI Agents**: Always run `npm run build` after making changes to plugins to catch build errors early. If npm is not installed, install Node.js (which includes npm). Do not run `npm install` to install npm itself - that command installs project dependencies.

### Linting

**Recommended**: Use `eslint-plugin-obsidianmd` (npm package name) for Obsidian-specific linting rules. The repository is at `.ref/eslint-plugin/` - see its README for setup and complete rule documentation.

**Basic ESLint setup**:
- Install: `npm install -D eslint eslint-plugin-obsidianmd`
- Configure ESLint to use the `obsidianmd` plugin (see `.ref/eslint-plugin/README.md` for configuration examples)
- Run: `eslint src/` (or `eslint src/main.ts` for a single file)
- ESLint will report suggestions for code improvement by file and line number

**Common issues caught by `eslint-plugin-obsidianmd`**: See [common-pitfalls.md](common-pitfalls.md#common-linting-issues) for details on style manipulation, settings headings, UI text case, file deletion, and more.

## Themes

- **Optional**: Node.js and npm if using SCSS/Sass preprocessors or build tools.
- **Simple themes**: Can be developed with just CSS and `manifest.json` (no build tools required).
- **SCSS themes**: Use Sass/SCSS compiler (e.g., `sass`, `node-sass`, or build tools like Vite).
- No TypeScript or bundler required for basic themes.

### Simple Theme Setup

No build tools needed - just edit `theme.css` directly.

### SCSS Theme Setup

```bash
npm install -D sass
npm run build  # Compile SCSS to CSS
```

### Theme Build (Grunt)

For themes using Grunt (like Obsidian Sample Theme):

```bash
npx grunt build
```

**Important for AI Agents**: Always run `npx grunt build` after making changes to themes to catch build errors early. If npm is not installed, install Node.js (which includes npm). Do not run `npm install` to install npm itself - that command installs project dependencies.

### Linting (Optional)

- Use `stylelint` for CSS/SCSS linting: `npm install -D stylelint`
- Configure stylelint for Obsidian theme conventions


