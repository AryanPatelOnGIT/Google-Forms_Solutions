// content.js - Scraper and DOM interaction

console.log("Gemini Forms Helper: Content script loaded.");

// Helper to wait for the DOM to be fully loaded
function waitForFormLoad(callback) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // Slight delay to allow dynamic Google Forms JS to render full UI
        setTimeout(callback, 1000);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(callback, 1000);
        });
    }
}

// Scrape questions from the DOM
function scrapeQuestions() {
    console.log("Gemini Forms Helper: Scraping started...");
    const questions = [];

    // Find all question containers
    const questionContainers = document.querySelectorAll('div[role="listitem"]');

    questionContainers.forEach((container, index) => {
        // 1. Get the question text
        // Usually Google forms uses a div with role="heading" for the question text
        const headingEl = container.querySelector('div[role="heading"]');
        if (!headingEl) return; // Skip if no heading found

        // Clean up the text (remove asterisks for required questions, etc.)
        let questionText = headingEl.innerText || headingEl.textContent;
        questionText = questionText.replace(/\*/g, '').trim();

        // 2. Identify the type and gather options
        // Find radios (single choice) or checkboxes (multiple choice)
        const radios = container.querySelectorAll('div[role="radio"]');
        const checkboxes = container.querySelectorAll('div[role="checkbox"]');

        let type = null;
        let optionElements = [];

        if (radios.length > 0) {
            type = 'radio';
            optionElements = Array.from(radios);
        } else if (checkboxes.length > 0) {
            type = 'checkbox';
            optionElements = Array.from(checkboxes);
        } else {
            // Not a multiple choice or checkbox question (e.g., text input)
            return;
        }

        // 3. Extract the text for each option
        const options = optionElements.map(el => {
            // The option text is usually the data-value, aria-label, or adjacent text
            return el.getAttribute('data-value') || el.getAttribute('aria-label') || el.innerText.trim();
        }).filter(text => text !== null && text !== "");

        // Store the data
        const questionData = {
            id: index,
            type: type,
            question: questionText,
            options: options,
            container: container, // Save reference to DOM element
            optionElements: optionElements // Save references to option elements for clicking later
        };

        questions.push(questionData);
    });

    console.log("Gemini Forms Helper: Scraped questions:", questions);
    return questions;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ANSWER_FORM") {
        console.log("Gemini Forms Helper: Received ANSWER_FORM request.");
        // 1. Scrape the form
        const scrapedData = scrapeQuestions();

        if (scrapedData.length === 0) {
            chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: "Error: No multiple choice questions found." });
            return;
        }

        chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: `Fetching answers for ${scrapedData.length} questions...` });

        // TODO: Call Gemini API (Phase 3 & 4)
        if (typeof handleGeminiAnswers === 'function') {
            handleGeminiAnswers(scrapedData);
        } else {
            console.warn("handleGeminiAnswers function not found. Ensure geminiService.js is loaded.");
            // For now just simulate completion
            setTimeout(() => {
                chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: "Done ✅ (Simulated)" });
            }, 1000);
        }

        sendResponse({ success: true });
    } else if (request.action === "CLEAR_SELECTIONS") {
        console.log("Gemini Forms Helper: Clearing selections...");
        clearSelections();
        sendResponse({ success: true });
    }
    return true; // Keep the message channel open for async responses
});

function clearSelections() {
    const selectedOptions = document.querySelectorAll('div[role="radio"][aria-checked="true"], div[role="checkbox"][aria-checked="true"]');
    selectedOptions.forEach(el => {
        el.click(); // Deselect
    });

    // Remove custom highlights
    const highlighted = document.querySelectorAll('.gemini-highlight-success, .gemini-highlight-error');
    highlighted.forEach(el => {
        el.classList.remove('gemini-highlight-success', 'gemini-highlight-error');
    });
}

// Initialize
waitForFormLoad(() => {
    console.log("Gemini Forms Helper: Ready on page.");
});

// --- Phase 4: Auto-Select Answers ---
window.applyAnswersToForm = function (scrapedData, answersArray) {
    let appliedCount = 0;

    answersArray.forEach(answerObj => {
        // Find the original question data
        const questionData = scrapedData.find(q => q.id === answerObj.id);
        if (!questionData) return;

        const correctOptions = answerObj.answer; // Array of strings
        if (!correctOptions || correctOptions.length === 0) return;

        // Iterate over the parsed correct options from Gemini
        correctOptions.forEach(correctText => {
            // Find the closest matching option element
            // We use fuzzy/case-insensitive matching
            const lowerCorrectText = correctText.toLowerCase().trim();

            let bestMatch = null;
            let highestScore = -1;

            questionData.optionElements.forEach((el, index) => {
                const optionText = questionData.options[index]?.toLowerCase().trim() || "";

                // Exact match
                if (optionText === lowerCorrectText) {
                    bestMatch = el;
                    highestScore = 100;
                } else if (highestScore < 100 && optionText.includes(lowerCorrectText) && lowerCorrectText.length > 3) {
                    bestMatch = el;
                    highestScore = 50;
                } else if (highestScore < 50 && lowerCorrectText.includes(optionText) && optionText.length > 3) {
                    bestMatch = el;
                    highestScore = 40;
                }
            });

            if (bestMatch) {
                // Click it if not already clicked
                // Google forms sets aria-checked="true" when selected
                const isChecked = bestMatch.getAttribute('aria-checked') === 'true';
                if (!isChecked) {
                    bestMatch.click();
                }

                // Add visual indicator (green highlight)
                bestMatch.classList.add('gemini-highlight-success');
                appliedCount++;
            }
        });
    });

    console.log(`Gemini Forms Helper: Applied ${appliedCount} answers.`);
};
