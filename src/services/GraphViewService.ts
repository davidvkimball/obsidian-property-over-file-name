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
  pov_plugin?: PropertyOverFileNamePlugin;
}

interface GraphNodePrototype {
  getDisplayText(): string;
  pov_originalGetDisplayText?: () => string;
  pov_plugin?: PropertyOverFileNamePlugin;
}

interface GraphNodeCollectionWithFirst extends GraphNodeCollection {
  first(): GraphNode | undefined;
}

export class GraphViewService {
  private plugin: PropertyOverFileNamePlugin;
  private modifiedPrototypes: GraphNodePrototype[] = [];

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  private createGetDisplayText(app: App) {
    return function getDisplayText(this: GraphNode): string {
      const plugin = this.pov_plugin;
      if (!plugin || !plugin.settings.enableForGraphView) {
        // If disabled or plugin not found, use original
        if (this.pov_originalGetDisplayText) {
          return this.pov_originalGetDisplayText();
        }
        throw new Error('pov_originalGetDisplayText does not exist on node');
      }

      // Try to get property value
      const file = app.vault.getFileByPath(this.id);
      if (file) {
        // For MD files, use metadata cache directly (fast sync access)
        if (file.extension === 'md') {
          const fileCache = app.metadataCache.getFileCache(file);
          const mdFrontmatter = fileCache?.frontmatter;
          if (mdFrontmatter && mdFrontmatter[plugin.settings.propertyKey] !== undefined && mdFrontmatter[plugin.settings.propertyKey] !== null) {
            const propertyValue = String(mdFrontmatter[plugin.settings.propertyKey]).trim();
            if (propertyValue !== '') {
              return propertyValue;
            }
          }
        }
        
        // For MDX files, use cache (populated async, but accessed sync)
        if (file.extension === 'mdx' && plugin.settings.enableMdxSupport) {
          // Trigger async read to populate cache if not already cached (fire and forget)
          const cached = frontmatterCache.getSync(file.path);
          if (!cached) {
            void frontmatterCache.get(app, file, plugin.settings);
          }
          
          // Try to get from cache
          const frontmatter = frontmatterCache.getSync(file.path);
          if (frontmatter && frontmatter[plugin.settings.propertyKey] !== undefined && frontmatter[plugin.settings.propertyKey] !== null) {
            const propertyValue = String(frontmatter[plugin.settings.propertyKey]).trim();
            if (propertyValue !== '') {
              return propertyValue;
            }
          }
        }
      }

      // Fall back to original display text (file name)
      if (this.pov_originalGetDisplayText) {
        return this.pov_originalGetDisplayText();
      }
      throw new Error('pov_originalGetDisplayText does not exist on node');
    };
  }

  private getGraphLeaves(): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = [];
    leaves.push(...this.plugin.app.workspace.getLeavesOfType('graph'));
    leaves.push(...this.plugin.app.workspace.getLeavesOfType('localgraph'));
    return [...new Set(leaves)];
  }

  private overridePrototypes() {
    if (!this.plugin.settings.enableForGraphView) {
      return;
    }

    const leaves = this.getGraphLeaves();
    for (const leaf of leaves) {
      if (!(leaf.view instanceof View) || leaf.isDeferred) continue;
      const view = leaf.view as unknown as GraphView | LocalGraphView;
      this.overridePrototype(view);
    }
  }

  private overridePrototype(view: GraphView | LocalGraphView) {
    // Pre-populate cache for MDX files in the graph
    if (this.plugin.settings.enableMdxSupport) {
      void (async () => {
        for (const node of view.renderer.nodes) {
          const file = this.plugin.app.vault.getFileByPath(node.id);
          if (file && file.extension === 'mdx') {
            // Trigger async read to populate cache
            void frontmatterCache.get(this.plugin.app, file, this.plugin.settings);
          }
        }
      })();
    }

    // Try to get first node - handle both Set and custom collection types
    let firstNode: GraphNode | undefined;
    const nodesWithFirst = view.renderer.nodes as GraphNodeCollectionWithFirst;
    if (typeof nodesWithFirst.first === 'function') {
      firstNode = nodesWithFirst.first();
    } else if (view.renderer.nodes instanceof Set) {
      firstNode = (view.renderer.nodes.values().next().value as GraphNode | undefined);
    } else {
      // Fallback: iterate to get first
      for (const node of view.renderer.nodes) {
        firstNode = node;
        break;
      }
    }

    if (firstNode) {
      const proto = firstNode.constructor.prototype as GraphNodePrototype;
      if (!proto.hasOwnProperty('pov_originalGetDisplayText') && !this.modifiedPrototypes.includes(proto)) {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Function is designed to be called with `this` as GraphNode
        proto.pov_originalGetDisplayText = proto.getDisplayText;
        const getDisplayTextFn = this.createGetDisplayText(this.plugin.app);
        proto.getDisplayText = getDisplayTextFn;
        // Store plugin reference on prototype for access in getDisplayText
        proto.pov_plugin = this.plugin;
        
        // Update all existing nodes
        for (const node of view.renderer.nodes) {
          if (node.text) {
            node.text.text = node.getDisplayText();
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
      delete proto.pov_plugin;
    }
    this.modifiedPrototypes = [];
    this.rewriteNames();
  }

  private rewriteNames() {
    const leaves = this.getGraphLeaves();
    for (const leaf of leaves) {
      if (!(leaf.view instanceof View) || leaf.isDeferred) continue;
      const view = leaf.view as unknown as GraphView | LocalGraphView;
      for (const node of view.renderer.nodes) {
        if (node.text) {
          node.text.text = node.getDisplayText();
        }
      }
      view.renderer.changed();
    }
  }

  onLayoutChange() {
    if (!this.plugin.settings.enableForGraphView) {
      this.restorePrototypes();
      return;
    }
    
    // Check if graph plugin is loaded
    const appInternal = this.plugin.app as App & { internalPlugins?: { getPluginById?: (id: string) => { _loaded?: boolean } | null } };
    const graphPlugin = appInternal.internalPlugins?.getPluginById?.('graph');
    if (!graphPlugin?._loaded) return;
    
    this.overridePrototypes();
  }

  updateGraphView() {
    if (this.plugin.settings.enableForGraphView) {
      this.overridePrototypes();
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

