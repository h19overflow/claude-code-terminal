/**
 * TerminalView - Main terminal view with multi-terminal support
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import * as path from 'path';

import type ClaudeCodeTerminalPlugin from '../main';
import type { Project, TerminalInstance } from '../types';
import { CLAUDE_TERMINAL_VIEW_TYPE } from '../constants';
import { TerminalManager } from '../services/TerminalManager';
import { ClaudeIntegration } from '../services/ClaudeIntegration';
import { SplitLayoutManager, type PaneId } from '../services/SplitLayoutManager';
import { SplitPaneRenderer } from './SplitPaneRenderer';
import { TerminalTabs } from './TerminalTabs';
import { TerminalPanel } from './TerminalPanel';
import { ProjectSwitcher } from './ProjectSwitcher';
import { ActionBar } from './ActionBar';

export { CLAUDE_TERMINAL_VIEW_TYPE };

export class ClaudeTerminalView extends ItemView {
    plugin: ClaudeCodeTerminalPlugin;

    // Managers
    private terminalManager: TerminalManager;
    private claudeIntegration: ClaudeIntegration;
    private splitLayoutManager: SplitLayoutManager;

    // UI Components
    private tabs: TerminalTabs | null = null;
    private panels: Map<string, TerminalPanel> = new Map();
    private actionBar: ActionBar | null = null;
    private splitRenderer: SplitPaneRenderer | null = null;

    // DOM Elements
    private headerEl: HTMLElement | null = null;
    private tabsEl: HTMLElement | null = null;
    private panelsContainer: HTMLElement | null = null;
    private splitContainer: HTMLElement | null = null;
    private actionsEl: HTMLElement | null = null;
    private actionBarEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ClaudeCodeTerminalPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.terminalManager = new TerminalManager();
        this.claudeIntegration = new ClaudeIntegration(this.app);
        this.splitLayoutManager = new SplitLayoutManager((layout) => {
            this.renderSplitLayout();
        });
    }

    getViewType(): string {
        return CLAUDE_TERMINAL_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Claude Code';
    }

    getIcon(): string {
        return 'claude-terminal';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('claude-terminal-container');

        // Header with tabs and actions
        this.headerEl = contentEl.createDiv({ cls: 'claude-terminal-header-multi' });

        // Logo
        const logoEl = this.headerEl.createDiv({ cls: 'claude-terminal-logo' });
        setIcon(logoEl, 'claude-terminal');

        // Tabs container
        this.tabsEl = this.headerEl.createDiv({ cls: 'claude-terminal-tabs-wrapper' });
        this.tabs = new TerminalTabs(this.tabsEl, {
            onTabSelect: (id) => this.switchToInstance(id),
            onTabClose: (id) => this.closeInstance(id),
            onNewTab: () => this.createNewTerminal()
        });

        // Actions
        this.actionsEl = this.headerEl.createDiv({ cls: 'claude-terminal-actions' });

        const projectBtn = this.actionsEl.createEl('button', {
            attr: { 'aria-label': 'Switch project', 'title': 'Switch project (for current tab)' }
        });
        setIcon(projectBtn, 'folder-open');
        projectBtn.addEventListener('click', () => this.openProjectSwitcher());

        const restartBtn = this.actionsEl.createEl('button', {
            attr: { 'aria-label': 'Restart terminal', 'title': 'Restart terminal' }
        });
        setIcon(restartBtn, 'refresh-cw');
        restartBtn.addEventListener('click', () => this.restartCurrentTerminal());

        const clearBtn = this.actionsEl.createEl('button', {
            attr: { 'aria-label': 'Clear terminal', 'title': 'Clear terminal' }
        });
        setIcon(clearBtn, 'trash-2');
        clearBtn.addEventListener('click', () => this.clearCurrentTerminal());

        // Action bar for Obsidian integration
        this.actionBarEl = contentEl.createDiv({ cls: 'claude-action-bar-wrapper' });
        this.actionBar = new ActionBar(this.actionBarEl, this.claudeIntegration);

        // Setup send callback for ClaudeIntegration
        this.claudeIntegration.setSendCallback((text) => {
            const activePanel = this.getActivePanel();
            activePanel?.write(text);
        });

        // Split container (holds all split panes)
        this.splitContainer = contentEl.createDiv({ cls: 'claude-terminal-split-container' });

        // Initialize split renderer
        this.splitRenderer = new SplitPaneRenderer(this.splitContainer, {
            onPaneClick: (paneId) => {
                // Update active pane without triggering re-render
                this.splitLayoutManager.setActivePane(paneId, false);
                // Update visual active state
                this.updateActivePaneVisual(paneId);
                // Focus the terminal
                this.focusPaneTerminal(paneId);
            },
            onSplitResize: (splitId, sizes) => {
                this.splitLayoutManager.updateSplitSizes(splitId, sizes);
            }
        });

        // Panels container (inside split container)
        this.panelsContainer = contentEl.createDiv({ cls: 'claude-terminal-panels' });
        this.panelsContainer.style.display = 'none'; // Hidden, panels are in panes

        // Subscribe to terminal manager changes
        this.terminalManager.onChange((instances, activeId) => {
            this.tabs?.update(instances, activeId);
        });

        // Create initial terminal
        await this.createNewTerminal();
    }

    /**
     * Get plugin path
     */
    private getPluginPath(): string {
        const adapter = this.app.vault.adapter as any;
        const vaultPath = adapter.basePath;
        return path.join(vaultPath, '.obsidian', 'plugins', 'claude-code-terminal');
    }

    /**
     * Create a new terminal instance
     */
    async createNewTerminal(project: Project | null = null): Promise<string> {
        // Use vault path as default project if none specified
        if (!project) {
            project = this.plugin.projectManager.createProjectFromPath(
                this.plugin.getVaultPath()
            );
        }

        // Create instance in manager
        const instance = this.terminalManager.createInstance(project);

        // Create panel container
        const panelContainer = document.createElement('div');
        panelContainer.addClass('terminal-panel-wrapper');
        panelContainer.setAttribute('data-instance-id', instance.id);

        // Create panel
        const panel = new TerminalPanel(
            panelContainer,
            this.plugin.settings,
            this.getPluginPath(),
            {
                onStatusChange: (status) => {
                    this.terminalManager.updateInstanceStatus(instance.id, status);
                },
                onTitleChange: (title) => {
                    this.terminalManager.renameInstance(instance.id, title);
                }
            },
            this.plugin.getVaultPath() // Pass vault path for proper boundary checking
        );

        this.panels.set(instance.id, panel);
        console.log('[TerminalView] Panel added to map, instance.id:', instance.id);
        console.log('[TerminalView] panels.size:', this.panels.size);

        // Update split layout FIRST to mount container to DOM
        const activePane = this.splitLayoutManager.getActivePane();
        console.log('[TerminalView] Active pane:', activePane);
        this.splitLayoutManager.setPaneInstanceId(activePane, instance.id);
        console.log('[TerminalView] Set pane instance id, calling renderSplitLayout');
        this.renderSplitLayout();

        // Verify container is now in DOM
        console.log('[TerminalView] After render - container parent:', panel.getContainer().parentElement?.className);

        // NOW initialize panel (xterm needs to be in DOM to render)
        await panel.initialize(project);

        // Track in recent projects
        if (project) {
            this.plugin.projectManager.addToRecent(project);
        }

        // Switch to this instance
        this.switchToInstance(instance.id);

        return instance.id;
    }

    /**
     * Switch to a terminal instance
     */
    switchToInstance(instanceId: string): void {
        // Hide all panels
        for (const [id, panel] of this.panels) {
            if (id === instanceId) {
                panel.show();
            } else {
                panel.hide();
            }
        }

        // Update manager
        this.terminalManager.setActiveInstance(instanceId);

        // Scroll tab into view
        this.tabs?.scrollActiveIntoView();
    }

    /**
     * Close a terminal instance
     */
    closeInstance(instanceId: string): void {
        const panel = this.panels.get(instanceId);
        if (panel) {
            panel.destroy();
            this.panels.delete(instanceId);
        }

        // Remove panel container
        const container = this.panelsContainer?.querySelector(`[data-instance-id="${instanceId}"]`);
        container?.remove();

        // Remove from manager
        this.terminalManager.removeInstance(instanceId);

        // If no instances left, create a new one
        if (this.terminalManager.getCount() === 0) {
            this.createNewTerminal();
        }
    }

    /**
     * Get active panel
     */
    private getActivePanel(): TerminalPanel | null {
        const activeId = this.terminalManager.getActiveInstanceId();
        if (!activeId) return null;
        return this.panels.get(activeId) || null;
    }

    /**
     * Open project switcher for current terminal
     */
    openProjectSwitcher(): void {
        const activePanel = this.getActivePanel();
        const currentPath = activePanel?.getProject()?.path || null;

        const modal = new ProjectSwitcher(
            this.app,
            this.plugin.projectManager,
            currentPath,
            (project) => this.switchCurrentProject(project)
        );
        modal.open();
    }

    /**
     * Switch project for current terminal
     */
    async switchCurrentProject(project: Project): Promise<void> {
        const activePanel = this.getActivePanel();
        if (activePanel) {
            await activePanel.switchProject(project);
            const activeId = this.terminalManager.getActiveInstanceId();
            if (activeId) {
                this.terminalManager.updateInstanceProject(activeId, project);
            }
            this.plugin.projectManager.addToRecent(project);
        }
    }

    /**
     * Switch to project (creates new tab if needed)
     */
    async switchProject(project: Project): Promise<void> {
        // Check if we already have a tab for this project
        const instances = this.terminalManager.getAllInstances();
        const existing = instances.find(i => i.project?.path === project.path);

        if (existing) {
            this.switchToInstance(existing.id);
        } else {
            await this.createNewTerminal(project);
        }
    }

    /**
     * Restart current terminal
     */
    async restartCurrentTerminal(): Promise<void> {
        const activePanel = this.getActivePanel();
        await activePanel?.restart();
    }

    /**
     * Clear current terminal
     */
    clearCurrentTerminal(): void {
        const activePanel = this.getActivePanel();
        activePanel?.clear();
    }

    /**
     * Restart terminal (compatibility method)
     */
    async restart(): Promise<void> {
        await this.restartCurrentTerminal();
    }

    /**
     * Clear terminal (compatibility method)
     */
    clear(): void {
        this.clearCurrentTerminal();
    }

    /**
     * Close current tab
     */
    closeCurrentTab(): void {
        const activeId = this.terminalManager.getActiveInstanceId();
        if (activeId) {
            this.closeInstance(activeId);
        }
    }

    /**
     * Switch to next tab
     */
    switchToNextTab(): void {
        const instances = this.terminalManager.getAllInstances();
        const activeId = this.terminalManager.getActiveInstanceId();
        if (instances.length <= 1 || !activeId) return;

        const currentIndex = instances.findIndex(i => i.id === activeId);
        const nextIndex = (currentIndex + 1) % instances.length;
        this.switchToInstance(instances[nextIndex].id);
    }

    /**
     * Switch to previous tab
     */
    switchToPreviousTab(): void {
        const instances = this.terminalManager.getAllInstances();
        const activeId = this.terminalManager.getActiveInstanceId();
        if (instances.length <= 1 || !activeId) return;

        const currentIndex = instances.findIndex(i => i.id === activeId);
        const prevIndex = currentIndex === 0 ? instances.length - 1 : currentIndex - 1;
        this.switchToInstance(instances[prevIndex].id);
    }

    /**
     * Get ClaudeIntegration instance (for external access)
     */
    getClaudeIntegration(): ClaudeIntegration {
        return this.claudeIntegration;
    }

    // === Split Pane Methods ===

    /**
     * Split current pane (creates side-by-side terminals with vertical divider)
     */
    async splitVertical(): Promise<void> {
        const activePane = this.splitLayoutManager.getActivePane();
        if (!this.splitLayoutManager.canSplit(activePane)) {
            return;
        }

        // Save the current pane's terminal instance ID BEFORE doing anything
        const existingInstanceId = this.splitLayoutManager.getPaneInstanceId(activePane);

        // Create new terminal instance (this will be placed in the new pane)
        const newInstanceId = await this.createTerminalInstance();

        // Split the pane horizontally (flex-row = side-by-side with vertical divider)
        const newPaneId = this.splitLayoutManager.splitPane(activePane, 'horizontal', newInstanceId);

        if (newPaneId) {
            // Restore original terminal to the original pane (now child of split)
            if (existingInstanceId) {
                this.splitLayoutManager.setPaneInstanceId(activePane, existingInstanceId);
            }

            // Re-render to mount both terminals
            this.renderSplitLayout();

            // Initialize and show the new terminal in the new pane
            const panel = this.panels.get(newInstanceId);
            if (panel) {
                const project = this.plugin.projectManager.createProjectFromPath(
                    this.plugin.getVaultPath()
                );
                await panel.initialize(project);
            }

            // Focus the new pane
            this.splitLayoutManager.setActivePane(newPaneId);
            this.focusPaneTerminal(newPaneId);
        }
    }

    /**
     * Create a terminal instance without mounting to a pane
     * Used by split operations to create terminals before pane assignment
     */
    private async createTerminalInstance(): Promise<string> {
        const project = this.plugin.projectManager.createProjectFromPath(
            this.plugin.getVaultPath()
        );

        // Create instance in manager
        const instance = this.terminalManager.createInstance(project);

        // Create panel container
        const panelContainer = document.createElement('div');
        panelContainer.addClass('terminal-panel-wrapper');
        panelContainer.setAttribute('data-instance-id', instance.id);

        // Create panel (but don't initialize yet - needs DOM mounting first)
        const panel = new TerminalPanel(
            panelContainer,
            this.plugin.settings,
            this.getPluginPath(),
            {
                onStatusChange: (status) => {
                    this.terminalManager.updateInstanceStatus(instance.id, status);
                },
                onTitleChange: (title) => {
                    this.terminalManager.renameInstance(instance.id, title);
                }
            },
            this.plugin.getVaultPath()
        );

        this.panels.set(instance.id, panel);

        return instance.id;
    }

    /**
     * Close current split pane
     */
    closeSplitPane(): void {
        const activePane = this.splitLayoutManager.getActivePane();
        if (!this.splitLayoutManager.canClose(activePane)) {
            return;
        }

        // Close pane in layout manager first (returns instance ID for cleanup)
        const closedInstanceId = this.splitLayoutManager.closePane(activePane);

        // Destroy the terminal panel if it exists
        if (closedInstanceId) {
            const panel = this.panels.get(closedInstanceId);
            if (panel) {
                panel.destroy();
                this.panels.delete(closedInstanceId);
            }
            // Remove from terminal manager
            this.terminalManager.removeInstance(closedInstanceId);
        }

        // Re-render layout to reflect changes
        this.renderSplitLayout();

        // Focus the new active pane's terminal
        const newActivePane = this.splitLayoutManager.getActivePane();
        this.focusPaneTerminal(newActivePane);
    }

    /**
     * Render split layout - mounts all panels into their respective panes
     */
    private renderSplitLayout(): void {
        if (!this.splitRenderer) return;

        const layout = this.splitLayoutManager.getLayout();
        this.splitRenderer.render(layout);

        // Mount panels into panes - ALL panels in split layout should be visible
        const paneIds = this.splitLayoutManager.getAllPaneIds();

        for (const paneId of paneIds) {
            const instanceId = this.splitLayoutManager.getPaneInstanceId(paneId);

            if (instanceId) {
                const panel = this.panels.get(instanceId);
                const paneEl = this.splitRenderer.getPaneElement(paneId);

                if (panel && paneEl) {
                    // Check if panel container already exists in this pane
                    const existingContainer = paneEl.querySelector('.terminal-panel-wrapper');
                    if (!existingContainer) {
                        paneEl.appendChild(panel.getContainer());
                    }
                    // Show all panels in split layout (show() triggers refit)
                    panel.show();
                }
            }
        }
    }

    /**
     * Update visual active state without re-rendering
     */
    private updateActivePaneVisual(paneId: PaneId): void {
        if (!this.splitContainer) return;

        // Remove active class from all panes
        this.splitContainer.querySelectorAll('.split-pane.active').forEach(el => {
            el.removeClass('active');
        });

        // Add active class to target pane
        const paneEl = this.splitContainer.querySelector(`[data-pane-id="${paneId}"]`);
        paneEl?.addClass('active');
    }

    /**
     * Focus terminal in pane (without hiding other split panes)
     */
    private focusPaneTerminal(paneId: PaneId): void {
        const instanceId = this.splitLayoutManager.getPaneInstanceId(paneId);
        if (instanceId) {
            // Update active instance in manager (for tabs display)
            this.terminalManager.setActiveInstance(instanceId);

            // Focus the terminal in the pane
            const panel = this.panels.get(instanceId);
            panel?.focus();
        }
    }

    /**
     * Navigate to next split pane
     */
    focusNextSplitPane(): void {
        const newPaneId = this.splitLayoutManager.focusNextPane();
        this.updateActivePaneVisual(newPaneId);
        this.focusPaneTerminal(newPaneId);
    }

    /**
     * Navigate to previous split pane
     */
    focusPreviousSplitPane(): void {
        const newPaneId = this.splitLayoutManager.focusPreviousPane();
        this.updateActivePaneVisual(newPaneId);
        this.focusPaneTerminal(newPaneId);
    }

    /**
     * Cleanup on close
     */
    async onClose() {
        // Destroy all panels
        for (const panel of this.panels.values()) {
            panel.destroy();
        }
        this.panels.clear();

        // Clear manager
        this.terminalManager.clear();

        // Destroy tabs
        this.tabs?.destroy();

        // Destroy action bar
        this.actionBar?.destroy();

        // Destroy split renderer
        this.splitRenderer?.destroy();
    }
}
