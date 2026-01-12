// This script runs in a separate Node.js process to handle PTY
// It communicates with the main Obsidian process via stdin/stdout JSON messages

const pty = require('@lydell/node-pty');
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
        ptyProcess = pty.spawn(options.shell, options.args || [], {
            name: 'xterm-256color',
            cols: options.cols || 80,
            rows: options.rows || 24,
            cwd: options.cwd,
            env: sanitizeEnv(process.env),
            useConpty: false
        });

        send('spawned', { pid: ptyProcess.pid, cwd: options.cwd, shell: options.shell });

        ptyProcess.onData((data) => {
            send('data', data);
        });

        ptyProcess.onExit(({ exitCode }) => {
            send('exit', { exitCode });
            ptyProcess = null;
        });

    } catch (e) {
        send('error', { message: e.message, code: 'SPAWN_FAILED' });
    }
}

// Keep process alive
process.stdin.resume();

// Handle cleanup
process.on('SIGTERM', () => {
    if (ptyProcess) ptyProcess.kill();
    process.exit(0);
});

process.on('SIGINT', () => {
    if (ptyProcess) ptyProcess.kill();
    process.exit(0);
});

send('ready', {});
