/**
 * ProjectManager - Handles project discovery, tracking, and switching
 * Enhanced with async parallel scanning for improved performance
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Project, ProjectSource, ClaudeCodeSettings } from '../types';
import { isProjectDirectory, getProjectName, detectProjectIcon, fuzzyScore } from '../utils';

// Promisified fs functions for async operations
const fsPromises = fs.promises;

export class ProjectManager {
    private settings: ClaudeCodeSettings;
    private saveSettingsCallback: () => Promise<void>;
    private cachedProjects: Project[] = [];
    private lastScanTime: number = 0;
    private readonly CACHE_TTL_MS = 30000; // 30 seconds
    private isScanning: boolean = false;
    private scanPromise: Promise<Project[]> | null = null;

    // Callbacks for scan progress
    private onScanStart: (() => void) | null = null;
    private onScanProgress: ((scanned: number, found: number) => void) | null = null;
    private onScanComplete: ((projects: Project[]) => void) | null = null;

    constructor(
        settings: ClaudeCodeSettings,
        saveSettings: () => Promise<void>
    ) {
        this.settings = settings;
        this.saveSettingsCallback = saveSettings;
    }

    /**
     * Set scan progress callbacks
     */
    setScanCallbacks(callbacks: {
        onScanStart?: () => void;
        onScanProgress?: (scanned: number, found: number) => void;
        onScanComplete?: (projects: Project[]) => void;
    }): void {
        this.onScanStart = callbacks.onScanStart || null;
        this.onScanProgress = callbacks.onScanProgress || null;
        this.onScanComplete = callbacks.onScanComplete || null;
    }

    /**
     * Update settings reference (called when settings change)
     */
    updateSettings(settings: ClaudeCodeSettings): void {
        this.settings = settings;
    }

    /**
     * Check if a scan is in progress
     */
    isScanInProgress(): boolean {
        return this.isScanning;
    }

    /**
     * Get all discovered projects (with async parallel scanning)
     */
    async getProjects(forceRefresh: boolean = false): Promise<Project[]> {
        const now = Date.now();

        // Return cached if valid
        if (!forceRefresh && this.cachedProjects.length > 0 && (now - this.lastScanTime) < this.CACHE_TTL_MS) {
            return this.cachedProjects;
        }

        // If scan in progress, return existing promise to avoid duplicate scans
        if (this.isScanning && this.scanPromise) {
            return this.scanPromise;
        }

        // Start new scan
        this.isScanning = true;
        this.onScanStart?.();

        this.scanPromise = this.performParallelScan();

        try {
            const projects = await this.scanPromise;
            this.cachedProjects = projects;
            this.lastScanTime = Date.now();
            this.onScanComplete?.(projects);
            return projects;
        } finally {
            this.isScanning = false;
            this.scanPromise = null;
        }
    }

    /**
     * Perform parallel scanning of all project sources
     */
    private async performParallelScan(): Promise<Project[]> {
        const enabledSources = this.settings.projectSources.filter(s => s.enabled && s.path);

        if (enabledSources.length === 0) {
            return [];
        }

        // Scan all sources in parallel
        const scanResults = await Promise.all(
            enabledSources.map(source => this.scanProjectSourceAsync(source))
        );

        // Merge and deduplicate results
        const seenPaths = new Set<string>();
        const projects: Project[] = [];

        for (const sourceProjects of scanResults) {
            for (const project of sourceProjects) {
                if (!seenPaths.has(project.path)) {
                    seenPaths.add(project.path);
                    projects.push(project);
                }
            }
        }

        // Sort by last opened (recent first), then alphabetically
        projects.sort((a, b) => {
            if (a.lastOpened && b.lastOpened) {
                return b.lastOpened - a.lastOpened;
            }
            if (a.lastOpened) return -1;
            if (b.lastOpened) return 1;
            return a.name.localeCompare(b.name);
        });

        return projects;
    }

    /**
     * Async scan a project source for projects
     */
    private async scanProjectSourceAsync(source: ProjectSource): Promise<Project[]> {
        try {
            const stats = await fsPromises.stat(source.path).catch(() => null);
            if (!stats?.isDirectory()) {
                return [];
            }

            const maxDepth = source.depth ?? 2;
            return await this.scanDirectoryAsync(source.path, 0, maxDepth);
        } catch (error) {
            console.error(`[ProjectManager] Error scanning ${source.path}:`, error);
            return [];
        }
    }

    /**
     * Async recursive directory scan with parallel subdirectory processing
     */
    private async scanDirectoryAsync(
        dirPath: string,
        currentDepth: number,
        maxDepth: number
    ): Promise<Project[]> {
        if (currentDepth > maxDepth) return [];

        try {
            // Check if current directory is a project (depth > 0)
            if (currentDepth > 0) {
                const isProject = await this.isProjectDirectoryAsync(dirPath);
                if (isProject) {
                    const recentProject = this.settings.recentProjects.find(p => p.path === dirPath);
                    const project: Project = {
                        name: getProjectName(dirPath),
                        path: dirPath,
                        lastOpened: recentProject?.lastOpened,
                        icon: await this.detectProjectIconAsync(dirPath)
                    };
                    return [project];
                }
            }

            // Read directory entries
            const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

            // Filter to valid subdirectories
            const subdirs = entries.filter(entry => {
                if (!entry.isDirectory()) return false;
                if (entry.name.startsWith('.')) return false;
                if (entry.name === 'node_modules') return false;
                if (entry.name === '__pycache__') return false;
                if (entry.name === 'venv') return false;
                if (entry.name === '.venv') return false;
                if (entry.name === 'target') return false; // Rust
                if (entry.name === 'dist') return false;
                if (entry.name === 'build') return false;
                return true;
            });

            // Scan subdirectories in parallel (with concurrency limit)
            const CONCURRENCY_LIMIT = 10;
            const results: Project[] = [];

            for (let i = 0; i < subdirs.length; i += CONCURRENCY_LIMIT) {
                const batch = subdirs.slice(i, i + CONCURRENCY_LIMIT);
                const batchResults = await Promise.all(
                    batch.map(entry => {
                        const subPath = path.join(dirPath, entry.name);
                        return this.scanDirectoryAsync(subPath, currentDepth + 1, maxDepth);
                    })
                );
                results.push(...batchResults.flat());

                // Report progress
                this.onScanProgress?.(i + batch.length, results.length);
            }

            return results;
        } catch (error) {
            // Silently skip directories we can't read
            return [];
        }
    }

    /**
     * Async check if directory is a project
     */
    private async isProjectDirectoryAsync(dirPath: string): Promise<boolean> {
        const projectMarkers = [
            'package.json',
            'Cargo.toml',
            'pyproject.toml',
            'setup.py',
            'go.mod',
            'pom.xml',
            'build.gradle',
            'CMakeLists.txt',
            'Makefile',
            '.git'
        ];

        // Check all markers in parallel
        const checks = await Promise.all(
            projectMarkers.map(async marker => {
                try {
                    await fsPromises.access(path.join(dirPath, marker));
                    return true;
                } catch {
                    return false;
                }
            })
        );

        return checks.some(exists => exists);
    }

    /**
     * Async detect project icon
     */
    private async detectProjectIconAsync(projectPath: string): Promise<string> {
        const iconChecks = [
            { file: 'package.json', icon: 'file-code' },
            { file: 'Cargo.toml', icon: 'box' },
            { file: 'pyproject.toml', icon: 'file-code-2' },
            { file: 'setup.py', icon: 'file-code-2' },
            { file: 'go.mod', icon: 'package' },
            { file: '.git', icon: 'git-branch' }
        ];

        for (const check of iconChecks) {
            try {
                await fsPromises.access(path.join(projectPath, check.file));
                return check.icon;
            } catch {
                continue;
            }
        }

        return 'folder';
    }

    /**
     * Search projects by query
     */
    async searchProjects(query: string): Promise<Project[]> {
        const allProjects = await this.getProjects();

        if (!query.trim()) {
            // Return recent projects first, then all projects
            return allProjects.slice(0, 20);
        }

        // Score and filter projects
        const scored = allProjects
            .map(project => ({
                project,
                score: fuzzyScore(project.name, query) + fuzzyScore(project.path, query) * 0.5
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);

        return scored.slice(0, 20).map(item => item.project);
    }

    /**
     * Get recent projects
     */
    getRecentProjects(): Project[] {
        return [...this.settings.recentProjects]
            .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
            .slice(0, this.settings.maxRecentProjects);
    }

    /**
     * Add or update project in recent list
     */
    async addToRecent(project: Project): Promise<void> {
        const now = Date.now();
        const existingIndex = this.settings.recentProjects.findIndex(p => p.path === project.path);

        if (existingIndex >= 0) {
            // Update existing
            this.settings.recentProjects[existingIndex].lastOpened = now;
        } else {
            // Add new
            this.settings.recentProjects.unshift({
                ...project,
                lastOpened: now
            });
        }

        // Trim to max size
        if (this.settings.recentProjects.length > this.settings.maxRecentProjects) {
            this.settings.recentProjects = this.settings.recentProjects.slice(0, this.settings.maxRecentProjects);
        }

        await this.saveSettingsCallback();
    }

    /**
     * Remove project from recent list
     */
    async removeFromRecent(projectPath: string): Promise<void> {
        this.settings.recentProjects = this.settings.recentProjects.filter(p => p.path !== projectPath);
        await this.saveSettingsCallback();
    }

    /**
     * Clear all recent projects
     */
    async clearRecent(): Promise<void> {
        this.settings.recentProjects = [];
        await this.saveSettingsCallback();
    }

    /**
     * Add a new project source
     */
    async addProjectSource(source: ProjectSource): Promise<void> {
        this.settings.projectSources.push(source);
        this.invalidateCache();
        await this.saveSettingsCallback();
    }

    /**
     * Remove a project source
     */
    async removeProjectSource(sourcePath: string): Promise<void> {
        this.settings.projectSources = this.settings.projectSources.filter(s => s.path !== sourcePath);
        this.invalidateCache();
        await this.saveSettingsCallback();
    }

    /**
     * Invalidate project cache
     */
    invalidateCache(): void {
        this.cachedProjects = [];
        this.lastScanTime = 0;
    }

    /**
     * Create project from path
     */
    createProjectFromPath(projectPath: string): Project {
        return {
            name: getProjectName(projectPath),
            path: projectPath,
            icon: detectProjectIcon(projectPath)
        };
    }
}
