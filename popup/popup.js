document.addEventListener('DOMContentLoaded', () => {
    // Get initial state from background script
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error getting state:', chrome.runtime.lastError);
            return;
        }
        updateButtonState(response?.isActive || false);
    });

    const toggleButton = document.getElementById('toggleButton');
    if (!toggleButton) {
        console.error('Toggle button not found');
        return;
    }
    
    toggleButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs?.[0]?.id) {
                console.error('No active tab found');
                return;
            }

            const currentState = toggleButton.classList.contains('active');
            const newAction = currentState ? 'stop' : 'start';
            
            chrome.tabs.sendMessage(tabs[0].id, { action: newAction }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message:', chrome.runtime.lastError);
                    return;
                }
                updateButtonState(!currentState);
                chrome.runtime.sendMessage({ 
                    action: 'updateState', 
                    isActive: !currentState 
                });
            });
        });
    });
});

function updateButtonState(isActive) {
    const toggleButton = document.getElementById('toggleButton');
    if (isActive) {
        toggleButton.classList.add('active');
        toggleButton.textContent = 'Disable ReCaptcha Clicker';
    } else {
        toggleButton.classList.remove('active');
        toggleButton.textContent = 'Enable ReCaptcha Clicker';
    }
} 