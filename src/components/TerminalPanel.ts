/**
 * TerminalPanel - A single terminal instance with xterm.js
 * Enhanced with WebGL rendering, search, and Unicode11 support
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import * as path from 'path';

import type { Project, ConnectionStatus, LoadingStage, ClaudeCodeSettings } from '../types';
import { TIMING } from '../constants';
import { getTerminalTheme, debounce } from '../utils';
import { PtyBridge } from '../services/PtyBridge';
import { LoadingState } from './LoadingState';

export interface TerminalPanelCallbacks {
    onStatusChange: (status: ConnectionStatus) => void;
    onTitleChange: (title: string) => void;
    onData?: (data: string) => void;
}

export class TerminalPanel {
    private container: HTMLElement;
    private settings: ClaudeCodeSettings;
    private pluginPath: string;
    private vaultPath: string;
    private callbacks: TerminalPanelCallbacks;

    // Core components
    private terminal: Terminal | null = null;
    private fitAddon: FitAddon | null = null;
    private searchAddon: SearchAddon | null = null;
    private webglAddon: WebglAddon | null = null;
    private ptyBridge: PtyBridge | null = null;
    private loadingState: LoadingState | null = null;

    // DOM elements
    private terminalEl: HTMLElement | null = null;
    private searchBarEl: HTMLElement | null = null;
    private searchInputEl: HTMLInputElement | null = null;

    // State
    private currentProject: Project | null = null;
    private status: ConnectionStatus = 'disconnected';
    private resizeObserver: ResizeObserver | null = null;
    private isVisible: boolean = false;
    private isInitialized: boolean = false;
    private isSearchVisible: boolean = false;
    private webglEnabled: boolean = false;

    constructor(
        container: HTMLElement,
        settings: ClaudeCodeSettings,
        pluginPath: string,
        callbacks: TerminalPanelCallbacks,
        vaultPath?: string
    ) {
        this.container = container;
        this.settings = settings;
        this.pluginPath = pluginPath;
        this.vaultPath = vaultPath || pluginPath;
        this.callbacks = callbacks;
    }

    /**
     * Initialize the terminal panel
     */
    async initialize(project: Project | null = null): Promise<void> {
        if (this.isInitialized) return;

        this.currentProject = project;
        this.container.empty();
        this.container.addClass('terminal-panel');

        // Create terminal wrapper (hidden initially)
        this.terminalEl = this.container.createDiv({ cls: 'terminal-panel-content' });
        this.terminalEl.style.display = 'none';

        // Create loading state
        this.loadingState = new LoadingState(this.container);
        this.showLoading({ stage: 'Initializing', substage: 'Setting up terminal...', progress: 0 });

        await this.initTerminal();
        this.isInitialized = true;
    }

    /**
     * Initialize xterm.js with enhanced addons
     */
    private async initTerminal(): Promise<void> {
        if (!this.terminalEl) return;

        const theme = getTerminalTheme();

        this.updateLoading({ stage: 'Initializing', substage: 'Creating terminal...', progress: 20 });

        this.terminal = new Terminal({
            fontSize: this.settings.fontSize,
            fontFamily: this.settings.fontFamily,
            theme,
            cursorBlink: true,
            convertEol: true,
            allowProposedApi: true,
            scrollback: 10000
        });

        this.updateLoading({ stage: 'Initializing', substage: 'Loading addons...', progress: 40 });

        // Load core addons
        this.fitAddon = new FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon());

        // Load Unicode11 for emoji and CJK support
        const unicode11Addon = new Unicode11Addon();
        this.terminal.loadAddon(unicode11Addon);
        this.terminal.unicode.activeVersion = '11';

        // Load search addon
        this.searchAddon = new SearchAddon();
        this.terminal.loadAddon(this.searchAddon);

        this.terminal.open(this.terminalEl);

        // Try to load WebGL addon for GPU-accelerated rendering
        this.tryLoadWebGL();

        // Create search bar (hidden initially)
        this.createSearchBar();

        // Setup resize handling
        this.setupResizeHandler();

        // Setup terminal input
        this.terminal.onData((data: string) => {
            this.ptyBridge?.write(data);
        });

        // Setup keyboard shortcuts for search
        this.setupSearchShortcuts();

        this.updateLoading({ stage: 'Connecting', substage: 'Starting PTY...', progress: 60 });

        // Delay fit and start PTY
        setTimeout(() => {
            this.fitAddon?.fit();
            this.startPtyBridge();
        }, TIMING.INITIAL_FIT_DELAY_MS);
    }

    /**
     * Try to load WebGL addon for GPU-accelerated rendering
     */
    private tryLoadWebGL(): void {
        if (!this.terminal) return;

        try {
            this.webglAddon = new WebglAddon();

            // Handle context loss gracefully
            this.webglAddon.onContextLoss(() => {
                console.warn('[TerminalPanel] WebGL context lost, falling back to canvas');
                this.webglAddon?.dispose();
                this.webglAddon = null;
                this.webglEnabled = false;
            });

            this.terminal.loadAddon(this.webglAddon);
            this.webglEnabled = true;
            console.log('[TerminalPanel] WebGL rendering enabled');
        } catch (e) {
            console.warn('[TerminalPanel] WebGL not available, using canvas renderer:', e);
            this.webglEnabled = false;
        }
    }

    /**
     * Create search bar UI
     */
    private createSearchBar(): void {
        this.searchBarEl = this.container.createDiv({ cls: 'terminal-search-bar' });
        this.searchBarEl.style.display = 'none';

        // Search input
        this.searchInputEl = this.searchBarEl.createEl('input', {
            type: 'text',
            placeholder: 'Search terminal...',
            cls: 'terminal-search-input'
        });

        // Search controls
        const controls = this.searchBarEl.createDiv({ cls: 'terminal-search-controls' });

        // Previous button
        const prevBtn = controls.createEl('button', { cls: 'terminal-search-btn', attr: { title: 'Previous (Shift+Enter)' } });
        prevBtn.innerHTML = '&#9650;'; // Up arrow
        prevBtn.addEventListener('click', () => this.searchPrevious());

        // Next button
        const nextBtn = controls.createEl('button', { cls: 'terminal-search-btn', attr: { title: 'Next (Enter)' } });
        nextBtn.innerHTML = '&#9660;'; // Down arrow
        nextBtn.addEventListener('click', () => this.searchNext());

        // Close button
        const closeBtn = controls.createEl('button', { cls: 'terminal-search-btn terminal-search-close', attr: { title: 'Close (Esc)' } });
        closeBtn.innerHTML = '&#10005;'; // X
        closeBtn.addEventListener('click', () => this.hideSearch());

        // Search input events
        this.searchInputEl.addEventListener('input', () => this.handleSearchInput());
        this.searchInputEl.addEventListener('keydown', (e) => this.handleSearchKeydown(e));
    }

    /**
     * Setup keyboard shortcuts for search
     */
    private setupSearchShortcuts(): void {
        if (!this.terminal) return;

        // Listen for Ctrl+F / Cmd+F to open search
        this.terminalEl?.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.showSearch();
            }
        });
    }

    /**
     * Show search bar
     */
    showSearch(): void {
        if (!this.searchBarEl || !this.searchInputEl) return;
        this.isSearchVisible = true;
        this.searchBarEl.style.display = 'flex';
        this.searchInputEl.focus();
        this.searchInputEl.select();
    }

    /**
     * Hide search bar
     */
    hideSearch(): void {
        if (!this.searchBarEl) return;
        this.isSearchVisible = false;
        this.searchBarEl.style.display = 'none';
        this.searchAddon?.clearDecorations();
        this.terminal?.focus();
    }

    /**
     * Handle search input changes
     */
    private handleSearchInput(): void {
        const query = this.searchInputEl?.value || '';
        if (query) {
            this.searchAddon?.findNext(query, { decorations: { activeMatchColorOverviewRuler: '#ffff00' } });
        } else {
            this.searchAddon?.clearDecorations();
        }
    }

    /**
     * Handle search bar keyboard events
     */
    private handleSearchKeydown(e: KeyboardEvent): void {
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                if (e.shiftKey) {
                    this.searchPrevious();
                } else {
                    this.searchNext();
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.hideSearch();
                break;
        }
    }

    /**
     * Find next match
     */
    private searchNext(): void {
        const query = this.searchInputEl?.value || '';
        if (query) {
            this.searchAddon?.findNext(query);
        }
    }

    /**
     * Find previous match
     */
    private searchPrevious(): void {
        const query = this.searchInputEl?.value || '';
        if (query) {
            this.searchAddon?.findPrevious(query);
        }
    }

    /**
     * Check if WebGL rendering is enabled
     */
    isWebGLEnabled(): boolean {
        return this.webglEnabled;
    }

    /**
     * Setup resize observer
     */
    private setupResizeHandler(): void {
        if (!this.terminalEl) return;

        const handleResize = debounce(() => {
            if (this.fitAddon && this.terminal && this.isVisible) {
                this.terminalEl?.removeClass('resizing');
                this.fitAddon.fit();
                this.ptyBridge?.resize(this.terminal.cols, this.terminal.rows);
            }
        }, TIMING.RESIZE_DEBOUNCE_MS);

        this.resizeObserver = new ResizeObserver(() => {
            if (this.isVisible) {
                this.terminalEl?.addClass('resizing');
                handleResize();
            }
        });

        this.resizeObserver.observe(this.terminalEl);
    }

    /**
     * Start PTY bridge
     */
    private startPtyBridge(): void {
        this.ptyBridge = new PtyBridge(this.pluginPath, this.vaultPath);

        this.ptyBridge.setCallbacks({
            onStatusChange: (status) => this.handleStatusChange(status),
            onData: (data) => {
                this.terminal?.write(data);
                // Forward data for capture
                this.callbacks.onData?.(data);
            },
            onReady: () => this.handlePtyReady(),
            onSpawned: (pid) => this.handleSpawned(pid),
            onExit: (code) => this.handleExit(code),
            onError: (message) => this.handleError(message)
        });

        this.ptyBridge.start();
    }

    /**
     * Handle PTY ready
     */
    private handlePtyReady(): void {
        this.updateLoading({ stage: 'Connecting', substage: 'Spawning shell...', progress: 80 });

        const cwd = this.currentProject?.path || this.pluginPath;

        this.ptyBridge?.spawn({
            shell: this.settings.shell,
            cwd,
            cols: this.terminal?.cols || 80,
            rows: this.terminal?.rows || 24
        });
    }

    /**
     * Handle shell spawned
     */
    private handleSpawned(pid: number): void {
        console.log('[TerminalPanel] handleSpawned called, PID:', pid);
        this.updateLoading({ stage: 'Connected', substage: 'Terminal ready!', progress: 100 });

        setTimeout(() => {
            console.log('[TerminalPanel] Hiding loading, showing terminal');
            this.hideLoading();
            // Force terminal visible
            if (this.terminalEl) {
                this.terminalEl.style.display = 'block';
                this.terminalEl.style.visibility = 'visible';
                this.terminalEl.style.opacity = '1';
                this.terminalEl.style.height = '100%';
                this.terminalEl.style.minHeight = '200px';
            }
            this.container.style.display = 'flex';
            this.container.style.height = '100%';
            this.container.style.minHeight = '200px';

            // Debug DOM
            console.log('[TerminalPanel] Container:', this.container.className,
                'offsetHeight:', this.container.offsetHeight,
                'parent:', this.container.parentElement?.className);
            console.log('[TerminalPanel] TerminalEl:', this.terminalEl?.className,
                'offsetHeight:', this.terminalEl?.offsetHeight);

            this.fitAddon?.fit();
            this.terminal?.focus();
            console.log('[TerminalPanel] Terminal cols:', this.terminal?.cols, 'rows:', this.terminal?.rows);
        }, TIMING.LOADING_COMPLETE_DELAY_MS);

        // Auto-start Claude if enabled
        if (this.settings.autoStartClaude) {
            setTimeout(() => {
                this.ptyBridge?.write(`${this.settings.claudeCommand}\r`);
            }, TIMING.AUTO_START_DELAY_MS);
        }
    }

    /**
     * Handle status change
     */
    private handleStatusChange(status: ConnectionStatus): void {
        this.status = status;
        this.callbacks.onStatusChange(status);
    }

    /**
     * Handle PTY exit
     */
    private handleExit(code: number): void {
        this.terminal?.write(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m\r\n`);
    }

    /**
     * Handle PTY error
     */
    private handleError(message: string): void {
        this.terminal?.write(`\r\n\x1b[31mError: ${message}\x1b[0m\r\n`);
    }

    /**
     * Show loading state
     */
    private showLoading(state: LoadingStage): void {
        if (this.terminalEl) this.terminalEl.style.display = 'none';
        this.loadingState?.show(state);
    }

    /**
     * Update loading progress
     */
    private updateLoading(state: LoadingStage): void {
        this.loadingState?.update(state);
    }

    /**
     * Hide loading state
     */
    private hideLoading(): void {
        this.loadingState?.hide();
        if (this.terminalEl) this.terminalEl.style.display = 'block';
    }

    /**
     * Show the panel
     */
    show(): void {
        this.isVisible = true;
        this.container.style.display = 'flex';

        // Refit terminal when shown
        setTimeout(() => {
            this.fitAddon?.fit();
            this.terminal?.focus();
        }, 50);
    }

    /**
     * Hide the panel
     */
    hide(): void {
        this.isVisible = false;
        this.container.style.display = 'none';
    }

    /**
     * Focus terminal
     */
    focus(): void {
        this.terminal?.focus();
    }

    /**
     * Clear terminal
     */
    clear(): void {
        this.terminal?.clear();
    }

    /**
     * Write to terminal
     */
    write(data: string): void {
        this.ptyBridge?.write(data);
    }

    /**
     * Switch to a different project
     */
    async switchProject(project: Project): Promise<void> {
        if (project.path === this.currentProject?.path) return;

        this.currentProject = project;
        this.callbacks.onTitleChange(project.name);

        this.showLoading({ stage: 'Switching', substage: `Opening ${project.name}...`, progress: 0 });

        // Kill current shell
        this.ptyBridge?.killShell();

        // Small delay for clean switch
        setTimeout(() => {
            this.updateLoading({ stage: 'Switching', substage: 'Starting new shell...', progress: 50 });

            this.ptyBridge?.spawn({
                shell: this.settings.shell,
                cwd: project.path,
                cols: this.terminal?.cols || 80,
                rows: this.terminal?.rows || 24
            });
        }, 300);
    }

    /**
     * Restart terminal
     */
    async restart(): Promise<void> {
        this.showLoading({ stage: 'Restarting', substage: 'Reinitializing...', progress: 0 });

        this.ptyBridge?.stop();
        this.ptyBridge = null;

        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }

        if (this.terminalEl) {
            this.terminalEl.empty();
        }

        this.isInitialized = false;
        await this.initTerminal();
        this.isInitialized = true;
    }

    /**
     * Get current project
     */
    getProject(): Project | null {
        return this.currentProject;
    }

    /**
     * Get current status
     */
    getStatus(): ConnectionStatus {
        return this.status;
    }

    /**
     * Get container element
     */
    getContainer(): HTMLElement {
        return this.container;
    }

    /**
     * Destroy panel
     */
    destroy(): void {
        this.resizeObserver?.disconnect();
        this.ptyBridge?.stop();
        this.loadingState?.destroy();

        // Dispose addons
        if (this.webglAddon) {
            this.webglAddon.dispose();
            this.webglAddon = null;
        }
        if (this.searchAddon) {
            this.searchAddon = null;
        }

        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }

        this.container.empty();
    }
}
