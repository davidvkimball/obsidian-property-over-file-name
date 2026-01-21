/**
 * Graph View Service
 *
 * This file contains code adapted from the Node Masquerade plugin by ElsaTam.
 * Original source: https://github.com/Kapirklaa/obsidian-node-masquerade
 *
 * The code has been modified to integrate with the Property Over File Name plugin
 * and use the plugin's property key setting instead of Node Masquerade's configuration.
 *
 * Original code is licensed under GPLv3. This file is also licensed under GPLv3.
 */

import { App, View, WorkspaceLeaf } from 'obsidian';
import { PropertyOverFileNamePlugin } from '../types';
import { frontmatterCache } from '../utils/frontmatter-cache';

// Static display settings - exactly like Node Masquerade
let graphDisplaySettings: { enableForGraphView: boolean; propertyKey: string; enableMdxSupport: boolean; app: App } | null = null;

function createGetDisplayText(app: App) {
	return function getDisplayText(this: GraphNode): string {
		if (!graphDisplaySettings?.enableForGraphView) {
			// If disabled, use original
			if (this.pov_originalGetDisplayText) {
				return this.pov_originalGetDisplayText();
			}
			throw new Error('pov_originalGetDisplayText does not exist on node');
		}

		// Try to get property value - exactly like Node Masquerade logic but for properties
		const file = app.vault.getFileByPath(this.id);

		if (file) {
			// For both MD and MDX files, try frontmatter parsing
			if ((file.extension === 'md' || (file.extension === 'mdx' && graphDisplaySettings.enableMdxSupport))) {
				if (file.extension === 'md') {
					// For MD files, use metadata cache directly (fast sync access)
					const fileCache = app.metadataCache.getFileCache(file);
					const mdFrontmatter = fileCache?.frontmatter;

					if (mdFrontmatter && mdFrontmatter[graphDisplaySettings.propertyKey] !== undefined && mdFrontmatter[graphDisplaySettings.propertyKey] !== null) {
						const propertyValue = String(mdFrontmatter[graphDisplaySettings.propertyKey]).trim();
						if (propertyValue !== '') {
							return propertyValue;
						}
					}
				} else if (file.extension === 'mdx') {
					// For MDX files, check cache first, then trigger async population if needed
					const cached = frontmatterCache.getSync(file.path);

					if (cached !== undefined) {
						if (cached && cached[graphDisplaySettings.propertyKey] !== undefined && cached[graphDisplaySettings.propertyKey] !== null) {
							const propertyValue = String(cached[graphDisplaySettings.propertyKey]).trim();
							if (propertyValue !== '') {
								return propertyValue;
							}
						}
					} else {
						// Trigger async load in background
						void frontmatterCache.get(app, file, { enableMdxSupport: graphDisplaySettings.enableMdxSupport, propertyKey: graphDisplaySettings.propertyKey } as any);
					}
				}
			}
		}

		// Fall back to original display text (file name) - exactly like Node Masquerade
		if (this.pov_originalGetDisplayText) {
			return this.pov_originalGetDisplayText();
		}
		throw new Error('pov_originalGetDisplayText does not exist on node');
	};
}

// Type definitions for graph view internals
interface GraphNodeCollection {
  first(): GraphNode | undefined;
  [Symbol.iterator](): Iterator<GraphNode>;
}

interface GraphView {
  renderer: {
    nodes: GraphNodeCollection;
    changed(): void;
  };
}

interface LocalGraphView {
  renderer: {
    nodes: GraphNodeCollection;
    changed(): void;
  };
}

interface GraphNode {
  id: string;
  text?: {
    text: string;
  };
  getDisplayText(): string;
  pov_originalGetDisplayText?: () => string;
}

interface GraphNodePrototype {
  getDisplayText(): string;
  pov_originalGetDisplayText?: () => string;
}

interface GraphNodeCollectionWithFirst extends GraphNodeCollection {
  first(): GraphNode | undefined;
}

