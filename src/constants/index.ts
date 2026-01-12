/**
 * Constants and default values for Claude Code Terminal
 */

import type { ClaudeCodeSettings, ProjectSource } from '../types';

// View type identifier
export const CLAUDE_TERMINAL_VIEW_TYPE = 'claude-terminal-view';

// Icons - Anthropic-inspired geometric design
export const ICONS = {
    // Main logo: Abstract geometric shape inspired by Claude's visual identity
    // Hexagonal form with inner structure suggesting neural/AI patterns
    claude: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 6.5V17.5L12 22L20 17.5V6.5L12 2Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M12 2V22" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
        <path d="M4 6.5L20 17.5" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
        <path d="M20 6.5L4 17.5" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
        <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.8"/>
        <circle cx="12" cy="2" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="22" r="1.5" fill="currentColor"/>
        <circle cx="4" cy="6.5" r="1.5" fill="currentColor"/>
        <circle cx="20" cy="6.5" r="1.5" fill="currentColor"/>
        <circle cx="4" cy="17.5" r="1.5" fill="currentColor"/>
        <circle cx="20" cy="17.5" r="1.5" fill="currentColor"/>
    </svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" fill="none"/>
    </svg>`,
    git: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
        <path d="M12 3v6m0 6v6" stroke="currentColor" stroke-width="2"/>
        <circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="18" cy="18" r="2" stroke="currentColor" stroke-width="2"/>
        <path d="M6 8v4a2 2 0 0 0 2 2h2m4 0h2a2 2 0 0 0 2-2V8" stroke="currentColor" stroke-width="2" fill="none"/>
    </svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
        <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2"/>
    </svg>`
};

// Default project sources
export const DEFAULT_PROJECT_SOURCES: ProjectSource[] = [
    {
        type: 'directory',
        path: '',  // Will be set to vault path
        depth: 1,
        enabled: true
    }
];

// Default settings
export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
    // Terminal settings
    shell: 'powershell.exe',
    claudeCommand: 'claude',
    autoStartClaude: true,
    fontSize: 14,
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',

    // Project settings
    projectSources: DEFAULT_PROJECT_SOURCES,
    recentProjects: [],
    maxRecentProjects: 10,
    showProjectInHeader: true,

    // UI settings
    showLoadingAnimation: true,
    showStatusBadge: true
};

// Terminal theme colors (dark mode)
export const TERMINAL_THEME_DARK = {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: '#1e1e1e',
    selectionBackground: '#264f78',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff'
};

// Terminal theme colors (light mode)
export const TERMINAL_THEME_LIGHT = {
    background: '#ffffff',
    foreground: '#1e1e1e',
    cursor: '#1e1e1e',
    cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#1e1e1e',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff'
};

// Timing constants
export const TIMING = {
    RESIZE_DEBOUNCE_MS: 150,
    INITIAL_FIT_DELAY_MS: 50,
    AUTO_START_DELAY_MS: 500,
    LOADING_COMPLETE_DELAY_MS: 300,
    PTY_KILL_TIMEOUT_MS: 500
};

// Status labels
export const STATUS_LABELS: Record<string, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Error'
};
