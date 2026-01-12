/**
 * SplitPaneRenderer - Renders split pane layout with resize handles
 */

import type { SplitPaneNode, SplitLayout, PaneId } from '../services/SplitLayoutManager';

export interface SplitPaneCallbacks {
    onPaneClick: (paneId: PaneId) => void;
    onSplitResize: (splitId: PaneId, sizes: [number, number]) => void;
}

export class SplitPaneRenderer {
    private container: HTMLElement;
    private callbacks: SplitPaneCallbacks;
    private paneElements: Map<PaneId, HTMLElement> = new Map();
    private resizing: { splitId: PaneId; startPos: number; startSizes: [number, number] } | null = null;

    constructor(container: HTMLElement, callbacks: SplitPaneCallbacks) {
        this.container = container;
        this.callbacks = callbacks;

        // Add resize event listeners
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }

    /**
     * Render the layout
     */
    render(layout: SplitLayout): void {
        this.container.empty();
        this.paneElements.clear();

        const rootEl = this.renderNode(layout.root, layout.activePane);

        // Ensure root element fills container (critical for single pane after close)
        if (layout.root.type === 'pane') {
            rootEl.style.width = '100%';
            rootEl.style.height = '100%';
            rootEl.addClass('split-pane-root');
        }

        this.container.appendChild(rootEl);
    }

    /**
     * Render a node (recursive)
     */
    private renderNode(node: SplitPaneNode, activePane: PaneId): HTMLElement {
        if (node.type === 'pane') {
            return this.renderPane(node, activePane);
        } else {
            return this.renderSplit(node, activePane);
        }
    }

    /**
     * Render a pane
     */
    private renderPane(node: SplitPaneNode, activePane: PaneId): HTMLElement {
        const paneEl = createDiv({
            cls: 'split-pane',
            attr: {
                'data-pane-id': node.id,
                'data-instance-id': node.instanceId || ''
            }
        });

        if (node.id === activePane) {
            paneEl.addClass('active');
        }

        // Click anywhere in pane to focus (including terminal)
        paneEl.addEventListener('mousedown', (e) => {
            // Trigger focus on any click within the pane
            this.callbacks.onPaneClick(node.id);
        });

        this.paneElements.set(node.id, paneEl);

        return paneEl;
    }

    /**
     * Render a split
     */
    private renderSplit(node: SplitPaneNode, activePane: PaneId): HTMLElement {
        const splitEl = createDiv({
            cls: `split-container split-${node.direction}`,
            attr: { 'data-split-id': node.id }
        });

        if (!node.children || node.children.length !== 2) {
            return splitEl;
        }

        const [child1, child2] = node.children;
        const [size1, size2] = node.sizes || [50, 50];

        // Render first child
        const child1El = this.renderNode(child1, activePane);
        if (node.direction === 'horizontal') {
            child1El.style.width = `${size1}%`;
        } else {
            child1El.style.height = `${size1}%`;
        }
        splitEl.appendChild(child1El);

        // Resize handle
        const handleEl = this.createResizeHandle(node.id, node.direction);
        splitEl.appendChild(handleEl);

        // Render second child
        const child2El = this.renderNode(child2, activePane);
        if (node.direction === 'horizontal') {
            child2El.style.width = `${size2}%`;
        } else {
            child2El.style.height = `${size2}%`;
        }
        splitEl.appendChild(child2El);

        return splitEl;
    }

    /**
     * Create resize handle
     */
    private createResizeHandle(splitId: PaneId, direction: 'horizontal' | 'vertical'): HTMLElement {
        const handle = createDiv({
            cls: `split-resize-handle split-resize-handle-${direction}`,
            attr: { 'data-split-id': splitId }
        });

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const parent = handle.parentElement;
            if (!parent) return;

            const rect = parent.getBoundingClientRect();
            const startPos = direction === 'horizontal' ? e.clientX : e.clientY;
            const totalSize = direction === 'horizontal' ? rect.width : rect.height;

            // Get current sizes from DOM
            const child1 = parent.children[0] as HTMLElement;
            const child1Size = direction === 'horizontal'
                ? child1.offsetWidth
                : child1.offsetHeight;
            const size1Percent = (child1Size / totalSize) * 100;
            const size2Percent = 100 - size1Percent;

            this.resizing = {
                splitId,
                startPos,
                startSizes: [size1Percent, size2Percent]
            };

            handle.addClass('resizing');
        });

        return handle;
    }

    /**
     * Handle mouse move during resize
     */
    private handleMouseMove(e: MouseEvent): void {
        if (!this.resizing) return;

        const handleEl = this.container.querySelector(`[data-split-id="${this.resizing.splitId}"]`);
        if (!handleEl) return;

        const parent = handleEl.parentElement;
        if (!parent) return;

        const splitContainer = parent.parentElement;
        if (!splitContainer) return;

        const direction = splitContainer.hasClass('split-horizontal') ? 'horizontal' : 'vertical';
        const rect = parent.getBoundingClientRect();
        const totalSize = direction === 'horizontal' ? rect.width : rect.height;
        const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
        const delta = currentPos - this.resizing.startPos;
        const deltaPercent = (delta / totalSize) * 100;

        let size1 = this.resizing.startSizes[0] + deltaPercent;
        let size2 = this.resizing.startSizes[1] - deltaPercent;

        // Clamp sizes (min 10%, max 90%)
        size1 = Math.max(10, Math.min(90, size1));
        size2 = 100 - size1;

        // Update DOM immediately for smooth resizing
        const child1 = parent.children[0] as HTMLElement;
        const child2 = parent.children[2] as HTMLElement;

        if (direction === 'horizontal') {
            child1.style.width = `${size1}%`;
            child2.style.width = `${size2}%`;
        } else {
            child1.style.height = `${size1}%`;
            child2.style.height = `${size2}%`;
        }
    }

    /**
     * Handle mouse up (end resize)
     */
    private handleMouseUp(): void {
        if (!this.resizing) return;

        const handleEl = this.container.querySelector(`[data-split-id="${this.resizing.splitId}"]`);
        if (handleEl) {
            handleEl.removeClass('resizing');
        }

        // Get final sizes from DOM
        const parent = handleEl?.parentElement;
        if (parent) {
            const direction = parent.parentElement?.hasClass('split-horizontal') ? 'horizontal' : 'vertical';
            const child1 = parent.children[0] as HTMLElement;
            const rect = parent.getBoundingClientRect();
            const totalSize = direction === 'horizontal' ? rect.width : rect.height;
            const child1Size = direction === 'horizontal' ? child1.offsetWidth : child1.offsetHeight;
            const size1Percent = (child1Size / totalSize) * 100;
            const size2Percent = 100 - size1Percent;

            // Notify callback
            this.callbacks.onSplitResize(this.resizing.splitId, [size1Percent, size2Percent]);
        }

        this.resizing = null;
    }

    /**
     * Get pane element
     */
    getPaneElement(paneId: PaneId): HTMLElement | undefined {
        return this.paneElements.get(paneId);
    }

    /**
     * Destroy renderer
     */
    destroy(): void {
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        this.paneElements.clear();
    }
}
