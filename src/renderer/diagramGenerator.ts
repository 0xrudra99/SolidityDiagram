import {
    FunctionAnalysis,
    FunctionInfo,
    FunctionCallInfo,
    TypeReference,
    StructInfo,
    EnumInfo,
    CodeBlockData
} from '../types';
import { SyntaxHighlighter } from './syntaxHighlight';
import { generateCanvasControllerScript, generateCanvasStyles } from './canvasController';
import { generateDraggableBlocksScript } from './draggableBlocks';
import { generateArrowManagerScript, ArrowDefinition } from './arrowManager';
import { generateImportManagerScript } from './importManager';

interface CodeBlock {
    id: string;
    title: string;
    subtitle?: string;
    sourceCode: string;
    category: 'main' | 'struct' | 'enum' | 'function' | 'statevar';
    filePath: string;
    startLine: number;
    position: { x: number; y: number };
}

export class DiagramGenerator {
    private highlighter: SyntaxHighlighter;
    private displayedBlocks: Set<string>;
    private stateVariableNames: Set<string>;

    constructor() {
        this.highlighter = new SyntaxHighlighter();
        this.displayedBlocks = new Set();
        this.stateVariableNames = new Set();
    }

    /**
     * Set the state variable names for the current contract.
     * These will be marked as importable in the highlighted code.
     */
    setStateVariables(names: Set<string>): void {
        this.stateVariableNames = names;
    }

    /**
     * Generate the complete HTML diagram with Miro-style canvas
     */
    generate(analysis: FunctionAnalysis): string {
        const blocks = this.createCodeBlocks(analysis);
        const arrows = this.createArrows(analysis, blocks);
        
        // Track displayed blocks for import detection
        this.displayedBlocks = new Set(blocks.map(b => b.id));

        return this.renderHtml(blocks, arrows, analysis);
    }

    /**
     * Create code blocks from the analysis with initial positions
     * Layout: structs/enums on left, main function center, inner functions on right
     */
    private createCodeBlocks(analysis: FunctionAnalysis): CodeBlock[] {
        const blocks: CodeBlock[] = [];
        
        // Layout constants
        const LEFT_X = 50;
        const CENTER_X = 450;
        const RIGHT_X = 900;
        const START_Y = 80;
        const VERTICAL_GAP = 40;
        
        // Estimate block heights based on line count
        const estimateHeight = (source: string): number => {
            const lines = source.split('\n').length;
            return Math.min(60 + lines * 22, 400); // cap at 400px
        };

        // Main function block - center
        blocks.push({
            id: 'main-function',
            title: `function ${analysis.function.name}`,
            subtitle: this.getFunctionSignature(analysis.function),
            sourceCode: analysis.function.fullSource,
            category: 'main',
            filePath: analysis.function.filePath,
            startLine: analysis.function.location.start.line,
            position: { x: CENTER_X, y: START_Y }
        });

        // Type reference blocks (structs and enums) - left side, stacked vertically
        let leftY = START_Y;
        for (const typeRef of analysis.referencedTypes) {
            if (typeRef.definition) {
                if (typeRef.kind === 'struct') {
                    const struct = typeRef.definition as StructInfo;
                    const height = estimateHeight(struct.fullSource);
                    blocks.push({
                        id: `struct-${struct.name}`,
                        title: `struct ${struct.name}`,
                        sourceCode: struct.fullSource,
                        category: 'struct',
                        filePath: struct.filePath,
                        startLine: struct.location.start.line,
                        position: { x: LEFT_X, y: leftY }
                    });
                    leftY += height + VERTICAL_GAP;
                } else if (typeRef.kind === 'enum') {
                    const enumDef = typeRef.definition as EnumInfo;
                    const height = estimateHeight(enumDef.fullSource);
                    blocks.push({
                        id: `enum-${enumDef.name}`,
                        title: `enum ${enumDef.name}`,
                        sourceCode: enumDef.fullSource,
                        category: 'enum',
                        filePath: enumDef.filePath,
                        startLine: enumDef.location.start.line,
                        position: { x: LEFT_X, y: leftY }
                    });
                    leftY += height + VERTICAL_GAP;
                }
            }
        }

        // Inner function call blocks - right side, stacked vertically
        // Show ALL calls (both resolved and unresolved/external)
        let rightY = START_Y;
        const seenCalls = new Set<string>();
        
        for (const call of analysis.innerCalls) {
            // Use expression as unique key
            const callKey = call.expression;
            if (seenCalls.has(callKey)) continue;
            seenCalls.add(callKey);

            if (call.resolvedFunction) {
                // Resolved local function - show full source
                const height = estimateHeight(call.resolvedFunction.fullSource);
                blocks.push({
                    id: `function-${call.name}`,
                    title: `function ${call.name}`,
                    subtitle: this.getFunctionSignature(call.resolvedFunction),
                    sourceCode: call.resolvedFunction.fullSource,
                    category: 'function',
                    filePath: call.resolvedFunction.filePath,
                    startLine: call.resolvedFunction.location.start.line,
                    position: { x: RIGHT_X, y: rightY }
                });
                rightY += height + VERTICAL_GAP;
            } else {
                // Unresolved/external call - show stub
                const stubSource = `// External/Interface call\n// ${call.expression}(...)\n\n// Definition not found in workspace.\n// Likely from an imported interface,\n// library, or external contract.`;
                blocks.push({
                    id: `external-${call.name}-${call.location.start.line}`,
                    title: call.expression,
                    subtitle: '(external)',
                    sourceCode: stubSource,
                    category: 'function',
                    filePath: analysis.function.filePath,
                    startLine: call.location.start.line,
                    position: { x: RIGHT_X, y: rightY }
                });
                rightY += 160 + VERTICAL_GAP;
            }
        }

        return blocks;
    }

