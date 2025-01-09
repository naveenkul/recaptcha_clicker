// Store the default and active icon paths
const icons = {
    default: {
        16: "icons/icon16.png",
        32: "icons/icon32.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png"
    },
    active: {
        16: "icons/icon16-active.png",
        32: "icons/icon32-active.png",
        48: "icons/icon48-active.png",
        128: "icons/icon128-active.png"
    }
};

// Track extension state
let isActive = false;

chrome.runtime.onInstalled.addListener(() => {
    console.log('ReCaptcha Clicker extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateState') {
        isActive = request.isActive;
        updateIcon(isActive);
        sendResponse({ success: true });
    } else if (request.action === 'getState') {
        sendResponse({ isActive: isActive });
    }
    if (request.action === 'clickInFrame') {
        const { frameData } = request;
        
        // Log the frame data for debugging
        console.log('Attempting to click in frame:', frameData);
        
        // Inject click script into the frame
        chrome.scripting.executeScript({
            target: { 
                tabId: sender.tab.id,
                allFrames: true // Try all frames if frameId is not working
            },
            func: executeFrameClicks,
            args: [frameData.selection]
        })
        .then(() => {
            console.log('Click script executed successfully');
            sendResponse({ success: true });
        })
        .catch(error => {
            console.error('Frame click error:', error);
            sendResponse({ success: false, error: error.message });
        });
        
        return true;  // Keep message channel open for async response
    }
});

function executeFrameClicks(selection) {
    console.log('Executing clicks in frame with selection:', selection);
    
    const tiles = document.querySelectorAll('.rc-image-tile-wrapper');
    console.log('Found tiles:', tiles.length);
    
    tiles.forEach(tile => {
        const rect = tile.getBoundingClientRect();
        const tileCenter = {
            x: rect.left + rect.width/2,
            y: rect.top + rect.height/2
        };
        
        if (isInSelection(tileCenter, selection)) {
            console.log('Clicking tile at:', tileCenter);
            
            // Add visual feedback before clicking
            const feedback = document.createElement('div');
            feedback.style.cssText = `
                position: absolute;
                left: ${rect.left}px;
                top: ${rect.top}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                border: 2px solid red;
                background-color: rgba(255, 0, 0, 0.2);
                pointer-events: none;
                z-index: 10000;
            `;
            document.body.appendChild(feedback);
            
            // Click after a short delay and remove feedback
            setTimeout(() => {
                tile.click();
                feedback.remove();
            }, 100);
        }
    });
}

function isInSelection(point, selection) {
    return point.x >= selection.left &&
           point.x <= selection.left + selection.width &&
           point.y >= selection.top &&
           point.y <= selection.top + selection.height;
}

// Helper function to handle errors
function handleError(error) {
    console.error('ReCaptcha Clicker Error:', error);
    return { success: false, error: error.message };
}

// Function to update the extension icon
function updateIcon(active) {
    const iconSet = active ? icons.active : icons.default;
    chrome.action.setIcon({ path: iconSet });
    
    // Update badge to show status
    const badgeText = active ? '' : '';
    const badgeColor = active ? '#4CAF50' : '#666666';
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
} 