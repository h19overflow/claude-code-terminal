/**
 * PtyBridge - Abstraction layer for PTY host communication
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import type { PtyMessage, PtySpawnOptions, ConnectionStatus, StatusChangeCallback, DataCallback } from '../types';
import { TIMING } from '../constants';

export class PtyBridge {
    private ptyHost: ChildProcess | null = null;
    private messageBuffer: string = '';
    private pluginPath: string;
    private vaultPath: string;
    private status: ConnectionStatus = 'disconnected';
    private boundarySet: boolean = false;

    // Callbacks
    private onStatusChange: StatusChangeCallback | null = null;
    private onData: DataCallback | null = null;
    private onReady: (() => void) | null = null;
    private onSpawned: ((pid: number) => void) | null = null;
    private onExit: ((code: number) => void) | null = null;
    private onError: ((message: string) => void) | null = null;

    constructor(pluginPath: string, vaultPath?: string) {
        this.pluginPath = pluginPath;
        this.vaultPath = vaultPath || pluginPath;
    }

    /**
     * Set event callbacks
     */
    setCallbacks(callbacks: {
        onStatusChange?: StatusChangeCallback;
        onData?: DataCallback;
        onReady?: () => void;
        onSpawned?: (pid: number) => void;
        onExit?: (code: number) => void;
        onError?: (message: string) => void;
    }): void {
        this.onStatusChange = callbacks.onStatusChange || null;
        this.onData = callbacks.onData || null;
        this.onReady = callbacks.onReady || null;
        this.onSpawned = callbacks.onSpawned || null;
        this.onExit = callbacks.onExit || null;
        this.onError = callbacks.onError || null;
    }

    /**
     * Get current connection status
     */
    getStatus(): ConnectionStatus {
        return this.status;
    }

    /**
     * Update and broadcast status
     */
    private setStatus(status: ConnectionStatus): void {
        this.status = status;
        this.onStatusChange?.(status);
    }

    /**
     * Start the PTY host process
     */
    start(): boolean {
        if (this.ptyHost) {
            console.warn('[PtyBridge] PTY host already running');
            return true;
        }

        const ptyHostPath = path.join(this.pluginPath, 'pty-host.js');
        this.setStatus('connecting');

        try {
            this.ptyHost = spawn('node', [ptyHostPath], {
                cwd: this.pluginPath,
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.setupEventHandlers();
            return true;
        } catch (error: any) {
            console.error('[PtyBridge] Failed to start PTY host:', error);
            this.setStatus('error');
            this.onError?.(error.message);
            return false;
        }
    }

    /**
     * Setup event handlers for PTY host process
     */
    private setupEventHandlers(): void {
        if (!this.ptyHost) return;

        // Handle stdout (JSON messages)
        this.ptyHost.stdout?.setEncoding('utf8');
        this.ptyHost.stdout?.on('data', (chunk: string) => {
            this.messageBuffer += chunk;
            const lines = this.messageBuffer.split('\n');
            this.messageBuffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg: PtyMessage = JSON.parse(line);
                    this.handleMessage(msg);
                } catch (e) {
                    console.error('[PtyBridge] Failed to parse message:', e);
                }
            }
        });

        // Handle stderr
        this.ptyHost.stderr?.setEncoding('utf8');
        this.ptyHost.stderr?.on('data', (data: string) => {
            console.error('[PtyBridge] stderr:', data);
        });

        // Handle process error
        this.ptyHost.on('error', (err) => {
            console.error('[PtyBridge] Process error:', err);
            this.setStatus('error');
            this.onError?.(err.message);
        });

        // Handle process exit
        this.ptyHost.on('exit', (code) => {
            console.log('[PtyBridge] Process exited with code:', code);
            this.ptyHost = null;
            if (this.status === 'connected') {
                this.setStatus('disconnected');
            }
        });
    }

    /**
     * Handle incoming PTY message
     */
    private handleMessage(msg: PtyMessage): void {
        switch (msg.type) {
            case 'ready':
                console.log('[PtyBridge] PTY host ready');
                // Set vault boundary for security
                this.setBoundary(this.vaultPath);
                this.onReady?.();
                break;

            case 'boundary-set':
                console.log('[PtyBridge] Vault boundary set:', msg.data.path);
                this.boundarySet = true;
                break;

            case 'spawned':
                console.log('[PtyBridge] Shell spawned with PID:', msg.data.pid);
                this.setStatus('connected');
                this.onSpawned?.(msg.data.pid);
                break;

            case 'data':
                this.onData?.(msg.data);
                break;

            case 'exit':
                console.log('[PtyBridge] Shell exited with code:', msg.data.exitCode);
                this.setStatus('disconnected');
                this.onExit?.(msg.data.exitCode);
                break;

            case 'error':
                console.error('[PtyBridge] PTY error:', msg.data.message, msg.data.code);
                this.setStatus('error');
                this.onError?.(msg.data.message);
                break;
        }
    }

    /**
     * Set the vault boundary for CWD validation
     */
    private setBoundary(boundaryPath: string): boolean {
        return this.send('set-boundary', { path: boundaryPath });
    }

    /**
     * Send message to PTY host
     */
    private send(type: string, data: any): boolean {
        if (!this.ptyHost?.stdin?.writable) {
            console.warn('[PtyBridge] Cannot send - stdin not writable');
            return false;
        }

        try {
            this.ptyHost.stdin.write(JSON.stringify({ type, data }) + '\n');
            return true;
        } catch (error) {
            console.error('[PtyBridge] Send error:', error);
            return false;
        }
    }

    /**
     * Spawn a shell in the PTY
     */
    spawn(options: PtySpawnOptions): boolean {
        return this.send('spawn', options);
    }

    /**
     * Write data to the PTY
     */
    write(data: string): boolean {
        return this.send('write', data);
    }

    /**
     * Resize the PTY
     */
    resize(cols: number, rows: number): boolean {
        return this.send('resize', { cols, rows });
    }

    /**
     * Kill the shell process
     */
    killShell(): boolean {
        return this.send('kill', {});
    }

    /**
     * Stop the PTY host process
     */
    stop(): void {
        if (!this.ptyHost) return;

        // Try graceful kill first
        this.killShell();

        // Force kill after timeout
        setTimeout(() => {
            if (this.ptyHost) {
                this.ptyHost.kill();
                this.ptyHost = null;
            }
        }, TIMING.PTY_KILL_TIMEOUT_MS);

        this.setStatus('disconnected');
    }

    /**
     * Restart the PTY host
     */
    restart(): void {
        this.stop();
        setTimeout(() => this.start(), TIMING.PTY_KILL_TIMEOUT_MS + 100);
    }

    /**
     * Check if PTY host is running
     */
    isRunning(): boolean {
        return this.ptyHost !== null;
    }
}
