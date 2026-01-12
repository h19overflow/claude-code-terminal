/**
 * SplitLayoutManager - Manages split pane layout for terminals
 *
 * Handles:
 * - Horizontal and vertical splits
 * - Nested splits (splits within splits)
 * - Active pane tracking
 * - Pane resize handles
 */

export type SplitDirection = 'horizontal' | 'vertical';
export type PaneId = string;

export interface SplitPaneNode {
    id: PaneId;
    type: 'pane' | 'split';
    parent: SplitPaneNode | null;

    // For type === 'pane'
    instanceId?: string;

    // For type === 'split'
    direction?: SplitDirection;
    children?: [SplitPaneNode, SplitPaneNode];
    sizes?: [number, number]; // Percentage: [50, 50]
}

export interface SplitLayout {
    root: SplitPaneNode;
    activePane: PaneId;
}

export class SplitLayoutManager {
    private layout: SplitLayout;
    private onChange: (layout: SplitLayout) => void;
    private nextId = 1;

    constructor(onChange: (layout: SplitLayout) => void) {
        this.onChange = onChange;

        // Initialize with single pane
        const rootPane = this.createPaneNode(null, null);
        this.layout = {
            root: rootPane,
            activePane: rootPane.id  // Use the actual pane ID
        };
    }

    /**
     * Create a pane node
     */
    private createPaneNode(parent: SplitPaneNode | null, instanceId: string | null): SplitPaneNode {
        return {
            id: this.nextId++.toString(),
            type: 'pane',
            parent,
            instanceId: instanceId || undefined
        };
    }

    /**
     * Create a split node
     */
    private createSplitNode(
        parent: SplitPaneNode | null,
        direction: SplitDirection,
        children: [SplitPaneNode, SplitPaneNode]
    ): SplitPaneNode {
        const node: SplitPaneNode = {
            id: this.nextId++.toString(),
            type: 'split',
            parent,
            direction,
            children,
            sizes: [50, 50]
        };

        // Update children's parent
        children[0].parent = node;
        children[1].parent = node;

        return node;
    }

    /**
     * Find a pane node by ID
     */
    private findNode(nodeId: PaneId, root: SplitPaneNode = this.layout.root): SplitPaneNode | null {
        if (root.id === nodeId) {
            return root;
        }

        if (root.type === 'split' && root.children) {
            return this.findNode(nodeId, root.children[0]) || this.findNode(nodeId, root.children[1]);
        }

        return null;
    }

    /**
     * Split a pane in the given direction
     */
    splitPane(paneId: PaneId, direction: SplitDirection, newInstanceId: string): PaneId | null {
        const node = this.findNode(paneId);
        if (!node || node.type !== 'pane') {
            return null;
        }

        const parent = node.parent;
        const newPane = this.createPaneNode(null, newInstanceId);
        const splitNode = this.createSplitNode(parent, direction, [node, newPane]);

        // Replace node in parent
        if (parent && parent.type === 'split' && parent.children) {
            if (parent.children[0].id === node.id) {
                parent.children[0] = splitNode;
            } else {
                parent.children[1] = splitNode;
            }
        } else {
            // Root node split
            this.layout.root = splitNode;
        }

        this.layout.activePane = newPane.id;
        this.notifyChange();
        return newPane.id;
    }

    /**
     * Close a pane and promote sibling to fill the space
     * Returns the instance ID of the closed pane for cleanup
     */
    closePane(paneId: PaneId): string | undefined {
        const node = this.findNode(paneId);
        if (!node || node.type !== 'pane') {
            return undefined;
        }

        const closedInstanceId = node.instanceId;
        const parent = node.parent;

        // If this is the root and only pane, can't close
        if (!parent) {
            return undefined;
        }

        // Find sibling
        if (parent.type === 'split' && parent.children) {
            const sibling = parent.children[0].id === node.id
                ? parent.children[1]
                : parent.children[0];

            const grandparent = parent.parent;

            // Replace parent split with sibling (sibling inherits parent's position)
            if (grandparent && grandparent.type === 'split' && grandparent.children) {
                // Sibling replaces parent in grandparent's children
                if (grandparent.children[0].id === parent.id) {
                    grandparent.children[0] = sibling;
                } else {
                    grandparent.children[1] = sibling;
                }
                sibling.parent = grandparent;
            } else {
                // Parent was root - sibling becomes new root
                this.layout.root = sibling;
                sibling.parent = null;
            }

            // Update active pane to sibling (or first pane within sibling if it's a split)
            if (this.layout.activePane === paneId) {
                this.layout.activePane = this.getFirstPaneId(sibling);
            }

            this.notifyChange();
            return closedInstanceId;
        }

        return undefined;
    }

