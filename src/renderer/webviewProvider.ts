import * as vscode from 'vscode';
import { FunctionAnalyzer } from '../analyzer/functionAnalyzer';
import { DiagramGenerator } from './diagramGenerator';
import { TypeResolver } from '../analyzer/typeResolver';
import { CallGraphBuilder } from '../analyzer/callGraphBuilder';
import { StateVariableResolver } from '../analyzer/stateVariableResolver';
import { InheritanceResolver } from '../analyzer/inheritanceResolver';
import { SolidityParser } from '../parser/solidityParser';
import { 
    FunctionAnalysis, 
    CodeBlockData, 
    ArrowData,
    ImportRequest,
    ImportResponse,
    ParsedFile,
    StructInfo,
    EnumInfo,
    StateVariableInfo,
    ContractInfo,
    ImplementationInfo
} from '../types';

export class SolidityDiagramProvider {
    private extensionUri: vscode.Uri;
    private analyzer: FunctionAnalyzer;
    private diagramGenerator: DiagramGenerator;
    private currentPanel: vscode.WebviewPanel | undefined;
    
    // Context for resolving imports
    private parser: SolidityParser;
    private typeResolver: TypeResolver;
    private callGraphBuilder: CallGraphBuilder;
    private stateVariableResolver: StateVariableResolver;
    private inheritanceResolver: InheritanceResolver;
    private currentFilePath: string = '';
    private currentContractName: string = '';
    private workspaceFilesCache: Map<string, ParsedFile> = new Map();
    private displayedBlocks: Set<string> = new Set();

    constructor(extensionUri: vscode.Uri, analyzer: FunctionAnalyzer) {
        this.extensionUri = extensionUri;
        this.analyzer = analyzer;
        this.diagramGenerator = new DiagramGenerator();
        
        // Initialize resolvers for on-demand import
        this.parser = new SolidityParser();
        this.typeResolver = new TypeResolver(this.parser);
        this.callGraphBuilder = new CallGraphBuilder(this.parser);
        this.stateVariableResolver = new StateVariableResolver(this.parser);
        this.inheritanceResolver = new InheritanceResolver();
    }

