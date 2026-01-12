# claude-code-terminal

**Windows-only Obsidian plugin** that embeds a fully-featured PowerShell terminal directly in your Obsidian sidebar, optimized for Claude Code workflows.

---

## Features

- **Embedded PowerShell Terminal** - Full-featured terminal using xterm.js with WebGL rendering
- **Claude Code Integration** - Seamlessly run Claude Code commands within your Obsidian workspace
- **Sidebar Integration** - Docked terminal view that doesn't interrupt your note-taking flow
- **Split Pane Layout** - Horizontal and vertical splits with resizable panes (NEW!)
- **Keyboard Shortcuts** - Full keyboard navigation for terminal management and action bar (NEW!)
- **Terminal Addons** - Includes search, web links, Unicode 11 support, and auto-fit capabilities
- **Windows Native** - Built specifically for Windows PowerShell using node-pty

---

## Requirements

- **Operating System**: Windows only (uses PowerShell and Windows-specific node-pty bindings)
- **Obsidian**: Version 1.4.0 or higher
- **Node.js**: Version 18+ (for building from source)
- **npm**: Latest version recommended

---

## Installation

### 1. Clone the Repository

Navigate to your Obsidian vault's plugins directory:

```powershell
cd path\to\your\vault\.obsidian\plugins
```

Clone this repository:

```powershell
git clone https://github.com/h19overflow/claude-code-terminal.git
cd claude-code-terminal
```

### 2. Install Dependencies

```powershell
npm install
```

This will install all required dependencies including:
- `@xterm/xterm` - Terminal emulator
- `@lydell/node-pty` - Pseudo-terminal bindings for Node.js
- xterm.js addons (fit, search, webgl, unicode11, web-links)

### 3. Build the Plugin

For development (with watch mode):

```powershell
npm run dev
```

For production build:

```powershell
npm run build
```

This compiles the TypeScript source into `main.js` using esbuild.

### 4. Enable in Obsidian

1. Open Obsidian
2. Go to `Settings` → `Community plugins`
3. Disable Safe Mode (if enabled)
4. Click "Reload plugins" or restart Obsidian
5. Find "Claude Code Terminal" in your plugin list
6. Toggle it on

The terminal view will appear in your right sidebar.

---

## Usage

### Opening the Terminal

- Click the terminal icon in the ribbon (left sidebar)
- Or use the command palette: `Ctrl/Cmd + P` → "Claude Code Terminal: Open Terminal"

### Running Claude Code

Once the terminal is open, you can run any Claude Code commands:

```powershell
claude "help me refactor this component"
claude --session my-session "implement feature X"
```

### Terminal Shortcuts

- **Copy**: `Ctrl + Shift + C` or right-click → Copy
- **Paste**: `Ctrl + Shift + V` or right-click → Paste
- **Clear**: Type `clear` or `cls`
- **Search**: `Ctrl + F` (if search addon is configured)

### Split Pane Shortcuts (NEW!)

- **Split Horizontally**: `Ctrl + Shift + S` - Create side-by-side terminal panes
- **Split Vertically**: `Ctrl + Shift + V` - Create top-bottom terminal panes
- **Close Split Pane**: `Ctrl + Shift + W` - Close the active pane
- **Focus Next Pane**: `Ctrl + →` - Navigate to next split pane
- **Focus Previous Pane**: `Ctrl + ←` - Navigate to previous split pane

### Action Bar Shortcuts (NEW!)

- **Send Selection**: `Alt + 1` - Send selected text to Claude
- **Send Note**: `Alt + 2` - Send entire note to Claude
- **Reference File**: `Alt + 3` - Add file reference (@path) to Claude

### Tab Management

- **New Terminal**: `Ctrl + Shift + T`
- **Next Tab**: `Ctrl + Shift + →`
- **Previous Tab**: `Ctrl + Shift + ←`

---

## Split Pane Workflow (NEW!)

