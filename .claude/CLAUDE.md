# Claude Code Terminal - Project Documentation

**A Windows-only Obsidian plugin providing embedded PowerShell terminals with split pane support and Claude Code integration.**

---

## Project Overview

This plugin embeds fully-featured PowerShell terminals directly into Obsidian's sidebar, optimized for Claude Code workflows. Built with TypeScript, xterm.js, and node-pty, it provides tmux-like split pane functionality with production-ready architecture.

### Key Features

- **Split Pane Layout**: Horizontal/vertical splits with independent terminal instances
- **Terminal Management**: Multiple tabs, project switching, command history
- **Claude Code Integration**: Send selections/notes to Claude, file references
- **Native Terminal**: Full PowerShell support with WebGL rendering
- **Keyboard-First**: Comprehensive shortcuts for all operations

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Obsidian Plugin                     │
│  ┌──────────────────────────────────────────────┐  │
│  │           TerminalView (ItemView)             │  │
│  │  - Split Layout Manager                       │  │
│  │  - Terminal Manager (tabs/instances)          │  │
│  │  - Claude Integration Bridge                  │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                                │
│  ┌──────────────────┴───────────────────────────┐  │
│  │         Split Pane Renderer                   │  │
│  │  ┌────────────┐  ┌────────────┐              │  │
│  │  │ Terminal   │  │ Terminal   │              │  │
│  │  │ Panel 1    │  │ Panel 2    │  ...         │  │
│  │  │ (xterm.js) │  │ (xterm.js) │              │  │
│  │  └─────┬──────┘  └─────┬──────┘              │  │
│  └────────┼────────────────┼─────────────────────┘  │
│           │                │                         │
│  ┌────────┴────────────────┴─────────────────────┐  │
│  │            PTY Bridge (IPC Layer)              │  │
│  └────────────────────┬───────────────────────────┘  │
└───────────────────────┼──────────────────────────────┘
                        │
                ┌───────┴────────┐
                │   pty-host.js  │ (Child Process)
                │   - node-pty   │
                │   - PowerShell │
                └────────────────┘