export class GraphViewService {
  private plugin: PropertyOverFileNamePlugin;
  private modifiedPrototypes: GraphNodePrototype[] = [];

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
    // Set static display settings - exactly like Node Masquerade
    graphDisplaySettings = {
      enableForGraphView: plugin.settings.enableForGraphView,
      propertyKey: plugin.settings.propertyKey,
      enableMdxSupport: plugin.settings.enableMdxSupport,
      app: plugin.app
    };
  }


  private getGraphLeaves(): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = [];
    leaves.push(...this.plugin.app.workspace.getLeavesOfType('graph'));
    leaves.push(...this.plugin.app.workspace.getLeavesOfType('localgraph'));
    return [...new Set(leaves)];
  }

  private async overridePrototypes() {
    const leaves = this.getGraphLeaves();
    for (const leaf of leaves) {
      if (!(leaf.view instanceof View) || leaf.isDeferred) continue;
      const view = leaf.view as unknown as GraphView | LocalGraphView;
      await this.overridePrototype(view);
    }
  }

  private async overridePrototype(view: GraphView | LocalGraphView) {
    // Check if graph view has nodes loaded yet
    let nodeCount = 0;
    for (const graphNode of view.renderer.nodes) {
      nodeCount++;
    }

    if (nodeCount === 0) {
      // Graph view is empty, try again in 1 second
      setTimeout(() => {
        void this.overridePrototype(view);
      }, 1000);
      return;
    }

    // Pre-populate cache for MDX files in the graph
    if (graphDisplaySettings?.enableMdxSupport) {
      const mdxPromises: Promise<void>[] = [];

      for (const graphNode of view.renderer.nodes) {
        const file = graphDisplaySettings.app.vault.getFileByPath(graphNode.id);
        if (file && file.extension === 'mdx') {
          const promise = frontmatterCache.get(graphDisplaySettings.app, file, { enableMdxSupport: graphDisplaySettings.enableMdxSupport, propertyKey: graphDisplaySettings.propertyKey } as any);
          mdxPromises.push(promise.then(() => {}));
        }
      }

      // Wait for all MDX cache population to complete
      if (mdxPromises.length > 0) {
        await Promise.all(mdxPromises);
      }
    }

    const node = view.renderer.nodes.first();

    if (node) {
      const proto = node.constructor.prototype;
      if (!proto.hasOwnProperty('pov_originalGetDisplayText') && !this.modifiedPrototypes.contains(proto)) {
        proto.pov_originalGetDisplayText = proto.getDisplayText;
        proto.getDisplayText = createGetDisplayText(this.plugin.app);
        let updatedCount = 0;
        for (const node of view.renderer.nodes) {
          if (node.text) {
            node.text.text = node.getDisplayText();
            updatedCount++;
          }
        }
        view.renderer.changed();
        this.modifiedPrototypes.push(proto);
      }
    }
  }

  private restorePrototypes() {
    for (const proto of this.modifiedPrototypes) {
      if (typeof proto.pov_originalGetDisplayText === 'function') {
        proto.getDisplayText = proto.pov_originalGetDisplayText;
        delete proto.pov_originalGetDisplayText;
      }
    }
    this.modifiedPrototypes = [];
    this.rewriteNames();
  }

  rewriteNames() {
    const leaves = this.getGraphLeaves();
    for (const leaf of leaves) {
      if (!(leaf.view instanceof View) || leaf.isDeferred) continue;
      const view = leaf.view as unknown as GraphView | LocalGraphView;
      for (const node of view.renderer.nodes) {
        if (node.text) node.text.text = node.getDisplayText();
      }
      view.renderer.changed();
    }
  }

  onLayoutChange() {
    if (!this.plugin.settings.enableForGraphView) {
      this.restorePrototypes();
      return;
    }

    // Check if graph plugin is loaded - exactly like Node Masquerade
    const appInternal = this.plugin.app as any;
    const isGraphLoaded = appInternal.internalPlugins.getPluginById("graph")?._loaded;
    if (!isGraphLoaded) return;

    void this.overridePrototypes();
  }


  updateGraphView() {
    // Update static display settings when plugin settings change
    if (graphDisplaySettings) {
      graphDisplaySettings.enableForGraphView = this.plugin.settings.enableForGraphView;
      graphDisplaySettings.propertyKey = this.plugin.settings.propertyKey;
      graphDisplaySettings.enableMdxSupport = this.plugin.settings.enableMdxSupport;
    }

    if (this.plugin.settings.enableForGraphView) {
      void this.overridePrototypes();
    } else {
      this.restorePrototypes();
    }
  }

  refreshGraphView() {
    if (this.plugin.settings.enableForGraphView) {
      this.rewriteNames();
    }
  }

  onunload() {
    this.restorePrototypes();
  }
}

