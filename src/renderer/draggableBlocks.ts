/**
 * Draggable Blocks Manager
 * Handles drag-and-drop functionality for code blocks on the canvas
 */

export interface BlockPosition {
    id: string;
    x: number;
    y: number;
}

export interface DragConfig {
    snapToGrid: boolean;
    gridSize: number;
}

const DEFAULT_DRAG_CONFIG: DragConfig = {
    snapToGrid: false,
    gridSize: 20
};

/**
 * Generates the JavaScript code for draggable blocks to be injected into the webview
 */
export function generateDraggableBlocksScript(config: Partial<DragConfig> = {}): string {
    const cfg = { ...DEFAULT_DRAG_CONFIG, ...config };

    return `
    // ============ Draggable & Resizable Blocks Manager ============
    class DraggableBlocksManager {
        constructor(config = {}) {
            this.config = {
                snapToGrid: ${cfg.snapToGrid},
                gridSize: ${cfg.gridSize},
                minWidth: 280,
                minHeight: 150
            };

            this.draggedBlock = null;
            this.dragOffset = { x: 0, y: 0 };
            this.onBlockMove = null;
            this.blockPositions = new Map();

            // Resize state
            this.resizingBlock = null;
            this.resizeDirection = null;
            this.resizeStart = { x: 0, y: 0, width: 0, height: 0 };

            this.init();
        }

        init() {
            // Drag events
            document.addEventListener('mousedown', this.handleMouseDown.bind(this));
            document.addEventListener('mousemove', this.handleMouseMove.bind(this));
            document.addEventListener('mouseup', this.handleMouseUp.bind(this));

            // Touch support
            document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
            document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
            document.addEventListener('touchend', this.handleTouchEnd.bind(this));

            // Initialize block positions from data attributes
            this.initializePositions();
        }

        initializePositions() {
            const blocks = document.querySelectorAll('.code-block-wrapper');
            blocks.forEach(block => {
                const x = parseFloat(block.dataset.x) || 0;
                const y = parseFloat(block.dataset.y) || 0;
                this.setBlockPosition(block.id, x, y);
            });
        }

        handleMouseDown(e) {
            // Check for resize handle first
            const resizeHandle = e.target.closest('.resize-handle');
            if (resizeHandle) {
                const block = resizeHandle.closest('.code-block-wrapper');
                if (block) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startResize(block, resizeHandle.dataset.resize, e.clientX, e.clientY);
                    return;
                }
            }

            // Then check for drag from header
            const header = e.target.closest('.block-header');
            if (!header) return;

            const block = header.closest('.code-block-wrapper');
            if (!block) return;

            e.preventDefault();
            e.stopPropagation();
            this.startDrag(block, e.clientX, e.clientY);
        }

        handleMouseMove(e) {
            if (this.resizingBlock) {
                e.preventDefault();
                this.updateResize(e.clientX, e.clientY);
                return;
            }

            if (this.draggedBlock) {
                e.preventDefault();
                this.updateDrag(e.clientX, e.clientY);
            }
        }

        handleMouseUp(e) {
            if (this.resizingBlock) {
                this.endResize();
            }
            if (this.draggedBlock) {
                this.endDrag();
            }
        }

        handleTouchStart(e) {
            const touch = e.touches[0];
            const header = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.block-header');
            if (!header) return;

            const block = header.closest('.code-block-wrapper');
            if (!block) return;

            e.preventDefault();
            this.startDrag(block, touch.clientX, touch.clientY);
        }

        handleTouchMove(e) {
            if (!this.draggedBlock) return;

            e.preventDefault();
            const touch = e.touches[0];
            this.updateDrag(touch.clientX, touch.clientY);
        }

        handleTouchEnd(e) {
            if (this.draggedBlock) {
                this.endDrag();
            }
        }

        startDrag(block, clientX, clientY) {
            this.draggedBlock = block;
            block.classList.add('dragging');

            // Get current transform from canvas
            const transform = canvasController ? canvasController.getTransform() : { x: 0, y: 0, scale: 1 };

            // Calculate the offset in canvas coordinates
            const currentX = parseFloat(block.dataset.x) || 0;
            const currentY = parseFloat(block.dataset.y) || 0;

            // Convert client coordinates to canvas coordinates
            const canvasX = (clientX - transform.x) / transform.scale;
            const canvasY = (clientY - transform.y) / transform.scale;

            this.dragOffset = {
                x: canvasX - currentX,
                y: canvasY - currentY
            };

            // Bring to front
            const maxZ = this.getMaxZIndex();
            block.style.zIndex = maxZ + 1;
        }

        updateDrag(clientX, clientY) {
            if (!this.draggedBlock) return;

            // Get current transform from canvas
            const transform = canvasController ? canvasController.getTransform() : { x: 0, y: 0, scale: 1 };

            // Convert client coordinates to canvas coordinates
            const canvasX = (clientX - transform.x) / transform.scale;
            const canvasY = (clientY - transform.y) / transform.scale;

            let newX = canvasX - this.dragOffset.x;
            let newY = canvasY - this.dragOffset.y;

            // Snap to grid if enabled
            if (this.config.snapToGrid) {
                newX = Math.round(newX / this.config.gridSize) * this.config.gridSize;
                newY = Math.round(newY / this.config.gridSize) * this.config.gridSize;
            }

            this.setBlockPosition(this.draggedBlock.id, newX, newY);

            // Notify arrow manager to update
            if (this.onBlockMove) {
                this.onBlockMove(this.draggedBlock.id, newX, newY);
            }

            // Trigger arrow update
            if (typeof updateAllArrows === 'function') {
                requestAnimationFrame(updateAllArrows);
            }
        }

        endDrag() {
            if (this.draggedBlock) {
                this.draggedBlock.classList.remove('dragging');
                this.draggedBlock = null;
            }
        }

        setBlockPosition(blockId, x, y) {
            const block = document.getElementById(blockId);
            if (!block) return;

            block.style.left = x + 'px';
            block.style.top = y + 'px';
            block.dataset.x = x;
            block.dataset.y = y;

            this.blockPositions.set(blockId, { x, y });
        }

        getBlockPosition(blockId) {
            return this.blockPositions.get(blockId) || { x: 0, y: 0 };
        }

        getMaxZIndex() {
            const blocks = document.querySelectorAll('.code-block-wrapper');
            let maxZ = 0;
            blocks.forEach(block => {
                const z = parseInt(block.style.zIndex) || 0;
                maxZ = Math.max(maxZ, z);
            });
            return maxZ;
        }

        // Auto-layout blocks in a smart arrangement with no overlap
        autoLayout() {
            const mainBlock = document.querySelector('.block-main');
            const structBlocks = document.querySelectorAll('.block-struct, .block-enum');
            const functionBlocks = document.querySelectorAll('.block-function');

            const LEFT_X = 50;
            const CENTER_X = 450;
            const VERTICAL_GAP = 40;
            const START_Y = 80;

            // Position main block in center
            if (mainBlock) {
                this.setBlockPosition(mainBlock.id, CENTER_X, START_Y);
            }

            // Position structs/enums on the left, stacked vertically
            let leftY = START_Y;
            structBlocks.forEach(block => {
                this.setBlockPosition(block.id, LEFT_X, leftY);
                leftY += block.offsetHeight + VERTICAL_GAP;
            });

            // Position functions on the right, stacked vertically
            let rightY = START_Y;
            const mainWidth = mainBlock ? mainBlock.offsetWidth : 500;
            const rightX = CENTER_X + mainWidth + 50;
            
            functionBlocks.forEach(block => {
                this.setBlockPosition(block.id, rightX, rightY);
                rightY += block.offsetHeight + VERTICAL_GAP;
            });

            // Update arrows after layout
            setTimeout(() => {
                if (typeof updateAllArrows === 'function') {
                    updateAllArrows();
                }
            }, 50);
        }

        // Re-layout triggered by window resize or button
        relayout() {
            this.autoLayout();
            if (canvasController) {
                canvasController.fitToView();
            }
        }

        // ============ Resize Methods ============

        startResize(block, direction, clientX, clientY) {
            this.resizingBlock = block;
            this.resizeDirection = direction;
            block.classList.add('resizing');

            // Get current size
            const rect = block.getBoundingClientRect();
            const transform = canvasController ? canvasController.getTransform() : { scale: 1 };

            this.resizeStart = {
                x: clientX,
                y: clientY,
                width: rect.width / transform.scale,
                height: rect.height / transform.scale
            };

            // Bring to front
            const maxZ = this.getMaxZIndex();
            block.style.zIndex = maxZ + 1;
        }

        updateResize(clientX, clientY) {
            if (!this.resizingBlock) return;

            const transform = canvasController ? canvasController.getTransform() : { scale: 1 };
            const deltaX = (clientX - this.resizeStart.x) / transform.scale;
            const deltaY = (clientY - this.resizeStart.y) / transform.scale;

            let newWidth = this.resizeStart.width;
            let newHeight = this.resizeStart.height;

            // Apply resize based on direction
            if (this.resizeDirection.includes('e')) {
                newWidth = Math.max(this.config.minWidth, this.resizeStart.width + deltaX);
            }
            if (this.resizeDirection.includes('s')) {
                newHeight = Math.max(this.config.minHeight, this.resizeStart.height + deltaY);
            }

            // Apply size
            this.resizingBlock.style.width = newWidth + 'px';
            
            // For height, adjust the code-block max-height
            const codeBlock = this.resizingBlock.querySelector('.code-block');
            if (codeBlock && this.resizeDirection.includes('s')) {
                const headerHeight = 50;
                const footerHeight = 45;
                const newCodeHeight = Math.max(100, newHeight - headerHeight - footerHeight);
                codeBlock.style.maxHeight = newCodeHeight + 'px';
            }

            // Update arrows
            if (typeof updateAllArrows === 'function') {
                requestAnimationFrame(updateAllArrows);
            }
        }

        endResize() {
            if (this.resizingBlock) {
                this.resizingBlock.classList.remove('resizing');
                this.resizingBlock = null;
                this.resizeDirection = null;
            }
        }
    }

    // Initialize draggable blocks manager
    let draggableManager = null;
    document.addEventListener('DOMContentLoaded', () => {
        draggableManager = new DraggableBlocksManager();
        
        // Auto layout after content is ready
        setTimeout(() => {
            draggableManager.autoLayout();
        }, 50);
    });
    `;
}