```

---

## Directory Structure

```
claude-code-terminal/
├── .claude/                    # Project configuration (gitignored)
│   └── CLAUDE.md              # This file
│
├── src/                       # Source code (TypeScript)
│   ├── main.ts               # Plugin entry point
│   │
│   ├── components/           # UI Components
│   │   ├── TerminalView.ts          # Main view (orchestrator)
│   │   ├── TerminalPanel.ts         # Single terminal instance
│   │   ├── TerminalTabs.ts          # Tab bar UI
│   │   ├── SplitPaneRenderer.ts     # Split layout rendering
│   │   ├── ActionBar.ts             # Obsidian integration buttons
│   │   ├── ProjectSwitcher.ts       # Project selection modal
│   │   ├── TerminalHeader.ts        # Header UI component
│   │   └── LoadingState.ts          # Loading animations
│   │
│   ├── services/             # Business Logic
│   │   ├── SplitLayoutManager.ts    # Split pane tree management
│   │   ├── TerminalManager.ts       # Terminal instance tracking
│   │   ├── PtyBridge.ts             # PTY process communication
│   │   ├── ClaudeIntegration.ts     # Obsidian → Terminal bridge
│   │   ├── ProjectManager.ts        # Project discovery & recent
│   │   └── ObsidianBridge.ts        # Obsidian API helpers
│   │
│   ├── types/                # TypeScript Definitions
│   │   └── index.ts                 # Shared interfaces & types
│   │
│   ├── constants/            # Configuration
│   │   └── index.ts                 # Constants, defaults, icons
│   │
│   ├── utils/                # Utilities
│   │   └── index.ts                 # Theme helpers, debounce
│   │
│   ├── settings.ts           # Settings UI tab
│   └── pty-host.js           # PTY host process (Node.js)
│
├── styles.css                # All plugin styles (1400+ lines)
├── manifest.json             # Plugin metadata
├── package.json              # Dependencies & build scripts
├── tsconfig.json             # TypeScript config
├── esbuild.config.mjs        # Build configuration
├── .gitignore               # Git exclusions
└── README.md                # User documentation
```

---

## Module Deep Dive

### 1. Entry Point: `main.ts`

**Purpose**: Plugin lifecycle, command registration, view activation

**Responsibilities**:
- Load/save settings
- Register commands with hotkeys
- Activate terminal view in sidebar
- Handle context menus (right-click on files/text)

**Key Methods**:
```typescript
onload()                    // Plugin initialization
activateView()              // Open terminal in sidebar
registerCommands()          // Register 20+ keyboard shortcuts
splitHorizontal/Vertical()  // Trigger split pane creation
```

**Dependencies**: `TerminalView`, `ClaudeCodeSettingTab`, `ProjectManager`

---

### 2. Core View: `components/TerminalView.ts`

**Purpose**: Main terminal view orchestrator

**Architecture**:
- Manages split layout tree
- Coordinates multiple terminal panels
- Handles tab switching
- Integrates Claude Code bridge

**Key Systems**:
```typescript
splitLayoutManager          // Tree-based pane layout
terminalManager            // Instance tracking (tabs)
splitRenderer              // DOM rendering of splits
claudeIntegration          // Obsidian → Terminal communication
```

**Lifecycle**:
1. `onOpen()` - Create UI structure
2. `createNewTerminal()` - Spawn terminal instance
3. `renderSplitLayout()` - Mount panels into panes
4. `onClose()` - Cleanup all resources

**Critical Methods**:
```typescript
splitHorizontal()          // Ctrl+Shift+S
splitVertical()            // Ctrl+Shift+V
closeSplitPane()           // Ctrl+Shift+W
focusNextSplitPane()       // Ctrl+→
createNewTerminal()        // Create & mount terminal
```

---

### 3. Terminal Instance: `components/TerminalPanel.ts`

**Purpose**: Single xterm.js terminal with PTY bridge

**Components**:
- `Terminal` (xterm.js) - Rendering engine
- `FitAddon` - Auto-resize to container
- `SearchAddon` - In-terminal search (Ctrl+F)
- `WebglAddon` - GPU-accelerated rendering
- `PtyBridge` - IPC to pty-host process

**Lifecycle**:
```typescript
initialize(project)        // Setup xterm + addons
startPtyBridge()          // Launch pty-host.js child process
handlePtyReady()          // Spawn PowerShell
handleSpawned(pid)        // Connect terminal I/O
restart()                 // Kill & respawn shell
destroy()                 // Cleanup all resources
```

**State Management**:
- `status`: disconnected | connecting | connected | error
- `currentProject`: Project path & metadata
- `isVisible`: Show/hide panel

---

### 4. Split Layout: `services/SplitLayoutManager.ts`

**Purpose**: Tree-based split pane management

**Data Structure**:
```typescript
interface SplitPaneNode {
    id: PaneId
    type: 'pane' | 'split'
    parent: SplitPaneNode | null

    // For 'pane' type
    instanceId?: string       // Terminal instance ID

    // For 'split' type
    direction?: 'horizontal' | 'vertical'
    children?: [SplitPaneNode, SplitPaneNode]
    sizes?: [number, number]  // Percentage [50, 50]
}
```

**Operations**:
```typescript
splitPane(paneId, direction, newInstanceId)
    // Creates split container with 2 children

closePane(paneId)
    // Removes pane, promotes sibling to parent position

setActivePane(paneId)
    // Focus management, visual highlighting

getAllPaneIds()
    // Traverse tree, collect all leaf panes
```

**Algorithm**: Binary tree with 50/50 default splits, user-resizable via drag handles.

---

### 5. Split Rendering: `components/SplitPaneRenderer.ts`

**Purpose**: Convert split tree to DOM, handle mouse resize

**Rendering**:
```typescript
render(layout: SplitLayout)
    // Recursive tree → DOM conversion

renderNode(node)
    // Split: flex container + resize handle
    // Pane: terminal panel mount point
```

**Mouse Resize**:
1. `mousedown` on handle → Start resize
2. `mousemove` → Update sizes (min 10%, max 90%)
3. `mouseup` → Finalize sizes, notify manager

**Visual Feedback**:
- Active pane: Accent color border
- Hover: Semi-transparent overlay
- Resize handle: Color change on hover/drag

---

### 6. PTY Bridge: `services/PtyBridge.ts`

**Purpose**: IPC layer between plugin and PTY host process

**Communication Protocol**:
```typescript
// Plugin → pty-host
send('spawn', { shell, cwd, cols, rows })
send('write', data)           // Keyboard input
send('resize', { cols, rows })
send('kill', {})

