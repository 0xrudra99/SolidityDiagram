import * as vscode from 'vscode';
import { SolidityDiagramProvider } from './renderer/webviewProvider';
import { FunctionAnalyzer } from './analyzer/functionAnalyzer';
import { SolidityParser } from './parser/solidityParser';

export function activate(context: vscode.ExtensionContext) {
    console.log('Solidity Diagram extension is now active');

    const parser = new SolidityParser();
    const analyzer = new FunctionAnalyzer(parser);
    const diagramProvider = new SolidityDiagramProvider(context.extensionUri, analyzer);

    const disposable = vscode.commands.registerCommand(
        'solidity-diagram.generateDiagram',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const document = editor.document;
            // Check for solidity language ID or .sol file extension
            const isSolidity = document.languageId === 'solidity' || 
                               document.fileName.endsWith('.sol');
            if (!isSolidity) {
                vscode.window.showErrorMessage('This command only works with Solidity files (.sol)');
                return;
            }

            const position = editor.selection.active;
            const sourceCode = document.getText();
            const filePath = document.uri.fsPath;

            try {
                await diagramProvider.showDiagram(sourceCode, filePath, position);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to generate diagram: ${message}`);
            }
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
