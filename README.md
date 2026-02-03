# Solidity Function Diagram

VS Code extension that generates interactive diagrams for Solidity functions. Right-click a function, get a visual breakdown of everything it touches.

![Function Diagram Example](screenshot/SS.png)

## What it does

- Shows the function with all its dependencies: structs, enums, state variables, inner calls
- Resolves interface calls (`IERC20(token).approve()`) to actual implementations
- Tracks library methods from `using X for Y` directives
- Draws arrows between references and definitions

## Usage

1. Open a `.sol` file
2. Right-click inside a function
3. Select "Generate Function Diagram"

**Canvas:** Drag background to pan, scroll to zoom, drag block headers to move them.

**Imports:** Cmd+Click (Mac) or Ctrl+Click (Windows) on any function, type, or variable to import its definition. Works across your workspace and common dependencies (OpenZeppelin, Solmate, Solady, Forge-std).

**Data Flow:** Click "Enable Data Flow", then click any variable to see where it's defined, used, and where it flows (external calls, state writes, returns).

**Notes:** Double-click canvas to add annotations. Draw arrows from notes to specific code lines.

## Install

```bash
code --install-extension solidity-diagram-0.0.1.vsix --force
```

Or: Extensions panel → `...` menu → "Install from VSIX..."

## Development

```bash
npm install
npm run compile
```

Press F5 to debug. The extension opens in a new VS Code window.

## License

MIT
