/**
 * TerminalHeader - Header component with status, project picker, and actions
 */

import { setIcon } from 'obsidian';
import type { ConnectionStatus, Project } from '../types';
import { STATUS_LABELS } from '../constants';
import { ProjectManager } from '../services/ProjectManager';
import { InlineProjectPicker } from './ProjectSwitcher';

export interface TerminalHeaderCallbacks {
    onRestart: () => void;
    onClear: () => void;
    onProjectSelect: (project: Project) => void;
    onOpenProjectModal: () => void;
}

export class TerminalHeader {
    private container: HTMLElement;
    private projectManager: ProjectManager;
    private callbacks: TerminalHeaderCallbacks;
    private showProjectPicker: boolean;
    private showStatusBadge: boolean;

    // Elements
    private statusBadge: HTMLElement | null = null;
    private statusDot: HTMLElement | null = null;
    private statusText: HTMLElement | null = null;
    private projectPickerContainer: HTMLElement | null = null;
    private projectPicker: InlineProjectPicker | null = null;

    // State
    private currentStatus: ConnectionStatus = 'disconnected';
    private currentProject: Project | null = null;

    constructor(
        container: HTMLElement,
        projectManager: ProjectManager,
        callbacks: TerminalHeaderCallbacks,
        options: { showProjectPicker: boolean; showStatusBadge: boolean }
    ) {
        this.container = container;
        this.projectManager = projectManager;
        this.callbacks = callbacks;
        this.showProjectPicker = options.showProjectPicker;
        this.showStatusBadge = options.showStatusBadge;

        this.render();
    }

    private render() {
        this.container.empty();
        this.container.addClass('claude-terminal-header');

        // Left section: Title + Status
        const leftSection = this.container.createDiv({ cls: 'claude-terminal-header-left' });

        const titleEl = leftSection.createDiv({ cls: 'claude-terminal-title' });
        const iconEl = titleEl.createSpan({ cls: 'claude-terminal-icon' });
        setIcon(iconEl, 'claude-terminal');
        titleEl.createSpan({ text: 'Claude Code' });

        // Status badge
        if (this.showStatusBadge) {
            this.statusBadge = leftSection.createDiv({ cls: 'claude-terminal-status' });
            this.statusBadge.setAttribute('data-status', 'disconnected');
            this.statusDot = this.statusBadge.createDiv({ cls: 'claude-terminal-status-dot' });
            this.statusText = this.statusBadge.createSpan({ text: 'Disconnected' });
        }

        // Center section: Project picker
        if (this.showProjectPicker) {
            this.projectPickerContainer = this.container.createDiv({ cls: 'claude-terminal-header-center' });
            this.projectPicker = new InlineProjectPicker(
                this.projectPickerContainer,
                this.projectManager,
                this.currentProject,
                (project) => this.callbacks.onProjectSelect(project)
            );

            // Listen for modal open event
            this.projectPickerContainer.addEventListener('open-project-modal', () => {
                this.callbacks.onOpenProjectModal();
            });
        }

        // Right section: Actions
        const actionsEl = this.container.createDiv({ cls: 'claude-terminal-actions' });

        // Project browse button (if no inline picker)
        if (!this.showProjectPicker) {
            const browseBtn = actionsEl.createEl('button', {
                attr: { 'aria-label': 'Switch project', 'title': 'Switch project' }
            });
            setIcon(browseBtn, 'folder-open');
            browseBtn.addEventListener('click', () => this.callbacks.onOpenProjectModal());
        }

        const restartBtn = actionsEl.createEl('button', {
            attr: { 'aria-label': 'Restart terminal', 'title': 'Restart terminal' }
        });
        setIcon(restartBtn, 'refresh-cw');
        restartBtn.addEventListener('click', () => this.callbacks.onRestart());

        const clearBtn = actionsEl.createEl('button', {
            attr: { 'aria-label': 'Clear terminal', 'title': 'Clear terminal' }
        });
        setIcon(clearBtn, 'trash-2');
        clearBtn.addEventListener('click', () => this.callbacks.onClear());
    }

    /**
     * Update connection status
     */
    setStatus(status: ConnectionStatus) {
        this.currentStatus = status;
        if (this.statusBadge) {
            this.statusBadge.setAttribute('data-status', status);
        }
        if (this.statusText) {
            this.statusText.textContent = STATUS_LABELS[status] || status;
        }
    }

    /**
     * Update current project
     */
    setProject(project: Project | null) {
        this.currentProject = project;
        this.projectPicker?.setCurrentProject(project);
    }

    /**
     * Get current status
     */
    getStatus(): ConnectionStatus {
        return this.currentStatus;
    }

    /**
     * Destroy component
     */
    destroy() {
        this.projectPicker?.destroy();
    }
}
