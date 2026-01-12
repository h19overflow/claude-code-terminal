/**
 * LoadingState - Loading UI component with spinner, progress, and status
 */

import type { LoadingStage } from '../types';

export class LoadingState {
    private container: HTMLElement;
    private wrapperEl: HTMLElement | null = null;
    private progressBar: HTMLElement | null = null;
    private stageEl: HTMLElement | null = null;
    private substageEl: HTMLElement | null = null;
    private isVisible: boolean = false;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    /**
     * Show loading state
     */
    show(state: LoadingStage) {
        if (!this.wrapperEl) {
            this.create();
        }

        this.update(state);
        this.wrapperEl!.style.display = 'flex';
        this.isVisible = true;
    }

    /**
     * Hide loading state
     */
    hide() {
        if (this.wrapperEl) {
            this.wrapperEl.style.display = 'none';
        }
        this.isVisible = false;
    }

    /**
     * Update loading progress
     */
    update(state: LoadingStage) {
        if (this.progressBar) {
            this.progressBar.style.width = `${state.progress}%`;
        }
        if (this.stageEl) {
            this.stageEl.textContent = state.stage;
        }
        if (this.substageEl) {
            this.substageEl.textContent = state.substage;
        }
    }

    /**
     * Check if loading is visible
     */
    isShowing(): boolean {
        return this.isVisible;
    }

    /**
     * Create loading DOM elements
     */
    private create() {
        this.wrapperEl = this.container.createDiv({ cls: 'claude-terminal-loading' });

        // Spinner
        this.wrapperEl.createDiv({ cls: 'claude-terminal-spinner' });

        // Progress bar
        const progressContainer = this.wrapperEl.createDiv({ cls: 'claude-terminal-progress' });
        this.progressBar = progressContainer.createDiv({ cls: 'claude-terminal-progress-bar' });

        // Status text
        const textContainer = this.wrapperEl.createDiv({ cls: 'claude-terminal-loading-text' });
        this.stageEl = textContainer.createDiv({ cls: 'claude-terminal-loading-stage' });
        this.substageEl = textContainer.createDiv({ cls: 'claude-terminal-loading-substage' });
    }

    /**
     * Destroy component
     */
    destroy() {
        this.wrapperEl?.remove();
        this.wrapperEl = null;
        this.progressBar = null;
        this.stageEl = null;
        this.substageEl = null;
    }
}
