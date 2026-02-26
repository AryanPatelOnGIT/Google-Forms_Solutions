document.addEventListener('DOMContentLoaded', () => {
  const apiKey = document.getElementById('apiKey');
  const answerBtn = document.getElementById('answerBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusText = document.getElementById('statusText');
  const dot = document.getElementById('dot');

  // Load saved key
  chrome.storage.local.get(['geminiApiKey'], r => {
    if (r.geminiApiKey) apiKey.value = r.geminiApiKey;
  });

  // Load last status (persists across popup open/close)
  chrome.storage.local.get(['geminiStatus'], r => {
    if (r.geminiStatus) setUI(r.geminiStatus);
  });

  // Save key on change
  apiKey.addEventListener('input', () => {
    chrome.storage.local.set({ geminiApiKey: apiKey.value });
  });

  function setUI(msg) {
    statusText.textContent = msg;

    // Reset dot classes
    dot.className = 'dot';

    const m = msg.toLowerCase();
    if (m.includes('error') || m.includes('fail')) {
      dot.classList.add('error');
    } else if (m.includes('✅') || m === 'ready') {
      if (m.includes('✅')) dot.classList.add('done');
    } else if (m !== 'ready') {
      dot.classList.add('working');
    }
  }

  // Answer
  answerBtn.addEventListener('click', async () => {
    if (!apiKey.value) { setUI('Error: API key required'); return; }

    setUI('Starting...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('docs.google.com/forms')) {
      setUI('Error: Open a Google Form first');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "ANSWER_FORM" }, resp => {
      if (chrome.runtime.lastError) setUI('Error: Reload the form page');
    });
  });

  // Clear
  clearBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url && tab.url.includes('docs.google.com/forms')) {
      chrome.tabs.sendMessage(tab.id, { action: "CLEAR_SELECTIONS" });
    }
    setUI('Ready');
  });

  // Live updates from content script
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'UPDATE_STATUS') setUI(req.status);
  });

  // Also poll storage for updates (works even after reopening popup)
  setInterval(() => {
    chrome.storage.local.get(['geminiStatus'], r => {
      if (r.geminiStatus && r.geminiStatus !== statusText.textContent) {
        setUI(r.geminiStatus);
      }
    });
  }, 1000);
});
