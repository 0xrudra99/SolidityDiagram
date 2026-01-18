/**
 * Canvas Controller - Miro-style infinite canvas with pan/zoom
 * Handles coordinate transformations, mouse interactions, and viewport management
 */

export interface Point {
    x: number;
    y: number;
}

export interface Transform {
    x: number;      // Pan offset X
    y: number;      // Pan offset Y
    scale: number;  // Zoom level
}

export interface CanvasConfig {
    minZoom: number;
    maxZoom: number;
    zoomSensitivity: number;
    gridSize: number;
    dotSize: number;
}

const DEFAULT_CONFIG: CanvasConfig = {
    minZoom: 0.1,
    maxZoom: 3,
    zoomSensitivity: 0.001,
    gridSize: 20,
    dotSize: 1.5
};

/**
 * Generates the JavaScript code for the canvas controller to be injected into the webview
 */
export function generateCanvasControllerScript(config: Partial<CanvasConfig> = {}): string {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    return `
    // ============ Canvas Controller ============
    class CanvasController {
        constructor(canvasElement, config = {}) {
            this.canvas = canvasElement;
            this.config = {
                minZoom: ${cfg.minZoom},
                maxZoom: ${cfg.maxZoom},
                zoomSensitivity: ${cfg.zoomSensitivity},
                gridSize: ${cfg.gridSize},
                dotSize: ${cfg.dotSize}
            };

            this.transform = { x: 0, y: 0, scale: 1 };
            this.isPanning = false;
            this.lastMousePos = { x: 0, y: 0 };
            this.onTransformChange = null;

            this.init();
        }

        init() {
            // Mouse events for panning
            this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
            window.addEventListener('mousemove', this.handleMouseMove.bind(this));
            window.addEventListener('mouseup', this.handleMouseUp.bind(this));

            // Wheel event for zooming
            this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

            // Touch events for mobile
            this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
            this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
            this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

            // Initial render
            this.applyTransform();
            this.updateBackground();
        }

        handleMouseDown(e) {
            // Only pan if clicking on the canvas background, not on blocks
            if (e.target === this.canvas || e.target.classList.contains('canvas-background')) {
                this.isPanning = true;
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
            }
        }

        handleMouseMove(e) {
            if (!this.isPanning) return;

            const deltaX = e.clientX - this.lastMousePos.x;
            const deltaY = e.clientY - this.lastMousePos.y;

            this.transform.x += deltaX;
            this.transform.y += deltaY;

            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.applyTransform();
        }

        handleMouseUp(e) {
            if (this.isPanning) {
                this.isPanning = false;
                this.canvas.style.cursor = 'grab';
            }
        }

        handleWheel(e) {
            e.preventDefault();

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate zoom
            const zoomDelta = -e.deltaY * this.config.zoomSensitivity;
            const newScale = Math.min(
                this.config.maxZoom,
                Math.max(this.config.minZoom, this.transform.scale * (1 + zoomDelta))
            );

            if (newScale !== this.transform.scale) {
                // Zoom towards mouse position
                const scaleRatio = newScale / this.transform.scale;

                this.transform.x = mouseX - (mouseX - this.transform.x) * scaleRatio;
                this.transform.y = mouseY - (mouseY - this.transform.y) * scaleRatio;
                this.transform.scale = newScale;

                this.applyTransform();
                this.updateBackground();
                this.updateZoomIndicator();
            }
        }

        handleTouchStart(e) {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                if (e.target === this.canvas || e.target.classList.contains('canvas-background')) {
                    this.isPanning = true;
                    this.lastMousePos = { x: touch.clientX, y: touch.clientY };
                    e.preventDefault();
                }
            }
        }

        handleTouchMove(e) {
            if (this.isPanning && e.touches.length === 1) {
                const touch = e.touches[0];
                const deltaX = touch.clientX - this.lastMousePos.x;
                const deltaY = touch.clientY - this.lastMousePos.y;

                this.transform.x += deltaX;
                this.transform.y += deltaY;

                this.lastMousePos = { x: touch.clientX, y: touch.clientY };
                this.applyTransform();
                e.preventDefault();
            }
        }

        handleTouchEnd(e) {
            this.isPanning = false;
        }

        applyTransform() {
            const content = document.getElementById('canvas-content');
            if (content) {
                content.style.transform = \`translate(\${this.transform.x}px, \${this.transform.y}px) scale(\${this.transform.scale})\`;
            }

            // Update arrows after transform
            if (typeof updateAllArrows === 'function') {
                requestAnimationFrame(updateAllArrows);
            }

            if (this.onTransformChange) {
                this.onTransformChange(this.transform);
            }
        }

        updateBackground() {
            const scaledGridSize = this.config.gridSize * this.transform.scale;
            const scaledDotSize = this.config.dotSize * this.transform.scale;

            // Create dot pattern that moves with pan
            const offsetX = this.transform.x % scaledGridSize;
            const offsetY = this.transform.y % scaledGridSize;

            this.canvas.style.backgroundSize = \`\${scaledGridSize}px \${scaledGridSize}px\`;
            this.canvas.style.backgroundPosition = \`\${offsetX}px \${offsetY}px\`;
            this.canvas.style.backgroundImage = \`radial-gradient(circle, rgba(255,255,255,0.15) \${scaledDotSize}px, transparent \${scaledDotSize}px)\`;
        }

        updateZoomIndicator() {
            const indicator = document.getElementById('zoom-indicator');
            if (indicator) {
                indicator.textContent = \`\${Math.round(this.transform.scale * 100)}%\`;
            }
        }

        // Convert screen coordinates to canvas coordinates
        screenToCanvas(screenX, screenY) {
            return {
                x: (screenX - this.transform.x) / this.transform.scale,
                y: (screenY - this.transform.y) / this.transform.scale
            };
        }

        // Convert canvas coordinates to screen coordinates
        canvasToScreen(canvasX, canvasY) {
            return {
                x: canvasX * this.transform.scale + this.transform.x,
                y: canvasY * this.transform.scale + this.transform.y
            };
        }

        // Reset view to center content
        resetView() {
            const content = document.getElementById('canvas-content');
            if (!content) return;

            const rect = this.canvas.getBoundingClientRect();
            const contentRect = content.getBoundingClientRect();

            this.transform = {
                x: (rect.width - contentRect.width) / 2,
                y: 50,
                scale: 1
            };

            this.applyTransform();
            this.updateBackground();
            this.updateZoomIndicator();
        }

        // Fit all content in view
        fitToView() {
            const content = document.getElementById('canvas-content');
            if (!content) return;

            const canvasRect = this.canvas.getBoundingClientRect();
            const blocks = content.querySelectorAll('.code-block-wrapper');

            if (blocks.length === 0) return;

            // Calculate bounding box of all blocks
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            blocks.forEach(block => {
                const x = parseFloat(block.dataset.x) || 0;
                const y = parseFloat(block.dataset.y) || 0;
                const width = block.offsetWidth;
                const height = block.offsetHeight;

                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + width);
                maxY = Math.max(maxY, y + height);
            });

            const contentWidth = maxX - minX + 100;
            const contentHeight = maxY - minY + 100;

            const scaleX = canvasRect.width / contentWidth;
            const scaleY = canvasRect.height / contentHeight;
            const scale = Math.min(scaleX, scaleY, 1);

            this.transform = {
                x: (canvasRect.width - contentWidth * scale) / 2 - minX * scale + 50,
                y: (canvasRect.height - contentHeight * scale) / 2 - minY * scale + 50,
                scale: Math.max(this.config.minZoom, Math.min(this.config.maxZoom, scale))
            };

            this.applyTransform();
            this.updateBackground();
            this.updateZoomIndicator();
        }

        getTransform() {
            return { ...this.transform };
        }

        setTransform(transform) {
            this.transform = { ...transform };
            this.applyTransform();
            this.updateBackground();
            this.updateZoomIndicator();
        }
    }

    // Initialize canvas controller
    let canvasController = null;
    document.addEventListener('DOMContentLoaded', () => {
        const canvas = document.getElementById('infinite-canvas');
        if (canvas) {
            canvasController = new CanvasController(canvas);
            
            // Center content after a short delay to let layout settle
            setTimeout(() => {
                canvasController.fitToView();
            }, 100);
        }
    });
    `;
}

