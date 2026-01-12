/**
 * TerminalManager - Manages multiple terminal instances
 */

import type { TerminalInstance, Project, ConnectionStatus } from '../types';

export type TerminalChangeCallback = (instances: TerminalInstance[], activeId: string | null) => void;

export class TerminalManager {
    private instances: Map<string, TerminalInstance> = new Map();
    private activeInstanceId: string | null = null;
    private changeCallbacks: Set<TerminalChangeCallback> = new Set();
    private instanceCounter: number = 0;

    /**
     * Create a new terminal instance
     */
    createInstance(project: Project | null = null): TerminalInstance {
        this.instanceCounter++;
        const id = `terminal-${Date.now()}-${this.instanceCounter}`;

        const instance: TerminalInstance = {
            id,
            name: project?.name || `Terminal ${this.instanceCounter}`,
            project,
            status: 'disconnected',
            createdAt: Date.now()
        };

        this.instances.set(id, instance);

        // If this is the first instance, make it active
        if (this.instances.size === 1) {
            this.activeInstanceId = id;
        }

        this.notifyChange();
        return instance;
    }

    /**
     * Get instance by ID
     */
    getInstance(id: string): TerminalInstance | undefined {
        return this.instances.get(id);
    }

    /**
     * Get active instance
     */
    getActiveInstance(): TerminalInstance | null {
        if (!this.activeInstanceId) return null;
        return this.instances.get(this.activeInstanceId) || null;
    }

    /**
     * Get active instance ID
     */
    getActiveInstanceId(): string | null {
        return this.activeInstanceId;
    }

    /**
     * Get all instances
     */
    getAllInstances(): TerminalInstance[] {
        return Array.from(this.instances.values()).sort((a, b) => a.createdAt - b.createdAt);
    }

    /**
     * Set active instance
     */
    setActiveInstance(id: string): boolean {
        if (!this.instances.has(id)) return false;
        this.activeInstanceId = id;
        this.notifyChange();
        return true;
    }

    /**
     * Update instance status
     */
    updateInstanceStatus(id: string, status: ConnectionStatus): void {
        const instance = this.instances.get(id);
        if (instance) {
            instance.status = status;
            this.notifyChange();
        }
    }

    /**
     * Update instance project
     */
    updateInstanceProject(id: string, project: Project | null): void {
        const instance = this.instances.get(id);
        if (instance) {
            instance.project = project;
            instance.name = project?.name || instance.name;
            this.notifyChange();
        }
    }

    /**
     * Rename instance
     */
    renameInstance(id: string, name: string): void {
        const instance = this.instances.get(id);
        if (instance) {
            instance.name = name;
            this.notifyChange();
        }
    }

    /**
     * Remove instance
     */
    removeInstance(id: string): boolean {
        if (!this.instances.has(id)) return false;

        this.instances.delete(id);

        // If we removed the active instance, switch to another
        if (this.activeInstanceId === id) {
            const remaining = this.getAllInstances();
            this.activeInstanceId = remaining.length > 0 ? remaining[0].id : null;
        }

        this.notifyChange();
        return true;
    }

    /**
     * Get instance count
     */
    getCount(): number {
        return this.instances.size;
    }

    /**
     * Subscribe to changes
     */
    onChange(callback: TerminalChangeCallback): () => void {
        this.changeCallbacks.add(callback);
        return () => this.changeCallbacks.delete(callback);
    }

    /**
     * Notify all subscribers of changes
     */
    private notifyChange(): void {
        const instances = this.getAllInstances();
        for (const callback of this.changeCallbacks) {
            callback(instances, this.activeInstanceId);
        }
    }

    /**
     * Clear all instances
     */
    clear(): void {
        this.instances.clear();
        this.activeInstanceId = null;
        this.notifyChange();
    }
}
