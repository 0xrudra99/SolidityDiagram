# Solidity Function Diagram

A VS Code extension that generates interactive diagrams showing function dependencies, data structures, and inner function calls for Solidity smart contracts.

![Function Diagram Example](screenshot/Screenshot%202026-01-19%20at%206.17.47%20PM.png)

## Features

- **Function Visualization**: Right-click on any Solidity function to generate a visual diagram
- **Data Structure Display**: Shows structs, enums, and other types used by the function
- **Call Graph**: Displays inner function calls with their implementations
- **Interactive Navigation**: Click on code blocks to navigate to source files
- **Syntax Highlighting**: Full Solidity syntax highlighting in diagrams

## Usage

1. Open a Solidity file (`.sol`)
2. Right-click on a function name or inside a function body
3. Select "Generate Function Diagram" from the context menu
4. View the interactive diagram in a new panel

## Requirements

- VS Code 1.85.0 or higher
- Solidity files with `.sol` extension

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch for changes
npm run watch
```

## License

MIT
