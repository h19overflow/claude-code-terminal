// This script runs in a separate Node.js process to handle PTY
// It communicates with the main Obsidian process via stdin/stdout JSON messages

// Try original node-pty first, fallback to @lydell/node-pty
let pty;
try {
    pty = require('node-pty');
    console.error('[pty-host] Using node-pty');
} catch (e) {
    pty = require('@lydell/node-pty');
    console.error('[pty-host] Using @lydell/node-pty');
}
const path = require('path');
const fs = require('fs');
const os = require('os');

let ptyProcess = null;
let vaultBoundary = null; // Set on first spawn, restricts CWD

// Security: Whitelist of allowed shells per platform
const SHELL_WHITELIST = {
    win32: [
        'powershell.exe',
        'pwsh.exe',
        'cmd.exe',
        'powershell',
        'pwsh',
        'cmd',
        // Full paths
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        'C:\\Windows\\System32\\cmd.exe',
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
    ],
    darwin: ['zsh', 'bash', 'sh', '/bin/zsh', '/bin/bash', '/bin/sh', '/usr/local/bin/zsh', '/usr/local/bin/bash'],
    linux: ['bash', 'zsh', 'sh', '/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/bash', '/usr/bin/zsh']
};

/**
 * Validate shell is in whitelist
 */
function isShellAllowed(shell) {
    const platform = os.platform();
    const whitelist = SHELL_WHITELIST[platform] || SHELL_WHITELIST.linux;
    const normalizedShell = shell.toLowerCase().trim();

    return whitelist.some(allowed => {
        const normalizedAllowed = allowed.toLowerCase();
        return normalizedShell === normalizedAllowed ||
               normalizedShell.endsWith(path.sep + normalizedAllowed) ||
               path.basename(normalizedShell) === path.basename(normalizedAllowed);
    });
}

/**
 * Validate CWD is within vault boundary
 * Prevents directory traversal attacks
 */
function isPathWithinBoundary(targetPath, boundary) {
    if (!boundary) return true; // No boundary set yet

    try {
        const resolvedTarget = path.resolve(targetPath);
        const resolvedBoundary = path.resolve(boundary);

        // Normalize for cross-platform comparison
        const normalizedTarget = resolvedTarget.toLowerCase();
        const normalizedBoundary = resolvedBoundary.toLowerCase();

        // Check if target starts with boundary (is within or is the boundary)
        return normalizedTarget === normalizedBoundary ||
               normalizedTarget.startsWith(normalizedBoundary + path.sep);
    } catch {
        return false;
    }
}

/**
 * Validate CWD exists and is a directory
 */
function isValidDirectory(dirPath) {
    try {
        const stats = fs.statSync(dirPath);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Get the real path with correct case (Windows fix)
 * node-pty can fail if path case doesn't match filesystem
 */
function getRealPath(inputPath) {
    try {
        // fs.realpathSync resolves symlinks and normalizes case on Windows
        return fs.realpathSync(inputPath);
    } catch {
        // If realpathSync fails, return original
        return inputPath;
    }
}

/**
 * Sanitize environment variables - remove sensitive ones
 */
function sanitizeEnv(baseEnv) {
    const sensitiveVars = [
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'GITHUB_TOKEN',
        'GH_TOKEN',
        'NPM_TOKEN',
        'PRIVATE_KEY',
        'SECRET_KEY',
        'API_SECRET',
        'DATABASE_PASSWORD',
        'DB_PASSWORD'
    ];

    const sanitized = { ...baseEnv };
    for (const varName of sensitiveVars) {
        delete sanitized[varName];
    }

    // Add terminal-specific vars
    sanitized.TERM = 'xterm-256color';
    sanitized.COLORTERM = 'truecolor';

    return sanitized;
}

process.stdin.setEncoding('utf8');

let buffer = '';
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const msg = JSON.parse(line);
            handleMessage(msg);
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    }
});

function send(type, data) {
    process.stdout.write(JSON.stringify({ type, data }) + '\n');
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'spawn':
            spawnPty(msg.data);
            break;
        case 'write':
            if (ptyProcess) {
                ptyProcess.write(msg.data);
            }
            break;
        case 'resize':
            if (ptyProcess) {
                ptyProcess.resize(msg.data.cols, msg.data.rows);
            }
            break;
        case 'kill':
            if (ptyProcess) {
                ptyProcess.kill();
                ptyProcess = null;
            }
            break;
        case 'set-boundary':
            // Set vault boundary on initialization
            if (msg.data && msg.data.path && isValidDirectory(msg.data.path)) {
                vaultBoundary = path.resolve(msg.data.path);
                send('boundary-set', { path: vaultBoundary });
            }
            break;
    }
}

