/**
 * ClaudeIntegration - Handles communication between Obsidian and Claude terminal
 *
 * Features:
 * - Context injection (send notes/selections to Claude)
 * - File linking (reference current files in Claude)
 */

import { App, Notice } from 'obsidian';
import { ObsidianBridge, SelectionContext, ActiveFileContext } from './ObsidianBridge';

export interface ClaudeCommand {
    type: 'context' | 'file' | 'selection' | 'custom';
    content: string;
    metadata?: {
        fileName?: string;
        filePath?: string;
        lineRange?: string;
    };
}

export type SendToTerminalCallback = (text: string) => void;

export class ClaudeIntegration {
    private app: App;
    private bridge: ObsidianBridge;
    private sendToTerminal: SendToTerminalCallback | null = null;

    // Cache selection when user switches to terminal
    private cachedSelection: SelectionContext | null = null;
    private cachedFileContext: ActiveFileContext | null = null;

    constructor(app: App) {
        this.app = app;
        this.bridge = new ObsidianBridge(app);

        // Cache selection whenever active leaf changes
        this.setupSelectionCaching();
    }

    /**
     * Setup selection caching to capture text before focus switches to terminal
     */
    private setupSelectionCaching(): void {
        // Cache selection periodically and on workspace changes
        this.app.workspace.on('active-leaf-change', () => {
            this.cacheCurrentContext();
        });

        // Also cache on editor changes
        this.app.workspace.on('editor-change', () => {
            this.cacheCurrentContext();
        });
    }

    /**
     * Cache current selection and file context
     */
    cacheCurrentContext(): void {
        const selection = this.bridge.getSelection();
        if (selection.text) {
            this.cachedSelection = selection;
        }

        // Always cache file context
        this.bridge.getActiveFileContext().then(ctx => {
            if (ctx) {
                this.cachedFileContext = ctx;
            }
        });
    }

    /**
     * Force refresh the cache (call before sending)
     */
    async refreshCache(): Promise<void> {
        const selection = this.bridge.getSelection();
        if (selection.text) {
            this.cachedSelection = selection;
        }

        const ctx = await this.bridge.getActiveFileContext();
        if (ctx) {
            this.cachedFileContext = ctx;
        }
    }

    /**
     * Set the callback for sending text to terminal
     */
    setSendCallback(callback: SendToTerminalCallback): void {
        this.sendToTerminal = callback;
    }

    /**
     * Get the ObsidianBridge instance
     */
    getBridge(): ObsidianBridge {
        return this.bridge;
    }

    // ==========================================
    // CONTEXT INJECTION FEATURES
    // ==========================================

    /**
     * Send current selection to Claude with a prompt
     */
    async sendSelectionToTerminal(prompt?: string): Promise<boolean> {
        // Try fresh selection first, then fall back to cache
        let selection = this.bridge.getSelection();

        if (!selection.text && this.cachedSelection?.text) {
            selection = this.cachedSelection;
        }

        if (!selection.text) {
            new Notice('No text selected. Select text in a note first.');
            return false;
        }

        const command = this.formatSelectionCommand(selection, prompt);
        const result = this.send(command);

        // Clear cache after use
        if (result) {
            this.cachedSelection = null;
        }

        return result;
    }

    /**
     * Send entire active note to Claude
     */
    async sendNoteToTerminal(prompt?: string): Promise<boolean> {
        // Try fresh context first, then fall back to cache
        let context = await this.bridge.getActiveFileContext();

        if (!context && this.cachedFileContext) {
            context = this.cachedFileContext;
        }

        if (!context) {
            new Notice('No active note. Open a note first.');
            return false;
        }

        const command = this.formatNoteCommand(context, prompt);
        return this.send(command);
    }

    /**
     * Send just the file path/reference to Claude
     */
    async sendFileReference(): Promise<boolean> {
        let context = await this.bridge.getActiveFileContext();

        if (!context && this.cachedFileContext) {
            context = this.cachedFileContext;
        }

        if (!context) {
            new Notice('No active file. Open a file first.');
            return false;
        }

        // Get full path for Claude to work with
        const vaultPath = this.bridge.getVaultPath();
        const fullPath = `${vaultPath}/${context.path}`;

        const command = `@${fullPath}`;
        return this.send(command);
    }

    /**
     * Send a custom prompt with optional context
     */
    async sendCustomPrompt(prompt: string, includeSelection: boolean = false): Promise<boolean> {
        let command = prompt;

        if (includeSelection) {
            let selection = this.bridge.getSelection();
            if (!selection.text && this.cachedSelection?.text) {
                selection = this.cachedSelection;
            }

            if (selection.text) {
                command = `${prompt}\n\n\`\`\`\n${selection.text}\n\`\`\``;
            }
        }

        return this.send(command);
    }

    // ==========================================
    // FORMATTING HELPERS
    // ==========================================

    /**
     * Format selection for Claude command
     */
    private formatSelectionCommand(selection: SelectionContext, prompt?: string): string {
        let command = '';

        // Add context about the source
        if (selection.fileName) {
            command += `# Context from: ${selection.fileName}`;
            if (selection.lineStart && selection.lineEnd) {
                command += ` (lines ${selection.lineStart}-${selection.lineEnd})`;
            }
            command += '\n\n';
        }

        // Add the selected content
        command += '```\n' + selection.text + '\n```\n\n';

        // Add prompt if provided
        if (prompt) {
            command += prompt;
        }

        return command;
    }

    /**
     * Format note for Claude command
     */
    private formatNoteCommand(context: ActiveFileContext, prompt?: string): string {
        let command = '';

        // Add file reference
        command += `# File: ${context.name}\n\n`;

        // Add content (truncate if too long)
        const maxLength = 10000;
        let content = context.content;

        if (content.length > maxLength) {
            content = content.substring(0, maxLength) + '\n\n[... truncated ...]';
        }

        command += '```' + (context.extension || 'md') + '\n';
        command += content + '\n';
        command += '```\n\n';

        // Add prompt if provided
        if (prompt) {
            command += prompt;
        }

        return command;
    }

    /**
     * Send text to terminal (public for direct access)
     */
    send(text: string): boolean {
        if (!this.sendToTerminal) {
            new Notice('Terminal not connected');
            return false;
        }

        // Escape for shell and send
        this.sendToTerminal(text + '\r');
        return true;
    }
}
