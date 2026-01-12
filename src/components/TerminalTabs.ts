/**
 * TerminalTabs - Tab bar for multiple terminal instances
 */

import { setIcon } from 'obsidian';
import type { TerminalInstance, ConnectionStatus } from '../types';

export interface TerminalTabsCallbacks {
    onTabSelect: (instanceId: string) => void;
    onTabClose: (instanceId: string) => void;
    onNewTab: () => void;
}

export class TerminalTabs {
    private container: HTMLElement;
    private callbacks: TerminalTabsCallbacks;
    private tabsContainer: HTMLElement | null = null;
    private instances: TerminalInstance[] = [];
    private activeId: string | null = null;

    constructor(container: HTMLElement, callbacks: TerminalTabsCallbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.render();
    }

    /**
     * Update tabs with new instance data
     */
    update(instances: TerminalInstance[], activeId: string | null): void {
        this.instances = instances;
        this.activeId = activeId;
        this.renderTabs();
    }

    /**
     * Initial render
     */
    private render(): void {
        this.container.empty();
        this.container.addClass('terminal-tabs-container');

        // Tabs scroll area
        this.tabsContainer = this.container.createDiv({ cls: 'terminal-tabs' });

        // New tab button
        const newTabBtn = this.container.createDiv({ cls: 'terminal-tab-new' });
        setIcon(newTabBtn, 'plus');
        newTabBtn.setAttribute('aria-label', 'New terminal');
        newTabBtn.addEventListener('click', () => this.callbacks.onNewTab());
    }

    /**
     * Render tab items
     */
    private renderTabs(): void {
        if (!this.tabsContainer) return;
        this.tabsContainer.empty();

        for (const instance of this.instances) {
            this.createTab(instance);
        }
    }

    /**
     * Create a single tab
     */
    private createTab(instance: TerminalInstance): void {
        if (!this.tabsContainer) return;

        const isActive = instance.id === this.activeId;
        const tab = this.tabsContainer.createDiv({
            cls: `terminal-tab ${isActive ? 'active' : ''}`
        });
        tab.setAttribute('data-instance-id', instance.id);

        // Status indicator
        const statusDot = tab.createDiv({ cls: 'terminal-tab-status' });
        statusDot.setAttribute('data-status', instance.status);

        // Icon based on project type
        const iconEl = tab.createDiv({ cls: 'terminal-tab-icon' });
        setIcon(iconEl, instance.project?.icon || 'terminal');

        // Tab name
        const nameEl = tab.createDiv({ cls: 'terminal-tab-name' });
        nameEl.setText(this.truncateName(instance.name, 20));
        nameEl.setAttribute('title', instance.name);

        // Close button
        const closeBtn = tab.createDiv({ cls: 'terminal-tab-close' });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.callbacks.onTabClose(instance.id);
        });

        // Tab click handler
        tab.addEventListener('click', () => {
            if (!isActive) {
                this.callbacks.onTabSelect(instance.id);
            }
        });

        // Middle click to close
        tab.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                this.callbacks.onTabClose(instance.id);
            }
        });
    }

    /**
     * Truncate name for display
     */
    private truncateName(name: string, maxLength: number): string {
        if (name.length <= maxLength) return name;
        return name.substring(0, maxLength - 1) + '…';
    }

    /**
     * Update single tab status
     */
    updateTabStatus(instanceId: string, status: ConnectionStatus): void {
        const tab = this.tabsContainer?.querySelector(`[data-instance-id="${instanceId}"]`);
        const statusDot = tab?.querySelector('.terminal-tab-status');
        if (statusDot) {
            statusDot.setAttribute('data-status', status);
        }
    }

    /**
     * Scroll active tab into view
     */
    scrollActiveIntoView(): void {
        const activeTab = this.tabsContainer?.querySelector('.terminal-tab.active');
        activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    /**
     * Destroy component
     */
    destroy(): void {
        this.container.empty();
    }
}