// pty-host → Plugin
{ type: 'ready' }             // Host initialized
{ type: 'spawned', data: { pid } }
{ type: 'data', data: string }  // Terminal output
{ type: 'exit', data: { exitCode } }
{ type: 'error', data: { message, code } }
```

**Process Management**:
- Spawns `pty-host.js` as child process
- Streams: stdin (commands), stdout (messages), stderr (errors)
- Graceful shutdown: `killShell()` → `ptyHost.kill()`

---

### 7. PTY Host: `src/pty-host.js`

**Purpose**: Isolated Node.js process for native PTY management

**Why Separate Process?**
- Obsidian runs in Electron renderer process
- node-pty requires Node.js native modules
- Isolation prevents plugin crashes from affecting Obsidian

**Operations**:
```javascript
spawn()      // Create PTY with node-pty
write()      // Send input to shell
resize()     // Update terminal dimensions
kill()       // Terminate shell process
```

**Security**: Vault boundary checking (CWD must be within vault path)

---

### 8. Claude Integration: `services/ClaudeIntegration.ts`

**Purpose**: Bridge Obsidian content → Terminal

**Features**:
```typescript
sendSelectionToTerminal(prompt?)
    // Get editor selection → Send to terminal

sendNoteToTerminal(prompt?)
    // Get active note content → Send to terminal

sendFileReference()
    // Send @/path/to/file.md reference
```

**Workflow**:
1. Get active MarkdownView
2. Extract content (selection or full note)
3. Escape special characters
4. Send via write callback to active terminal

---

### 9. Terminal Manager: `services/TerminalManager.ts`

**Purpose**: Track terminal instances (tabs)

**State**:
```typescript
instances: TerminalInstance[]
    // { id, name, project, status, createdAt }

activeInstanceId: string | null
```

**Operations**:
- `createInstance(project)` - Generate ID, add to list
- `removeInstance(id)` - Delete, switch to next
- `setActiveInstance(id)` - Update active, trigger onChange
- `getAllInstances()` - For tab bar rendering

---

### 10. Project Manager: `services/ProjectManager.ts`

**Purpose**: Discover & track projects

**Sources**:
- Directory scanning (configurable depth)
- Git repository detection
- Custom paths

**Recent Projects**:
- LRU cache (max 10 recent)
- Persisted in plugin settings
- Displayed in project switcher

---

## Settings System

### Configuration: `types/index.ts` → `ClaudeCodeSettings`

```typescript
{
    // Terminal
    shell: 'powershell.exe',
    claudeCommand: 'claude',
    autoStartClaude: false,
    fontSize: 14,
    fontFamily: '"Cascadia Code", Consolas, monospace',

    // Projects
    projectSources: [
        { type: 'directory', path: 'C:/Projects', depth: 2, enabled: true }
    ],
    recentProjects: [],
    maxRecentProjects: 10,

    // UI
    showLoadingAnimation: true,
    showStatusBadge: true
}
```

### Settings UI: `settings.ts` → `ClaudeCodeSettingTab`

Obsidian native settings page with:
- Text inputs (shell path, font)
- Sliders (font size)
- Toggles (auto-start, animations)
- Project source management (add/remove/configure)

---

## Styling Architecture

### File: `styles.css` (1400+ lines)

**Structure**:
```css
/* CSS Variables (Obsidian theme integration) */
--terminal-bg, --terminal-fg, --terminal-accent, ...

