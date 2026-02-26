import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function suggestAnswers(formData: any) {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze the following Google Form structure and provide suggested answers for each question.
    Form Title: ${formData.info?.title}
    Form Description: ${formData.info?.description || "No description"}
    
    Questions:
    ${formData.items?.map((item: any, index: number) => {
      if (!item.questionItem) return "";
      const q = item.questionItem.question;
      return `${index + 1}. ${item.title} (Type: ${q.choiceQuestion ? "Multiple Choice" : "Text"})
      ${q.choiceQuestion ? `Options: ${q.choiceQuestion.options.map((o: any) => o.value).join(", ")}` : ""}`;
    }).join("\n")}

    Return the suggestions in a structured JSON format.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionIndex: { type: Type.NUMBER },
                questionTitle: { type: Type.STRING },
                suggestedAnswer: { type: Type.STRING },
                reasoning: { type: Type.STRING }
              },
              required: ["questionIndex", "questionTitle", "suggestedAnswer"]
            }
          }
        },
        required: ["suggestions"]
      }
    }
  });

  return JSON.parse(response.text);
}
