/**
 * Import Manager - Handles dynamic import of functions/types via Cmd+Click
 * and removal of blocks from the diagram
 */

/**
 * Generates the JavaScript code for the import manager to be injected into the webview
 */
export function generateImportManagerScript(): string {
    return `
    // ============ Import Manager ============
    class ImportManager {
        constructor() {
            this.displayedBlocks = new Set();
            this.pendingImports = new Map();
            this.hintElement = null;
            this.hintTimeout = null;
            this.pickerElement = null;
            
            this.init();
        }

        init() {
            // Collect initially displayed blocks
            this.refreshDisplayedBlocks();

            // Cmd+Click handler for importing
            document.addEventListener('click', (e) => {
                const token = e.target.closest('.importable-token');
                if (!token) return;
                
                // Check for Cmd (Mac) or Ctrl (Windows/Linux)
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.requestImport(token);
                }
            });

            // Close button handler
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('block-close-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const block = e.target.closest('.code-block-wrapper');
                    if (block) {
                        this.removeBlock(block);
                    }
                }
            });

            // Show hint on hover over importable tokens
            document.addEventListener('mouseover', (e) => {
                const token = e.target.closest('.importable-token');
                if (token && !token.classList.contains('loading')) {
                    this.showImportHint(token);
                }
            });

            document.addEventListener('mouseout', (e) => {
                const token = e.target.closest('.importable-token');
                if (token) {
                    this.hideImportHint();
                }
            });

            // Listen for import responses from extension
            window.addEventListener('message', (e) => {
                const message = e.data;
                if (message.command === 'importResponse') {
                    this.handleImportResponse(message);
                } else if (message.command === 'showImplementationPicker') {
                    this.showImplementationPicker(message);
                } else if (message.command === 'implementationsResult') {
                    this.handleImplementationsResult(message);
                }
            });

            // Create hint element
            this.createHintElement();
            
            // Create implementation picker
            this.createImplementationPicker();
        }

        /**
         * Refresh the displayedBlocks set from the current DOM state
         */
        refreshDisplayedBlocks() {
            this.displayedBlocks.clear();
            document.querySelectorAll('.code-block-wrapper').forEach(block => {
                this.displayedBlocks.add(block.id);
            });
        }

        createHintElement() {
            this.hintElement = document.createElement('div');
            this.hintElement.className = 'import-hint';
            this.hintElement.innerHTML = '<kbd>⌘</kbd> Click to import';
            document.body.appendChild(this.hintElement);
        }

        createImplementationPicker() {
            this.pickerElement = document.createElement('div');
            this.pickerElement.className = 'implementation-picker';
            this.pickerElement.innerHTML = \`
                <div class="picker-header">
                    <span class="picker-title">Select Implementation</span>
                    <button class="picker-close">&times;</button>
                </div>
                <div class="picker-body"></div>
            \`;
            document.body.appendChild(this.pickerElement);
            
            // Close button handler
            this.pickerElement.querySelector('.picker-close').addEventListener('click', () => {
                this.hideImplementationPicker();
            });
            
            // Close on escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.pickerElement.classList.contains('visible')) {
                    this.hideImplementationPicker();
                }
            });
            
            // Close on click outside
            document.addEventListener('click', (e) => {
                if (this.pickerElement.classList.contains('visible') && 
                    !this.pickerElement.contains(e.target) &&
                    !e.target.closest('.importable-token')) {
                    this.hideImplementationPicker();
                }
            });
        }

        showImplementationPicker(message) {
            const body = this.pickerElement.querySelector('.picker-body');
            body.innerHTML = '';
            
            // Clear loading state on tokens since picker is now showing
            for (const [key, value] of this.pendingImports.entries()) {
                if (key.startsWith('impl-')) {
                    value.token.classList.remove('loading');
                }
            }
            
            // Store context for selection
            this.pickerContext = {
                sourceBlockId: message.sourceBlockId,
                sourceLine: message.sourceLine
            };
            
            for (const impl of message.implementations) {
                const item = document.createElement('div');
                item.className = 'picker-item';
                item.innerHTML = \`
                    <div class="picker-item-main">
                        <span class="picker-item-contract">\${impl.contractName}</span>
                        <span class="picker-item-kind \${impl.contractKind}">\${impl.contractKind}</span>
                    </div>
                    <div class="picker-item-details">
                        <span class="picker-item-signature">\${impl.functionName}\${impl.signature}</span>
                        \${impl.isInherited ? '<span class="picker-item-inherited">inherited</span>' : ''}
                    </div>
                    <div class="picker-item-path">\${impl.filePath.split('/').pop()}:\${impl.line}</div>
                \`;
                
                item.addEventListener('click', () => {
                    this.selectImplementation(impl);
                });
                
                body.appendChild(item);
            }
            
            // Position near center of viewport
            this.pickerElement.style.left = '50%';
            this.pickerElement.style.top = '50%';
            this.pickerElement.style.transform = 'translate(-50%, -50%)';
            this.pickerElement.classList.add('visible');
        }

        hideImplementationPicker() {
            this.pickerElement.classList.remove('visible');
            
            // Clear any pending interface call imports and remove loading state
            for (const [key, value] of this.pendingImports.entries()) {
                if (key.startsWith('impl-')) {
                    value.token.classList.remove('loading');
                    this.pendingImports.delete(key);
                }
            }
            
            this.pickerContext = null;
        }

        selectImplementation(impl) {
            this.hideImplementationPicker();
            
            vscode.postMessage({
                command: 'selectImplementation',
                contractName: impl.contractName,
                methodName: impl.functionName,
                sourceBlockId: this.pickerContext?.sourceBlockId,
                sourceLine: this.pickerContext?.sourceLine
            });
        }

        handleImplementationsResult(message) {
            if (!message.success) {
                // Show error briefly and clear loading state
                console.warn('Implementation search failed:', message.error);
                
                // Clear any pending interface call imports
                for (const [key, value] of this.pendingImports.entries()) {
                    if (key.startsWith('impl-')) {
                        value.token.classList.remove('loading');
                        value.token.classList.add('error');
                        setTimeout(() => value.token.classList.remove('error'), 1000);
                        this.pendingImports.delete(key);
                    }
                }
            }
        }

        showImportHint(token) {
            if (this.hintTimeout) {
                clearTimeout(this.hintTimeout);
            }

            this.hintTimeout = setTimeout(() => {
                const rect = token.getBoundingClientRect();
                this.hintElement.style.left = rect.left + 'px';
                this.hintElement.style.top = (rect.bottom + 8) + 'px';
                this.hintElement.classList.add('visible');
            }, 500);
        }

        hideImportHint() {
            if (this.hintTimeout) {
                clearTimeout(this.hintTimeout);
                this.hintTimeout = null;
            }
            this.hintElement.classList.remove('visible');
        }

        requestImport(token) {
            const name = token.dataset.name;
            const importType = token.dataset.importable; // 'function', 'type', 'statevar', or 'interface-call'
            const line = parseInt(token.dataset.line, 10);
            const blockId = token.dataset.block;
            const interfaceName = token.dataset.interface; // For interface calls

            // Debug logging
            console.log('[ImportManager] Import requested:', { name, importType, blockId, line, interfaceName });

            if (!name || !importType) {
                console.warn('[ImportManager] Missing name or importType in token data');
                return;
            }

            // Handle interface method calls - find implementations
            if (importType === 'interface-call' && interfaceName) {
                // Mark as loading
                token.classList.add('loading');
                this.pendingImports.set(\`impl-\${interfaceName}-\${name}\`, { token, sourceBlockId: blockId, sourceLine: line });
                
                vscode.postMessage({
                    command: 'findImplementations',
                    interfaceName: interfaceName,
                    methodName: name,
                    sourceBlockId: blockId,
                    sourceLine: line
                });
                return;
            }

            // Check if already displayed
            let targetId;
            if (importType === 'function') {
                targetId = \`function-\${name}\`;
            } else if (importType === 'statevar') {
                targetId = \`statevar-\${name}\`;
            } else {
                targetId = \`struct-\${name}\`;
            }
            
            if (this.displayedBlocks.has(targetId) || 
                this.displayedBlocks.has(\`enum-\${name}\`) ||
                this.displayedBlocks.has(\`statevar-\${name}\`)) {
                // Already imported - briefly highlight the existing block
                this.highlightExistingBlock(targetId) || 
                    this.highlightExistingBlock(\`enum-\${name}\`) ||
                    this.highlightExistingBlock(\`statevar-\${name}\`);
                token.classList.add('already-imported');
                setTimeout(() => token.classList.remove('already-imported'), 1000);
                return;
            }

            // Check if import is already pending
            const pendingKey = \`\${importType}-\${name}\`;
            if (this.pendingImports.has(pendingKey)) {
                return;
            }

            // Mark as loading
            token.classList.add('loading');
            this.pendingImports.set(pendingKey, { token, sourceBlockId: blockId, sourceLine: line });

            // Determine the kind for the import request
            let kind;
            if (importType === 'function') {
                kind = 'function';
            } else if (importType === 'statevar') {
                kind = 'statevar';
            } else {
                kind = 'struct'; // 'type' becomes 'struct' for resolution
            }

            // Send import request to extension
            vscode.postMessage({
                command: 'importRequest',
                name: name,
                kind: kind,
                sourceBlockId: blockId,
                sourceLine: line
            });
        }

        handleImportResponse(response) {
            // Find the pending import
            let pendingKey = null;
            let pending = null;
            
            for (const [key, value] of this.pendingImports.entries()) {
                if (response.requestId && response.requestId.includes(value.token.dataset.name)) {
                    pendingKey = key;
                    pending = value;
                    break;
                }
            }

            // Also try to find by name in the response
            if (!pending && response.block) {
                const name = response.block.id.split('-').slice(1).join('-');
                for (const [key, value] of this.pendingImports.entries()) {
                    if (key.includes(name)) {
                        pendingKey = key;
                        pending = value;
                        break;
                    }
                }
            }

            if (pending) {
                pending.token.classList.remove('loading');
                this.pendingImports.delete(pendingKey);
            }

            if (!response.success) {
                // Show error state briefly
                if (pending) {
                    pending.token.classList.add('error');
                    setTimeout(() => pending.token.classList.remove('error'), 1000);
                }
                console.warn('Import failed:', response.error);
                return;
            }

            // Create and add the new block
            if (response.block) {
                this.addBlock(response.block, pending?.sourceBlockId);
            }

            // Add arrows
            if (response.arrows && response.arrows.length > 0) {
                for (const arrow of response.arrows) {
                    if (typeof arrowManager !== 'undefined' && arrowManager) {
                        arrowManager.addArrow(arrow);
                    }
                }
            }

            // Mark all matching tokens as imported
            this.markTokensAsImported(response.block?.id);
        }

        addBlock(blockData, sourceBlockId) {
            const content = document.getElementById('canvas-content');
            if (!content) return;

            console.log('[ImportManager] Adding block:', blockData.id, 'Current displayedBlocks:', Array.from(this.displayedBlocks));

            // Calculate position near the source block
            const position = this.calculateBlockPosition(blockData, sourceBlockId);
            
            // Create block element
            const blockHtml = this.createBlockHtml(blockData, position);
            
            // Insert into DOM
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = blockHtml;
            const blockElement = tempDiv.firstElementChild;
            
            if (blockElement) {
                blockElement.classList.add('appearing');
                content.appendChild(blockElement);
                
                // Track the new block
                this.displayedBlocks.add(blockData.id);
                
                // Update draggable manager
                if (typeof draggableManager !== 'undefined' && draggableManager) {
                    draggableManager.setBlockPosition(blockData.id, position.x, position.y);
                }

                // Update arrows after a short delay
                setTimeout(() => {
                    blockElement.classList.remove('appearing');
                    if (typeof updateAllArrows === 'function') {
                        updateAllArrows();
                    }
                }, 300);
            }
        }

        calculateBlockPosition(blockData, sourceBlockId) {
            const sourceBlock = sourceBlockId ? document.getElementById(sourceBlockId) : null;
            
            let x = 900; // Default right position
            let y = 80;  // Default top position
            
            if (sourceBlock) {
                const sourceX = parseFloat(sourceBlock.dataset.x) || 0;
                const sourceY = parseFloat(sourceBlock.dataset.y) || 0;
                const sourceWidth = sourceBlock.offsetWidth || 400;
                
                // Position to the right of the source block
                if (blockData.category === 'function') {
                    x = sourceX + sourceWidth + 50;
                } else {
                    // Structs/enums/statevars go to the left
                    x = sourceX - 400;
                    if (x < 50) x = sourceX + sourceWidth + 50;
                }
                
                // Find a Y position that doesn't overlap
                y = this.findNonOverlappingY(x, sourceY, blockData.category);
            } else {
                // No source block, find any non-overlapping position
                y = this.findNonOverlappingY(x, y, blockData.category);
            }
            
            return { x, y };
        }

        findNonOverlappingY(x, preferredY, category) {
            const blocks = document.querySelectorAll('.code-block-wrapper');
            const occupiedRanges = [];
            
            // Collect Y ranges of blocks at similar X positions
            blocks.forEach(block => {
                const blockX = parseFloat(block.dataset.x) || 0;
                const blockY = parseFloat(block.dataset.y) || 0;
                const blockHeight = block.offsetHeight || 200;
                
                // Only consider blocks that might overlap horizontally
                if (Math.abs(blockX - x) < 350) {
                    occupiedRanges.push({ start: blockY, end: blockY + blockHeight + 40 });
                }
            });
            
            // Sort by start position
            occupiedRanges.sort((a, b) => a.start - b.start);
            
            // Find first available slot
            let y = preferredY;
            for (const range of occupiedRanges) {
                if (y >= range.start && y < range.end) {
                    y = range.end;
                }
            }
            
            return y;
        }

        createBlockHtml(blockData, position) {
            const categoryClass = \`block-\${blockData.category}\`;
            const highlightedCode = this.highlightCode(blockData.sourceCode, blockData.id, blockData.startLine);
            
            return \`
            <div class="code-block-wrapper \${categoryClass}" 
                 id="\${blockData.id}" 
                 data-file="\${this.escapeHtml(blockData.filePath)}" 
                 data-line="\${blockData.startLine}"
                 data-x="\${position.x}"
                 data-y="\${position.y}"
                 style="left: \${position.x}px; top: \${position.y}px;">
                <button class="block-close-btn" title="Remove block">&times;</button>
                <div class="block-header">
                    <span class="block-title">\${this.escapeHtml(blockData.title)}</span>
                    \${blockData.subtitle ? \`<span class="block-subtitle">\${this.escapeHtml(blockData.subtitle)}</span>\` : ''}
                </div>
                <div class="code-block">
                    \${highlightedCode}
                </div>
                <div class="block-footer">
                    <button class="goto-btn" onclick="goToSource('\${this.escapeHtml(blockData.filePath)}', \${blockData.startLine})">
                        Go to source
                    </button>
                </div>
                <div class="resize-handle resize-handle-e" data-resize="e"></div>
                <div class="resize-handle resize-handle-s" data-resize="s"></div>
                <div class="resize-handle resize-handle-se" data-resize="se"></div>
            </div>\`;
        }

        highlightCode(sourceCode, blockId, startLine) {
            // Simple highlighting for dynamically added blocks
            // This mirrors the server-side SyntaxHighlighter but runs client-side
            const lines = sourceCode.split('\\n');
            const highlightedLines = [];
            
            // Extract variable-to-type mappings for this source
            const variableTypes = this.extractVariableTypes(sourceCode);
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const actualLineNum = startLine + i;
                const lineId = \`\${blockId}-line-\${actualLineNum}\`;
                const lineNumStr = String(actualLineNum).padStart(3, ' ');
                
                // Basic syntax highlighting with variable type awareness
                const highlightedLine = this.highlightLine(line, actualLineNum, blockId, variableTypes);
                
                highlightedLines.push(
                    \`<div class="code-line" id="\${lineId}" data-line="\${actualLineNum}" data-block="\${blockId}">\` +
                    \`<span class="line-number">\${lineNumStr}</span>\` +
                    \`<span class="line-content">\${highlightedLine || ' '}</span></div>\`
                );
            }
            
            return \`<div class="code-block-inner">\${highlightedLines.join('')}</div>\`;
        }

        extractVariableTypes(sourceCode) {
            const varTypes = new Map();
            
            // Normalize whitespace - replace newlines with spaces for easier matching
            const normalizedSource = sourceCode.replace(/\\s+/g, ' ');
            
            // Keywords to skip
            const keywords = ['pragma', 'solidity', 'import', 'contract', 'interface', 'library', 'abstract',
                'is', 'using', 'for', 'struct', 'enum', 'event', 'error', 'modifier',
                'function', 'constructor', 'fallback', 'receive', 'returns', 'return',
                'if', 'else', 'while', 'do', 'break', 'continue', 'throw',
                'try', 'catch', 'revert', 'require', 'assert', 'emit', 'new', 'delete',
                'true', 'false', 'this', 'super', 'type', 'assembly', 'unchecked'];
            const types = ['address', 'bool', 'string', 'bytes', 'uint', 'int', 'uint256', 'uint128', 
                'uint64', 'uint32', 'uint16', 'uint8', 'int256', 'int128', 'int64', 'int32', 'int16', 'int8',
                'bytes32', 'bytes20', 'bytes4', 'mapping', 'payable'];
            const modifiers = ['public', 'private', 'internal', 'external', 'pure', 'view', 'payable',
                'constant', 'immutable', 'virtual', 'override', 'indexed', 'memory', 'storage', 'calldata'];
            
            const isKeyword = (word) => keywords.includes(word) || types.includes(word) || modifiers.includes(word);
            
            // Pattern 1: TypeName (memory|storage|calldata)? varName
            const pattern1 = /\\b([A-Z][a-zA-Z0-9_]*)\\s+(?:memory\\s+|storage\\s+|calldata\\s+)?([a-z_][a-zA-Z0-9_]*)\\b/g;
            
            // Pattern 2: TypeName[] (memory|storage|calldata)? varName (array types)
            const pattern2 = /\\b([A-Z][a-zA-Z0-9_]*)\\s*\\[\\s*\\]\\s*(?:memory\\s+|storage\\s+|calldata\\s+)?([a-z_][a-zA-Z0-9_]*)\\b/g;
            
            // Pattern 3: mapping(...=> TypeName) varName
            const pattern3 = /mapping\\s*\\([^)]*=>\\s*([A-Z][a-zA-Z0-9_]*)\\s*\\)\\s*(?:public\\s+|private\\s+|internal\\s+)?([a-z_][a-zA-Z0-9_]*)\\b/g;
            
            // Pattern 4: varName = TypeName(...) - struct instantiation assignment
            const pattern4 = /\\b([a-z_][a-zA-Z0-9_]*)\\s*=\\s*([A-Z][a-zA-Z0-9_]*)\\s*\\(/g;
            
            // Pattern 5: TypeName varName = - explicit variable declaration with assignment (no storage location)
            // Must NOT be followed by memory/storage/calldata (those are handled by pattern1)
            const pattern5 = /\\b([A-Z][a-zA-Z0-9_]*)\\s+(?!memory\\b|storage\\b|calldata\\b)([a-z_][a-zA-Z0-9_]*)\\s*=/g;
            
            let match;
            
            while ((match = pattern1.exec(normalizedSource)) !== null) {
                const typeName = match[1];
                const varName = match[2];
                if (!this.isBuiltInType(typeName) && !isKeyword(typeName)) {
                    varTypes.set(varName, typeName);
                }
            }
            
            while ((match = pattern2.exec(normalizedSource)) !== null) {
                const typeName = match[1];
                const varName = match[2];
                if (!this.isBuiltInType(typeName) && !isKeyword(typeName)) {
                    varTypes.set(varName, typeName);
                }
            }
            
            while ((match = pattern3.exec(normalizedSource)) !== null) {
                const typeName = match[1];
                const varName = match[2];
                if (!this.isBuiltInType(typeName) && !isKeyword(typeName)) {
                    varTypes.set(varName, typeName);
                }
            }
            
            // Pattern 4: varName = TypeName(...) - infer type from struct instantiation
            while ((match = pattern4.exec(normalizedSource)) !== null) {
                const varName = match[1];
                const typeName = match[2];
                if (!this.isBuiltInType(typeName) && !isKeyword(typeName)) {
                    if (!varTypes.has(varName)) {
                        varTypes.set(varName, typeName);
                    }
                }
            }
            
            // Pattern 5: TypeName varName = - explicit declaration with assignment
            while ((match = pattern5.exec(normalizedSource)) !== null) {
                const typeName = match[1];
                const varName = match[2];
                if (!this.isBuiltInType(typeName) && !isKeyword(typeName)) {
                    varTypes.set(varName, typeName);
                }
            }
            
            return varTypes;
        }

        highlightLine(line, lineNumber, blockId, variableTypes = new Map()) {
            if (!line.trim()) return this.escapeHtml(line);
            
            // First, detect and mark interface calls: IERC20(token).method(...)
            // This pre-processes the line to find interface call patterns
            const interfaceCallInfo = this.detectInterfaceCalls(line);
            
            // Keywords
            const keywords = ['pragma', 'solidity', 'import', 'contract', 'interface', 'library', 'abstract',
                'is', 'using', 'for', 'struct', 'enum', 'event', 'error', 'modifier',
                'function', 'constructor', 'fallback', 'receive', 'returns', 'return',
                'if', 'else', 'while', 'do', 'break', 'continue', 'throw',
                'try', 'catch', 'revert', 'require', 'assert', 'emit', 'new', 'delete',
                'true', 'false', 'this', 'super', 'type', 'assembly', 'unchecked'];
            
            const types = ['address', 'bool', 'string', 'bytes', 'uint', 'int', 'uint256', 'uint128', 
                'uint64', 'uint32', 'uint16', 'uint8', 'int256', 'int128', 'int64', 'int32', 'int16', 'int8',
                'bytes32', 'bytes20', 'bytes4', 'mapping', 'payable'];
            
            const modifiers = ['public', 'private', 'internal', 'external', 'pure', 'view', 'payable',
                'constant', 'immutable', 'virtual', 'override', 'indexed', 'memory', 'storage', 'calldata'];
            
            let result = '';
            let i = 0;
            
            while (i < line.length) {
                // Comments
                if (line.substring(i, i + 2) === '//') {
                    result += \`<span class="token-comment">\${this.escapeHtml(line.substring(i))}</span>\`;
                    break;
                }
                
                // Strings
                if (line[i] === '"' || line[i] === "'") {
                    const quote = line[i];
                    let j = i + 1;
                    while (j < line.length && line[j] !== quote) {
                        if (line[j] === '\\\\') j++;
                        j++;
                    }
                    result += \`<span class="token-string">\${this.escapeHtml(line.substring(i, j + 1))}</span>\`;
                    i = j + 1;
                    continue;
                }
                
                // Numbers
                if (/[0-9]/.test(line[i])) {
                    let j = i;
                    if (line.substring(i, i + 2) === '0x') {
                        j += 2;
                        while (j < line.length && /[0-9a-fA-F]/.test(line[j])) j++;
                    } else {
                        while (j < line.length && /[0-9.]/.test(line[j])) j++;
                    }
                    result += \`<span class="token-number">\${this.escapeHtml(line.substring(i, j))}</span>\`;
                    i = j;
                    continue;
                }
                
                // Identifiers
                if (/[a-zA-Z_]/.test(line[i])) {
                    let j = i;
                    while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
                    const word = line.substring(i, j);
                    
                    // Check if this is part of an interface call pattern
                    const interfaceCallMatch = interfaceCallInfo.find(
                        ic => ic.methodPos === i && ic.methodName === word
                    );
                    
                    if (interfaceCallMatch) {
                        // This is an interface method call - make it importable with interface info
                        result += \`<span class="token-function interface-call importable-token" \` +
                            \`data-importable="interface-call" data-name="\${this.escapeHtml(word)}" \` +
                            \`data-interface="\${this.escapeHtml(interfaceCallMatch.interfaceName)}" \` +
                            \`data-line="\${lineNumber}" data-block="\${blockId}">\` +
                            \`\${this.escapeHtml(word)}</span>\`;
                        i = j;
                        continue;
                    }
                    
                    const escapedWord = this.escapeHtml(word);

                    if (keywords.includes(word)) {
                        result += \`<span class="token-keyword">\${escapedWord}</span>\`;
                    } else if (types.includes(word)) {
                        result += \`<span class="token-type">\${escapedWord}</span>\`;
                    } else if (modifiers.includes(word)) {
                        result += \`<span class="token-modifier">\${escapedWord}</span>\`;
                    } else if (line[j] === '(') {
                        // Function call - make it importable
                        // Also check for function-ContractName-funcName pattern used by implementations
                        const isDisplayed = this.displayedBlocks.has(\`function-\${word}\`) ||
                            Array.from(this.displayedBlocks).some(id => id.endsWith(\`-\${word}\`) && id.startsWith('function-'));
                        const isImportable = !isDisplayed && !this.isBuiltInFunction(word);
                        if (isImportable) {
                            result += \`<span class="token-function importable-token" \` +
                                \`data-importable="function" data-name="\${escapedWord}" \` +
                                \`data-line="\${lineNumber}" data-block="\${blockId}">\` +
                                \`\${escapedWord}</span>\`;
                        } else {
                            result += \`<span class="token-function">\${escapedWord}</span>\`;
                        }
                    } else if (word[0] === word[0].toUpperCase() && word[0] !== '_') {
                        // Type - make it importable
                        const hasStruct = this.displayedBlocks.has(\`struct-\${word}\`);
                        const hasEnum = this.displayedBlocks.has(\`enum-\${word}\`);
                        const isBuiltIn = this.isBuiltInType(word);
                        const isImportable = !hasStruct && !hasEnum && !isBuiltIn;

                        if (isImportable) {
                            result += \`<span class="token-type importable-token" \` +
                                \`data-importable="type" data-name="\${escapedWord}" \` +
                                \`data-line="\${lineNumber}" data-block="\${blockId}">\` +
                                \`\${escapedWord}</span>\`;
                        } else {
                            result += \`<span class="token-type">\${escapedWord}</span>\`;
                        }
                    } else {
                        // Check if this variable has a known struct/enum type
                        const varType = variableTypes.get(word);
                        const isImportableVar = varType &&
                            !this.displayedBlocks.has(\`struct-\${varType}\`) &&
                            !this.displayedBlocks.has(\`enum-\${varType}\`) &&
                            !this.isBuiltInType(varType);

                        if (isImportableVar) {
                            result += \`<span class="token-variable importable-token" \` +
                                \`data-importable="type" data-name="\${this.escapeHtml(varType)}" \` +
                                \`data-line="\${lineNumber}" data-block="\${blockId}">\` +
                                \`\${escapedWord}</span>\`;
                        } else {
                            result += \`<span class="token-variable">\${escapedWord}</span>\`;
                        }
                    }
                    i = j;
                    continue;
                }
                
                // Operators
                if (/[+\\-*\\/%=<>!&|^~?:]/.test(line[i])) {
                    let j = i;
                    while (j < line.length && /[+\\-*\\/%=<>!&|^~?:]/.test(line[j])) j++;
                    result += \`<span class="token-operator">\${this.escapeHtml(line.substring(i, j))}</span>\`;
                    i = j;
                    continue;
                }
                
                result += this.escapeHtml(line[i]);
                i++;
            }
            
            return result;
        }

        /**
         * Detect interface call patterns in a line: InterfaceName(address).method(...)
         * Returns array of { interfaceName, methodName, methodPos }
         * Handles nested parentheses like IERC20(address(token)).method()
         */
        detectInterfaceCalls(line) {
            const results = [];
            
            // Use a character-by-character approach to handle nested parentheses
            let i = 0;
            while (i < line.length) {
                // Look for a potential type name (starts with uppercase)
                if (/[A-Z]/.test(line[i])) {
                    const typeStart = i;
                    
                    // Read the type name
                    while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
                        i++;
                    }
                    const typeName = line.substring(typeStart, i);
                    
                    // Skip whitespace
                    while (i < line.length && /\\s/.test(line[i])) {
                        i++;
                    }
                    
                    // Check for opening parenthesis
                    if (i < line.length && line[i] === '(') {
                        // Find matching closing parenthesis (handle nesting)
                        const closeParenPos = this.findMatchingParen(line, i);
                        if (closeParenPos === -1) {
                            i++;
                            continue;
                        }
                        
                        i = closeParenPos + 1;
                        
                        // Skip whitespace
                        while (i < line.length && /\\s/.test(line[i])) {
                            i++;
                        }
                        
                        // Check for dot
                        if (i < line.length && line[i] === '.') {
                            i++; // skip the dot
                            
                            // Skip whitespace
                            while (i < line.length && /\\s/.test(line[i])) {
                                i++;
                            }
                            
                            // Read method name (must start with lowercase or underscore)
                            if (i < line.length && /[a-z_]/.test(line[i])) {
                                const methodStart = i;
                                while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
                                    i++;
                                }
                                const methodName = line.substring(methodStart, i);
                                
                                // Skip whitespace
                                while (i < line.length && /\\s/.test(line[i])) {
                                    i++;
                                }
                                
                                // Check for opening paren (confirming it's a function call)
                                if (i < line.length && line[i] === '(') {
                                    // This is an interface call pattern!
                                    if (this.looksLikeInterface(typeName)) {
                                        results.push({
                                            interfaceName: typeName,
                                            methodName: methodName,
                                            methodPos: methodStart
                                        });
                                    }
                                }
                            }
                        }
                    } else {
                        // Not followed by (, continue scanning
                        continue;
                    }
                } else {
                    i++;
                }
            }
            
            return results;
        }

        /**
         * Find the position of the matching closing parenthesis, handling nesting
         */
        findMatchingParen(line, openPos) {
            if (line[openPos] !== '(') return -1;
            
            let depth = 1;
            let i = openPos + 1;
            
            while (i < line.length && depth > 0) {
                if (line[i] === '(') {
                    depth++;
                } else if (line[i] === ')') {
                    depth--;
                } else if (line[i] === '"' || line[i] === "'") {
                    // Skip string literals
                    const quote = line[i];
                    i++;
                    while (i < line.length && line[i] !== quote) {
                        if (line[i] === '\\\\') i++; // skip escaped chars
                        i++;
                    }
                }
                i++;
            }
            
            return depth === 0 ? i - 1 : -1;
        }

        /**
         * Check if a type name looks like an interface
         */
        looksLikeInterface(name) {
            // Common interface prefixes
            if (/^I[A-Z]/.test(name)) return true;
            
            // Known interface-like patterns
            const interfaceLikePatterns = ['IERC20', 'IERC721', 'IERC1155', 'IUniswap', 'IAave', 
                'ICompound', 'ICurve', 'IBalancer', 'ISynthetix', 'IMaker', 'IYearn', 'IConvex',
                'ILido', 'IRocket', 'IChainlink', 'IBancor'];
            
            for (const pattern of interfaceLikePatterns) {
                if (name.startsWith(pattern)) return true;
            }
            
            return false;
        }

        isBuiltInFunction(name) {
            const builtIns = ['require', 'assert', 'revert', 'keccak256', 'sha256', 'sha3',
                'ripemd160', 'ecrecover', 'addmod', 'mulmod', 'selfdestruct',
                'blockhash', 'gasleft', 'type', 'abi', 'push', 'pop', 'transfer', 'send', 'call',
                'delegatecall', 'staticcall', 'encode', 'encodePacked',
                'encodeWithSelector', 'encodeWithSignature', 'decode', 'emit', 'new', 'delete'];
            return builtIns.includes(name);
        }

        isBuiltInType(name) {
            if (/^I[A-Z]/.test(name)) return true;
            const skipTypes = ['SafeERC20', 'SafeMath', 'Address', 'Strings', 'Math',
                'ECDSA', 'MerkleProof', 'EnumerableSet', 'EnumerableMap', 'Error', 'Panic', 'Console'];
            return skipTypes.includes(name);
        }

        removeBlock(block) {
            if (!block) return;

            const blockId = block.id;

            // Don't allow removing the main function
            if (block.classList.contains('block-main')) {
                return;
            }

            // Animate removal
            block.classList.add('removing');

            // Remove associated arrows
            if (typeof arrowManager !== 'undefined' && arrowManager) {
                arrowManager.removeArrowsForBlock(blockId);
            }

            // Remove from displayed blocks
            this.displayedBlocks.delete(blockId);

            // Notify extension
            vscode.postMessage({
                command: 'blockRemoved',
                blockId: blockId
            });

            // Remove from DOM after animation
            setTimeout(() => {
                block.remove();

                // Update arrows
                if (typeof updateAllArrows === 'function') {
                    updateAllArrows();
                }
            }, 200);
        }

        highlightExistingBlock(blockId) {
            const block = document.getElementById(blockId);
            if (!block) return false;
            
            // Scroll into view and flash
            block.scrollIntoView({ behavior: 'smooth', block: 'center' });
            block.style.transition = 'box-shadow 0.3s ease';
            block.style.boxShadow = '0 0 0 3px rgba(88, 166, 255, 0.6)';
            
            setTimeout(() => {
                block.style.boxShadow = '';
            }, 1500);
            
            return true;
        }

        markTokensAsImported(blockId) {
            if (!blockId) return;
            
            const name = blockId.split('-').slice(1).join('-');
            document.querySelectorAll(\`.importable-token[data-name="\${name}"]\`).forEach(token => {
                token.classList.remove('importable-token');
                token.removeAttribute('data-importable');
            });
        }

        escapeHtml(text) {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

    }

    // Initialize import manager
    let importManager = null;
    document.addEventListener('DOMContentLoaded', () => {
        importManager = new ImportManager();
    });
    `;
}
