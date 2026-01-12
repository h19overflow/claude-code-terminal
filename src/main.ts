/**
 * Claude Code Terminal - Main Plugin Entry
 *
 * A terminal plugin for Obsidian that integrates Claude Code CLI
 * with project switching and modern UX.
 */

import { Plugin, WorkspaceLeaf, addIcon, Menu, TFile, MarkdownView } from 'obsidian';
import { ClaudeTerminalView, CLAUDE_TERMINAL_VIEW_TYPE } from './components/TerminalView';
import { ClaudeCodeSettingTab } from './settings';
import { ProjectManager } from './services/ProjectManager';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { ICONS, DEFAULT_SETTINGS } from './constants';
import type { ClaudeCodeSettings, Project } from './types';

export default class ClaudeCodeTerminalPlugin extends Plugin {
    settings: ClaudeCodeSettings = DEFAULT_SETTINGS;
    projectManager!: ProjectManager;

    async onload() {
        console.log('[Claude Code Terminal] Loading plugin...');

        // Load settings
        await this.loadSettings();

        // Initialize project manager
        this.projectManager = new ProjectManager(
            this.settings,
            () => this.saveSettings()
        );

        // Set default project source to vault path if empty
        if (this.settings.projectSources.length === 0 ||
            (this.settings.projectSources.length === 1 && !this.settings.projectSources[0].path)) {
            this.settings.projectSources = [{
                type: 'directory',
                path: this.getVaultPath(),
                depth: 2,
                enabled: true
            }];
            await this.saveSettings();
        }

        // Register custom icon
        addIcon('claude-terminal', ICONS.claude);

        // Register view
        this.registerView(
            CLAUDE_TERMINAL_VIEW_TYPE,
            (leaf) => new ClaudeTerminalView(leaf, this)
        );

        // Add ribbon icon
        this.addRibbonIcon('claude-terminal', 'Open Claude Code', () => {
            this.activateView();
        });

        // Register commands
        this.registerCommands();

        // Register context menus
        this.registerContextMenus();

        // Add settings tab
        this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));

        console.log('[Claude Code Terminal] Plugin loaded');
    }

    async onunload() {
        console.log('[Claude Code Terminal] Unloading plugin...');
        this.app.workspace.detachLeavesOfType(CLAUDE_TERMINAL_VIEW_TYPE);
    }

    /**
     * Register all plugin commands
     */
    private registerCommands() {
        // Open terminal
        this.addCommand({
            id: 'open-claude-terminal',
            name: 'Open Claude Code Terminal',
            callback: () => this.activateView(),
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'c' }]
        });

        // Toggle terminal
        this.addCommand({
            id: 'toggle-claude-terminal',
            name: 'Toggle Claude Code Terminal',
            callback: () => this.toggleView()
        });

        // New terminal tab
        this.addCommand({
            id: 'new-terminal',
            name: 'New Terminal Tab',
            callback: () => this.newTerminal(),
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 't' }]
        });

        // Switch project
        this.addCommand({
            id: 'switch-project',
            name: 'Switch Project',
            callback: () => this.openProjectSwitcher()
        });

        // Restart terminal
        this.addCommand({
            id: 'restart-terminal',
            name: 'Restart Terminal',
            callback: () => this.restartTerminal()
        });

        // Clear terminal
        this.addCommand({
            id: 'clear-terminal',
            name: 'Clear Terminal',
            callback: () => this.clearTerminal()
        });

        // Close current terminal tab
        this.addCommand({
            id: 'close-terminal',
            name: 'Close Terminal Tab',
            callback: () => this.closeCurrentTerminal()
        });

        // Switch to next terminal tab
        this.addCommand({
            id: 'next-terminal',
            name: 'Next Terminal Tab',
            callback: () => this.nextTerminalTab(),
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'ArrowRight' }]
        });

        // Switch to previous terminal tab
        this.addCommand({
            id: 'previous-terminal',
            name: 'Previous Terminal Tab',
            callback: () => this.previousTerminalTab(),
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'ArrowLeft' }]
        });

        // === Obsidian Integration Commands ===

        // Send selection to Claude
        this.addCommand({
            id: 'send-selection-to-claude',
            name: 'Send Selection to Claude',
            editorCallback: () => this.sendSelectionToClaude()
        });

        // Send current note to Claude
        this.addCommand({
            id: 'send-note-to-claude',
            name: 'Send Current Note to Claude',
            callback: () => this.sendNoteToClaude()
        });

        // Link current file in Claude
        this.addCommand({
            id: 'link-file-in-claude',
            name: 'Reference Current File in Claude (@path)',
            callback: () => this.linkFileInClaude()
        });

        // === Split Pane Commands ===

        // Split terminal vertically (side-by-side panes)
        this.addCommand({
            id: 'split-terminal-vertical',
            name: 'Split Terminal',
            callback: () => this.splitVertical(),
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'v' }]
        });

        // Close split pane
        this.addCommand({
            id: 'close-split-pane',
            name: 'Close Split Pane',
            callback: () => this.closeSplitPane(),
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'w' }]
        });

        // Focus next split pane
        this.addCommand({
            id: 'focus-next-split-pane',
            name: 'Focus Next Split Pane',
            callback: () => this.focusNextSplitPane(),
            hotkeys: [{ modifiers: ['Mod'], key: 'ArrowRight' }]
        });

        // Focus previous split pane
        this.addCommand({
            id: 'focus-previous-split-pane',
            name: 'Focus Previous Split Pane',
            callback: () => this.focusPreviousSplitPane(),
            hotkeys: [{ modifiers: ['Mod'], key: 'ArrowLeft' }]
        });

        // === Action Bar Keyboard Shortcuts ===

        // Send selection to Claude (Alt+1)
        this.addCommand({
            id: 'action-send-selection',
            name: 'Action Bar: Send Selection',
            callback: () => this.sendSelectionToClaude(),
            hotkeys: [{ modifiers: ['Alt'], key: '1' }]
        });

        // Send note to Claude (Alt+2)
        this.addCommand({
            id: 'action-send-note',
            name: 'Action Bar: Send Note',
            callback: () => this.sendNoteToClaude(),
            hotkeys: [{ modifiers: ['Alt'], key: '2' }]
        });

        // Reference file in Claude (Alt+3)
        this.addCommand({
            id: 'action-reference-file',
            name: 'Action Bar: Reference File',
            callback: () => this.linkFileInClaude(),
            hotkeys: [{ modifiers: ['Alt'], key: '3' }]
        });
    }

    /**
     * Register context menus
     */
    private registerContextMenus() {
        // Editor context menu (right-click on text)
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor, view) => {
                const selection = editor.getSelection();

                if (selection) {
                    menu.addItem((item) => {
                        item.setTitle('Send to Claude')
                            .setIcon('message-square')
                            .onClick(() => this.sendSelectionToClaude());
                    });
                }

                menu.addItem((item) => {
                    item.setTitle('Send note to Claude')
                        .setIcon('file-text')
                        .onClick(() => this.sendNoteToClaude());
                });

                menu.addItem((item) => {
                    item.setTitle('Reference in Claude (@path)')
                        .setIcon('link')
                        .onClick(() => this.linkFileInClaude());
                });
            })
        );

        // File context menu (right-click on file in explorer)
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item.setTitle('Send to Claude')
                            .setIcon('message-square')
                            .onClick(async () => {
                                // Open the file first, then send
                                await this.app.workspace.getLeaf().openFile(file);
                                await this.sendNoteToClaude();
                            });
                    });

                    menu.addItem((item) => {
                        item.setTitle('Reference in Claude (@path)')
                            .setIcon('link')
                            .onClick(async () => {
                                await this.activateView();
                                const view = this.getTerminalView();
                                const vaultPath = this.getVaultPath();
                                const fullPath = `${vaultPath}/${file.path}`;
                                view?.getClaudeIntegration().getBridge();
                                // Send the path directly
                                const integration = view?.getClaudeIntegration();
                                if (integration) {
                                    (integration as any).send(`@${fullPath}`);
                                }
                            });
                    });
                }
            })
        );
    }

    /**
     * Load plugin settings
     */
    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

        // Update project manager if it exists
        this.projectManager?.updateSettings(this.settings);
    }

    /**
     * Save plugin settings
     */
    async saveSettings() {
        await this.saveData(this.settings);
        this.projectManager?.updateSettings(this.settings);
    }

    /**
     * Get existing terminal leaf
     */
    getExistingLeaf(): WorkspaceLeaf | null {
        const leaves = this.app.workspace.getLeavesOfType(CLAUDE_TERMINAL_VIEW_TYPE);
        return leaves.length > 0 ? leaves[0] : null;
    }

    /**
     * Get terminal view instance
     */
    getTerminalView(): ClaudeTerminalView | null {
        const leaf = this.getExistingLeaf();
        if (leaf?.view instanceof ClaudeTerminalView) {
            return leaf.view;
        }
        return null;
    }

    /**
     * Activate (open) terminal view
     */
    async activateView() {
        const existingLeaf = this.getExistingLeaf();

        if (existingLeaf) {
            this.app.workspace.revealLeaf(existingLeaf);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: CLAUDE_TERMINAL_VIEW_TYPE,
                active: true
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    /**
     * Toggle terminal view
     */
    async toggleView() {
        const existingLeaf = this.getExistingLeaf();

        if (existingLeaf) {
            existingLeaf.detach();
        } else {
            await this.activateView();
        }
    }

    /**
     * Open project switcher modal
     */
    openProjectSwitcher() {
        const view = this.getTerminalView();
        const currentPath = view ? null : null; // Get from view if available

        const modal = new ProjectSwitcher(
            this.app,
            this.projectManager,
            currentPath,
            (project) => this.switchToProject(project)
        );
        modal.open();
    }

    /**
     * Switch to a project
     */
    async switchToProject(project: Project) {
        // Ensure terminal is open
        await this.activateView();

        // Switch project in terminal
        const view = this.getTerminalView();
        if (view) {
            view.switchProject(project);
        }
    }

    /**
     * Restart terminal
     */
    restartTerminal() {
        const view = this.getTerminalView();
        view?.restart();
    }

    /**
     * Clear terminal
     */
    clearTerminal() {
        const view = this.getTerminalView();
        view?.clear();
    }

    /**
     * Create new terminal tab
     */
    async newTerminal() {
        await this.activateView();
        const view = this.getTerminalView();
        view?.createNewTerminal();
    }

    /**
     * Close current terminal tab
     */
    closeCurrentTerminal() {
        const view = this.getTerminalView();
        view?.closeCurrentTab();
    }

    /**
     * Switch to next terminal tab
     */
    nextTerminalTab() {
        const view = this.getTerminalView();
        view?.switchToNextTab();
    }

    /**
     * Switch to previous terminal tab
     */
    previousTerminalTab() {
        const view = this.getTerminalView();
        view?.switchToPreviousTab();
    }

    // === Obsidian Integration Methods ===

    /**
     * Send current selection to Claude terminal
     */
    async sendSelectionToClaude() {
        await this.activateView();
        const view = this.getTerminalView();
        await view?.getClaudeIntegration().sendSelectionToTerminal();
    }

    /**
     * Send current note to Claude terminal
     */
    async sendNoteToClaude() {
        await this.activateView();
        const view = this.getTerminalView();
        await view?.getClaudeIntegration().sendNoteToTerminal();
    }

    /**
     * Link current file in Claude (send @path)
     */
    async linkFileInClaude() {
        await this.activateView();
        const view = this.getTerminalView();
        await view?.getClaudeIntegration().sendFileReference();
    }

    // === Split Pane Methods ===

    /**
     * Split terminal vertically (side-by-side panes)
     */
    splitVertical() {
        const view = this.getTerminalView();
        view?.splitVertical();
    }

    /**
     * Close current split pane
     */
    closeSplitPane() {
        const view = this.getTerminalView();
        view?.closeSplitPane();
    }

    /**
     * Focus next split pane
     */
    focusNextSplitPane() {
        const view = this.getTerminalView();
        view?.focusNextSplitPane();
    }

    /**
     * Focus previous split pane
     */
    focusPreviousSplitPane() {
        const view = this.getTerminalView();
        view?.focusPreviousSplitPane();
    }

    /**
     * Get vault base path
     */
    getVaultPath(): string {
        const adapter = this.app.vault.adapter as any;
        return adapter.basePath || '';
    }
}