    /**
     * Create arrow definitions connecting blocks
     */
    private createArrows(analysis: FunctionAnalysis, blocks: CodeBlock[]): ArrowDefinition[] {
        const arrows: ArrowDefinition[] = [];
        const blockIds = new Set(blocks.map(b => b.id));
        let arrowId = 0;
        const seenArrows = new Set<string>();

        // Create arrows from main function to ALL inner function calls
        for (const call of analysis.innerCalls) {
            // Determine target block ID
            let targetId: string;
            if (call.resolvedFunction) {
                targetId = `function-${call.name}`;
            } else {
                targetId = `external-${call.name}-${call.location.start.line}`;
            }

            // Skip if we've already added an arrow to this target from the same source line
            const arrowKey = `${call.location.start.line}-${targetId}`;
            if (seenArrows.has(arrowKey)) continue;
            seenArrows.add(arrowKey);

            if (blockIds.has(targetId)) {
                arrows.push({
                    id: `arrow-${arrowId++}`,
                    sourceBlockId: 'main-function',
                    sourceLine: call.location.start.line,
                    targetBlockId: targetId,
                    type: 'function',
                    label: call.expression
                });
            }
        }

        // Create arrows from main function to struct references
        for (const typeRef of analysis.referencedTypes) {
            if (typeRef.kind === 'struct' && typeRef.definition) {
                const targetId = `struct-${typeRef.name.split('.').pop()}`;
                if (blockIds.has(targetId)) {
                    // Find the first line that references this type
                    const refLine = this.findTypeReferenceLine(
                        analysis.function.fullSource,
                        typeRef.name,
                        analysis.function.location.start.line
                    );
                    arrows.push({
                        id: `arrow-${arrowId++}`,
                        sourceBlockId: 'main-function',
                        sourceLine: refLine,
                        targetBlockId: targetId,
                        type: 'struct'
                    });
                }
            } else if (typeRef.kind === 'enum' && typeRef.definition) {
                const targetId = `enum-${typeRef.name.split('.').pop()}`;
                if (blockIds.has(targetId)) {
                    const refLine = this.findTypeReferenceLine(
                        analysis.function.fullSource,
                        typeRef.name,
                        analysis.function.location.start.line
                    );
                    arrows.push({
                        id: `arrow-${arrowId++}`,
                        sourceBlockId: 'main-function',
                        sourceLine: refLine,
                        targetBlockId: targetId,
                        type: 'enum'
                    });
                }
            }
        }

        return arrows;
    }

