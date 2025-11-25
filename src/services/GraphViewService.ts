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

export class GraphViewService {
  private plugin: PropertyOverFileNamePlugin;
  private modifiedPrototypes: GraphNode[] = [];

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  private createGetDisplayText(app: App) {
    return function getDisplayText(this: GraphNode): string {
      const plugin = (this as any).pov_plugin as PropertyOverFileNamePlugin;
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
        const fileCache = app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        if (frontmatter && frontmatter[plugin.settings.propertyKey] !== undefined && frontmatter[plugin.settings.propertyKey] !== null) {
          const propertyValue = String(frontmatter[plugin.settings.propertyKey]).trim();
          if (propertyValue !== '') {
            return propertyValue;
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
    // Try to get first node - handle both Set and custom collection types
    let firstNode: GraphNode | undefined;
    if (typeof (view.renderer.nodes as any).first === 'function') {
      firstNode = (view.renderer.nodes as any).first();
    } else if (view.renderer.nodes instanceof Set) {
      firstNode = view.renderer.nodes.values().next().value;
    } else {
      // Fallback: iterate to get first
      for (const node of view.renderer.nodes) {
        firstNode = node;
        break;
      }
    }

    if (firstNode) {
      const proto = firstNode.constructor.prototype;
      if (!proto.hasOwnProperty('pov_originalGetDisplayText') && !this.modifiedPrototypes.includes(proto)) {
        proto.pov_originalGetDisplayText = proto.getDisplayText;
        proto.getDisplayText = this.createGetDisplayText(this.plugin.app);
        // Store plugin reference on prototype for access in getDisplayText
        (proto as any).pov_plugin = this.plugin;
        
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
      delete (proto as any).pov_plugin;
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
    const appInternal = this.plugin.app as any;
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

