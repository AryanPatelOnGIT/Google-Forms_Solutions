// geminiService.js - API integration

async function getGeminiApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['geminiApiKey'], (result) => {
            resolve(result.geminiApiKey);
        });
    });
}

async function callGemini(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error("Rate limit exceeded (429). Please wait and try again.");
        }
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No text returned from Gemini");

    return JSON.parse(text);
}

// Global function that content.js calls
window.handleGeminiAnswers = async function (scrapedData) {
    try {
        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: "Error: No API Key found in settings." });
            return;
        }

        // Build the prompt
        let promptText = "You are an automated assistant designed to answer multiple choice questions from a test or survey. I will provide a list of questions along with their unique IDs and possible options.\n\n" +
            "Task: For each question, determine the correct answer(s) and return a JSON array of objects. Each object MUST contain:\n" +
            "- \"id\": the exact integer ID provided for the question.\n" +
            "- \"answer\": an array of strings containing the exact text of the correct option(s).\n\n" +
            "Important: Your entire response must be ONLY a valid JSON array and nothing else. Ensure the answer text matches the provided options exactly or as closely as possible.\n\n" +
            "Questions:\n";

        scrapedData.forEach(q => {
            promptText += `ID: ${q.id}\n`;
            promptText += `Type: ${q.type}\n`;
            promptText += `Question: ${q.question}\n`;
            promptText += `Options: ${JSON.stringify(q.options)}\n\n`;
        });

        console.log("Gemini Forms Helper: Sending prompt to Gemini...", promptText);

        const answersJson = await callGemini(promptText, apiKey);
        console.log("Gemini Forms Helper: Received answers:", answersJson);

        chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: "Applying answers to form..." });

        // Call back to content.js to apply the answers
        if (typeof window.applyAnswersToForm === 'function') {
            window.applyAnswersToForm(scrapedData, answersJson);
            chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: "Done ✅ Answers applied!" });
        } else {
            console.warn("applyAnswersToForm function not found.");
            chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: "Done ✅ (Answers not applied due to missing function)" });
        }

    } catch (err) {
        console.error("Gemini Forms Helper API Error:", err);
        chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: `Error: ${err.message}` });
    }
};
