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
                this.splitLayoutManager.setActivePane(paneId);
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
        const panelContainer = this.panelsContainer!.createDiv({
            cls: 'terminal-panel-wrapper',
            attr: { 'data-instance-id': instance.id }
        });

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

        // Initialize panel
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
     * Split current pane horizontally
     */
    async splitHorizontal(): Promise<void> {
        const activePane = this.splitLayoutManager.getActivePane();
        if (!this.splitLayoutManager.canSplit(activePane)) {
            return;
        }

        // Create new terminal instance
        const newInstanceId = await this.createNewTerminal();

        // Split the pane
        const newPaneId = this.splitLayoutManager.splitPane(activePane, 'horizontal', newInstanceId);

        if (newPaneId) {
            // Assign current terminal to old pane
            const currentInstanceId = this.terminalManager.getActiveInstanceId();
            if (currentInstanceId) {
                this.splitLayoutManager.setPaneInstanceId(activePane, currentInstanceId);
            }
        }
    }

    /**
     * Split current pane vertically
     */
    async splitVertical(): Promise<void> {
        const activePane = this.splitLayoutManager.getActivePane();
        if (!this.splitLayoutManager.canSplit(activePane)) {
            return;
        }

        // Create new terminal instance
        const newInstanceId = await this.createNewTerminal();

        // Split the pane
        const newPaneId = this.splitLayoutManager.splitPane(activePane, 'vertical', newInstanceId);

        if (newPaneId) {
            // Assign current terminal to old pane
            const currentInstanceId = this.terminalManager.getActiveInstanceId();
            if (currentInstanceId) {
                this.splitLayoutManager.setPaneInstanceId(activePane, currentInstanceId);
            }
        }
    }

    /**
     * Close current split pane
     */
    closeSplitPane(): void {
        const activePane = this.splitLayoutManager.getActivePane();
        if (!this.splitLayoutManager.canClose(activePane)) {
            return;
        }

        // Get instance ID and close it
        const instanceId = this.splitLayoutManager.getPaneInstanceId(activePane);
        if (instanceId) {
            this.closeInstance(instanceId);
        }

        // Close the pane
        this.splitLayoutManager.closePane(activePane);
    }

    /**
     * Render split layout
     */
    private renderSplitLayout(): void {
        if (!this.splitRenderer) return;

        const layout = this.splitLayoutManager.getLayout();
        this.splitRenderer.render(layout);

        // Mount panels into panes
        const paneIds = this.splitLayoutManager.getAllPaneIds();
        for (const paneId of paneIds) {
            const instanceId = this.splitLayoutManager.getPaneInstanceId(paneId);
            if (instanceId) {
                const panel = this.panels.get(instanceId);
                const paneEl = this.splitRenderer.getPaneElement(paneId);
                if (panel && paneEl) {
                    const panelContainer = paneEl.querySelector('.terminal-panel-wrapper') as HTMLElement;
                    if (!panelContainer) {
                        paneEl.appendChild(panel.getContainer());
                    }
                    panel.show();
                }
            }
        }
    }

    /**
     * Focus terminal in pane
     */
    private focusPaneTerminal(paneId: PaneId): void {
        const instanceId = this.splitLayoutManager.getPaneInstanceId(paneId);
        if (instanceId) {
            this.switchToInstance(instanceId);
        }
    }

    /**
     * Navigate to next split pane
     */
    focusNextSplitPane(): void {
        this.splitLayoutManager.focusNextPane();
        const activePane = this.splitLayoutManager.getActivePane();
        this.focusPaneTerminal(activePane);
    }

    /**
     * Navigate to previous split pane
     */
    focusPreviousSplitPane(): void {
        this.splitLayoutManager.focusPreviousPane();
        const activePane = this.splitLayoutManager.getActivePane();
        this.focusPaneTerminal(activePane);
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
