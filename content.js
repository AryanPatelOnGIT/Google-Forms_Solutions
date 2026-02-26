// content.js — Structured Scraper + Applicator

console.log("Gemini Forms Helper: loaded.");

// Clean up google forms text
function cleanText(text) {
    if (!text) return "";
    return text.replace(/\n|Required|\*/gi, ' ').replace(/\s+/g, ' ').trim();
}

function scrapeFormStructured() {
    const questions = [];
    const containers = document.querySelectorAll('div[role="listitem"]');

    containers.forEach((container, index) => {
        const heading = container.querySelector('div[role="heading"]');
        if (!heading) return; // Not a question

        const qText = cleanText(heading.innerText);
        if (qText.length < 5) return;

        // Tag the DOM element so we can find it later without fuzzy matching!
        container.dataset.geminiId = index;

        // Detect type
        const radios = container.querySelectorAll('div[role="radio"]');
        const checkboxes = container.querySelectorAll('div[role="checkbox"]');
        const textInputs = container.querySelectorAll('input[type="text"], textarea');

        function getOptionText(el) {
            return cleanText(el.getAttribute('data-value') || el.getAttribute('aria-label') || el.innerText);
        }

        let type = 'unknown';
        let options = [];

        if (radios.length > 0) {
            type = 'radio';
            options = Array.from(radios).map(getOptionText);
        } else if (checkboxes.length > 0) {
            type = 'checkbox';
            options = Array.from(checkboxes).map(getOptionText);
        } else if (textInputs.length > 0) {
            type = 'text';
        }

        if (type !== 'unknown') {
            questions.push({
                id: index,
                type: type,
                question: qText,
                options: options
            });
        }
    });

    return questions;
}

// Find and click the right options based on explicit IDs
window.applyAnswersToForm = function (answersArray) {
    if (!Array.isArray(answersArray)) return;

    let applied = 0;

    answersArray.forEach(ansObj => {
        const id = ansObj.id;
        const answer = ansObj.answer; // string or array of strings
        if (id === undefined || !answer) return;

        const container = document.querySelector(`div[role="listitem"][data-gemini-id="${id}"]`);
        if (!container) return;

        // Apply Answer
        const radios = container.querySelectorAll('div[role="radio"]');
        const checkboxes = container.querySelectorAll('div[role="checkbox"]');
        const textInputs = container.querySelectorAll('input[type="text"], textarea');

        const isRadio = radios.length > 0;
        const isCheckbox = checkboxes.length > 0;
        const isText = textInputs.length > 0;

        if (isText) {
            const input = textInputs[0];
            // Simulate typing for Google Forms React/Angular inputs
            input.value = Array.isArray(answer) ? answer.join(', ') : answer;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.classList.add('gemini-highlight-success');
            applied++;
        } else if (isRadio || isCheckbox) {
            const options = isRadio ? Array.from(radios) : Array.from(checkboxes);

            let targetAnswers = [];
            if (Array.isArray(answer)) {
                targetAnswers = answer;
            } else if (typeof answer === 'string') {
                const exactMatch = options.find(el => cleanText(el.getAttribute('data-value') || el.getAttribute('aria-label') || el.innerText).toLowerCase() === cleanText(answer).toLowerCase());
                if (!exactMatch && isCheckbox && answer.includes(',')) {
                    targetAnswers = answer.split(',').map(s => s.trim());
                } else {
                    targetAnswers = [answer];
                }
            } else {
                targetAnswers = [String(answer)];
            }

            let clickedForThisQuestion = 0;

            function getOptionTextStr(el) {
                return cleanText(el.getAttribute('data-value') || el.getAttribute('aria-label') || el.innerText).toLowerCase();
            }

            targetAnswers.forEach(targetRaw => {
                if (isRadio && clickedForThisQuestion > 0) return; // Only 1 for radio

                const target = cleanText(targetRaw).toLowerCase();
                let bestEl = null;

                // Exact match first
                bestEl = options.find(el => getOptionTextStr(el) === target);

                // Fallback: partial match
                if (!bestEl) {
                    bestEl = options.find(el => {
                        const opt = getOptionTextStr(el);
                        return opt.includes(target) || target.includes(opt);
                    });
                }

                if (bestEl && bestEl.getAttribute('aria-checked') !== 'true') {
                    if (isRadio) options.forEach(o => o.classList.remove('gemini-highlight-success'));
                    bestEl.click();
                    bestEl.classList.add('gemini-highlight-success');
                    clickedForThisQuestion++;
                    applied++;
                }
            });
        }
    });

    console.log(`Gemini Forms Helper: selected ${applied} answers.`);
};

// Clear all selections
function clearSelections() {
    document.querySelectorAll('div[role="radio"][aria-checked="true"], div[role="checkbox"][aria-checked="true"]')
        .forEach(el => el.click());
    document.querySelectorAll('.gemini-highlight-success')
        .forEach(el => {
            el.classList.remove('gemini-highlight-success');
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ANSWER_FORM") {
        const questions = scrapeFormStructured();
        console.log("Scraped questions:", questions.length);

        if (questions.length === 0) {
            chrome.storage.local.set({ geminiStatus: "Error: No questions found." });
            try { chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: "Error: No questions found." }); } catch (e) { }
            return;
        }

        // Send strict structured JSON to background logic
        if (typeof window.handleGeminiAnswers === 'function') {
            window.handleGeminiAnswers(questions);
        }

        sendResponse({ success: true });
    } else if (request.action === "CLEAR_SELECTIONS") {
        clearSelections();
        chrome.storage.local.set({ geminiStatus: "Ready" });
        sendResponse({ success: true });
    }
    return true;
});
