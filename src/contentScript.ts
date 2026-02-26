// This script runs in the context of the Google Form page
console.log("FormGenius Content Script Loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_FORM_DATA") {
    const formData = extractFormData();
    sendResponse(formData);
  } else if (request.action === "FILL_FORM") {
    const success = fillFormData(request.suggestions);
    sendResponse({ success });
  }
  return true;
});

function fillFormData(suggestions: any[]) {
  try {
    const questionContainers = document.querySelectorAll('div[role="listitem"]');
    
    suggestions.forEach(suggestion => {
      // Find the container for this question index
      const container = questionContainers[suggestion.questionIndex - 1];
      if (!container) return;

      const suggestedAnswer = suggestion.suggestedAnswer.toLowerCase().trim();

      // Handle Multiple Choice (Radio/Checkbox)
      const options = container.querySelectorAll('div[role="radio"], div[role="checkbox"]');
      options.forEach(opt => {
        const label = (opt.getAttribute('aria-label') || opt.textContent || "").toLowerCase().trim();
        
        // If the label matches the suggested answer, click it
        if (label === suggestedAnswer || suggestedAnswer.includes(label) || label.includes(suggestedAnswer)) {
          const isChecked = opt.getAttribute('aria-checked') === 'true';
          if (!isChecked) {
            (opt as HTMLElement).click();
          }
        }
      });

      // Handle Text Inputs (Short answer/Paragraph)
      const textInput = container.querySelector('input[type="text"], textarea') as HTMLInputElement | HTMLTextAreaElement;
      if (textInput) {
        textInput.value = suggestion.suggestedAnswer;
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        textInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    return true;
  } catch (err) {
    console.error("Error filling form:", err);
    return false;
  }
}

function extractFormData() {
  const title = document.querySelector('div[role="heading"]') ?.textContent || document.title;
  const description = document.querySelector('div[id="i1"]') ?.textContent || "";
  
  // Google Forms structure: questions are usually in divs with specific classes or roles
  const questionContainers = document.querySelectorAll('div[role="listitem"]');
  const items = Array.from(questionContainers).map((container, index) => {
    const questionText = container.querySelector('div[role="heading"]') ?.textContent || 
                        container.querySelector('.M7eMe') ?.textContent || // Common class for question text
                        "Unknown Question";
    
    // Check for options (multiple choice)
    const options = Array.from(container.querySelectorAll('div[role="radio"], div[role="checkbox"]')).map(opt => {
      return opt.getAttribute('aria-label') || opt.textContent || "";
    });

    return {
      index: index + 1,
      title: questionText,
      type: options.length > 0 ? "Multiple Choice" : "Text",
      options: options
    };
  });

  return {
    info: { title, description },
    items: items.filter(item => item.title !== "Unknown Question")
  };
}
