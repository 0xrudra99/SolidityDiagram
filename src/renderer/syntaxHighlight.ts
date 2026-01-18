/**
 * Simple Solidity syntax highlighter for the webview
 * Uses regex-based highlighting similar to how code editors work
 */

interface HighlightToken {
    type: 'keyword' | 'type' | 'function' | 'string' | 'number' | 'comment' | 'operator' | 'variable' | 'modifier' | 'annotation' | 'text';
    value: string;
}

const SOLIDITY_KEYWORDS = new Set([
    'pragma', 'solidity', 'import', 'contract', 'interface', 'library', 'abstract',
    'is', 'using', 'for', 'struct', 'enum', 'event', 'error', 'modifier',
    'function', 'constructor', 'fallback', 'receive', 'returns', 'return',
    'if', 'else', 'while', 'do', 'for', 'break', 'continue', 'throw',
    'try', 'catch', 'revert', 'require', 'assert', 'emit', 'new', 'delete',
    'true', 'false', 'this', 'super', 'type', 'assembly', 'unchecked'
]);

const SOLIDITY_TYPES = new Set([
    'address', 'bool', 'string', 'bytes', 'byte',
    'uint', 'int', 'uint8', 'uint16', 'uint24', 'uint32', 'uint40', 'uint48', 'uint56', 'uint64',
    'uint72', 'uint80', 'uint88', 'uint96', 'uint104', 'uint112', 'uint120', 'uint128',
    'uint136', 'uint144', 'uint152', 'uint160', 'uint168', 'uint176', 'uint184', 'uint192',
    'uint200', 'uint208', 'uint216', 'uint224', 'uint232', 'uint240', 'uint248', 'uint256',
    'int8', 'int16', 'int24', 'int32', 'int40', 'int48', 'int56', 'int64',
    'int72', 'int80', 'int88', 'int96', 'int104', 'int112', 'int120', 'int128',
    'int136', 'int144', 'int152', 'int160', 'int168', 'int176', 'int184', 'int192',
    'int200', 'int208', 'int216', 'int224', 'int232', 'int240', 'int248', 'int256',
    'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5', 'bytes6', 'bytes7', 'bytes8',
    'bytes9', 'bytes10', 'bytes11', 'bytes12', 'bytes13', 'bytes14', 'bytes15', 'bytes16',
    'bytes17', 'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 'bytes23', 'bytes24',
    'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29', 'bytes30', 'bytes31', 'bytes32',
    'mapping', 'payable'
]);

const SOLIDITY_MODIFIERS = new Set([
    'public', 'private', 'internal', 'external',
    'pure', 'view', 'payable', 'constant', 'immutable',
    'virtual', 'override', 'indexed', 'anonymous',
    'memory', 'storage', 'calldata'
]);

export interface HighlightOptions {
    showLineNumbers?: boolean;
    blockId?: string;           // Block ID for line referencing
    startLineNumber?: number;   // Starting line number in original file
    displayedBlocks?: Set<string>;  // Already displayed block names (to avoid making them clickable)
    enableImport?: boolean;     // Whether to enable Cmd+Click import on tokens
    variableTypes?: Map<string, string>;  // Map of variable names to their type names
    stateVariables?: Set<string>;  // Set of state variable names that can be imported
}

export class SyntaxHighlighter {
    // Store current highlight options for use in highlightLine
    private currentOptions: HighlightOptions = {};
    // Store variable-to-type mappings for the current source
    private variableTypes: Map<string, string> = new Map();

    /**
     * Extract variable-to-type mappings from Solidity source code.
     * This allows us to make variables clickable to import their struct/enum type.
     */
    extractVariableTypes(sourceCode: string): Map<string, string> {
        const varTypes = new Map<string, string>();
        
        // Normalize whitespace - replace newlines with spaces for easier matching
        const normalizedSource = sourceCode.replace(/\s+/g, ' ');
        
        // Pattern 1: TypeName (memory|storage|calldata)? varName
        // e.g., "DepositPool memory depositPool_" or "Strategy strategy_"
        const pattern1 = /\b([A-Z][a-zA-Z0-9_]*)\s+(?:memory\s+|storage\s+|calldata\s+)?([a-z_][a-zA-Z0-9_]*)\b/g;
        
        // Pattern 2: TypeName[] (memory|storage|calldata)? varName (array types)
        // e.g., "DepositPool[] memory pools_"
        const pattern2 = /\b([A-Z][a-zA-Z0-9_]*)\s*\[\s*\]\s*(?:memory\s+|storage\s+|calldata\s+)?([a-z_][a-zA-Z0-9_]*)\b/g;
        
        // Pattern 3: mapping(...=> TypeName) varName
        // e.g., "mapping(address => TokenInfo) tokenInfos"
        const pattern3 = /mapping\s*\([^)]*=>\s*([A-Z][a-zA-Z0-9_]*)\s*\)\s*(?:public\s+|private\s+|internal\s+)?([a-z_][a-zA-Z0-9_]*)\b/g;
        
