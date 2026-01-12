// This script runs in a separate Node.js process to handle PTY
// It communicates with the main Obsidian process via stdin/stdout JSON messages

const pty = require('@lydell/node-pty');

let ptyProcess = null;

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
    }
}

function spawnPty(options) {
    try {
        // Use ConPTY on Windows 10+ (build 18362+), fallback to winpty on older
        const useConpty = process.platform === 'win32';

        ptyProcess = pty.spawn(options.shell, options.args || [], {
            name: 'xterm-256color',
            cols: options.cols || 80,
            rows: options.rows || 24,
            cwd: options.cwd,
            env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
            useConpty: useConpty
        });

        send('spawned', { pid: ptyProcess.pid });

        ptyProcess.onData((data) => {
            send('data', data);
        });

        ptyProcess.onExit(({ exitCode }) => {
            send('exit', { exitCode });
            ptyProcess = null;
        });

    } catch (e) {
        send('error', { message: e.message });
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