/* Component Sections */
1. Header & Logo
2. Loading States (spinner, progress bar)
3. Terminal Wrapper (xterm.js integration)
4. Multi-Terminal Tabs
5. Action Bar (Obsidian integration buttons)
6. Project Switcher Modal
7. Split Pane Layout ← NEW!
8. Search Bar
9. Terminal Panels
```

**Split Pane Styles** (lines 1279-1406):
- `.split-container` - Flex container (row/column)
- `.split-pane` - Individual pane with focus indicator
- `.split-resize-handle` - Draggable divider (4px)
- Active state: Accent color outline
- Hover state: Semi-transparent overlay

---

## Build System

### Config: `esbuild.config.mjs`

**Entry**: `src/main.ts` → `main.js`

**Externals**:
- `obsidian` - Provided by Obsidian
- `electron` - Provided by Electron
- `node-pty` / `@lydell/node-pty` - Native module
- All `@codemirror/*` packages
- Node.js builtins

**Build Modes**:
- `npm run dev` - Watch mode with inline sourcemaps
- `npm run build` - Production (minified, tree-shaken)

**Output**: Single `main.js` bundle (CommonJS, ES2018 target)

---

## Command Reference

### Registered Commands (20+)

**Terminal Management**:
- `open-claude-terminal` - Ctrl+Shift+C
- `toggle-claude-terminal`
- `new-terminal` - Ctrl+Shift+T
- `restart-terminal`
- `clear-terminal`
- `close-terminal`

**Tab Navigation**:
- `next-terminal` - Ctrl+Shift+→
- `previous-terminal` - Ctrl+Shift+←

**Split Panes** (NEW):
- `split-terminal-horizontal` - Ctrl+Shift+S
- `split-terminal-vertical` - Ctrl+Shift+V
- `close-split-pane` - Ctrl+Shift+W
- `focus-next-split-pane` - Ctrl+→
- `focus-previous-split-pane` - Ctrl+←

**Claude Integration**:
- `send-selection-to-claude` / `action-send-selection` - Alt+1
- `send-note-to-claude` / `action-send-note` - Alt+2
- `link-file-in-claude` / `action-reference-file` - Alt+3

**Projects**:
- `switch-project`

---

## Development Workflow

### Setup
```bash
git clone https://github.com/h19overflow/claude-code-terminal.git
cd claude-code-terminal
npm install
```

### Development
```bash
npm run dev          # Watch mode, auto-rebuild
# Edit files in src/, changes auto-compile
```

### Testing
1. Restart Obsidian (or reload plugin)
2. Open Developer Console (Ctrl+Shift+I)
3. Check for errors: `[Claude Code Terminal]` logs
4. Test features manually (no automated tests yet)

### Production Build
```bash
npm run build       # Minified output
# Commit main.js
```

---

## Common Issues & Solutions

### Issue: Terminal Not Starting

**Symptom**: Plugin opens but no terminal appears

**Debug**:
1. Open DevTools Console (Ctrl+Shift+I)
2. Look for `[PtyBridge]` errors
3. Check: Is `pty-host.js` spawning?
4. Check: Is `node` in PATH?

**Fix**: Ensure Node.js v18+ installed and in system PATH

---

### Issue: Split Panes Empty

**Symptom**: Split created but panes show "No terminal"

**Cause**: Terminal instance not assigned to pane

**Fix**: Ensure `renderSplitLayout()` called after `createNewTerminal()`

---

### Issue: WebGL Context Lost

**Symptom**: Terminal rendering degrades over time

**Cause**: GPU context limit exceeded (common with many terminals)

**Behavior**: Automatic fallback to canvas renderer

**Prevention**: Close unused terminal tabs

---

## Performance Considerations

### Terminal Instances
- Each terminal = separate xterm.js instance
- Each terminal = separate PTY process
- **Recommendation**: Max 4-6 terminals per window

### WebGL Rendering
- GPU-accelerated by default
- Fallback to canvas if unavailable
- Context loss handled gracefully

### Split Layout
- Tree traversal: O(n) where n = pane count
- Resize: Direct DOM manipulation (no React)
- Memory: ~10-15MB per terminal instance

---

## Security Model

### Vault Boundary
- PTY host validates CWD against vault path
- Prevents escaping vault directory
- Configurable in pty-host.js

### Shell Injection
- No direct command execution from UI
- All input goes through PTY stdin
- PowerShell handles parsing

### File Access
- Plugin can read vault files only
- Uses Obsidian's FileManager API
- No direct fs access

---

## Future Enhancements

### Planned Features
- [ ] Terminal session persistence (restore on restart)
- [ ] Configurable shell (CMD, PowerShell Core, WSL)
- [ ] Custom themes (import xterm.js themes)
- [ ] Command palette integration
- [ ] Split pane layouts (save/load)

### Technical Debt
- [ ] Add unit tests (Vitest)
- [ ] E2E tests (Playwright)
- [ ] Refactor TerminalView (too large)
- [ ] Abstract Obsidian API usage
- [ ] Add error boundaries

---

## Contributing Guidelines

### Code Style
- TypeScript strict mode
- ESLint + Prettier (not configured yet)
- Max line length: 100 chars
- Max file size: 500 lines (soft limit)

### Commit Messages
```
feat: add feature
fix: resolve bug
refactor: improve code structure
docs: update documentation
style: formatting changes
test: add tests
chore: tooling/config
```

### Pull Request Process
1. Fork repository
2. Create feature branch: `feat/your-feature`
3. Test thoroughly in Obsidian
4. Update README.md if needed
5. Submit PR with description

---

## License

MIT License - See LICENSE file

---

## Maintainer

**GitHub**: [@h19overflow](https://github.com/h19overflow)
**Repository**: [claude-code-terminal](https://github.com/h19overflow/claude-code-terminal)

---

**Last Updated**: 2026-01-12
**Plugin Version**: 1.0.0
**Obsidian Min Version**: 1.4.0
