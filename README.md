# Gemini Forms Helper 

An AI-powered Chrome extension that automatically reads Google Forms (Multiple Choice Questions and Checkboxes), fetches the correct answers using the Gemini 2.0 Flash API, and auto-selects them for you.

## Architecture

The extension follows a standard Chrome Manifest V3 architecture with messaging between the popup and the content script injected into the active form page.

```mermaid
graph TD
    subgraph Chrome Extension
        A[Popup UI popup.html/js] -->|chrome.tabs.sendMessage| B(Content Script content.js);
        B -->|chrome.runtime.sendMessage| A;
        B -->|injects| C(Injected Styles styles.css);
        B -->|executes| D(API Logic geminiService.js);
    end

    subgraph Browser Tab
        E[Google Form DOM]
    end

    subgraph Google Cloud
        F[Gemini 2.0 Flash API]
    end

    B <-->|reads & clicks| E;
    D <-->|fetches answers| F;
    
    style A fill:#4285F4,stroke:#333,stroke-width:2px,color:white
    style B fill:#34A853,stroke:#333,stroke-width:2px,color:white
    style D fill:#EA4335,stroke:#333,stroke-width:2px,color:white
    style F fill:#FBBC05,stroke:#333,stroke-width:2px,color:black
```

1. **Popup UI (`popup.html` & `popup.js`)**: The control panel where users securely store their Gemini API key and trigger the auto-answering process.
2. **Content Script (`content.js`)**: Injected directly into the `https://docs.google.com/forms/*` page. It scrapes the DOM to extract questions and option labels, fuzzy-matches the API response to the DOM nodes, and simulates the click events.
3. **Gemini Service (`geminiService.js`)**: Takes the scraped questions, batches them into a single, highly-optimized prompt, and returns a verified JSON object of the correct answers.

## Installation (Developer Mode)

Since this extension is not currently on the Chrome Web Store, you can install it manually:

1. Clone or download this repository.
   ```bash
   git clone https://github.com/notnamansinha/Google-Forms_Solutions.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** ON in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select the cloned `gemini-forms-helper` folder. 
6. Pin the extension to your toolbar for easy access!

## How to Use

1. **Get an API Key**: Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and generate a free API Key.
2. **Save the Key**: Click the extension icon in your Chrome toolbar, paste your API Key into the input field, and it will be saved securely to your local browser storage.
3. **Open a Form**: Navigate to any standard Google Form that contains multiple-choice questions or checkboxes.
4. **Auto-Answer**: Click the extension icon and hit the **"Answer Form"** button.
5. **Review**: The extension will scrape the form, consult Gemini, and highlight the selected correct answers in a green border. You can review them before submitting the form.
6. **Clear**: If you want to reset everything, click the **"Clear Selections"** button in the popup to uncheck all answers.

## ⚙️ How it Works under the hood
- **Scraping**: It targets `div[role="listitem"]` to isolate questions, and reads labels from `div[role="radio"]` and `div[role="checkbox"]`.
- **Fuzzy Matching**: Gemini sometimes returns slightly modified text. The application uses a scoring system to fuzzy-match the returned exact answer with the closest DOM element text.
- **Visuals**: A custom `styles.css` is injected to provide the `.gemini-highlight-success` green glowing border so users know what was automated.

## Notes & Edge Cases
- Currently supports standard single-choice (radio) and multiple-choice (checkbox) options.
- Dropdowns and short/long answer text inputs are ignored in the current version.
- Extremely long forms may hit the Gemini API rate limits/token limits. The prompt is highly optimized to minimize token usage by requesting strictly formatted JSON output.