The split pane system allows you to work with multiple terminals simultaneously, similar to tmux or VSCode.

### How It Works

1. **Create Splits**: Use `Ctrl + Shift + S` (horizontal) or `Ctrl + Shift + V` (vertical)
2. **Independent Terminals**: Each pane runs its own terminal instance with separate processes
3. **Resize Panes**: Drag the divider between panes to adjust sizes
4. **Focus Management**: Click a pane or use `Ctrl + Arrow` keys to focus
5. **Close Panes**: Use `Ctrl + Shift + W` to close the active pane

### Use Cases

- **Multi-Project Development**: Work on frontend and backend simultaneously
- **Monitoring + Development**: Keep `npm run dev` in one pane, run commands in another
- **Comparison Tasks**: View two different directories or branches side-by-side
- **Claude Collaboration**: Have Claude Code session in one pane, regular terminal in another

### Visual Feedback

- **Active Pane**: Highlighted with accent color border
- **Hover State**: Inactive panes slightly dim on hover
- **Resize Handle**: Divider changes color when hovering/dragging

---

## Development

### Project Structure

```
claude-code-terminal/
├── main.ts              # Plugin entry point (if exists)
├── manifest.json        # Plugin metadata
├── package.json         # Node dependencies
├── esbuild.config.mjs   # Build configuration
├── tsconfig.json        # TypeScript configuration
├── styles.css           # Terminal styling (if exists)
└── node_modules/        # Dependencies
```

### Build Configuration

The plugin uses **esbuild** for fast compilation:

- **Development**: `npm run dev` - Watches for changes and rebuilds automatically
- **Production**: `npm run build` - Minified build optimized for distribution

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `@xterm/xterm` | Core terminal emulator |
| `@lydell/node-pty` | Native pseudoterminal bindings (Windows support) |
| `obsidian` | Obsidian API types |
| `esbuild` | Fast TypeScript/JavaScript bundler |

---

## Troubleshooting

### Plugin Not Appearing After Build

1. Check that `main.js` was generated in the plugin directory
2. Restart Obsidian completely
3. Verify Safe Mode is disabled in Community Plugins settings

### Terminal Not Loading

- Ensure you're on Windows (this plugin requires PowerShell)
- Check the Obsidian console (`Ctrl + Shift + I`) for errors
- Verify node-pty compiled correctly during `npm install`

### Build Errors

If you encounter native module compilation errors:

```powershell
# Rebuild native modules
npm rebuild @lydell/node-pty

# Or clean install
rm -r node_modules
npm install
```

### PowerShell Not Found

Ensure PowerShell is in your system PATH:

```powershell
$env:Path
```

Should include `C:\Windows\System32\WindowsPowerShell\v1.0\` or similar.

---

## Limitations

- **Windows Only**: This plugin uses Windows-specific PowerShell bindings and will not work on macOS or Linux
- **Desktop Only**: Terminal functionality requires Node.js process management, not available in mobile Obsidian

---

## Roadmap

- [ ] Configurable shell (CMD, PowerShell Core)
- [ ] Terminal theme customization
- [ ] Multiple terminal instances
- [ ] Split terminal views
- [ ] Session persistence across Obsidian restarts

---

## Contributing

Contributions welcome! This is a specialized tool for Windows Claude Code users.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## License

MIT License - See LICENSE file for details

---

## Acknowledgments

- Built with [Obsidian API](https://docs.obsidian.md/)
- Terminal powered by [xterm.js](https://xtermjs.org/)
- Pseudoterminal via [@lydell/node-pty](https://github.com/lydell/node-pty)
- Inspired by the need for seamless Claude Code integration in Obsidian

---

## Author

**h19overflow**

- GitHub: [@h19overflow](https://github.com/h19overflow)
- Plugin Repo: [claude-code-terminal](https://github.com/h19overflow/claude-code-terminal)

---

**Last Updated**: 2026-01-12
