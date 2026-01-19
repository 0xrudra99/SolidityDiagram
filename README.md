# Solidity Function Diagram

A powerful VS Code extension for visualizing and analyzing Solidity smart contracts. Generate interactive, Miro-style diagrams that help you understand complex DeFi protocols by showing function dependencies, data structures, data flow, and call graphs.

![Function Diagram Example](screenshot/SS.png)

## ✨ Key Features

### 🎯 Smart Code Analysis
- **Function Visualization**: Right-click any function to generate a comprehensive diagram
- **Data Structure Display**: Automatically imports structs, enums, and custom types used in the function
- **Call Graph**: Shows inner function calls with their full implementations
- **Interface Resolution**: Resolves interface calls to actual implementations across workspace and dependencies
- **Library Method Support**: Tracks `using LibraryName for Type` directives to resolve extension methods
- **State Variable Tracking**: Displays contract state variables referenced in functions

### 🌊 Data Flow Analysis
- **Value Flow Tracking**: Visualize how values, tokens, and state changes flow through functions
- **DeFi Pattern Detection**: Highlights token amounts, `msg.value`, address targets, and balance checks
- **Interactive Flow Highlighting**: Click on variables to see all definitions, uses, and assignments
- **Flow Tooltips**: Hover over highlighted tokens to see detailed flow information

### 🎨 Interactive Canvas
- **Pan & Zoom**: Drag the dotted background to pan, scroll to zoom in/out
- **Draggable Blocks**: Move code blocks by dragging their headers
- **Resizable Blocks**: Resize code blocks by dragging corners or edges
- **Smooth Animations**: Fluid arrow animations and glitter effects on hover
- **Dark Theme**: Beautiful Catppuccin/GitHub dark color scheme

### 🔗 Dynamic Imports
- **Cmd+Click Navigation** (Mac) / **Ctrl+Click** (Windows/Linux):
  - Click on function names to import their implementations
  - Click on type names to import struct/enum definitions
  - Click on state variables to import their declarations
  - Click on interface calls to choose from multiple implementations
- **Workspace-Wide Search**: Finds definitions across all `.sol` files
- **Dependency Scanning**: Searches `node_modules` for OpenZeppelin, Solmate, Solady, and Forge-std
- **Smart Filtering**: Excludes built-in functions, type casts, and external library methods

### 📝 Annotations & Notes
- **Text Annotations**: Add notes directly on the diagram canvas
- **Arrow Markers**: Draw arrows to highlight specific code sections
- **Persistent Storage**: Annotations are saved per diagram and persist across sessions
- **Adjustable Styling**: Customize text size and color for better visibility

### 🎯 Advanced Features
- **Multiple Implementation Picker**: When interface calls have multiple implementations, choose which to display
- **Inheritance Resolution**: Follows contract inheritance chains to find method implementations
- **Syntax Highlighting**: Full Solidity syntax highlighting with keyword, function, and type coloring
- **Source Mapping**: "Go to source" buttons to jump directly to code definitions
- **Remove Blocks**: Close individual blocks (except the main function) with the X button

## 🚀 Getting Started

### Installation

1. Download the latest `.vsix` file from releases
2. Install via command line:
   ```bash
   code --install-extension solidity-diagram-0.0.1.vsix --force
   ```
3. Or install via VS Code:
   - Open Extensions panel (Cmd+Shift+X / Ctrl+Shift+X)
   - Click the `...` menu → "Install from VSIX..."
   - Select the downloaded `.vsix` file

### Usage

1. Open any Solidity file (`.sol`)
2. Right-click inside a function body
3. Select **"Generate Function Diagram"** from the context menu
4. Interact with the diagram:

#### Canvas Controls
- **Pan**: Drag the dotted background
- **Zoom**: Mouse wheel / trackpad scroll
- **Reset View**: Click "Reset View" button at the bottom

#### Code Block Controls
- **Move**: Drag the header (title bar) of any block
- **Resize**: Drag the corners or edges of a block
- **Scroll Code**: Hover over the code area and scroll
- **Navigate**: Click "Go to source" to jump to the original file
- **Remove**: Click the X button to remove a block (main function cannot be removed)

#### Data Flow
- **Enable**: Click "Enable Data Flow" button
- **Explore**: Click on any variable/parameter to see its flow
- **Lock**: Click again to lock the highlighting
- **Tooltip**: Hover over highlighted tokens for details
- **Clear**: Click "Clear Flow" to reset

