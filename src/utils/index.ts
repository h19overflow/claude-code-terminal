/**
 * Utility functions for Claude Code Terminal
 */

import * as path from 'path';
import * as fs from 'fs';
import { TERMINAL_THEME_DARK, TERMINAL_THEME_LIGHT } from '../constants';

/**
 * Get terminal theme colors based on Obsidian's current theme
 */
export function getTerminalTheme(): Record<string, string> {
    const isDark = document.body.classList.contains('theme-dark');
    return isDark ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT;
}

/**
 * Check if a directory is a git repository
 */
export function isGitRepo(dirPath: string): boolean {
    try {
        const gitPath = path.join(dirPath, '.git');
        return fs.existsSync(gitPath);
    } catch {
        return false;
    }
}

/**
 * Check if a directory contains a project marker
 * (package.json, Cargo.toml, pyproject.toml, etc.)
 */
export function isProjectDirectory(dirPath: string): boolean {
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

    try {
        for (const marker of projectMarkers) {
            if (fs.existsSync(path.join(dirPath, marker))) {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Get project name from path (last directory name)
 */
export function getProjectName(projectPath: string): string {
    return path.basename(projectPath);
}

/**
 * Get relative path from base
 */
export function getRelativePath(basePath: string, fullPath: string): string {
    return path.relative(basePath, fullPath);
}

/**
 * Detect project type and return appropriate icon name
 */
export function detectProjectIcon(projectPath: string): string {
    try {
        if (fs.existsSync(path.join(projectPath, 'package.json'))) {
            return 'file-code';
        }
        if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
            return 'box';
        }
        if (fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
            fs.existsSync(path.join(projectPath, 'setup.py'))) {
            return 'file-code-2';
        }
        if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
            return 'package';
        }
        if (isGitRepo(projectPath)) {
            return 'git-branch';
        }
        return 'folder';
    } catch {
        return 'folder';
    }
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Fuzzy match string against pattern
 */
export function fuzzyMatch(str: string, pattern: string): boolean {
    const lowerStr = str.toLowerCase();
    const lowerPattern = pattern.toLowerCase();

    let patternIdx = 0;
    for (let i = 0; i < lowerStr.length && patternIdx < lowerPattern.length; i++) {
        if (lowerStr[i] === lowerPattern[patternIdx]) {
            patternIdx++;
        }
    }

    return patternIdx === lowerPattern.length;
}

/**
 * Score fuzzy match (higher = better match)
 */
export function fuzzyScore(str: string, pattern: string): number {
    const lowerStr = str.toLowerCase();
    const lowerPattern = pattern.toLowerCase();

    if (lowerStr === lowerPattern) return 1000;
    if (lowerStr.startsWith(lowerPattern)) return 500;
    if (lowerStr.includes(lowerPattern)) return 100;

    let score = 0;
    let patternIdx = 0;
    let consecutiveBonus = 0;

    for (let i = 0; i < lowerStr.length && patternIdx < lowerPattern.length; i++) {
        if (lowerStr[i] === lowerPattern[patternIdx]) {
            score += 10 + consecutiveBonus;
            consecutiveBonus += 5;
            patternIdx++;
        } else {
            consecutiveBonus = 0;
        }
    }

    return patternIdx === lowerPattern.length ? score : 0;
}

/**
 * Format timestamp as relative time
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Truncate path for display
 */
export function truncatePath(fullPath: string, maxLength: number = 50): string {
    if (fullPath.length <= maxLength) return fullPath;

    const parts = fullPath.split(path.sep);
    if (parts.length <= 2) return fullPath;

    // Keep first and last parts, truncate middle
    const first = parts[0];
    const last = parts.slice(-2).join(path.sep);

    if (`${first}${path.sep}...${path.sep}${last}`.length <= maxLength) {
        return `${first}${path.sep}...${path.sep}${last}`;
    }

    return `...${path.sep}${last}`;
}
