document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const answerBtn = document.getElementById('answerBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusDisplay = document.getElementById('status');

  // Load saved API key
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  // Save API key when changed
  apiKeyInput.addEventListener('input', () => {
    chrome.storage.local.set({ geminiApiKey: apiKeyInput.value });
  });

  function updateStatus(message) {
    statusDisplay.textContent = message;
  }

  // Handle "Answer Form" button click
  answerBtn.addEventListener('click', async () => {
    if (!apiKeyInput.value) {
      updateStatus("Error: API Key needed.");
      return;
    }

    updateStatus("Scraping...");
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url.includes("docs.google.com/forms")) {
      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { action: "ANSWER_FORM" }, (response) => {
        if (chrome.runtime.lastError) {
          updateStatus("Error: Could not connect to page.");
          return;
        }
      });
    } else {
      updateStatus("Error: Not a Google Form.");
    }
  });

  // Handle "Clear Selections" button click
  clearBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url.includes("docs.google.com/forms")) {
      chrome.tabs.sendMessage(tab.id, { action: "CLEAR_SELECTIONS" });
    }
  });

  // Listen for status updates from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "UPDATE_STATUS") {
      updateStatus(request.status);
    }
  });
});
