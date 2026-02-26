# Gemini Forms Auto-Answer

A Chrome extension that automatically answers MCQ (multiple choice) questions on Google Forms using Google's Gemini AI — completely free.

---

## How It Works

1. You open a Google Form with multiple choice questions
2. Click the extension icon and press **▶ Run Now**
3. The extension scrapes all MCQ questions and sends them to Gemini AI
4. Gemini returns the correct answers, which get auto-selected on the form
5. Correct options are highlighted in purple so you can review before submitting

---

## Installation

### Step 1 — Get a Free Gemini API Key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key — it will start with `AIza...`

>  No billing required. The free tier is enough for normal use.

### Step 2 — Install the Extension

1. Download and **unzip** `gemini-forms-extension.zip`
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** (toggle in the top-right corner)
4. Click **"Load Unpacked"**
5. Select the unzipped `gemini-forms-extension` folder
6. The extension icon will appear in your Chrome toolbar

### Step 3 — Configure

1. Click the extension icon in your toolbar
2. Paste your Gemini API key into the input field
3. Click **"Test Key"** — the debug panel will confirm your key works and show available models
4. Click **"Save Settings"**

---

## Usage

1. Open any Google Form that contains multiple choice questions
2. Click the extension icon
3. You'll see a green **"Google Form detected"** banner at the top
4. Click **▶ Run Now on This Page**
5. Watch the form — correct answers will be selected and highlighted in purple within a few seconds

### Auto-Run Mode

Toggle **"Auto-run on page load"** in the popup to have the extension trigger automatically every time you open a Google Form, without needing to press Run Now.

---

## Project Structure

```
gemini-forms-extension/
├── manifest.json       # Extension config & permissions
├── content.js          # Scrapes form questions & clicks answers
├── background.js       # Calls the Gemini API (service worker)
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic (save settings, test key, run now)
```

---

## ⚙️How the Scraping Works

The extension uses 4 fallback strategies to detect MCQ questions, handling different versions of Google Forms:

| Strategy | Method |
|----------|--------|
| 1 | Google Forms freebird CSS class names (most reliable) |
| 2 | ARIA `role="listitem"` + `role="radiogroup"` |
| 3 | Standalone radio groups with adjacent question text |
| 4 | Native `input[type="radio"]` grouped by `name` attribute |

If questions aren't found instantly, it polls the DOM every 500ms for up to 10 seconds to handle slow-loading forms.

---

## API Key Troubleshooting

| Symptom | Fix |
|---------|-----|
| Key doesn't start with `AIza` | You have the wrong key — get it from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| "Model not found" error | Click **Test Key** — it auto-detects which models are available for your account |
| "Invalid API key" | Re-copy the key carefully, no extra spaces |
| Key starts with numbers | That's a Google Cloud key, not an AI Studio key |

Click **"Test Key"** in the popup — it calls the `ListModels` API and shows you exactly which Gemini models your key can access, then auto-saves the best one.

---

## Permissions Used

| Permission | Why It's Needed |
|------------|----------------|
| `activeTab` | Read the current Google Form tab |
| `scripting` | Inject the content script manually when needed |
| `storage` | Save your API key and settings locally |
| `tabs` | Detect if the current tab is a Google Form |
| `host_permissions: docs.google.com` | Access Google Forms pages |
| `host_permissions: generativelanguage.googleapis.com` | Call the Gemini API |

>  Your API key is stored locally in Chrome's storage and never sent anywhere except Google's own Gemini API.

---

## Limitations

- Accuracy depends on Gemini AI — it may occasionally get answers wrong on tricky or ambiguous questions
- Multi-page forms require running the extension again after navigating to the next page
- Google Forms occasionally updates its HTML structure, which may require selector updates

---

##  Debugging

Open **DevTools** on the Google Form page (`F12` → Console tab) and look for `[GeminiForms]` log lines. They show:

- How many questions were found and by which strategy
- What was sent to Gemini
- What Gemini responded with
- Which option was matched and clicked

---

## License

MIT — free to use, modify, and distribute.
