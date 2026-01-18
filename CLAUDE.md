# Solidity Diagram Extension

## Project Overview
A VS Code extension that generates interactive Miro-style diagrams for Solidity smart contracts. When invoked on a function, it displays:
- The main function code
- Referenced data structures (structs, enums)
- Inner function calls with their implementations
- Visual arrows connecting references to definitions

## Architecture

```
src/
├── extension.ts              # VS Code extension entry point
├── parser/
│   ├── solidityParser.ts     # Solidity AST parsing using @solidity-parser/parser
│   └── astTraverser.ts       # AST walking utilities
├── analyzer/
│   ├── functionAnalyzer.ts   # Main analysis orchestrator
│   ├── typeResolver.ts       # Resolves struct/enum definitions
│   └── callGraphBuilder.ts   # Builds function call graph
├── renderer/
│   ├── webviewProvider.ts    # VS Code webview panel management
│   ├── diagramGenerator.ts   # Generates HTML diagram
│   ├── canvasController.ts   # Miro-style pan/zoom canvas
│   ├── draggableBlocks.ts    # Drag functionality for code blocks
│   ├── arrowManager.ts       # Dynamic arrow connections
│   └── syntaxHighlight.ts    # Solidity syntax highlighting
├── types/index.ts            # TypeScript type definitions
└── utils/sourceMapper.ts     # Source code mapping utilities
```

## Key Technologies
- **@solidity-parser/parser**: Parses Solidity into AST
- **VS Code Webview API**: Renders interactive HTML diagrams
- **Vanilla JS Canvas**: Custom pan/zoom/drag implementation (no external libs)

## Commands
- `npm install` - Install dependencies
- `npm run compile` - Build TypeScript
- `npm run watch` - Watch mode for development
- Press **F5** in VS Code to debug the extension

## Usage
1. Open a `.sol` file
2. Right-click inside a function
3. Select "Generate Function Diagram"
4. Interact with the diagram:
   - **Pan**: Drag the dotted background
   - **Zoom**: Mouse wheel
   - **Move blocks**: Drag the header (title bar) of any block
   - **Scroll code**: Hover over code area and scroll
   - **Resize blocks**: Drag corner or edges to resize
   - **Navigate**: Click "Go to source" to jump to code

## What Gets Displayed
- **Main Function**: The selected function with full source code
- **Data Structures**: Structs and enums used anywhere in the function, resolved from ALL workspace files:
  - Variable declarations: `DepositPool memory pool_`
  - Struct instantiation: `DepositPool({...})`
  - Enum comparisons: `strategy_ == Strategy.NO_YIELD`
- **Internal Calls**: Only functions with actual definitions in the workspace

## What Gets Excluded
- Interface calls: `IERC20(token_).safeApprove(...)`, `IRewardPool(addr).method()`
- Type casts: `address(0)`, `uint256(value)`
- Built-in calls: `require()`, `keccak256()`, `abi.encode()`
- External library methods: `safeTransfer`, `safeApprove`, etc.

## Code Style
- TypeScript with strict mode
- Inline JavaScript/CSS generation for webview (no external files in webview)
- Catppuccin/GitHub dark theme colors
- No external UI frameworks - pure DOM manipulation

## Key Files to Modify
- `canvasController.ts` - Canvas behavior, CSS styles
- `diagramGenerator.ts` - HTML structure, block layout
- `arrowManager.ts` - Arrow routing and positioning
- `syntaxHighlight.ts` - Code syntax colors

## Color Palette
- Background: `#0d1117`
- Block background: `#161b22`
- Block header: `#21262d`
- Border: `#30363d`
- Primary blue: `#58a6ff`
- Function arrows: `#f38ba8` (pink)
- Struct arrows: `#89dceb` (cyan)
- Enum arrows: `#a6e3a1` (green)
- Keywords: `#cba6f7` (purple)
