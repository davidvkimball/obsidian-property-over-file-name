/**
 * Clean-room implementation for graph/local graph node labeling.
 *
 * This file is an original implementation written for Property Over File Name.
 * It is not derived from any GPL-licensed code.
 */
import { TFile } from 'obsidian';
import type { PropertyOverFileNamePlugin } from '../types';
import { frontmatterCache } from '../utils/frontmatter-cache';

type GraphLeafType = 'graph' | 'localgraph';

type GraphNodeText = { text: string };

type GraphNode = {
  id?: unknown; // likely file path, but can vary across Obsidian versions
  text?: GraphNodeText;
  getDisplayText?: () => string;
};

type GraphRenderer = {
  nodes?: unknown;
  changed?: () => void;
};

type GraphView = {
  renderer?: GraphRenderer;
};

type LeafLike = {
  id?: string;
  view?: GraphView;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function coerceFrontmatterValueToLabel(value: unknown): string | null {
  if (isNonEmptyString(value)) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

function getLeafKey(leafType: GraphLeafType, leafId: string): string {
  return `${leafType}:${leafId}`;
}

function asLeafLike(value: unknown): LeafLike | null {
  if (!value || typeof value !== 'object') return null;
  return value;
}

function isGraphNode(value: unknown): value is GraphNode {
  if (!value || typeof value !== 'object') return false;
  const v = value as { id?: unknown; text?: { text?: unknown }; getDisplayText?: unknown };
  return typeof v.id === 'string' || typeof v.text?.text === 'string';
}

function isNodeTextCarrier(node: GraphNode): node is GraphNode & { text: GraphNodeText } {
  return !!node.text && typeof node.text.text === 'string';
}

function iterateGraphNodes(nodes: unknown, cb: (node: GraphNode) => void): void {
  if (!nodes) return;
  try {
    if (nodes instanceof Map) {
      for (const v of nodes.values()) if (isGraphNode(v)) cb(v);
      return;
    }
    if (nodes instanceof Set) {
      for (const v of nodes.values()) if (isGraphNode(v)) cb(v);
      return;
    }
    if (Array.isArray(nodes)) {
      for (const v of nodes) if (isGraphNode(v)) cb(v);
      return;
    }

    const maybeIterable = nodes as { [Symbol.iterator]?: () => Iterator<unknown> };
    if (typeof maybeIterable[Symbol.iterator] === 'function') {
      for (const v of nodes as Iterable<unknown>) if (isGraphNode(v)) cb(v);
      return;
    }

    if (typeof nodes === 'object' && nodes) {
      for (const v of Object.values(nodes as Record<string, unknown>)) if (isGraphNode(v)) cb(v);
    }
  } catch {
    // ignore
  }
}

export class GraphViewService {
  private plugin: PropertyOverFileNamePlugin;

  private observer?: MutationObserver;
  private refreshTimer?: number;
  private retryTimers = new Set<number>();

  private pendingMdxRefreshPaths = new Set<string>();
  private pendingMdxRefreshTimer?: number;

  private installed = false;
  private originalsByPrototype = new Map<object, (this: GraphNode) => string>();
  private originalNodeText = new WeakMap<object, string>();

  // Track which leaves we've already attempted to patch (best-effort identity).
  private seenLeaves = new Set<string>();

  private basenameIndex = new Map<string, TFile>();
  private basenameIndexBuiltForMdxSupport: boolean | null = null;

  constructor(plugin: PropertyOverFileNamePlugin) {
    this.plugin = plugin;
  }

  onLayoutChange(): void {
    // Layout changes can create/destroy graph views.
    this.updateGraphView();
  }

  updateGraphView(): void {
    if (!this.plugin.settings.enableForGraphView) {
      this.teardown();
      return;
    }

    this.ensureObserver();
    this.ensurePatchedForOpenLeaves();
    this.refreshGraphView();
  }

  refreshGraphView(): void {
    if (!this.plugin.settings.enableForGraphView) return;
    this.ensurePatchedForOpenLeaves();
    this.triggerRenderOnAllGraphViewsWithRetry();
  }

  onunload(): void {
    this.teardown();
  }

  // --- Patch management ---

  private ensurePatchedForOpenLeaves(): void {
    if (!this.plugin.settings.enableForGraphView) return;

    const leaves = this.getGraphLeaves();
    for (const { leafType, leaf } of leaves) {
      const leafLike = asLeafLike(leaf);
      const leafId = leafLike?.id;
      const leafKey = getLeafKey(leafType, isNonEmptyString(leafId) ? leafId : String(leaf));
      if (!this.seenLeaves.has(leafKey)) this.seenLeaves.add(leafKey);
      this.tryInstallPatchFromLeaf(leaf);
    }
  }

  private tryInstallPatchFromLeaf(leaf: unknown): void {
    const view = asLeafLike(leaf)?.view;
    const renderer = view?.renderer;
    if (!renderer) return;

    const nodes = renderer.nodes;
    if (!nodes) return;

    const sampleNode = this.pickAnyNode(nodes);
    if (!sampleNode) return;

    const protoUnknown: unknown = Object.getPrototypeOf(sampleNode);
    if (!protoUnknown || typeof protoUnknown !== 'object') return;
    const proto = protoUnknown;

    const protoWithMethod = proto as { getDisplayText?: (this: GraphNode) => string };
    const current = protoWithMethod.getDisplayText;
    if (typeof current !== 'function') return;

    if (this.originalsByPrototype.has(proto)) {
      this.installed = true;
      return;
    }

    const original = current;
    this.originalsByPrototype.set(proto, original);

    const resolveLabel = (node: GraphNode): string => {
      // Prefer per-node `.text.text` if present (Obsidian sometimes caches label there),
      // but always allow falling back to original.
      const fallback = safeCall(original, node);
      const label = this.computeNodeLabel(node);
      return label ?? fallback;
    };

    protoWithMethod.getDisplayText = function patchedGetDisplayText(this: GraphNode): string {
      return resolveLabel(this);
    };

    // Mark installed and refresh.
    this.installed = true;
  }

  private teardown(): void {
    this.disconnectObserver();
    this.clearAllTimers();
    this.restoreNodeTextsFromOpenLeaves();
    this.restoreAllPatches();
    this.seenLeaves.clear();
    this.pendingMdxRefreshPaths.clear();
    this.originalNodeText = new WeakMap<object, string>();
  }

  private restoreNodeTextsFromOpenLeaves(): void {
    const leaves = this.getGraphLeaves();
    for (const { leaf } of leaves) {
      const view = asLeafLike(leaf)?.view;
      const nodes = view?.renderer?.nodes;
      if (!nodes) continue;

      iterateGraphNodes(nodes, (node) => {
        if (!node || typeof node !== 'object') return;
        if (!isNodeTextCarrier(node)) return;
        const original = this.originalNodeText.get(node);
        if (original !== undefined) node.text.text = original;
      });
    }
  }

  private restoreAllPatches(): void {
    for (const [proto, original] of this.originalsByPrototype.entries()) {
      try {
        (proto as { getDisplayText?: (this: GraphNode) => string }).getDisplayText = original;
      } catch {
        // best-effort restore
      }
    }
    this.originalsByPrototype.clear();
    this.installed = false;
  }

  // --- Observer / refresh ---

  private ensureObserver(): void {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      if (!this.plugin.settings.enableForGraphView) return;
      // Debounce to avoid hammering renderer.changed() during large layout operations.
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = undefined;
        this.ensurePatchedForOpenLeaves();
        this.triggerRenderOnAllGraphViewsWithRetry();
      }, 150);
    });

    this.observer.observe(activeDocument.body, { childList: true, subtree: true });
  }

  private disconnectObserver(): void {
    if (!this.observer) return;
    try {
      this.observer.disconnect();
    } finally {
      this.observer = undefined;
    }
  }

  private triggerRenderOnAllGraphViewsWithRetry(): void {
    const leaves = this.getGraphLeaves();
    for (const { leaf } of leaves) {
      this.triggerRenderWithRetry(leaf);
    }
  }

  private triggerRenderWithRetry(leaf: unknown): void {
    const maxAttempts = 8;
    const baseDelayMs = 80;

    const attempt = (n: number) => {
      const view = asLeafLike(leaf)?.view;
      const renderer = view?.renderer;

      const changed = renderer?.changed;
      const nodes = renderer?.nodes;

      // If renderer is present but nodes aren't ready yet, retry.
      if (!renderer || typeof changed !== 'function' || !nodes) {
        if (n >= maxAttempts) return;
        const delay = Math.min(1500, baseDelayMs * Math.pow(2, n));
        const t = window.setTimeout(() => {
          this.retryTimers.delete(t);
          attempt(n + 1);
        }, delay);
        this.retryTimers.add(t);
        return;
      }

      // Ensure patch installed once nodes exist.
      this.tryInstallPatchFromLeaf(leaf);
      this.applyLabelsToOpenNodes(renderer, leaf);

      try {
        changed.call(renderer);
      } catch {
        // best-effort
      }
    };

    attempt(0);
  }

  private applyLabelsToOpenNodes(renderer: GraphRenderer, leaf: unknown): void {
    const nodes = renderer.nodes;
    if (!nodes) return;

    iterateGraphNodes(nodes, (node) => {
      if (!isNodeTextCarrier(node)) return;
      if (!this.plugin.settings.enableForGraphView) return;

      const label = this.computeNodeLabel(node);
      if (label === null) return;

      const nodeObj = node as unknown as object;
      if (!this.originalNodeText.has(nodeObj)) {
        this.originalNodeText.set(nodeObj, node.text.text);
      }
      node.text.text = label;
    });
  }

  private clearAllTimers(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;

    for (const t of this.retryTimers) window.clearTimeout(t);
    this.retryTimers.clear();

    if (this.pendingMdxRefreshTimer) window.clearTimeout(this.pendingMdxRefreshTimer);
    this.pendingMdxRefreshTimer = undefined;
  }

  // --- Label computation ---

  private computeNodeLabel(node: GraphNode): string | null {
    if (!this.plugin.settings.enableForGraphView) return null;

    const propertyKey = this.plugin.settings.propertyKey?.trim() || 'title';

    const fileFromId = this.resolveFileFromNodeId(node.id);
    const nodeObj = node as unknown as object;
    const nodeTextForResolution = this.originalNodeText.get(nodeObj) ?? node.text?.text;
    const file = fileFromId ?? this.resolveFileFromNodeLabel(nodeTextForResolution);
    if (!(file instanceof TFile)) return null;

    if (file.extension !== 'md' && (file.extension !== 'mdx' || !this.plugin.settings.enableMdxSupport)) return null;

    if (file.extension === 'md') {
      const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
      const fmRecord = fm && typeof fm === 'object' ? (fm as Record<string, unknown>) : undefined;
      const label = coerceFrontmatterValueToLabel(fmRecord?.[propertyKey]);
      return label;
    }

    // mdx
    const cached = frontmatterCache.getSync(file.path);
    if (cached === undefined) {
      // Kick off async load; refresh later once loaded.
      this.scheduleMdxLoadAndRefresh(file, propertyKey);
      return null;
    }
    const cachedRecord = cached && typeof cached === 'object' ? cached : undefined;
    const label = coerceFrontmatterValueToLabel(cachedRecord?.[propertyKey]);
    return label;
  }

  private ensureBasenameIndex(): void {
    const mdxEnabled = this.plugin.settings.enableMdxSupport;
    if (this.basenameIndexBuiltForMdxSupport === mdxEnabled && this.basenameIndex.size > 0) return;

    this.basenameIndexBuiltForMdxSupport = mdxEnabled;
    this.basenameIndex.clear();

    const files = this.plugin.app.vault.getFiles();
    for (const file of files) {
      if (!(file instanceof TFile)) continue;
      if (file.extension === 'md') {
        if (!this.basenameIndex.has(file.basename)) this.basenameIndex.set(file.basename, file);
        continue;
      }
      if (file.extension === 'mdx' && mdxEnabled) {
        if (!this.basenameIndex.has(file.basename)) this.basenameIndex.set(file.basename, file);
      }
    }
  }

  private resolveFileFromNodeLabel(labelText: unknown): TFile | null {
    if (typeof labelText !== 'string') return null;
    const base = cleanLabelToBasename(labelText);
    if (!isNonEmptyString(base)) return null;

    this.ensureBasenameIndex();
    return this.basenameIndex.get(base) ?? null;
  }

  private resolveFileFromNodeId(nodeId: unknown): TFile | null {
    if (typeof nodeId !== 'string') return null;

    const normalizedId = normalizeVaultPath(nodeId);
    if (!isNonEmptyString(normalizedId)) return null;

    const enableMdx = this.plugin.settings.enableMdxSupport;
    const lower = normalizedId.toLowerCase();
    const candidates = new Set<string>();
    candidates.add(normalizedId);

    if (lower.endsWith('.mdx')) {
      if (!enableMdx) return null;
      candidates.add(normalizedId);
      candidates.add(normalizedId.slice(0, -4) + '.md');
    } else if (lower.endsWith('.md')) {
      candidates.add(normalizedId);
      if (enableMdx) candidates.add(normalizedId.slice(0, -3) + '.mdx');
    } else {
      candidates.add(normalizedId + '.md');
      if (enableMdx) candidates.add(normalizedId + '.mdx');
    }

    for (const candidate of candidates) {
      const file = this.plugin.app.vault.getAbstractFileByPath(candidate);
      if (!(file instanceof TFile)) continue;
      if (file.extension === 'md') return file;
      if (file.extension === 'mdx' && enableMdx) return file;
    }

    // Last-resort: match by basename extracted from the node id.
    const cleaned = normalizedId.split(/[/\\]/).pop() ?? normalizedId;
    const base = stripMdExtension(cleaned);
    if (!isNonEmptyString(base)) return null;
    this.ensureBasenameIndex();
    return this.basenameIndex.get(base) ?? null;
  }

  private scheduleMdxLoadAndRefresh(file: TFile, _key: string): void {
    // Coalesce refreshes: multiple nodes can request the same MDX file.
    if (this.pendingMdxRefreshPaths.has(file.path)) return;
    this.pendingMdxRefreshPaths.add(file.path);

    void frontmatterCache
      .get(this.plugin.app, file, this.plugin.settings)
      .catch(() => null)
      .finally(() => {
        // If multiple files resolve quickly, do a single refresh.
        if (this.pendingMdxRefreshTimer) return;
        this.pendingMdxRefreshTimer = window.setTimeout(() => {
          this.pendingMdxRefreshTimer = undefined;
          this.pendingMdxRefreshPaths.clear();
          this.refreshGraphView();
        }, 200);
      });
  }

  // --- Leaf helpers ---

  private getGraphLeaves(): Array<{ leafType: GraphLeafType; leaf: unknown }> {
    const out: Array<{ leafType: GraphLeafType; leaf: unknown }> = [];
    const workspace = this.plugin.app.workspace as unknown as { getLeavesOfType?: (type: string) => unknown };

    const graphLeavesUnknown = workspace.getLeavesOfType?.('graph');
    const graphLeaves = Array.isArray(graphLeavesUnknown) ? graphLeavesUnknown : [];
    for (const leaf of graphLeaves) out.push({ leafType: 'graph', leaf });

    const localGraphLeavesUnknown = workspace.getLeavesOfType?.('localgraph');
    const localGraphLeaves = Array.isArray(localGraphLeavesUnknown) ? localGraphLeavesUnknown : [];
    for (const leaf of localGraphLeaves) out.push({ leafType: 'localgraph', leaf });

    return out;
  }

  private pickAnyNode(nodes: unknown): GraphNode | null {
    // Obsidian uses different internal structures across versions.
    // Try common shapes: Map, Set, plain object, array-like.
    try {
      if (nodes instanceof Map) {
        for (const v of nodes.values() as IterableIterator<unknown>) {
          if (isGraphNode(v)) return v;
        }
      }
      if (nodes instanceof Set) {
        for (const v of nodes.values() as IterableIterator<unknown>) {
          if (isGraphNode(v)) return v;
        }
      }
      if (Array.isArray(nodes)) {
        const first: unknown = (nodes as unknown[])[0];
        return isGraphNode(first) ? first : null;
      }
      if (typeof nodes === 'object' && nodes) {
        const values = Object.values(nodes as Record<string, unknown>);
        const first = values[0];
        return isGraphNode(first) ? first : null;
      }
    } catch {
      // ignore
    }
    return null;
  }
}

function normalizeVaultPath(raw: string): string {
  let v = raw.trim();
  if (v.startsWith('file://')) v = v.slice('file://'.length);
  if (v.startsWith('vault://')) v = v.slice('vault://'.length);
  if (v.startsWith('obsidian://')) v = v.slice('obsidian://'.length);
  return v;
}

function stripMdExtension(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.mdx')) return path.slice(0, -4);
  if (lower.endsWith('.md')) return path.slice(0, -3);
  return path;
}

function cleanLabelToBasename(label: string): string {
  const trimmed = label.trim();
  const lastSegment = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return stripMdExtension(lastSegment);
}

function safeCall(fn: (this: GraphNode) => string, self: GraphNode): string {
  try {
    return fn.call(self);
  } catch {
    // As a last resort, use whatever we can find on node.text.
    const direct = self?.text?.text;
    return isNonEmptyString(direct) ? direct : '';
  }
}