        // Pattern 4: varName = TypeName(...) - struct instantiation assignment
        // e.g., "depositPool_ = DepositPool({...})" or "pool_ = DepositPool(token, amount)"
        const pattern4 = /\b([a-z_][a-zA-Z0-9_]*)\s*=\s*([A-Z][a-zA-Z0-9_]*)\s*\(/g;
        
        // Pattern 5: TypeName varName = - explicit variable declaration with assignment (no storage location)
        // e.g., "Strategy strategy_ ="
        // Must NOT be followed by memory/storage/calldata (those are handled by pattern1)
        const pattern5 = /\b([A-Z][a-zA-Z0-9_]*)\s+(?!memory\b|storage\b|calldata\b)([a-z_][a-zA-Z0-9_]*)\s*=/g;
        
        let match;
        
        // Apply patterns to normalized source
        while ((match = pattern1.exec(normalizedSource)) !== null) {
            const typeName = match[1];
            const varName = match[2];
            if (!this.isBuiltInType(typeName) && !this.isKeyword(typeName)) {
                varTypes.set(varName, typeName);
            }
        }
        
        while ((match = pattern2.exec(normalizedSource)) !== null) {
            const typeName = match[1];
            const varName = match[2];
            if (!this.isBuiltInType(typeName) && !this.isKeyword(typeName)) {
                varTypes.set(varName, typeName);
            }
        }
        
        while ((match = pattern3.exec(normalizedSource)) !== null) {
            const typeName = match[1];
            const varName = match[2];
            if (!this.isBuiltInType(typeName) && !this.isKeyword(typeName)) {
                varTypes.set(varName, typeName);
            }
        }
        
        // Pattern 4: varName = TypeName(...) - infer type from struct instantiation
        while ((match = pattern4.exec(normalizedSource)) !== null) {
            const varName = match[1];
            const typeName = match[2];
            if (!this.isBuiltInType(typeName) && !this.isKeyword(typeName)) {
                // Only set if not already set (prefer explicit declarations)
                if (!varTypes.has(varName)) {
                    varTypes.set(varName, typeName);
                }
            }
        }
        
        // Pattern 5: TypeName varName = - explicit declaration with assignment
        while ((match = pattern5.exec(normalizedSource)) !== null) {
            const typeName = match[1];
            const varName = match[2];
            if (!this.isBuiltInType(typeName) && !this.isKeyword(typeName)) {
                varTypes.set(varName, typeName);
            }
        }
        
        return varTypes;
    }
    
    /**
     * Check if a word is a Solidity keyword
     */
    private isKeyword(word: string): boolean {
        return SOLIDITY_KEYWORDS.has(word) || SOLIDITY_TYPES.has(word) || SOLIDITY_MODIFIERS.has(word);
    }

    /**
     * Highlight Solidity source code and return HTML
     * Each line gets a unique ID for arrow anchoring: {blockId}-line-{lineNumber}
     */
    highlight(sourceCode: string, options: HighlightOptions = {}): string {
        const lines = sourceCode.split('\n');
        const highlightedLines: string[] = [];
        const blockId = options.blockId || 'block';
        const startLine = options.startLineNumber || 1;

        // Store options for use in highlightLine
        this.currentOptions = options;
        
        // Extract variable types if not provided
        if (options.variableTypes) {
            this.variableTypes = options.variableTypes;
        } else if (options.enableImport) {
            this.variableTypes = this.extractVariableTypes(sourceCode);
        } else {
            this.variableTypes = new Map();
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const actualLineNum = startLine + i;
            const highlightedLine = this.highlightLine(line, actualLineNum, blockId);
            const lineId = `${blockId}-line-${actualLineNum}`;
            
            // Pad line numbers for alignment
            const lineNumStr = String(actualLineNum).padStart(3, ' ');
            
            if (options.showLineNumbers) {
                highlightedLines.push(
                    `<div class="code-line" id="${lineId}" data-line="${actualLineNum}" data-block="${blockId}">` +
                    `<span class="line-number">${lineNumStr}</span>` +
                    `<span class="line-content">${highlightedLine || ' '}</span></div>`
                );
            } else {
                highlightedLines.push(
                    `<div class="code-line" id="${lineId}" data-line="${actualLineNum}" data-block="${blockId}">` +
                    `<span class="line-content">${highlightedLine || ' '}</span></div>`
                );
            }
        }

        // Wrap in inner container to prevent text wrapping
        return `<div class="code-block-inner">${highlightedLines.join('')}</div>`;
    }

