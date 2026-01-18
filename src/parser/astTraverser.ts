import { ASTNode } from '@solidity-parser/parser/dist/src/ast-types';

export type VisitorCallback = (node: ASTNode, parent: ASTNode | null) => boolean | void;

export interface ASTVisitor {
    [nodeType: string]: VisitorCallback;
}

/**
 * Utility class for traversing Solidity AST nodes
 */
export class ASTTraverser {
    /**
     * Traverse the AST and call visitor callbacks for matching node types
     */
    traverse(node: ASTNode, visitor: ASTVisitor, parent: ASTNode | null = null): void {
        // Call the visitor for this node type if it exists
        const callback = visitor[node.type];
        if (callback) {
            const shouldStop = callback(node, parent);
            if (shouldStop === true) {
                return;
            }
        }

        // Traverse child nodes
        this.traverseChildren(node, visitor);
    }

    /**
     * Traverse all children of a node
     */
    private traverseChildren(node: ASTNode, visitor: ASTVisitor): void {
        const nodeAny = node as any;
        const nodeType = node.type as string;

        // Handle different node types and their children
        switch (nodeType) {
            case 'SourceUnit':
                this.traverseArray(nodeAny.children, visitor, node);
                break;

            case 'ContractDefinition':
                this.traverseArray(nodeAny.baseContracts, visitor, node);
                this.traverseArray(nodeAny.subNodes, visitor, node);
                break;

            case 'FunctionDefinition':
                this.traverseArray(nodeAny.parameters, visitor, node);
                this.traverseArray(nodeAny.returnParameters, visitor, node);
                this.traverseArray(nodeAny.modifiers, visitor, node);
                if (nodeAny.body) {
                    this.traverse(nodeAny.body, visitor, node);
                }
                break;

            case 'ModifierDefinition':
                this.traverseArray(nodeAny.parameters, visitor, node);
                if (nodeAny.body) {
                    this.traverse(nodeAny.body, visitor, node);
                }
                break;

            case 'VariableDeclaration':
                if (nodeAny.typeName) {
                    this.traverse(nodeAny.typeName, visitor, node);
                }
                if (nodeAny.expression) {
                    this.traverse(nodeAny.expression, visitor, node);
                }
                break;

            case 'StructDefinition':
                this.traverseArray(nodeAny.members, visitor, node);
                break;

            case 'Block':
                this.traverseArray(nodeAny.statements, visitor, node);
                break;

            case 'IfStatement':
                this.traverse(nodeAny.condition, visitor, node);
                this.traverse(nodeAny.trueBody, visitor, node);
                if (nodeAny.falseBody) {
                    this.traverse(nodeAny.falseBody, visitor, node);
                }
                break;

            case 'WhileStatement':
            case 'DoWhileStatement':
                this.traverse(nodeAny.condition, visitor, node);
                this.traverse(nodeAny.body, visitor, node);
                break;

            case 'ForStatement':
                if (nodeAny.initExpression) {
                    this.traverse(nodeAny.initExpression, visitor, node);
                }
                if (nodeAny.conditionExpression) {
                    this.traverse(nodeAny.conditionExpression, visitor, node);
                }
                if (nodeAny.loopExpression) {
                    this.traverse(nodeAny.loopExpression, visitor, node);
                }
                this.traverse(nodeAny.body, visitor, node);
                break;

            case 'TryStatement':
                this.traverse(nodeAny.expression, visitor, node);
                this.traverseArray(nodeAny.returnParameters, visitor, node);
                this.traverse(nodeAny.body, visitor, node);
                this.traverseArray(nodeAny.catchClauses, visitor, node);
                break;

            case 'CatchClause':
                this.traverseArray(nodeAny.parameters, visitor, node);
                this.traverse(nodeAny.body, visitor, node);
                break;

            case 'ReturnStatement':
            case 'EmitStatement':
            case 'RevertStatement':
                if (nodeAny.expression) {
                    this.traverse(nodeAny.expression, visitor, node);
                }
                break;

            case 'ExpressionStatement':
                if (nodeAny.expression) {
                    this.traverse(nodeAny.expression, visitor, node);
                }
                break;

            case 'VariableDeclarationStatement':
                this.traverseArray(nodeAny.variables, visitor, node);
                if (nodeAny.initialValue) {
                    this.traverse(nodeAny.initialValue, visitor, node);
                }
                break;

            case 'FunctionCall':
                this.traverse(nodeAny.expression, visitor, node);
                this.traverseArray(nodeAny.arguments, visitor, node);
                this.traverseArray(nodeAny.names, visitor, node);
                break;

            case 'MemberAccess':
                this.traverse(nodeAny.expression, visitor, node);
                break;

            case 'IndexAccess':
                this.traverse(nodeAny.base, visitor, node);
                if (nodeAny.index) {
                    this.traverse(nodeAny.index, visitor, node);
                }
                break;

            case 'BinaryOperation':
            case 'Assignment':
                this.traverse(nodeAny.left, visitor, node);
                this.traverse(nodeAny.right, visitor, node);
                break;

            case 'UnaryOperation':
                this.traverse(nodeAny.subExpression, visitor, node);
                break;

            case 'Conditional':
                this.traverse(nodeAny.condition, visitor, node);
                this.traverse(nodeAny.trueExpression, visitor, node);
                this.traverse(nodeAny.falseExpression, visitor, node);
                break;

            case 'TupleExpression':
                this.traverseArray(nodeAny.components, visitor, node);
                break;

            case 'ArrayTypeName':
                this.traverse(nodeAny.baseTypeName, visitor, node);
                if (nodeAny.length) {
                    this.traverse(nodeAny.length, visitor, node);
                }
                break;

            case 'Mapping':
                this.traverse(nodeAny.keyType, visitor, node);
                this.traverse(nodeAny.valueType, visitor, node);
                break;

            case 'NewExpression':
                this.traverse(nodeAny.typeName, visitor, node);
                break;

            case 'ModifierInvocation':
                this.traverseArray(nodeAny.arguments, visitor, node);
                break;

            case 'InheritanceSpecifier':
                this.traverse(nodeAny.baseName, visitor, node);
                this.traverseArray(nodeAny.arguments, visitor, node);
                break;

            case 'UsingForDeclaration':
                if (nodeAny.typeName) {
                    this.traverse(nodeAny.typeName, visitor, node);
                }
                break;

            case 'StateVariableDeclaration':
                this.traverseArray(nodeAny.variables, visitor, node);
                if (nodeAny.initialValue) {
                    this.traverse(nodeAny.initialValue, visitor, node);
                }
                break;

            case 'EventDefinition':
                this.traverseArray(nodeAny.parameters, visitor, node);
                break;

            case 'ErrorDefinition':
                this.traverseArray(nodeAny.parameters, visitor, node);
                break;

            // Leaf nodes - no children to traverse
            case 'Identifier':
            case 'NumberLiteral':
            case 'StringLiteral':
            case 'BooleanLiteral':
            case 'HexLiteral':
            case 'ElementaryTypeName':
            case 'UserDefinedTypeName':
            case 'PragmaDirective':
            case 'ImportDirective':
            case 'EnumValue':
            case 'BreakStatement':
            case 'ContinueStatement':
            case 'PlaceholderStatement':
            case 'AssemblyBlock':
            case 'UncheckedStatement':
                // No children
                break;

            default:
                // Try to traverse any array or object properties that might be children
                for (const key of Object.keys(nodeAny)) {
                    const value = nodeAny[key];
                    if (Array.isArray(value)) {
                        this.traverseArray(value, visitor, node);
                    } else if (value && typeof value === 'object' && value.type) {
                        this.traverse(value, visitor, node);
                    }
                }
        }
    }