    /**
     * Show the diagram for a function at the given position
     */
    async showDiagram(
        sourceCode: string,
        filePath: string,
        position: vscode.Position
    ): Promise<void> {
        // Analyze the function
        const analysis = await this.analyzer.analyze(sourceCode, filePath, position);

        if (!analysis) {
            vscode.window.showWarningMessage(
                'No function found at cursor position. Please place your cursor inside a function.'
            );
            return;
        }

        // Create or show the webview panel
        if (this.currentPanel) {
            this.currentPanel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.currentPanel = vscode.window.createWebviewPanel(
                'solidityDiagram',
                `Diagram: ${analysis.function.name}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.extensionUri]
                }
            );

            // Handle panel disposal
            this.currentPanel.onDidDispose(() => {
                this.currentPanel = undefined;
            });

            // Handle messages from the webview
            this.currentPanel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'goToSource':
                            await this.goToSource(message.filePath, message.line);
                            break;
                        
                        case 'importRequest':
                            await this.handleImportRequest(message as ImportRequest);
                            break;
                        
                        case 'findImplementations':
                            await this.handleFindImplementations(message);
                            break;
                        
                        case 'selectImplementation':
                            await this.handleSelectImplementation(message);
                            break;
                        
                        case 'blockRemoved':
                            // Remove from displayed blocks set
                            this.displayedBlocks.delete(message.blockId);
                            break;
                    }
                }
            );
        }

        // Store context for import resolution
        this.currentFilePath = filePath;
        this.workspaceFilesCache = await this.getWorkspaceFiles();
        
        // Build inheritance graph for implementation resolution
        this.inheritanceResolver.buildInheritanceGraph(this.workspaceFilesCache);
        
        // Find the contract containing this function and extract state variable names
        const currentContract = this.stateVariableResolver.findContractForFunction(
            analysis.function,
            this.workspaceFilesCache
        );
        
        if (currentContract) {
            this.currentContractName = currentContract.name;
            // Extract state variable names and pass to diagram generator
            const stateVarNames = new Set(
                currentContract.stateVariables.map(sv => sv.name)
            );
            this.diagramGenerator.setStateVariables(stateVarNames);
        } else {
            this.currentContractName = '';
            this.diagramGenerator.setStateVariables(new Set());
        }
        
        // Track displayed blocks
        this.displayedBlocks = this.extractDisplayedBlocks(analysis);

        // Update the panel title and content
        this.currentPanel.title = `Diagram: ${analysis.function.name}`;
        this.currentPanel.webview.html = this.getWebviewContent(analysis);
    }

    /**
     * Extract the set of displayed block IDs from an analysis
     */
    private extractDisplayedBlocks(analysis: FunctionAnalysis): Set<string> {
        const blocks = new Set<string>();
        
        // Main function
        blocks.add('main-function');
        
        // Referenced types
        for (const typeRef of analysis.referencedTypes) {
            if (typeRef.definition) {
                if (typeRef.kind === 'struct') {
                    blocks.add(`struct-${typeRef.name.split('.').pop()}`);
                } else if (typeRef.kind === 'enum') {
                    blocks.add(`enum-${typeRef.name.split('.').pop()}`);
                }
            }
        }
        
        // Inner function calls
        for (const call of analysis.innerCalls) {
            if (call.resolvedFunction) {
                blocks.add(`function-${call.name}`);
            }
        }
        
        return blocks;
    }

    /**
     * Handle import request from webview
     */
    private async handleImportRequest(request: ImportRequest): Promise<void> {
        if (!this.currentPanel) return;

        const requestId = `${request.kind}-${request.name}-${Date.now()}`;
        
        try {
            // Refresh workspace files cache
            this.workspaceFilesCache = await this.getWorkspaceFiles();
            
            let response: ImportResponse;
            
            if (request.kind === 'function') {
                response = await this.resolveFunction(request, requestId);
            } else if (request.kind === 'statevar') {
                response = await this.resolveStateVariable(request, requestId);
            } else {
                // 'struct' or 'enum' - we need to try both since we don't know which
                response = await this.resolveType(request, requestId);
            }
            
            // Track newly added block
            if (response.success && response.block) {
                this.displayedBlocks.add(response.block.id);
            }
            
            // Send response back to webview
            this.currentPanel.webview.postMessage(response);
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.currentPanel.webview.postMessage({
                command: 'importResponse',
                success: false,
                requestId,
                error: errorMessage
            } as ImportResponse);
        }
    }

    /**
     * Resolve a function definition and create block data
     */
    private async resolveFunction(request: ImportRequest, requestId: string): Promise<ImportResponse> {
        const funcInfo = this.callGraphBuilder.resolveSingleFunction(
            request.name,
            this.workspaceFilesCache
        );
        
        if (!funcInfo) {
            return {
                command: 'importResponse',
                success: false,
                requestId,
                error: `Function "${request.name}" not found in workspace`
            };
        }
        
        // Create block data
        const blockId = `function-${request.name}`;
        const block: CodeBlockData = {
            id: blockId,
            title: `function ${funcInfo.name}`,
            subtitle: this.getFunctionSignature(funcInfo),
            sourceCode: funcInfo.fullSource,
            category: 'function',
            filePath: funcInfo.filePath,
            startLine: funcInfo.location.start.line,
            position: { x: 0, y: 0 } // Will be calculated in webview
        };
        
        // Create arrow from source to new block
        const arrow: ArrowData = {
            id: `arrow-import-${Date.now()}`,
            sourceBlockId: request.sourceBlockId,
            sourceLine: request.sourceLine,
            targetBlockId: blockId,
            type: 'function',
            label: request.name
        };
        
        return {
            command: 'importResponse',
            success: true,
            requestId,
            block,
            arrows: [arrow]
        };
    }

    /**
     * Resolve a type (struct or enum) definition and create block data
     */
    private async resolveType(request: ImportRequest, requestId: string): Promise<ImportResponse> {
        const typeRef = this.typeResolver.resolveSingleType(
            request.name,
            this.workspaceFilesCache
        );
        
        if (!typeRef || !typeRef.definition) {
            return {
                command: 'importResponse',
                success: false,
                requestId,
                error: `Type "${request.name}" not found in workspace`
            };
        }
        
        let block: CodeBlockData;
        let arrowType: 'struct' | 'enum';
        
        if (typeRef.kind === 'struct') {
            const structDef = typeRef.definition as StructInfo;
            block = {
                id: `struct-${structDef.name}`,
                title: `struct ${structDef.name}`,
                sourceCode: structDef.fullSource,
                category: 'struct',
                filePath: structDef.filePath,
                startLine: structDef.location.start.line,
                position: { x: 0, y: 0 }
            };
            arrowType = 'struct';
        } else {
            const enumDef = typeRef.definition as EnumInfo;
            block = {
                id: `enum-${enumDef.name}`,
                title: `enum ${enumDef.name}`,
                sourceCode: enumDef.fullSource,
                category: 'enum',
                filePath: enumDef.filePath,
                startLine: enumDef.location.start.line,
                position: { x: 0, y: 0 }
            };
            arrowType = 'enum';
        }
        
        // Create arrow
        const arrow: ArrowData = {
            id: `arrow-import-${Date.now()}`,
            sourceBlockId: request.sourceBlockId,
            sourceLine: request.sourceLine,
            targetBlockId: block.id,
            type: arrowType
        };
        
        return {
            command: 'importResponse',
            success: true,
            requestId,
            block,
            arrows: [arrow]
        };
    }

    /**
     * Resolve a state variable definition and create block data
     */
    private async resolveStateVariable(request: ImportRequest, requestId: string): Promise<ImportResponse> {
        const stateVar = this.stateVariableResolver.resolveStateVariable(
            request.name,
            this.currentContractName,
            this.workspaceFilesCache
        );
        
        if (!stateVar) {
            return {
                command: 'importResponse',
                success: false,
                requestId,
                error: `State variable "${request.name}" not found in workspace`
            };
        }
        
        // Create block data for state variable
        const blockId = `statevar-${stateVar.name}`;
        const block: CodeBlockData = {
            id: blockId,
            title: stateVar.name,
            subtitle: `${stateVar.visibility} ${stateVar.typeName}`,
            sourceCode: stateVar.fullSource,
            category: 'statevar',
            filePath: stateVar.filePath,
            startLine: stateVar.location.start.line,
            position: { x: 0, y: 0 }
        };
        
        // Create arrow
        const arrow: ArrowData = {
            id: `arrow-import-${Date.now()}`,
            sourceBlockId: request.sourceBlockId,
            sourceLine: request.sourceLine,
            targetBlockId: blockId,
            type: 'statevar'
        };
        
        return {
            command: 'importResponse',
            success: true,
            requestId,
            block,
            arrows: [arrow]
        };
    }

    /**
     * Handle finding implementations for an interface method
     */
    private async handleFindImplementations(message: {
        interfaceName: string;
        methodName: string;
        sourceBlockId: string;
        sourceLine: number;
    }): Promise<void> {
        if (!this.currentPanel) return;

        // Refresh inheritance graph
        this.workspaceFilesCache = await this.getWorkspaceFiles();
        this.inheritanceResolver.buildInheritanceGraph(this.workspaceFilesCache);

        // Find implementations
        let implementations = this.inheritanceResolver.findImplementations(
            message.interfaceName,
            message.methodName
        );

        // If no implementations found via interface, try direct search
        if (implementations.length === 0) {
            implementations = this.inheritanceResolver.findContractsWithMethod(message.methodName);
        }

        if (implementations.length === 0) {
            this.currentPanel.webview.postMessage({
                command: 'implementationsResult',
                success: false,
                error: `No implementations found for ${message.interfaceName}.${message.methodName}`
            });
            return;
        }

        if (implementations.length === 1) {
            // Single implementation - import directly
            await this.importImplementation(
                implementations[0],
                message.sourceBlockId,
                message.sourceLine
            );
        } else {
            // Multiple implementations - show picker
            this.currentPanel.webview.postMessage({
                command: 'showImplementationPicker',
                implementations: implementations.map(impl => ({
                    contractName: impl.contractName,
                    contractKind: impl.contractKind,
                    functionName: impl.functionInfo.name,
                    filePath: impl.filePath,
                    line: impl.functionInfo.location.start.line,
                    isInherited: impl.isInherited,
                    inheritanceChain: impl.inheritanceChain,
                    signature: this.getFunctionSignature(impl.functionInfo)
                })),
                sourceBlockId: message.sourceBlockId,
                sourceLine: message.sourceLine
            });
        }
    }

    /**
     * Handle selection of an implementation from the picker
     */
    private async handleSelectImplementation(message: {
        contractName: string;
        methodName: string;
        sourceBlockId: string;
        sourceLine: number;
    }): Promise<void> {
        if (!this.currentPanel) return;

        // Find the specific implementation
        const implementations = this.inheritanceResolver.findContractsWithMethod(message.methodName);
        const selected = implementations.find(impl => impl.contractName === message.contractName);

        if (selected) {
            await this.importImplementation(selected, message.sourceBlockId, message.sourceLine);
        }
    }

    /**
     * Import a specific implementation into the diagram
     */
    private async importImplementation(
        impl: ImplementationInfo,
        sourceBlockId: string,
        sourceLine: number
    ): Promise<void> {
        if (!this.currentPanel) return;

        const blockId = `function-${impl.contractName}-${impl.functionInfo.name}`;
        
        const block: CodeBlockData = {
            id: blockId,
            title: `${impl.contractName}.${impl.functionInfo.name}`,
            subtitle: this.getFunctionSignature(impl.functionInfo),
            sourceCode: impl.functionInfo.fullSource,
            category: 'function',
            filePath: impl.filePath,
            startLine: impl.functionInfo.location.start.line,
            position: { x: 0, y: 0 }
        };

        const arrow: ArrowData = {
            id: `arrow-impl-${Date.now()}`,
            sourceBlockId,
            sourceLine,
            targetBlockId: blockId,
            type: 'function',
            label: `${impl.contractName}.${impl.functionInfo.name}`
        };

        this.displayedBlocks.add(blockId);

        this.currentPanel.webview.postMessage({
            command: 'importResponse',
            success: true,
            requestId: `impl-${Date.now()}`,
            block,
            arrows: [arrow]
        } as ImportResponse);
    }

    /**
     * Get a compact function signature
     */
    private getFunctionSignature(func: { parameters: Array<{ typeName: string; name?: string }>; returnParameters: Array<{ typeName: string }> }): string {
        const params = func.parameters.map(p => `${p.typeName} ${p.name || ''}`).join(', ');
        const returns = func.returnParameters.length > 0
            ? ` returns (${func.returnParameters.map(p => p.typeName).join(', ')})`
            : '';
        return `(${params})${returns}`;
    }

    /**
     * Get all Solidity files in the workspace
     */
    private async getWorkspaceFiles(): Promise<Map<string, ParsedFile>> {
        const files = new Map<string, ParsedFile>();
        
        const solFiles = await vscode.workspace.findFiles('**/*.sol', '**/node_modules/**');
        
        for (const uri of solFiles) {
            try {
                const document = await vscode.workspace.openTextDocument(uri);
                const sourceCode = document.getText();
                const parsed = this.parser.parse(sourceCode, uri.fsPath);
                files.set(uri.fsPath, parsed);
            } catch (error) {
                console.warn(`Failed to parse ${uri.fsPath}:`, error);
            }
        }
        
        return files;
    }

    /**
     * Navigate to a source file at a specific line
     */
    private async goToSource(filePath: string, line: number): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
            
            const position = new vscode.Position(line - 1, 0);
            const range = new vscode.Range(position, position);
            
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }

    /**
     * Generate the webview HTML content
     */
    private getWebviewContent(analysis: FunctionAnalysis): string {
        return this.diagramGenerator.generate(analysis);
    }

    /**
     * Refresh the current diagram
     */
    async refresh(sourceCode: string, filePath: string, position: vscode.Position): Promise<void> {
        if (!this.currentPanel) {
            return;
        }

        const analysis = await this.analyzer.analyze(sourceCode, filePath, position);
        if (analysis) {
            // Refresh workspace files and state variables
            this.workspaceFilesCache = await this.getWorkspaceFiles();
            const currentContract = this.stateVariableResolver.findContractForFunction(
                analysis.function,
                this.workspaceFilesCache
            );
            
            if (currentContract) {
                this.currentContractName = currentContract.name;
                const stateVarNames = new Set(
                    currentContract.stateVariables.map(sv => sv.name)
                );
                this.diagramGenerator.setStateVariables(stateVarNames);
            }
            
            this.currentPanel.title = `Diagram: ${analysis.function.name}`;
            this.currentPanel.webview.html = this.getWebviewContent(analysis);
        }
    }

    /**
     * Dispose of the current panel
     */
    dispose(): void {
        if (this.currentPanel) {
            this.currentPanel.dispose();
            this.currentPanel = undefined;
        }
    }
}
