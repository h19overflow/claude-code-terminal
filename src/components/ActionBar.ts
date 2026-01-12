/**
 * ActionBar - Obsidian integration action buttons for terminal
 *
 * Provides quick access to:
 * - Send selection to Claude
 * - Send current note to Claude
 * - Link current file
 */

import { setIcon, Menu } from 'obsidian';
import type { ClaudeIntegration } from '../services/ClaudeIntegration';

export class ActionBar {
    private container: HTMLElement;
    private integration: ClaudeIntegration;

    constructor(container: HTMLElement, integration: ClaudeIntegration) {
        this.container = container;
        this.integration = integration;
        this.render();
    }

    /**
     * Render the action bar
     */
    private render(): void {
        this.container.empty();
        this.container.addClass('claude-action-bar');

        // Left section - Obsidian integration actions
        const leftSection = this.container.createDiv({ cls: 'action-bar-section action-bar-left' });

        // Send selection button
        this.createActionButton(leftSection, {
            icon: 'text-cursor-input',
            label: 'Send selection to Claude',
            onClick: () => this.handleSendSelection()
        });

        // Send note button
        this.createActionButton(leftSection, {
            icon: 'file-text',
            label: 'Send current note to Claude',
            onClick: () => this.handleSendNote()
        });

        // Link file button
        this.createActionButton(leftSection, {
            icon: 'link',
            label: 'Reference current file (@path)',
            onClick: () => this.handleLinkFile()
        });

        // Right section - More menu
        const rightSection = this.container.createDiv({ cls: 'action-bar-section action-bar-right' });

        this.createActionButton(rightSection, {
            icon: 'more-horizontal',
            label: 'More actions',
            onClick: (e) => this.showMoreMenu(e)
        });
    }

    /**
     * Create an action button
     */
    private createActionButton(
        parent: HTMLElement,
        options: {
            icon: string;
            label: string;
            onClick: (e: MouseEvent) => void;
        }
    ): HTMLElement {
        const btn = parent.createEl('button', {
            cls: 'action-bar-btn',
            attr: {
                'aria-label': options.label,
                'title': options.label
            }
        });

        setIcon(btn, options.icon);
        btn.addEventListener('click', options.onClick);

        return btn;
    }

    /**
     * Handle send selection
     */
    private async handleSendSelection(): Promise<void> {
        await this.integration.sendSelectionToTerminal();
    }

    /**
     * Handle send note
     */
    private async handleSendNote(): Promise<void> {
        await this.integration.sendNoteToTerminal();
    }

    /**
     * Handle link file
     */
    private async handleLinkFile(): Promise<void> {
        await this.integration.sendFileReference();
    }

    /**
     * Show more actions menu
     */
    private showMoreMenu(e: MouseEvent): void {
        const menu = new Menu();

        menu.addItem(item => {
            item.setTitle('Send selection with prompt...')
                .setIcon('message-square')
                .onClick(async () => {
                    const prompt = await this.promptForInput('Enter prompt for Claude:');
                    if (prompt) {
                        await this.integration.sendSelectionToTerminal(prompt);
                    }
                });
        });

        menu.addItem(item => {
            item.setTitle('Send note with prompt...')
                .setIcon('file-question')
                .onClick(async () => {
                    const prompt = await this.promptForInput('Enter prompt for Claude:');
                    if (prompt) {
                        await this.integration.sendNoteToTerminal(prompt);
                    }
                });
        });

        menu.showAtMouseEvent(e);
    }

    /**
     * Prompt for user input (simple implementation)
     */
    private async promptForInput(message: string): Promise<string | null> {
        return new Promise((resolve) => {
            const input = prompt(message);
            resolve(input);
        });
    }

    /**
     * Destroy the action bar
     */
    destroy(): void {
        this.container.empty();
    }
}
