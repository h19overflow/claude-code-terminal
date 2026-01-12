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
        this.layout = {
            root: this.createPaneNode(null, null),
            activePane: this.nextId.toString()
        };
        this.nextId++;
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
     * Close a pane
     */
    closePane(paneId: PaneId): void {
        const node = this.findNode(paneId);
        if (!node || node.type !== 'pane') {
            return;
        }

        const parent = node.parent;

        // If this is the root and only pane, can't close
        if (!parent) {
            return;
        }

        // Find sibling
        if (parent.type === 'split' && parent.children) {
            const sibling = parent.children[0].id === node.id
                ? parent.children[1]
                : parent.children[0];

            const grandparent = parent.parent;

            // Replace parent with sibling
            if (grandparent && grandparent.type === 'split' && grandparent.children) {
                if (grandparent.children[0].id === parent.id) {
                    grandparent.children[0] = sibling;
                } else {
                    grandparent.children[1] = sibling;
                }
                sibling.parent = grandparent;
            } else {
                // Parent was root
                this.layout.root = sibling;
                sibling.parent = null;
            }

            // Update active pane if needed
            if (this.layout.activePane === paneId) {
                this.layout.activePane = this.getFirstPaneId(sibling);
            }

            this.notifyChange();
        }
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
     */
    setActivePane(paneId: PaneId): void {
        const node = this.findNode(paneId);
        if (node && node.type === 'pane') {
            this.layout.activePane = paneId;
            this.notifyChange();
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
     * Navigate to next pane
     */
    focusNextPane(): void {
        const panes = this.getAllPaneIds();
        const currentIndex = panes.indexOf(this.layout.activePane);
        const nextIndex = (currentIndex + 1) % panes.length;
        this.setActivePane(panes[nextIndex]);
    }

    /**
     * Navigate to previous pane
     */
    focusPreviousPane(): void {
        const panes = this.getAllPaneIds();
        const currentIndex = panes.indexOf(this.layout.activePane);
        const prevIndex = currentIndex === 0 ? panes.length - 1 : currentIndex - 1;
        this.setActivePane(panes[prevIndex]);
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
        this.layout = {
            root: this.createPaneNode(null, null),
            activePane: this.nextId.toString()
        };
        this.nextId++;
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