    /**
     * Highlight a single line of code
     */
    private highlightLine(line: string, lineNumber: number = 0, blockId: string = ''): string {
        // Handle empty lines
        if (!line.trim()) {
            return this.escapeHtml(line);
        }

        let result = '';
        let i = 0;
        const enableImport = this.currentOptions.enableImport ?? false;
        const displayedBlocks = this.currentOptions.displayedBlocks ?? new Set<string>();

        while (i < line.length) {
            // Check for single-line comment
            if (line.substring(i, i + 2) === '//') {
                result += `<span class="token-comment">${this.escapeHtml(line.substring(i))}</span>`;
                break;
            }

            // Check for multi-line comment start (simplified - doesn't handle spanning lines)
            if (line.substring(i, i + 2) === '/*') {
                const endIndex = line.indexOf('*/', i + 2);
                if (endIndex !== -1) {
                    result += `<span class="token-comment">${this.escapeHtml(line.substring(i, endIndex + 2))}</span>`;
                    i = endIndex + 2;
                    continue;
                } else {
                    result += `<span class="token-comment">${this.escapeHtml(line.substring(i))}</span>`;
                    break;
                }
            }

            // Check for NatSpec comment (@notice, @dev, @param, etc.)
            if (line.substring(i, i + 3) === '///') {
                result += `<span class="token-annotation">${this.escapeHtml(line.substring(i))}</span>`;
                break;
            }

            // Check for string literals
            if (line[i] === '"' || line[i] === "'") {
                const quote = line[i];
                let j = i + 1;
                while (j < line.length && line[j] !== quote) {
                    if (line[j] === '\\') j++; // Skip escaped characters
                    j++;
                }
                result += `<span class="token-string">${this.escapeHtml(line.substring(i, j + 1))}</span>`;
                i = j + 1;
                continue;
            }

            // Check for numbers (including hex)
            if (/[0-9]/.test(line[i]) || (line[i] === '0' && line[i + 1] === 'x')) {
                let j = i;
                if (line.substring(i, i + 2) === '0x') {
                    j += 2;
                    while (j < line.length && /[0-9a-fA-F]/.test(line[j])) j++;
                } else {
                    while (j < line.length && /[0-9.]/.test(line[j])) j++;
                    // Handle scientific notation and ether units
                    if (line.substring(j).match(/^(ether|wei|gwei|finney|szabo|seconds|minutes|hours|days|weeks|years)/)) {
                        const match = line.substring(j).match(/^(ether|wei|gwei|finney|szabo|seconds|minutes|hours|days|weeks|years)/);
                        if (match) {
                            j += match[0].length;
                        }
                    }
                }
                result += `<span class="token-number">${this.escapeHtml(line.substring(i, j))}</span>`;
                i = j;
                continue;
            }

            // Check for identifiers/keywords
            if (/[a-zA-Z_]/.test(line[i])) {
                let j = i;
                while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
                const word = line.substring(i, j);

                if (SOLIDITY_KEYWORDS.has(word)) {
                    result += `<span class="token-keyword">${this.escapeHtml(word)}</span>`;
                } else if (SOLIDITY_TYPES.has(word)) {
                    result += `<span class="token-type">${this.escapeHtml(word)}</span>`;
                } else if (SOLIDITY_MODIFIERS.has(word)) {
                    result += `<span class="token-modifier">${this.escapeHtml(word)}</span>`;
                } else if (line[j] === '(') {
                    // Function call - make it importable if enabled
                    const isImportable = enableImport && 
                        !displayedBlocks.has(`function-${word}`) &&
                        !this.isBuiltInFunction(word);
                    
                    if (isImportable) {
                        result += `<span class="token-function importable-token" ` +
                            `data-importable="function" data-name="${this.escapeHtml(word)}" ` +
                            `data-line="${lineNumber}" data-block="${blockId}">` +
                            `${this.escapeHtml(word)}</span>`;
                    } else {
                        result += `<span class="token-function">${this.escapeHtml(word)}</span>`;
                    }
                } else if (word[0] === word[0].toUpperCase() && word[0] !== '_') {
                    // Likely a type (struct, enum, contract) - make it importable if enabled
                    const isImportable = enableImport && 
                        !displayedBlocks.has(`struct-${word}`) &&
                        !displayedBlocks.has(`enum-${word}`) &&
                        !this.isBuiltInType(word);
                    
                    if (isImportable) {
                        result += `<span class="token-type importable-token" ` +
                            `data-importable="type" data-name="${this.escapeHtml(word)}" ` +
                            `data-line="${lineNumber}" data-block="${blockId}">` +
                            `${this.escapeHtml(word)}</span>`;
                    } else {
                        result += `<span class="token-type">${this.escapeHtml(word)}</span>`;
                    }
                } else {
                    // Check if this is a state variable reference
                    const stateVariables = this.currentOptions.stateVariables ?? new Set<string>();
                    const isStateVar = stateVariables.has(word);
                    const isStateVarImportable = enableImport && 
                        isStateVar && 
                        !displayedBlocks.has(`statevar-${word}`);
                    
                    if (isStateVarImportable) {
                        result += `<span class="token-variable importable-token" ` +
                            `data-importable="statevar" data-name="${this.escapeHtml(word)}" ` +
                            `data-line="${lineNumber}" data-block="${blockId}">` +
                            `${this.escapeHtml(word)}</span>`;
                    } else {
                        // Check if this variable has a known struct/enum type
                        const varType = this.variableTypes.get(word);
                        const isImportableVar = enableImport && 
                            varType && 
                            !displayedBlocks.has(`struct-${varType}`) &&
                            !displayedBlocks.has(`enum-${varType}`) &&
                            !this.isBuiltInType(varType);
                        
                        if (isImportableVar && varType) {
                            result += `<span class="token-variable importable-token" ` +
                                `data-importable="type" data-name="${this.escapeHtml(varType)}" ` +
                                `data-line="${lineNumber}" data-block="${blockId}">` +
                                `${this.escapeHtml(word)}</span>`;
                        } else {
                            result += `<span class="token-variable">${this.escapeHtml(word)}</span>`;
                        }
                    }
                }
                i = j;
                continue;
            }

            // Check for operators
            if (/[+\-*\/%=<>!&|^~?:]/.test(line[i])) {
                let j = i;
                while (j < line.length && /[+\-*\/%=<>!&|^~?:]/.test(line[j])) j++;
                result += `<span class="token-operator">${this.escapeHtml(line.substring(i, j))}</span>`;
                i = j;
                continue;
            }

            // Default: just output the character
            result += this.escapeHtml(line[i]);
            i++;
        }

        return result;
    }

