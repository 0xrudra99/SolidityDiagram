/**
 * Generates the client-side JavaScript for data flow visualization.
 * Handles hover/click interactions on variables to show data flow.
 */

export function generateDataFlowVisualizerScript(): string {
    return `
// ============ Data Flow Visualizer ============
// Provides on-demand visualization of data flow through hover/click

(function() {
    'use strict';

    // State
    let dataFlowGraph = null;
    let activeVariable = null;
    let tooltip = null;
    let isLocked = false;

    /**
     * Initialize data flow visualization with graph data
     */
    window.initDataFlow = function(graphData) {
        if (!graphData) return;
        
        // Convert serialized arrays back to Maps
        dataFlowGraph = {
            nodes: graphData.nodes || [],
            edges: graphData.edges || [],
            sinks: graphData.sinks || [],
            definitions: new Map(graphData.definitions || []),
            uses: new Map(graphData.uses || [])
        };

        // Set up event listeners on all flow-var elements
        setupEventListeners();
        
        console.log('Data flow visualization initialized with', dataFlowGraph.nodes.length, 'nodes');
    };

    /**
     * Set up event listeners for flow variables
     */
    function setupEventListeners() {
        const flowVars = document.querySelectorAll('.flow-var');
        
        flowVars.forEach(el => {
            el.addEventListener('mouseenter', handleMouseEnter);
            el.addEventListener('mouseleave', handleMouseLeave);
            el.addEventListener('click', handleClick);
        });

        // Click elsewhere to dismiss locked state
        document.addEventListener('click', (e) => {
            if (isLocked && !e.target.closest('.flow-var') && !e.target.closest('.flow-tooltip')) {
                clearHighlights();
                isLocked = false;
            }
        });

        // Keyboard escape to dismiss
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isLocked) {
                clearHighlights();
                isLocked = false;
            }
        });
    }

    /**
     * Handle mouse enter on a flow variable
     */
    function handleMouseEnter(e) {
        if (isLocked) return;
        
        const varName = e.target.dataset.var;
        if (!varName) return;

        activeVariable = varName;
        highlightVariable(varName);
        showTooltip(e.target, varName);
    }

    /**
     * Handle mouse leave on a flow variable
     */
    function handleMouseLeave(e) {
        if (isLocked) return;
        
        clearHighlights();
        hideTooltip();
        activeVariable = null;
    }

    /**
     * Handle click on a flow variable (locks the visualization)
     * NOTE: If Cmd/Ctrl is held, let the event propagate for import handling
     */
    function handleClick(e) {
        // If Cmd (Mac) or Ctrl (Windows/Linux) is held, this is an import action
        // Let it propagate to the import manager instead
        if (e.metaKey || e.ctrlKey) {
            return; // Don't stop propagation, let import manager handle it
        }
        
        e.stopPropagation();
        
        const varName = e.target.dataset.var;
        if (!varName) return;

        if (isLocked && activeVariable === varName) {
            // Clicking same variable - unlock
            clearHighlights();
            hideTooltip();
            isLocked = false;
            activeVariable = null;
        } else {
            // Lock on this variable
            clearHighlights();
            activeVariable = varName;
            highlightVariable(varName);
            showTooltip(e.target, varName, true);
            isLocked = true;
        }
    }

    /**
     * Highlight all occurrences of a variable and related lines
     */
    function highlightVariable(varName) {
        if (!dataFlowGraph) return;

        // Get definitions and uses for this variable
        const definitions = dataFlowGraph.definitions.get(varName) || [];
        const uses = dataFlowGraph.uses.get(varName) || [];

        // Highlight definition lines
        for (const def of definitions) {
            highlightLine(def.line, 'flow-highlight-def');
            markToken(varName, def.line, 'flow-definition');
        }

        // Highlight use lines
        for (const use of uses) {
            highlightLine(use.line, 'flow-highlight-use');
            markToken(varName, use.line, 'flow-use');
        }

        // Check if this variable flows to any sinks
        const relatedSinks = dataFlowGraph.sinks.filter(sink => 
            sink.inputVars.includes(varName)
        );

        for (const sink of relatedSinks) {
            highlightLine(sink.line, 'flow-highlight-sink');
        }

        // Also highlight all tokens with this variable name
        document.querySelectorAll(\`.flow-var[data-var="\${CSS.escape(varName)}"]\`).forEach(el => {
            if (!el.classList.contains('flow-definition') && !el.classList.contains('flow-use')) {
                el.classList.add('flow-use');
            }
        });
    }

    /**
     * Highlight a specific line
     */
    function highlightLine(lineNum, className) {
        // Find line elements across all blocks
        const lineEls = document.querySelectorAll(\`.code-line[data-line="\${lineNum}"]\`);
        lineEls.forEach(el => el.classList.add(className));
    }

    /**
     * Mark a specific token on a line
     */
    function markToken(varName, lineNum, className) {
        const selector = \`.code-line[data-line="\${lineNum}"] .flow-var[data-var="\${CSS.escape(varName)}"]\`;
        const tokens = document.querySelectorAll(selector);
        tokens.forEach(el => el.classList.add(className));
    }

    /**
     * Clear all highlights
     */
    function clearHighlights() {
        // Clear line highlights
        document.querySelectorAll('.flow-highlight-def, .flow-highlight-use, .flow-highlight-sink').forEach(el => {
            el.classList.remove('flow-highlight-def', 'flow-highlight-use', 'flow-highlight-sink');
        });

        // Clear token highlights
        document.querySelectorAll('.flow-definition, .flow-use, .flow-sink').forEach(el => {
            el.classList.remove('flow-definition', 'flow-use', 'flow-sink');
        });
    }

    /**
     * Show tooltip with flow information
     */
    function showTooltip(element, varName, locked = false) {
        if (!dataFlowGraph) return;

        // Remove existing tooltip
        hideTooltip();

        // Create tooltip element
        tooltip = document.createElement('div');
        tooltip.className = 'flow-tooltip';
        
        // Build tooltip content
        const definitions = dataFlowGraph.definitions.get(varName) || [];
        const uses = dataFlowGraph.uses.get(varName) || [];
        const relatedSinks = dataFlowGraph.sinks.filter(sink => 
            sink.inputVars.includes(varName)
        );

        // Get DeFi tag if present
        const defiTag = element.dataset.defiTag;
        
        let html = '<div class="flow-tooltip-header">';
        html += escapeHtml(varName);
        if (defiTag) {
            html += \` <span class="flow-tooltip-defi-tag \${defiTag}">\${formatDefiTag(defiTag)}</span>\`;
        }
        html += '</div>';

        // Definitions section
        if (definitions.length > 0) {
            html += '<div class="flow-tooltip-section">';
            html += '<div class="flow-tooltip-section-title">Defined at</div>';
            for (const def of definitions) {
                html += \`<div class="flow-tooltip-item">
                    <span class="line-ref">line \${def.line}</span>
                    <span class="flow-arrow">←</span>
                    <span>\${def.kind}</span>
                </div>\`;
            }
            html += '</div>';
        }

        // Uses section (limit to first 5)
        if (uses.length > 0) {
            html += '<div class="flow-tooltip-section">';
            html += '<div class="flow-tooltip-section-title">Used at</div>';
            const displayUses = uses.slice(0, 5);
            for (const use of displayUses) {
                html += \`<div class="flow-tooltip-item">
                    <span class="line-ref">line \${use.line}</span>
                </div>\`;
            }
            if (uses.length > 5) {
                html += \`<div class="flow-tooltip-item" style="color: #6c7086;">... and \${uses.length - 5} more</div>\`;
            }
            html += '</div>';
        }

        // Sinks section
        if (relatedSinks.length > 0) {
            html += '<div class="flow-tooltip-section">';
            html += '<div class="flow-tooltip-section-title">Flows to</div>';
            for (const sink of relatedSinks) {
                const sinkIcon = getSinkIcon(sink.kind);
                html += \`<div class="flow-tooltip-item">
                    <span>\${sinkIcon}</span>
                    <span class="line-ref">line \${sink.line}</span>
                    <span style="color: #a6adc8; font-size: 11px;">\${escapeHtml(truncate(sink.description, 40))}</span>
                </div>\`;
            }
            html += '</div>';
        }

        // DeFi risk hints
        if (defiTag) {
            const hints = getDefiRiskHint(defiTag, relatedSinks);
            if (hints.length > 0) {
                html += '<div class="flow-tooltip-section" style="border-top: 1px solid #45475a; padding-top: 8px; margin-top: 4px;">';
                for (const hint of hints) {
                    html += \`<div style="font-size: 11px; color: #f9e2af;">\${hint}</div>\`;
                }
                html += '</div>';
            }
        }

        if (locked) {
            html += '<div style="color: #6c7086; font-size: 10px; margin-top: 8px; text-align: center;">Press ESC or click elsewhere to dismiss</div>';
        }

        tooltip.innerHTML = html;
        document.body.appendChild(tooltip);

        // Find the parent code block wrapper to position outside of it
        const codeBlock = element.closest('.code-block-wrapper');
        const tooltipRect = tooltip.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        let left, top;

        if (codeBlock) {
            const blockRect = codeBlock.getBoundingClientRect();
            
            // Position to the right of the entire code block
            left = blockRect.right + 16;
            top = elementRect.top;

            // If tooltip would go off-screen to the right, position to the left of the block
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = blockRect.left - tooltipRect.width - 16;
            }

            // If still off-screen (block near left edge), position below the element
            if (left < 10) {
                left = Math.min(blockRect.right - tooltipRect.width, window.innerWidth - tooltipRect.width - 10);
                left = Math.max(10, left);
                top = elementRect.bottom + 12;
            }
        } else {
            // Fallback: position to the right of the element
            left = elementRect.right + 16;
            top = elementRect.top;
        }

        // Keep tooltip vertically in viewport
        if (top + tooltipRect.height > window.innerHeight - 10) {
            top = window.innerHeight - tooltipRect.height - 10;
        }
        if (top < 60) { // Leave room for header
            top = 60;
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    /**
     * Hide tooltip
     */
    function hideTooltip() {
        if (tooltip) {
            tooltip.remove();
            tooltip = null;
        }
    }

    /**
     * Get icon for sink type
     */
    function getSinkIcon(kind) {
        switch (kind) {
            case 'external-call': return '📤';
            case 'state-write': return '💾';
            case 'return': return '↩️';
            case 'event-emit': return '📢';
            default: return '→';
        }
    }

    /**
     * Format DeFi tag for display
     */
    function formatDefiTag(tag) {
        switch (tag) {
            case 'token-amount': return 'Token Amount';
            case 'msg-value': return 'ETH Value';
            case 'msg-sender': return 'Caller';
            case 'address-target': return 'Address';
            case 'balance': return 'Balance';
            default: return tag;
        }
    }

    /**
     * Get risk indicator for DeFi tag
     */
    function getDefiRiskHint(tag, sinks) {
        const hints = [];
        
        if (tag === 'token-amount') {
            // Check if this flows to external calls
            const hasExternalCall = sinks.some(s => s.kind === 'external-call');
            if (hasExternalCall) {
                hints.push('⚠️ Flows to external call - verify amount validation');
            }
        }
        
        if (tag === 'msg-value') {
            hints.push('💡 Native ETH value - check for ETH handling');
        }
        
        if (tag === 'address-target') {
            const hasExternalCall = sinks.some(s => s.kind === 'external-call');
            if (hasExternalCall) {
                hints.push('⚠️ Used as call target - verify address validation');
            }
        }
        
        if (tag === 'balance') {
            hints.push('💡 Balance check - potential flash loan consideration');
        }
        
        return hints;
    }

    /**
     * Escape HTML characters
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Truncate string
     */
    function truncate(str, maxLen) {
        if (str.length <= maxLen) return str;
        return str.substring(0, maxLen - 3) + '...';
    }

})();
`;
}