    /**
     * Get first pane ID in tree
     */
    private getFirstPaneId(node: SplitPaneNode): PaneId {
        if (node.type === 'pane') {
            return node.id;
        }
        return this.getFirstPaneId(node.children![0]);
    }

    /**
     * Set active pane
     * @param triggerRender - If false, won't trigger onChange (for focus-only updates)
     */
    setActivePane(paneId: PaneId, triggerRender: boolean = true): void {
        const node = this.findNode(paneId);
        if (node && node.type === 'pane') {
            this.layout.activePane = paneId;
            if (triggerRender) {
                this.notifyChange();
            }
        }
    }

    /**
     * Get active pane ID
     */
    getActivePane(): PaneId {
        return this.layout.activePane;
    }

    /**
     * Get pane instance ID
     */
    getPaneInstanceId(paneId: PaneId): string | undefined {
        const node = this.findNode(paneId);
        return node?.instanceId;
    }

    /**
     * Set pane instance ID
     */
    setPaneInstanceId(paneId: PaneId, instanceId: string): void {
        const node = this.findNode(paneId);
        if (node && node.type === 'pane') {
            node.instanceId = instanceId;
            this.notifyChange();
        }
    }

    /**
     * Get all pane IDs
     */
    getAllPaneIds(): PaneId[] {
        const panes: PaneId[] = [];
        this.traversePanes(this.layout.root, (node) => {
            if (node.type === 'pane') {
                panes.push(node.id);
            }
        });
        return panes;
    }

    /**
     * Traverse all nodes
     */
    private traversePanes(node: SplitPaneNode, callback: (node: SplitPaneNode) => void): void {
        callback(node);
        if (node.type === 'split' && node.children) {
            this.traversePanes(node.children[0], callback);
            this.traversePanes(node.children[1], callback);
        }
    }

    /**
     * Get current layout
     */
    getLayout(): SplitLayout {
        return this.layout;
    }

    /**
     * Update split sizes
     */
    updateSplitSizes(splitId: PaneId, sizes: [number, number]): void {
        const node = this.findNode(splitId);
        if (node && node.type === 'split') {
            node.sizes = sizes;
            this.notifyChange();
        }
    }

    /**
     * Navigate to next pane (returns the new pane ID without triggering render)
     */
    focusNextPane(): PaneId {
        const panes = this.getAllPaneIds();
        const currentIndex = panes.indexOf(this.layout.activePane);
        const nextIndex = (currentIndex + 1) % panes.length;
        const nextPaneId = panes[nextIndex];
        this.setActivePane(nextPaneId, false);
        return nextPaneId;
    }

    /**
     * Navigate to previous pane (returns the new pane ID without triggering render)
     */
    focusPreviousPane(): PaneId {
        const panes = this.getAllPaneIds();
        const currentIndex = panes.indexOf(this.layout.activePane);
        const prevIndex = currentIndex === 0 ? panes.length - 1 : currentIndex - 1;
        const prevPaneId = panes[prevIndex];
        this.setActivePane(prevPaneId, false);
        return prevPaneId;
    }

    /**
     * Notify listeners of layout change
     */
    private notifyChange(): void {
        this.onChange(this.layout);
    }

    /**
     * Reset to single pane
     */
    reset(): void {
        this.nextId = 1;
        const rootPane = this.createPaneNode(null, null);
        this.layout = {
            root: rootPane,
            activePane: rootPane.id
        };
        this.notifyChange();
    }

    /**
     * Check if pane can be split
     */
    canSplit(paneId: PaneId): boolean {
        const node = this.findNode(paneId);
        return node !== null && node.type === 'pane';
    }

    /**
     * Check if pane can be closed
     */
    canClose(paneId: PaneId): boolean {
        const node = this.findNode(paneId);
        if (!node || node.type !== 'pane') {
            return false;
        }
        // Can't close if it's the only pane
        return node.parent !== null;
    }
}