/**
 * Generates the CSS styles for the canvas
 */
export function generateCanvasStyles(): string {
    return `
    /* ============ Infinite Canvas Styles ============ */
    
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    html, body {
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
    }

    body {
        background: #0d1117;
    }

    #infinite-canvas {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        cursor: grab;
        background-color: #0d1117;
        background-image: radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px);
        background-size: 24px 24px;
    }

    #infinite-canvas:active {
        cursor: grabbing;
    }

    #canvas-content {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
        will-change: transform;
        /* Ensure content doesn't overflow weirdly */
        pointer-events: none;
    }

    #canvas-content > * {
        pointer-events: auto;
    }

    /* ============ Controls ============ */

    .canvas-controls {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 6px;
        padding: 6px 10px;
        background: rgba(13, 17, 23, 0.95);
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        z-index: 1001;
        backdrop-filter: blur(8px);
    }

    .canvas-controls button {
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: #8b949e;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
    }

    .canvas-controls button:hover {
        background: rgba(88, 166, 255, 0.15);
        border-color: rgba(88, 166, 255, 0.3);
        color: #58a6ff;
    }

    #zoom-indicator {
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 6px;
        color: #6e7681;
        font-size: 11px;
        font-family: 'SF Mono', Monaco, monospace;
        min-width: 50px;
        text-align: center;
    }

    /* ============ Header ============ */

    .canvas-header {
        position: fixed;
        top: 16px;
        left: 16px;
        padding: 12px 16px;
        background: rgba(13, 17, 23, 0.95);
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        z-index: 1001;
        backdrop-filter: blur(8px);
    }

    .canvas-header h1 {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #6e7681;
        margin-bottom: 2px;
    }

    .canvas-header .function-name {
        font-size: 16px;
        font-weight: 600;
        color: #58a6ff;
    }

    /* ============ Code Block Wrapper ============ */

    .code-block-wrapper {
        position: absolute;
        background: #161b22;
        border-radius: 8px;
        overflow: visible;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
        border: 1px solid #30363d;
        min-width: 320px;
        z-index: 10;
    }

    .code-block-wrapper:hover {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        border-color: #484f58;
    }

    .code-block-wrapper.dragging {
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), 0 0 0 2px rgba(88, 166, 255, 0.4);
        z-index: 100;
    }

    .code-block-wrapper.block-main {
        border: 1px solid #58a6ff;
        min-width: 400px;
        z-index: 11;
    }

    .code-block-wrapper.block-struct {
        border-left: 3px solid #89dceb;
    }

    .code-block-wrapper.block-enum {
        border-left: 3px solid #a6e3a1;
    }

    .code-block-wrapper.block-function {
        border-left: 3px solid #f38ba8;
    }

    /* External/unresolved function calls */
    .code-block-wrapper.block-function[id^="external-"] {
        border-left: 3px solid #f9e2af;
        border-style: dashed;
        opacity: 0.9;
    }

    .code-block-wrapper.block-function[id^="external-"] .block-header {
        background: linear-gradient(135deg, #21262d 0%, #2d1f1f 100%);
    }

    .code-block-wrapper.block-function[id^="external-"] .block-subtitle {
        color: #f9e2af;
    }

    /* ============ Block Header (Drag Handle) ============ */

    .block-header {
        padding: 10px 14px;
        background: #21262d;
        border-bottom: 1px solid #30363d;
        cursor: grab;
        user-select: none;
    }

    .block-header:active {
        cursor: grabbing;
    }

    .block-title {
        font-size: 13px;
        font-weight: 600;
        color: #cba6f7;
        white-space: nowrap;
    }

    .block-subtitle {
        display: block;
        font-size: 10px;
        color: #6e7681;
        margin-top: 3px;
        font-family: 'SF Mono', Monaco, monospace;
        white-space: nowrap;
    }

    /* Drag indicator */
    .block-header::before {
        content: '⋮⋮';
        position: absolute;
        right: 12px;
        top: 12px;
        font-size: 10px;
        color: #484f58;
        letter-spacing: -2px;
    }

    /* ============ Code Block (Scrollable) ============ */

    .code-block {
        max-height: 450px;
        overflow: auto;
        font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', Consolas, monospace;
        font-size: 13px;
        line-height: 1.5;
        padding: 10px 0;
        background: #0d1117;
        cursor: text;  /* Text cursor for code area */
        user-select: text;  /* Allow text selection */
    }

    .block-main .code-block {
        max-height: 600px;
    }

    /* Inner container to prevent text wrapping */
    .code-block-inner {
        display: inline-block;
        min-width: 100%;
    }

    .code-line {
        display: flex;
        padding: 1px 14px;
        white-space: pre;
        min-width: max-content;
    }

    .code-line:hover {
        background: rgba(255, 255, 255, 0.04);
    }

    .line-number {
        flex-shrink: 0;
        min-width: 40px;
        padding-right: 16px;
        text-align: right;
        color: #484f58;
        user-select: none;
        cursor: default;
    }

    .line-content {
        white-space: pre;
    }

    /* Scrollbar styling */
    .code-block::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }

    .code-block::-webkit-scrollbar-track {
        background: #161b22;
    }

    .code-block::-webkit-scrollbar-thumb {
        background: #30363d;
        border-radius: 5px;
        border: 2px solid #161b22;
    }

    .code-block::-webkit-scrollbar-thumb:hover {
        background: #484f58;
    }

    .code-block::-webkit-scrollbar-corner {
        background: #161b22;
    }

    /* ============ Block Footer ============ */

    .block-footer {
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.02);
        border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .goto-btn {
        font-size: 11px;
        padding: 6px 12px;
        background: rgba(137, 180, 250, 0.15);
        color: #89b4fa;
        border: 1px solid rgba(137, 180, 250, 0.3);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .goto-btn:hover {
        background: rgba(137, 180, 250, 0.25);
        border-color: rgba(137, 180, 250, 0.5);
    }

    /* ============ SVG Arrows Layer ============ */

    #arrows-svg {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 5;  /* Below blocks but above background */
        overflow: visible;
    }

    .arrow-line path {
        transition: opacity 0.15s ease;
    }

    .arrow-line:hover path {
        opacity: 1 !important;
        stroke-width: 2 !important;
    }

    /* ============ Resize Handles ============ */

    .resize-handle {
        position: absolute;
        background: transparent;
        z-index: 20;
    }

    .resize-handle:hover {
        background: rgba(88, 166, 255, 0.3);
    }

    /* Corner resize handle (bottom-right) */
    .resize-handle-se {
        bottom: 0;
        right: 0;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
        border-radius: 0 0 8px 0;
    }

    .resize-handle-se::after {
        content: '';
        position: absolute;
        bottom: 4px;
        right: 4px;
        width: 8px;
        height: 8px;
        border-right: 2px solid #484f58;
        border-bottom: 2px solid #484f58;
    }

    /* Right edge resize */
    .resize-handle-e {
        top: 40px;
        right: 0;
        width: 6px;
        bottom: 40px;
        cursor: ew-resize;
    }

    /* Bottom edge resize */
    .resize-handle-s {
        bottom: 0;
        left: 40px;
        right: 40px;
        height: 6px;
        cursor: ns-resize;
    }

    /* Minimum size indicator when resizing */
    .code-block-wrapper.resizing {
        outline: 2px dashed rgba(88, 166, 255, 0.5);
    }

    /* ============ Importable Tokens ============ */

    .importable-token {
        cursor: pointer;
        border-bottom: 1px dotted transparent;
        transition: all 0.15s ease;
        border-radius: 2px;
        padding: 0 1px;
        margin: 0 -1px;
    }

    .importable-token:hover {
        border-bottom-color: currentColor;
        background: rgba(255, 255, 255, 0.08);
    }

    .importable-token.loading {
        opacity: 0.6;
        pointer-events: none;
    }

    .importable-token.loading::after {
        content: '...';
        animation: pulse 1s infinite;
    }

    .importable-token.error {
        border-bottom-color: #f38ba8 !important;
        animation: shake 0.3s ease;
    }

    .importable-token.already-imported {
        cursor: default;
        border-bottom-color: transparent;
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
    }

    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
    }

    /* ============ Close Button ============ */

    .block-close-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid transparent;
        border-radius: 4px;
        color: #6e7681;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        transition: all 0.15s ease;
        z-index: 10;
    }

    .code-block-wrapper:hover .block-close-btn {
        opacity: 1;
    }

    .block-close-btn:hover {
        background: rgba(243, 139, 168, 0.2);
        border-color: rgba(243, 139, 168, 0.4);
        color: #f38ba8;
    }

    /* Hide close button on main function block */
    .block-main .block-close-btn {
        display: none;
    }

    /* Block removal animation */
    .code-block-wrapper.removing {
        opacity: 0;
        transform: scale(0.95);
        transition: all 0.2s ease;
        pointer-events: none;
    }

    /* Block appear animation */
    .code-block-wrapper.appearing {
        animation: blockAppear 0.3s ease forwards;
    }

    @keyframes blockAppear {
        from {
            opacity: 0;
            transform: scale(0.9) translateY(-10px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }

    /* ============ Import Hint Tooltip ============ */

    .import-hint {
        position: fixed;
        background: rgba(13, 17, 23, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 11px;
        color: #8b949e;
        pointer-events: none;
        z-index: 2000;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        opacity: 0;
        transition: opacity 0.15s ease;
    }

    .import-hint.visible {
        opacity: 1;
    }

    .import-hint kbd {
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        margin-right: 4px;
        font-family: inherit;
    }
    `;
}