function spawnPty(options) {
    // Security: Prevent double spawn
    if (ptyProcess) {
        send('error', { message: 'PTY already spawned. Kill existing process first.', code: 'DOUBLE_SPAWN' });
        return;
    }

    // Security: Validate shell
    if (!isShellAllowed(options.shell)) {
        send('error', {
            message: `Shell not allowed: ${options.shell}. Use powershell, pwsh, cmd, bash, zsh, or sh.`,
            code: 'SHELL_NOT_ALLOWED'
        });
        return;
    }

    // Security: Validate CWD exists
    if (!isValidDirectory(options.cwd)) {
        send('error', {
            message: `Invalid working directory: ${options.cwd}`,
            code: 'INVALID_CWD'
        });
        return;
    }

    // Security: Validate CWD is within boundary (if boundary is set)
    // Allow parent directories up to 2 levels above vault for project flexibility
    const cwdToCheck = options.cwd;
    if (vaultBoundary) {
        // For flexibility, allow paths that are:
        // 1. Within the vault
        // 2. Parent of the vault (for project roots outside vault)
        // 3. Sibling directories of vault's parent
        const vaultParent = path.dirname(vaultBoundary);
        const vaultGrandparent = path.dirname(vaultParent);

        const isWithinVault = isPathWithinBoundary(cwdToCheck, vaultBoundary);
        const isWithinParent = isPathWithinBoundary(cwdToCheck, vaultParent);
        const isWithinGrandparent = isPathWithinBoundary(cwdToCheck, vaultGrandparent);

        if (!isWithinVault && !isWithinParent && !isWithinGrandparent) {
            send('error', {
                message: `CWD outside allowed boundary. Path: ${cwdToCheck}`,
                code: 'CWD_OUTSIDE_BOUNDARY'
            });
            return;
        }
    }

    try {
        // Resolve the real path with correct case (Windows fix for node-pty)
        const resolvedCwd = getRealPath(options.cwd);

        // Debug logging
        console.error('[pty-host] Spawning shell:', options.shell);
        console.error('[pty-host] Input CWD:', options.cwd);
        console.error('[pty-host] Resolved CWD:', resolvedCwd);
        console.error('[pty-host] CWD exists:', fs.existsSync(resolvedCwd));
        console.error('[pty-host] Cols:', options.cols, 'Rows:', options.rows);

        // Use ConPTY on modern Windows (winpty has path resolution issues in Electron)
        const useConpty = true;
        console.error('[pty-host] Using ConPTY:', useConpty);
        console.error('[pty-host] PATH:', process.env.PATH ? process.env.PATH.substring(0, 200) : 'undefined');
        console.error('[pty-host] Shell exists:', fs.existsSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'));

        // Use full path to shell
        const shellPath = options.shell === 'powershell.exe'
            ? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
            : options.shell;
        console.error('[pty-host] Full shell path:', shellPath);

        let spawnedProcess;
        try {
            console.error('[pty-host] Calling pty.spawn NOW...');
            spawnedProcess = pty.spawn(shellPath, options.args || [], {
                name: 'xterm-256color',
                cols: options.cols || 80,
                rows: options.rows || 24,
                cwd: resolvedCwd,
                env: sanitizeEnv(process.env),
                useConpty: useConpty
            });
            console.error('[pty-host] pty.spawn returned');
        } catch (spawnError) {
            console.error('[pty-host] pty.spawn() threw:', spawnError.message);
            console.error('[pty-host] Stack:', spawnError.stack);
            send('error', { message: spawnError.message, code: 'SPAWN_EXCEPTION' });
            return;
        }

        if (!spawnedProcess || !spawnedProcess.pid) {
            console.error('[pty-host] pty.spawn() returned invalid process');
            send('error', { message: 'Invalid PTY process returned', code: 'INVALID_PTY' });
            return;
        }

        ptyProcess = spawnedProcess;
        console.error('[pty-host] Shell spawned successfully, PID:', ptyProcess.pid);
        send('spawned', { pid: ptyProcess.pid, cwd: resolvedCwd, shell: options.shell, conpty: useConpty });

        let dataCount = 0;
        ptyProcess.onData((data) => {
            dataCount++;
            if (dataCount <= 5) {
                console.error('[pty-host] Data received #' + dataCount + ', length:', data.length);
            }
            send('data', data);
        });

        ptyProcess.onExit(({ exitCode }) => {
            console.error('[pty-host] Shell exited with code:', exitCode);
            send('exit', { exitCode });
            ptyProcess = null;
        });

    } catch (e) {
        send('error', { message: e.message, code: 'SPAWN_FAILED' });
    }
}

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('[pty-host] Uncaught exception:', err.message);
    console.error('[pty-host] Stack:', err.stack);
    send('error', { message: 'Uncaught: ' + err.message, code: 'UNCAUGHT_EXCEPTION' });
});

process.on('unhandledRejection', (reason) => {
    console.error('[pty-host] Unhandled rejection:', reason);
    send('error', { message: 'Unhandled rejection: ' + reason, code: 'UNHANDLED_REJECTION' });
});

// Keep process alive
process.stdin.resume();

// Handle cleanup
process.on('SIGTERM', () => {
    console.error('[pty-host] Received SIGTERM');
    if (ptyProcess) ptyProcess.kill();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.error('[pty-host] Received SIGINT');
    if (ptyProcess) ptyProcess.kill();
    process.exit(0);
});

process.on('exit', (code) => {
    console.error('[pty-host] Process exiting with code:', code);
});

console.error('[pty-host] Starting pty-host.js...');
send('ready', {});
console.error('[pty-host] Ready signal sent');