    /**
     * Find the line number where a type is first referenced
     */
    private findTypeReferenceLine(source: string, typeName: string, startLine: number): number {
        const lines = source.split('\n');
        const simpleName = typeName.split('.').pop() || typeName;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(simpleName)) {
                return startLine + i;
            }
        }
        return startLine;
    }

    /**
     * Get a compact function signature
     */
    private getFunctionSignature(func: FunctionInfo): string {
        const params = func.parameters.map(p => `${p.typeName} ${p.name || ''}`).join(', ');
        const returns = func.returnParameters.length > 0
            ? ` returns (${func.returnParameters.map(p => p.typeName).join(', ')})`
            : '';
        return `(${params})${returns}`;
    }

    /**
     * Render the complete HTML page with Miro-style canvas
     */
    private renderHtml(blocks: CodeBlock[], arrows: ArrowDefinition[], analysis: FunctionAnalysis): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Function Diagram: ${analysis.function.name}</title>
    <style>
        ${generateCanvasStyles()}
        ${this.highlighter.getStyles()}
    </style>
</head>
<body>
    <!-- Header -->
    <div class="canvas-header">
        <h1>Function Diagram</h1>
        <div class="function-name">${this.escapeHtml(analysis.function.name)}</div>
    </div>

    <!-- Canvas Controls -->
    <div class="canvas-controls">
        <button onclick="canvasController && canvasController.resetView()">Reset View</button>
        <button onclick="canvasController && canvasController.fitToView()">Fit to View</button>
        <button onclick="draggableManager && draggableManager.relayout()">Re-layout</button>
        <span id="zoom-indicator">100%</span>
    </div>

    <!-- Infinite Canvas -->
    <div id="infinite-canvas">
        <!-- Canvas Content (transformed container) -->
        <div id="canvas-content">
            ${blocks.map(block => this.renderCodeBlock(block)).join('\n')}
        </div>
    </div>

    <!-- SVG Arrows Layer -->
    <svg id="arrows-svg"></svg>

    <script>
        const vscode = acquireVsCodeApi();

        function goToSource(filePath, line) {
            vscode.postMessage({
                command: 'goToSource',
                filePath: filePath,
                line: line
            });
        }

        ${generateCanvasControllerScript()}
        ${generateDraggableBlocksScript()}
        ${generateArrowManagerScript()}
        ${generateImportManagerScript()}

        // Initialize arrows after everything is loaded
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                const arrows = ${JSON.stringify(arrows)};
                if (typeof setArrowsFromAnalysis === 'function') {
                    setArrowsFromAnalysis(arrows);
                }
            }, 200);
        });
    </script>
</body>
</html>`;
    }

    /**
     * Render a single code block
     */
    private renderCodeBlock(block: CodeBlock): string {
        const highlightedCode = this.highlighter.highlight(block.sourceCode, { 
            showLineNumbers: true,
            blockId: block.id,
            startLineNumber: block.startLine,
            displayedBlocks: this.displayedBlocks,
            enableImport: true,  // Enable Cmd+Click import on tokens
            stateVariables: this.stateVariableNames  // Pass state variable names for import
        });
        
        const categoryClass = `block-${block.category}`;
        const mainClass = block.category === 'main' ? 'block-main' : '';
        
        // Add close button for non-main blocks
        const closeButton = block.category !== 'main' 
            ? '<button class="block-close-btn" title="Remove block">&times;</button>'
            : '';

        return `
        <div class="code-block-wrapper ${categoryClass} ${mainClass}" 
             id="${block.id}" 
             data-file="${this.escapeHtml(block.filePath)}" 
             data-line="${block.startLine}"
             data-x="${block.position.x}"
             data-y="${block.position.y}"
             style="left: ${block.position.x}px; top: ${block.position.y}px;">
            ${closeButton}
            <div class="block-header">
                <span class="block-title">${this.escapeHtml(block.title)}</span>
                ${block.subtitle ? `<span class="block-subtitle">${this.escapeHtml(block.subtitle)}</span>` : ''}
            </div>
            <div class="code-block">
                ${highlightedCode}
            </div>
            <div class="block-footer">
                <button class="goto-btn" onclick="goToSource('${this.escapeHtml(block.filePath)}', ${block.startLine})">
                    Go to source
                </button>
            </div>
            <!-- Resize handles -->
            <div class="resize-handle resize-handle-e" data-resize="e"></div>
            <div class="resize-handle resize-handle-s" data-resize="s"></div>
            <div class="resize-handle resize-handle-se" data-resize="se"></div>
        </div>`;
    }

    /**
     * Escape HTML characters
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