    /**
     * Traverse an array of nodes
     */
    private traverseArray(nodes: any[], visitor: ASTVisitor, parent: ASTNode): void {
        if (!nodes) return;
        for (const node of nodes) {
            if (node && typeof node === 'object' && node.type) {
                this.traverse(node, visitor, parent);
            }
        }
    }

    /**
     * Find all nodes of a specific type in the AST
     */
    findAll(node: ASTNode, nodeType: string): ASTNode[] {
        const results: ASTNode[] = [];
        this.traverse(node, {
            [nodeType]: (n) => {
                results.push(n);
            }
        });
        return results;
    }

    /**
     * Find the first node of a specific type in the AST
     */
    findFirst(node: ASTNode, nodeType: string): ASTNode | null {
        let result: ASTNode | null = null;
        this.traverse(node, {
            [nodeType]: (n) => {
                result = n;
                return true; // Stop traversal
            }
        });
        return result;
    }

    /**
     * Find a node at a specific line and column position
     */
    findAtPosition(node: ASTNode, line: number, column: number): ASTNode | null {
        let result: ASTNode | null = null;
        let smallestRange = Infinity;

        this.traverse(node, {
            FunctionDefinition: (n) => {
                const nodeAny = n as any;
                if (nodeAny.loc) {
                    const loc = nodeAny.loc;
                    if (
                        line >= loc.start.line &&
                        line <= loc.end.line &&
                        (line > loc.start.line || column >= loc.start.column) &&
                        (line < loc.end.line || column <= loc.end.column)
                    ) {
                        const range = (loc.end.line - loc.start.line) * 1000 + (loc.end.column - loc.start.column);
                        if (range < smallestRange) {
                            smallestRange = range;
                            result = n;
                        }
                    }
                }
            }
        });

        return result;
    }
}