#### Annotations
- **Add Note**: Click "+ Note" button, then click on canvas to place
- **Add Label**: Click "+ Label" button, then drag to draw an arrow
- **Edit**: Click on a note/label to edit text, size, or color
- **Delete**: Use the delete controls on each annotation
- **Re-layout**: Click "Re-layout" to reorganize the diagram

#### Dynamic Imports
- **Cmd+Click** (Mac) / **Ctrl+Click** (Windows/Linux) on:
  - Function names → Import function definition
  - Type names → Import struct/enum definition
  - State variables → Import variable declaration
  - Interface calls (e.g., `IERC20(token).approve()`) → Choose implementation

## 🔍 What Gets Analyzed

### Included
- ✅ Function implementations (internal and public)
- ✅ Struct and enum definitions
- ✅ State variable declarations
- ✅ Interface-to-implementation mappings
- ✅ Library extension methods (`using X for Y`)
- ✅ Data flow through parameters, variables, and return values
- ✅ External dependencies (OpenZeppelin, Solmate, Solady, Forge-std)

### Excluded
- ❌ Interface calls without implementations (shows signature only)
- ❌ Type casts (e.g., `address(0)`, `uint256(value)`)
- ❌ Built-in functions (e.g., `require()`, `keccak256()`, `abi.encode()`)
- ❌ External library static calls (e.g., `SafeMath.add()`)

## 🎨 Color Coding

- **Keywords**: Purple (`#cba6f7`)
- **Functions**: Pink (`#f38ba8`)
- **Types**: Blue (`#58a6ff`)
- **Strings**: Green (`#a6e3a1`)
- **Numbers**: Cyan (`#89dceb`)
- **Comments**: Gray (`#6e7681`)

### Arrow Colors
- **Function Calls**: Pink (`#f38ba8`)
- **Struct References**: Cyan (`#89dceb`)
- **Enum References**: Green (`#a6e3a1`)
- **State Variables**: Orange/Peach (`#fab387`)

## 🛠️ Development

### Prerequisites
- Node.js 16+ (Note: v24 has compatibility issues with older `vsce` versions)
- VS Code 1.85.0 or higher

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd SolidityDiagram

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes (auto-compile)
npm run watch
```

### Debugging

1. Open the project in VS Code
2. Press **F5** to launch Extension Development Host
3. Open a `.sol` file in the new window
4. Test the "Generate Function Diagram" command

### Building VSIX

```bash
# Package the extension
npx @vscode/vsce@2.22.0 package --allow-missing-repository --skip-license

# Install locally
code --install-extension solidity-diagram-0.0.1.vsix --force
```

## 📁 Project Structure

```
src/
├── extension.ts                 # VS Code extension entry point
├── parser/
│   ├── solidityParser.ts        # Solidity AST parsing
│   └── astTraverser.ts          # AST walking utilities
├── analyzer/
│   ├── functionAnalyzer.ts      # Main analysis orchestrator
│   ├── typeResolver.ts          # Resolves struct/enum definitions
│   ├── callGraphBuilder.ts      # Builds function call graph
│   ├── stateVariableResolver.ts # Resolves state variable declarations
│   ├── dataFlowAnalyzer.ts      # Data flow tracking
│   └── inheritanceResolver.ts   # Interface/inheritance resolution
├── renderer/
│   ├── webviewProvider.ts       # VS Code webview panel management
│   ├── diagramGenerator.ts      # Generates HTML diagram
│   ├── canvasController.ts      # Miro-style pan/zoom canvas
│   ├── draggableBlocks.ts       # Drag functionality for code blocks
│   ├── arrowManager.ts          # Dynamic arrow connections
│   ├── syntaxHighlight.ts       # Solidity syntax highlighting
│   ├── importManager.ts         # Dynamic Cmd+Click import functionality
│   ├── dataFlowVisualizer.ts    # Client-side data flow UI
│   └── notesManager.ts          # Annotations and labels
├── types/index.ts               # TypeScript type definitions
└── utils/sourceMapper.ts        # Source code mapping utilities
```

## 🔧 Technologies

- **@solidity-parser/parser**: Parses Solidity code into AST
- **VS Code Webview API**: Renders interactive HTML diagrams
- **TypeScript**: Type-safe development
- **Vanilla JavaScript**: No external UI frameworks for webview
- **SVG**: Dynamic arrow rendering

## 🐛 Known Issues

- Node.js v24 may have compatibility issues with older `vsce` versions (use v18 or v20)
- Very large contracts (1000+ lines) may have performance impact
- Some complex nested generic types may not resolve correctly

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📧 Support

For bugs and feature requests, please open an issue on the repository.

---

