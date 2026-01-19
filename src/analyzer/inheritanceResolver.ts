import {
    ParsedFile,
    ContractInfo,
    FunctionInfo,
    ImplementationInfo
} from '../types';

/**
 * Resolves interface-to-implementation mappings across a workspace.
 * Builds inheritance graphs and finds concrete implementations of interface methods.
 */
export class InheritanceResolver {
    // Map: contract name -> ContractInfo
    private contractMap: Map<string, ContractInfo> = new Map();
    
    // Map: contract name -> set of contracts that inherit from it
    private inheritedBy: Map<string, Set<string>> = new Map();
    
    // Map: contract name -> its full inheritance chain (linearized)
    private inheritanceChains: Map<string, string[]> = new Map();

    /**
     * Build the inheritance graph from all parsed files in the workspace
     */
    buildInheritanceGraph(workspaceFiles: Map<string, ParsedFile>): void {
        this.contractMap.clear();
        this.inheritedBy.clear();
        this.inheritanceChains.clear();

        // First pass: collect all contracts
        for (const [filePath, parsedFile] of workspaceFiles) {
            for (const contract of parsedFile.contracts) {
                this.contractMap.set(contract.name, contract);
            }
        }

        // Second pass: build inheritance relationships
        for (const [name, contract] of this.contractMap) {
            for (const baseName of contract.baseContracts) {
                if (!this.inheritedBy.has(baseName)) {
                    this.inheritedBy.set(baseName, new Set());
                }
                this.inheritedBy.get(baseName)!.add(name);
            }
        }

        // Third pass: compute linearized inheritance chains
        for (const [name, contract] of this.contractMap) {
            this.inheritanceChains.set(name, this.computeInheritanceChain(name));
        }
    }

    /**
     * Compute the full inheritance chain for a contract (C3 linearization simplified)
     */
    private computeInheritanceChain(contractName: string, visited: Set<string> = new Set()): string[] {
        if (visited.has(contractName)) {
            return []; // Avoid cycles
        }
        visited.add(contractName);

        const chain: string[] = [contractName];
        const contract = this.contractMap.get(contractName);
        
        if (contract) {
            for (const baseName of contract.baseContracts) {
                const baseChain = this.computeInheritanceChain(baseName, new Set(visited));
                for (const name of baseChain) {
                    if (!chain.includes(name)) {
                        chain.push(name);
                    }
                }
            }
        }

        return chain;
    }

    /**
     * Find all implementations of a method from an interface/contract.
     * 
     * @param interfaceName The interface or contract name (e.g., "IERC20")
     * @param methodName The method name (e.g., "transfer")
     * @returns Array of implementations found across the workspace
     */
    findImplementations(interfaceName: string, methodName: string): ImplementationInfo[] {
        const implementations: ImplementationInfo[] = [];
        
        // Get all contracts that inherit from this interface
        const implementingContracts = this.getImplementingContracts(interfaceName);

        for (const contractName of implementingContracts) {
            const contract = this.contractMap.get(contractName);
            if (!contract) continue;

            // Skip if this is also an interface (no implementation)
            if (contract.kind === 'interface') continue;

            // Find the method implementation in this contract or its inheritance chain
            const impl = this.findMethodInContract(contractName, methodName);
            if (impl) {
                implementations.push(impl);
            }
        }

        return implementations;
    }

    /**
     * Get all contracts that implement/inherit from a given interface/contract
     */
    getImplementingContracts(interfaceName: string): string[] {
        const result = new Set<string>();
        
        const collectInheritors = (name: string) => {
            const inheritors = this.inheritedBy.get(name);
            if (inheritors) {
                for (const inheritor of inheritors) {
                    result.add(inheritor);
                    collectInheritors(inheritor); // Recursive for deep inheritance
                }
            }
        };

        collectInheritors(interfaceName);
        return Array.from(result);
    }

    /**
     * Find a method implementation in a contract, traversing its inheritance chain
     */
    private findMethodInContract(contractName: string, methodName: string): ImplementationInfo | null {
        const chain = this.inheritanceChains.get(contractName) || [contractName];
        
        for (const name of chain) {
            const contract = this.contractMap.get(name);
            if (!contract) continue;

            // Skip interfaces - we want actual implementations
            if (contract.kind === 'interface') continue;

            // Find the method in this contract
            const func = contract.functions.find(f => f.name === methodName);
            if (func && func.body && func.body.trim() !== '') {
                // Found an implementation (has a body)
                return {
                    contractName: name,
                    contractKind: contract.kind,
                    functionInfo: func,
                    filePath: contract.filePath,
                    isInherited: name !== contractName,
                    inheritanceChain: chain
                };
            }
        }

        return null;
    }

    /**
     * Find all contracts that match a function signature (for when we don't know the interface)
     */
    findContractsWithMethod(methodName: string, paramCount?: number): ImplementationInfo[] {
        const implementations: ImplementationInfo[] = [];

        for (const [name, contract] of this.contractMap) {
            // Skip interfaces
            if (contract.kind === 'interface') continue;

            for (const func of contract.functions) {
                if (func.name === methodName) {
                    // Optionally filter by parameter count
                    if (paramCount !== undefined && func.parameters.length !== paramCount) {
                        continue;
                    }

                    // Only include if it has a body (actual implementation)
                    if (func.body && func.body.trim() !== '') {
                        implementations.push({
                            contractName: name,
                            contractKind: contract.kind,
                            functionInfo: func,
                            filePath: contract.filePath,
                            isInherited: false,
                            inheritanceChain: this.inheritanceChains.get(name) || [name]
                        });
                    }
                }
            }
        }

        return implementations;
    }

    /**
     * Get the interface definition for a given interface name
     */
    getInterfaceDefinition(interfaceName: string): ContractInfo | null {
        const contract = this.contractMap.get(interfaceName);
        if (contract && contract.kind === 'interface') {
            return contract;
        }
        return null;
    }

    /**
     * Check if a contract/interface exists in the workspace
     */
    hasContract(name: string): boolean {
        return this.contractMap.has(name);
    }

    /**
     * Get a contract by name
     */
    getContract(name: string): ContractInfo | null {
        return this.contractMap.get(name) || null;
    }

    /**
     * Get all interfaces in the workspace
     */
    getAllInterfaces(): ContractInfo[] {
        const interfaces: ContractInfo[] = [];
        for (const contract of this.contractMap.values()) {
            if (contract.kind === 'interface') {
                interfaces.push(contract);
            }
        }
        return interfaces;
    }

    /**
     * Get all concrete contracts (not interfaces) in the workspace
     */
    getAllConcreteContracts(): ContractInfo[] {
        const contracts: ContractInfo[] = [];
        for (const contract of this.contractMap.values()) {
            if (contract.kind !== 'interface') {
                contracts.push(contract);
            }
        }
        return contracts;
    }

    /**
     * Debug: Print the inheritance graph
     */
    debugPrint(): void {
        console.log('=== Contract Map ===');
        for (const [name, contract] of this.contractMap) {
            console.log(`${name} (${contract.kind}): inherits [${contract.baseContracts.join(', ')}]`);
        }
        
        console.log('\n=== Inherited By ===');
        for (const [name, inheritors] of this.inheritedBy) {
            console.log(`${name}: inherited by [${Array.from(inheritors).join(', ')}]`);
        }

        console.log('\n=== Inheritance Chains ===');
        for (const [name, chain] of this.inheritanceChains) {
            console.log(`${name}: ${chain.join(' -> ')}`);
        }
    }
}