    /**
     * Check if a function name is a built-in that shouldn't be importable
     */
    private isBuiltInFunction(name: string): boolean {
        const builtIns = new Set([
            'require', 'assert', 'revert', 'keccak256', 'sha256', 'sha3',
            'ripemd160', 'ecrecover', 'addmod', 'mulmod', 'selfdestruct',
            'blockhash', 'gasleft', 'type', 'abi',
            'push', 'pop', 'transfer', 'send', 'call',
            'delegatecall', 'staticcall', 'encode', 'encodePacked',
            'encodeWithSelector', 'encodeWithSignature', 'decode',
            'emit', 'new', 'delete'
        ]);
        return builtIns.has(name);
    }

    /**
     * Check if a type name is a built-in or interface that shouldn't be importable
     */
    private isBuiltInType(name: string): boolean {
        // Skip interface types (IERC20, IRewardPool, etc.)
        if (/^I[A-Z]/.test(name)) return true;
        
        // Skip common library/contract names that are external
        const skipTypes = new Set([
            'SafeERC20', 'SafeMath', 'Address', 'Strings', 'Math',
            'ECDSA', 'MerkleProof', 'EnumerableSet', 'EnumerableMap',
            'Error', 'Panic', 'Console'
        ]);
        return skipTypes.has(name);
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Get CSS styles for syntax highlighting (token colors only)
     * Layout styles are in canvasController.ts
     */
    getStyles(): string {
        return `

            /* Dark theme (default) */
            .code-block {
                background-color: #1e1e2e;
                color: #cdd6f4;
            }

            .token-keyword {
                color: #cba6f7;
                font-weight: 500;
            }

            .token-type {
                color: #89dceb;
            }

            .token-function {
                color: #89b4fa;
            }

            .token-string {
                color: #a6e3a1;
            }

            .token-number {
                color: #fab387;
            }

            .token-comment {
                color: #6c7086;
                font-style: italic;
            }

            .token-annotation {
                color: #94e2d5;
                font-style: italic;
            }

            .token-operator {
                color: #89dceb;
            }

            .token-variable {
                color: #cdd6f4;
            }

            .token-modifier {
                color: #f38ba8;
            }

            /* Light theme */
            .theme-light .code-block {
                background-color: #f5f5f5;
                color: #1e1e1e;
            }

            .theme-light .token-keyword {
                color: #7c3aed;
            }

            .theme-light .token-type {
                color: #0891b2;
            }

            .theme-light .token-function {
                color: #2563eb;
            }

            .theme-light .token-string {
                color: #059669;
            }

            .theme-light .token-number {
                color: #ea580c;
            }

            .theme-light .token-comment {
                color: #6b7280;
            }

            .theme-light .token-annotation {
                color: #0d9488;
            }

            .theme-light .token-operator {
                color: #0891b2;
            }

            .theme-light .token-variable {
                color: #1e1e1e;
            }

            .theme-light .token-modifier {
                color: #db2777;
            }
        `;
    }
}
