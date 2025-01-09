class ReCaptchaClicker {
    constructor() {
        this.active = false;
        this.selecting = false;
        this.startPos = null;
        this.overlay = null;
        this.selectionBox = null;
        this.lastSelection = null;
        this.setupGlobalShortcut();
        this.setupFrameObserver();
        this._boundKeydownHandler = null;
        this._boundKeyupHandler = null;
    }


    setupGlobalShortcut() {
        document.addEventListener('keydown', (e) => {
            // Alt + R to toggle the extension
            if (e.altKey && e.key.toLowerCase() === 'r') {
                if (this.active) {
                    this.stop();
                    console.log('ReCaptcha Clicker deactivated');
                } else {
                    this.start();
                    console.log('ReCaptcha Clicker activated. Hold Shift to select region.');
                }
            }
        });
    }

    /**
     * Activates the extension, creating the overlay and setting up event listeners
     * Called when Alt+R is pressed or from popup
     */
    start() {
        this.active = true;
        this.createOverlay();
        this.setupKeyListeners();
        // Notify background script about state change
        chrome.runtime.sendMessage({ action: 'updateState', isActive: true });
    }

    createOverlay() {
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: transparent;
                display: none;
                z-index: 2147483646;
                cursor: crosshair;
            `;

            this.selectionBox = document.createElement('div');
            this.selectionBox.style.cssText = `
                position: fixed;
                border: 2px solid #2196F3;
                background-color: rgba(33, 150, 243, 0.1);
                display: none;
                z-index: 2147483647;
            `;

            document.body.appendChild(this.overlay);
            document.body.appendChild(this.selectionBox);
            this.setupOverlayEvents();
        }
    }

    /**
     * Sets up keyboard event listeners for the Shift key
     * Shift key is used to start/stop the region selection process
     */
    setupKeyListeners() {
        // Remove any existing listeners first
        this.removeKeyListeners();

        this._boundKeydownHandler = (e) => {
            if (e.key === 'Shift' && this.active) {
                this.selecting = true;
                this.overlay.style.display = 'block';
                this.clearSelectionBox();
            }
        };

        this._boundKeyupHandler = (e) => {
            if (e.key === 'Shift') {
                this.selecting = false;
                this.overlay.style.display = 'none';
                if (this.selectionBox?.style.display === 'block') {
                    const selection = {
                        left: parseInt(this.selectionBox.style.left) || 0,
                        top: parseInt(this.selectionBox.style.top) || 0,
                        width: parseInt(this.selectionBox.style.width) || 0,
                        height: parseInt(this.selectionBox.style.height) || 0
                    };
                    this.handleSelection(selection);
                }
                this.clearSelectionBox();
            }
        };

        document.addEventListener('keydown', this._boundKeydownHandler);
        document.addEventListener('keyup', this._boundKeyupHandler);
    }

    removeKeyListeners() {
        if (this._boundKeydownHandler) {
            document.removeEventListener('keydown', this._boundKeydownHandler);
        }
        if (this._boundKeyupHandler) {
            document.removeEventListener('keyup', this._boundKeyupHandler);
        }
    }

    /**
     * Configures mouse events for the overlay to handle region selection
     * Handles mousedown (start selection), mousemove (update selection), and mouseup (finish selection)
     */
    setupOverlayEvents() {
        this.overlay.addEventListener('mousedown', (e) => {
            if (this.selecting) {
                this.startPos = { x: e.clientX, y: e.clientY };
                this.selectionBox.style.display = 'block';
            }
        });

        this.overlay.addEventListener('mousemove', (e) => {
            if (this.selecting && this.startPos) {
                const currentPos = { x: e.clientX, y: e.clientY };
                const left = Math.min(this.startPos.x, currentPos.x);
                const top = Math.min(this.startPos.y, currentPos.y);
                const width = Math.abs(currentPos.x - this.startPos.x);
                const height = Math.abs(currentPos.y - this.startPos.y);

                this.selectionBox.style.left = `${left}px`;
                this.selectionBox.style.top = `${top}px`;
                this.selectionBox.style.width = `${width}px`;
                this.selectionBox.style.height = `${height}px`;
                this.selectionBox.style.display = 'block';
            }
        });

        this.overlay.addEventListener('mouseup', (e) => {
            if (this.selecting && this.startPos) {
                const currentPos = { x: e.clientX, y: e.clientY };
                const left = Math.min(this.startPos.x, currentPos.x);
                const top = Math.min(this.startPos.y, currentPos.y);
                const width = Math.abs(currentPos.x - this.startPos.x);
                const height = Math.abs(currentPos.y - this.startPos.y);

                this.selectionBox.style.left = `${left}px`;
                this.selectionBox.style.top = `${top}px`;
                this.selectionBox.style.width = `${width}px`;
                this.selectionBox.style.height = `${height}px`;
            }
        });
    }

    /**
     * Observes the DOM for new reCAPTCHA iframes being added
     * Necessary because reCAPTCHA loads dynamically
     */
    setupFrameObserver() {
        // Watch for reCAPTCHA iframe changes
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes) {
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'IFRAME') {
                            this.setupFrameContentObserver(node);
                        }
                    });
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    setupFrameContentObserver(frame) {
        try {
            const frameDoc = frame.contentDocument || frame.contentWindow.document;
            const contentObserver = new MutationObserver(() => {
                // Update frame content whenever it changes
                frame.dataset.gridType = this.detectGridType(frameDoc);
            });

            contentObserver.observe(frameDoc.body, {
                childList: true,
                subtree: true,
                attributes: true
            });
        } catch (e) {
            console.log('Frame access error:', e);
        }
    }

    /**
     * Detects whether the reCAPTCHA grid is 3x3 or 4x4
     * Different grid types require different click patterns and visual feedback
     * @param {Document} frameDoc - The document object of the reCAPTCHA iframe
     * @returns {string} - Either '3x3' or '4x4'
     */
    detectGridType(frameDoc) {
        try {
            // Check for 4x4 indicators
            const has4x4Table = frameDoc.querySelector('table.rc-imageselect-table-44');
            const has4x4Images = frameDoc.querySelectorAll('img.rc-image-tile-44').length > 0;
            const has95pxTiles = frameDoc.querySelectorAll('.rc-image-tile-wrapper[style*="width: 95px"]').length > 0;

            return (has4x4Table || has4x4Images || has95pxTiles) ? '4x4' : '3x3';
        } catch (e) {
            console.log('Grid detection error:', e);
            return '3x3'; // default
        }
    }

    /**
     * Processes selection and converts it into click actions
     * Handles both single clicks and region selections
     * @param {Object} selection - Contains coordinates and dimensions of selected region
     */
    handleSelection(selection) {
        if (this.lastSelection && 
            this.lastSelection.left === selection.left && 
            this.lastSelection.top === selection.top) {
            return;
        }

        this.lastSelection = { ...selection };

        const region = {
            left: parseInt(selection.left),
            top: parseInt(selection.top),
            width: parseInt(selection.width),
            height: parseInt(selection.height)
        };

        // For very small selections (single click)
        if (region.width < 20 && region.height < 20) {
            const centerX = region.left;
            const centerY = region.top;
            this.showClickFeedback(centerX, centerY, false);
            this.simulateClick(centerX, centerY);
            return;
        }

        // Find the reCAPTCHA table element
        const recaptchaTarget = document.querySelector('#rc-imageselect-target');
        if (!recaptchaTarget) {
            console.log('No reCAPTCHA target found');
            return;
        }

        // Determine grid type
        const is4x4 = recaptchaTarget.querySelector('table.rc-imageselect-table-44') !== null;
        const gridSize = is4x4 ? 4 : 3;
        const tileSize = is4x4 ? 95 : 126;

        console.log(`Detected ${gridSize}x${gridSize} grid (${tileSize}px tiles)`);

        // Calculate number of tiles in selection
        const selectedCols = Math.min(Math.ceil(region.width / tileSize), gridSize);
        const selectedRows = Math.min(Math.ceil(region.height / tileSize), gridSize);

        // Create array of click positions starting from the exact selection point
        const clickPositions = [];
        for (let row = 0; row < selectedRows; row++) {
            for (let col = 0; col < selectedCols; col++) {
                // Use the exact selection point for the first click
                const baseX = col === 0 && row === 0 ? 
                    region.left : // First click exactly where selected
                    region.left + (col * tileSize); // Other clicks spaced by tileSize

                const baseY = col === 0 && row === 0 ? 
                    region.top : // First click exactly where selected
                    region.top + (row * tileSize); // Other clicks spaced by tileSize

                // Add random offset for all clicks except the first one
                const isFirstClick = col === 0 && row === 0;
                const x = isFirstClick ? baseX : baseX + this.getRandomOffset();
                const y = isFirstClick ? baseY : baseY + this.getRandomOffset();

                clickPositions.push({ x, y });
            }
        }

        console.log(`Grid: ${gridSize}x${gridSize}, Tile size: ${tileSize}px`);
        console.log(`Selection: ${selectedRows}x${selectedCols}, Clicks: ${clickPositions.length}`);
        
        this.performClickSequence(clickPositions, is4x4);
    }

    rectanglesIntersect(rect1, rect2) {
        return !(rect1.left > rect2.right || 
                rect1.right < rect2.left || 
                rect1.top > rect2.bottom || 
                rect1.bottom < rect2.top);
    }

    /**
     * Simulates a mouse click at the specified coordinates
     * Creates and dispatches a synthetic click event
     * @param {number} x - X coordinate for the click
     * @param {number} y - Y coordinate for the click
     */
    simulateClick(x, y) {
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
        });

        const element = document.elementFromPoint(x, y);
        if (element) {
            element.dispatchEvent(clickEvent);
        }
    }

    /**
     * Executes a sequence of clicks with random delays
     * Makes the clicking pattern more human-like
     * @param {Array} positions - Array of {x,y} coordinates to click
     * @param {boolean} is4x4 - Whether this is a 4x4 grid (affects visual feedback)
     */
    performClickSequence(positions, is4x4) {
        let index = 0;
        
        const clickNext = () => {
            if (index < positions.length) {
                const pos = positions[index];
                
                // Show click animation (green for 4x4, red for 3x3)
                this.showClickFeedback(pos.x, pos.y, is4x4);

                setTimeout(() => {
                    this.simulateClick(pos.x, pos.y);
                    index++;
                    const randomDelay = 300 + Math.random() * 500;
                    setTimeout(clickNext, randomDelay);
                }, 50);
            } else {
                this.lastSelection = null;
                this.clearSelectionBox();
            }
        };

        clickNext();
    }

    /**
     * Creates a visual indicator where clicks occur
     * Shows red circles for 3x3 grids and green circles for 4x4 grids
     * @param {number} x - X coordinate for the feedback
     * @param {number} y - Y coordinate for the feedback
     * @param {boolean} is4x4 - Whether this is a 4x4 grid
     */
    showClickFeedback(x, y, is4x4) {
        const feedback = document.createElement('div');
        const color = is4x4 ? '#00FF00' : '#FFCF12';
        const bgColor = is4x4 ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 207, 18, 0.3)';
        
        feedback.style.cssText = `
            position: fixed;
            left: ${x - 25}px;
            top: ${y - 25}px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: ${bgColor};
            border: 2px solid ${color};
            pointer-events: none;
            z-index: 2147483647;
            animation: clickAnimation 0.5s ease-out forwards;
        `;

        if (!document.getElementById('click-animation-style')) {
            const style = document.createElement('style');
            style.id = 'click-animation-style';
            style.textContent = `
                @keyframes clickAnimation {
                    0% { transform: scale(0.3); opacity: 1; }
                    100% { transform: scale(1); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(feedback);
        setTimeout(() => feedback.remove(), 500);
    }

    /**
     * Resets the selection box to its initial state
     * Called after a selection is processed or when canceling a selection
     */
    clearSelectionBox() {
        if (this.selectionBox) {
            this.selectionBox.style.display = 'none';
            this.selectionBox.style.width = '0';
            this.selectionBox.style.height = '0';
            this.selectionBox.style.left = '0';
            this.selectionBox.style.top = '0';
        }
        this.lastSelection = null;
        this.startPos = null;
    }

    /**
     * Generates a small random offset for click positions
     * Makes clicking patterns more natural by avoiding exact grid intersections
     * @returns {number} A random number between -10 and 10
     */
    getRandomOffset() {
        // Random number between -10 and 10
        return Math.floor(Math.random() * 21) - 10;
    }

    /**
     * Deactivates the extension and cleans up event listeners and visual elements
     * Called when Alt+R is pressed or from popup
     */
    stop() {
        this.active = false;
        this.selecting = false;
        this.removeKeyListeners();
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
        this.clearSelectionBox();
        chrome.runtime.sendMessage({ action: 'updateState', isActive: false });
    }

    cleanup() {
        this.stop();
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
    }
}

// Create instance
const clicker = new ReCaptchaClicker();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start") {
        clicker.start();
        sendResponse({ success: true });
    } else if (request.action === "stop") {
        clicker.stop();
        sendResponse({ success: true });
    }
    return true; // Keep message channel open for async response
});

// Cleanup on page unload
window.addEventListener('unload', () => {
    clicker.cleanup();
}); 