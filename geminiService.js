// geminiService.js - API integration (Robust chunking & fallbacks)

async function getGeminiApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['geminiApiKey'], (result) => {
            resolve(result.geminiApiKey);
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setStatus(msg) {
    chrome.storage.local.set({ geminiStatus: msg });
    try { chrome.runtime.sendMessage({ action: "UPDATE_STATUS", status: msg }); } catch (e) { }
}

const MODELS = [
    "gemini-2.0-flash-exp",   // Has higher limits
    "gemini-2.0-flash-lite",  // Fallback 1
    "gemini-2.5-flash",       // Fallback 2
    "gemini-1.5-flash"        // Fallback 3
];

async function callGeminiOnce(prompt, apiKey, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        })
    });

    if (response.status === 429) return { rateLimited: true };
    if (response.status === 404) return { notFound: true };

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`${response.status}: ${body}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini");
    return { data: JSON.parse(text) };
}

async function callGeminiRobust(prompt, apiKey, attemptIndex = 1) {
    for (const model of MODELS) {
        setStatus(`Trying ${model}...`);
        try {
            const result = await callGeminiOnce(prompt, apiKey, model);
            if (result.data) return result.data;
            if (result.rateLimited) {
                console.warn(`[${model}] 429 rate limit.`);
                await sleep(1000); // Tiny pause before next model
                continue;
            }
            if (result.notFound) continue;
        } catch (err) {
            console.error(`[${model}] Error:`, err.message);
            if (err.message.includes("API_KEY") || err.message.includes("401") || err.message.includes("403")) {
                throw new Error("Invalid or expired API key.");
            }
            continue;
        }
    }

    // All models 429'd. Exponential backoff and retry.
    if (attemptIndex <= 4) {
        const waitSec = 10 * Math.pow(2, attemptIndex - 1); // 10s, 20s, 40s, 80s
        setStatus(`Rate limited. Waiting ${waitSec}s...`);
        console.warn(`All models rate-limited. Waiting ${waitSec}s...`);
        await sleep(waitSec * 1000);
        return callGeminiRobust(prompt, apiKey, attemptIndex + 1);
    }

    throw new Error("All models exhausted & rate-limited. Try again in 2 minutes.");
}

// Global entry
window.handleGeminiAnswers = async function (pageText) {
    try {
        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            setStatus("Error: No API key.");
            return;
        }

        setStatus("Chunking form data...");

        // --- CHUNKING LOGIC FOR LARGE FORMS ---
        // If the form text is enormous, we split it so Gemini doesn't choke.
        // Google Forms usually separates questions by newlines heavily.
        const lines = pageText.split('\n');
        const CHUNK_SIZE = 150; // process 150 lines at a time
        let allAnswers = [];

        const totalChunks = Math.ceil(lines.length / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
            setStatus(`Sending chunk ${i + 1} of ${totalChunks}...`);
            const chunkText = lines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).join('\n');

            // Skip empty chunks
            if (chunkText.trim().length < 10) continue;

            const prompt = `You are a strict test solver. Read this form section.
Identify ONLY the multiple choice questions (radio buttons / checkboxes).
Ignore text inputs, dropdowns, generic text.
Return ONLY a JSON array. 
Format: [{"question": "<first 5-10 words of the question>", "answers": ["<exact option text>"]}]
Match option text EXACTLY.

--- TEXT START ---
${chunkText}
--- TEXT END ---`;

            const chunkAnswers = await callGeminiRobust(prompt, apiKey);
            if (Array.isArray(chunkAnswers)) {
                allAnswers = allAnswers.concat(chunkAnswers);
            }

            // Small pause between chunks to respect rate limits
            if (i < totalChunks - 1) {
                setStatus(`Pause before chunk ${i + 2}...`);
                await sleep(2500);
            }
        }

        console.log("Gemini complete answers:", allAnswers);
        setStatus("Selecting answers...");

        if (typeof window.applyAnswersToForm === 'function') {
            window.applyAnswersToForm(allAnswers);
            setStatus("Done ✅");
        } else {
            setStatus("Error: form connection lost.");
        }

    } catch (err) {
        console.error("Gemini API Error:", err);
        setStatus(`Error: ${err.message}`);
    }
};
