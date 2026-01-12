/**
 * Core type definitions for Claude Code Terminal
 */

// Connection status for terminal
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Loading progress stage
export interface LoadingStage {
    stage: string;
    substage: string;
    progress: number;
}

// PTY message from host process
export interface PtyMessage {
    type: 'ready' | 'spawned' | 'data' | 'exit' | 'error' | 'boundary-set';
    data: any;
}

// PTY spawn options
export interface PtySpawnOptions {
    shell: string;
    cwd: string;
    cols: number;
    rows: number;
    args?: string[];
}

// Project definition
export interface Project {
    name: string;
    path: string;
    lastOpened?: number;
    icon?: string;
    description?: string;
}

// Project source configuration
export interface ProjectSource {
    type: 'directory' | 'git-repos' | 'custom';
    path: string;
    depth?: number;
    enabled: boolean;
}

// Plugin settings
export interface ClaudeCodeSettings {
    // Terminal settings
    shell: string;
    claudeCommand: string;
    autoStartClaude: boolean;
    fontSize: number;
    fontFamily: string;

    // Project settings
    projectSources: ProjectSource[];
    recentProjects: Project[];
    maxRecentProjects: number;
    showProjectInHeader: boolean;

    // UI settings
    showLoadingAnimation: boolean;
    showStatusBadge: boolean;
}

// Terminal view state
export interface TerminalState {
    status: ConnectionStatus;
    currentProject: Project | null;
    pid: number | null;
}

// Terminal instance (for multi-terminal support)
export interface TerminalInstance {
    id: string;
    name: string;
    project: Project | null;
    status: ConnectionStatus;
    createdAt: number;
}

// Event types for internal communication
export type TerminalEventType =
    | 'status-change'
    | 'project-change'
    | 'pty-data'
    | 'pty-exit'
    | 'pty-error';

export interface TerminalEvent {
    type: TerminalEventType;
    data: any;
}

// Callback types
export type StatusChangeCallback = (status: ConnectionStatus) => void;
export type ProjectChangeCallback = (project: Project | null) => void;
export type DataCallback = (data: string) => void;
