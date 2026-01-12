/**
 * ObsidianBridge - Interface between terminal and Obsidian vault/editor
 *
 * Provides modular access to:
 * - Active file/selection
 * - Note creation/modification
 * - Vault operations
 */

import { App, TFile, MarkdownView, Notice, TFolder } from 'obsidian';

export interface NoteContent {
    title: string;
    content: string;
    path: string;
}

export interface SelectionContext {
    text: string;
    file: TFile | null;
    filePath: string | null;
    fileName: string | null;
    lineStart?: number;
    lineEnd?: number;
}

export interface ActiveFileContext {
    file: TFile;
    path: string;
    name: string;
    basename: string;
    extension: string;
    content: string;
}

export class ObsidianBridge {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Get the currently active markdown file
     */
    getActiveFile(): TFile | null {
        return this.app.workspace.getActiveFile();
    }

    /**
     * Get active file with full context
     */
    async getActiveFileContext(): Promise<ActiveFileContext | null> {
        const file = this.getActiveFile();
        if (!file) return null;

        const content = await this.app.vault.read(file);

        return {
            file,
            path: file.path,
            name: file.name,
            basename: file.basename,
            extension: file.extension,
            content
        };
    }

    /**
     * Get current selection in the active editor
     */
    getSelection(): SelectionContext {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const file = this.getActiveFile();

        const result: SelectionContext = {
            text: '',
            file,
            filePath: file?.path || null,
            fileName: file?.name || null
        };

        if (!view?.editor) return result;

        const editor = view.editor;
        const selection = editor.getSelection();

        if (selection) {
            result.text = selection;
            result.lineStart = editor.getCursor('from').line + 1;
            result.lineEnd = editor.getCursor('to').line + 1;
        }

        return result;
    }

    /**
     * Get the full content of the active note
     */
    async getActiveNoteContent(): Promise<string | null> {
        const file = this.getActiveFile();
        if (!file) return null;

        return await this.app.vault.read(file);
    }

    /**
     * Create a new note in the vault
     */
    async createNote(options: {
        title: string;
        content: string;
        folder?: string;
        open?: boolean;
    }): Promise<TFile | null> {
        const { title, content, folder, open = true } = options;

        // Sanitize title for filename
        const sanitizedTitle = title
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();

        // Determine path
        let folderPath = folder || this.getDefaultNoteFolder();

        // Ensure folder exists
        await this.ensureFolderExists(folderPath);

        const filePath = folderPath
            ? `${folderPath}/${sanitizedTitle}.md`
            : `${sanitizedTitle}.md`;

        // Check if file exists, add suffix if needed
        let finalPath = filePath;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(finalPath)) {
            finalPath = filePath.replace('.md', ` ${counter}.md`);
            counter++;
        }

        try {
            const file = await this.app.vault.create(finalPath, content);

            if (open) {
                await this.openFile(file);
            }

            new Notice(`Created note: ${file.basename}`);
            return file;
        } catch (error) {
            console.error('[ObsidianBridge] Failed to create note:', error);
            new Notice(`Failed to create note: ${error}`);
            return null;
        }
    }

    /**
     * Append content to an existing note
     */
    async appendToNote(file: TFile, content: string): Promise<boolean> {
        try {
            const existing = await this.app.vault.read(file);
            await this.app.vault.modify(file, existing + '\n' + content);
            return true;
        } catch (error) {
            console.error('[ObsidianBridge] Failed to append to note:', error);
            return false;
        }
    }

    /**
     * Open a file in Obsidian
     */
    async openFile(file: TFile, newLeaf: boolean = false): Promise<void> {
        await this.app.workspace.getLeaf(newLeaf).openFile(file);
    }

    /**
     * Get vault base path
     */
    getVaultPath(): string {
        const adapter = this.app.vault.adapter as any;
        return adapter.basePath || '';
    }

    /**
     * Get default folder for new notes
     */
    private getDefaultNoteFolder(): string {
        // Check Obsidian's default new file location setting
        const newFileLocation = (this.app.vault as any).getConfig?.('newFileLocation');

        if (newFileLocation === 'folder') {
            return (this.app.vault as any).getConfig?.('newFileFolderPath') || '';
        }

        // Default to root if current file location or root
        return '';
    }

    /**
     * Ensure a folder exists, create if it doesn't
     */
    private async ensureFolderExists(folderPath: string): Promise<void> {
        if (!folderPath) return;

        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof TFolder) return;

        try {
            await this.app.vault.createFolder(folderPath);
        } catch (error) {
            // Folder might already exist or parent needs creation
            const parts = folderPath.split('/');
            let currentPath = '';

            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                const existing = this.app.vault.getAbstractFileByPath(currentPath);
                if (!existing) {
                    await this.app.vault.createFolder(currentPath);
                }
            }
        }
    }

    /**
     * Get all markdown files in vault
     */
    getAllNotes(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    /**
     * Search notes by name
     */
    searchNotes(query: string): TFile[] {
        const files = this.getAllNotes();
        const lowerQuery = query.toLowerCase();

        return files.filter(f =>
            f.basename.toLowerCase().includes(lowerQuery) ||
            f.path.toLowerCase().includes(lowerQuery)
        );
    }
}
