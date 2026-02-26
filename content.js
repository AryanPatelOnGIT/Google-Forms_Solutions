// content.js — Scraper + DOM interaction

console.log("Gemini Forms Helper: loaded.");

// Grab full text content of the form page
function getFullPageText() {
    // Get all visible text from the form
    const formArea = document.querySelector('div[role="list"]') || document.body;
    return formArea.innerText;
}

// Find and click the right options based on Gemini's answers
window.applyAnswersToForm = function (answersArray) {
    if (!Array.isArray(answersArray)) {
        console.error("Expected array, got:", answersArray);
        return;
    }

    let applied = 0;
    const containers = document.querySelectorAll('div[role="listitem"]');

    answersArray.forEach(ansObj => {
        const qSnippet = (ansObj.question || "").toLowerCase().trim();
        const correctAnswers = ansObj.answers || [];
        if (!qSnippet || correctAnswers.length === 0) return;

        // Find matching question container
        for (const container of containers) {
            const heading = container.querySelector('div[role="heading"]');
            if (!heading) continue;

            const headingText = heading.innerText.replace(/\*/g, '').toLowerCase().trim();
            if (!headingText.includes(qSnippet) && !qSnippet.includes(headingText.substring(0, 20))) continue;

            // Found the question — now click options
            const radios = container.querySelectorAll('div[role="radio"]');
            const checkboxes = container.querySelectorAll('div[role="checkbox"]');
            const options = radios.length > 0 ? Array.from(radios) : Array.from(checkboxes);

            correctAnswers.forEach(correctText => {
                const target = correctText.toLowerCase().trim();
                let bestEl = null;
                let bestScore = 0;

                options.forEach(el => {
                    const optText = (
                        el.getAttribute('data-value') ||
                        el.getAttribute('aria-label') ||
                        el.innerText || ""
                    ).toLowerCase().trim();

                    if (optText === target) {
                        bestEl = el; bestScore = 100;
                    } else if (bestScore < 100 && optText.includes(target) && target.length > 2) {
                        bestEl = el; bestScore = 60;
                    } else if (bestScore < 60 && target.includes(optText) && optText.length > 2) {
                        bestEl = el; bestScore = 40;
                    }
                });

                if (bestEl && bestEl.getAttribute('aria-checked') !== 'true') {
                    bestEl.click();
                    bestEl.classList.add('gemini-highlight-success');
                    applied++;
                }
            });

            break; // Found the question, move on
        }
    });

    console.log(`Gemini Forms Helper: selected ${applied} answers.`);
};

// Clear all selections
function clearSelections() {
    document.querySelectorAll('div[role="radio"][aria-checked="true"], div[role="checkbox"][aria-checked="true"]')
        .forEach(el => el.click());
    document.querySelectorAll('.gemini-highlight-success')
        .forEach(el => el.classList.remove('gemini-highlight-success'));
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ANSWER_FORM") {
        const pageText = getFullPageText();
        console.log("Page text length:", pageText.length);

        if (pageText.length < 20) {
            chrome.storage.local.set({ geminiStatus: "Error: Could not read form." });
            try { chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: "Error: Could not read form." }); } catch (e) { }
            return;
        }

        // Fire and forget — runs even if popup closes
        if (typeof window.handleGeminiAnswers === 'function') {
            window.handleGeminiAnswers(pageText);
        }

        sendResponse({ success: true });
    } else if (request.action === "CLEAR_SELECTIONS") {
        clearSelections();
        chrome.storage.local.set({ geminiStatus: "Ready" });
        sendResponse({ success: true });
    }
    return true;
});
