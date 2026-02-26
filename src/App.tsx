import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Loader2,
  Layout,
  RefreshCw,
  Info,
  FileText,
  Settings,
  X,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface FormSuggestion {
  questionIndex: number;
  questionTitle: string;
  suggestedAnswer: string;
  reasoning?: string;
}

interface ScrapedFormData {
  info: {
    title: string;
    description: string;
  };
  items: Array<{
    index: number;
    title: string;
    type: string;
    options: string[];
  }>;
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapedData, setScrapedData] = useState<ScrapedFormData | null>(null);
  const [suggestions, setSuggestions] = useState<FormSuggestion[]>([]);
  const [isExtension, setIsExtension] = useState(false);
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState<string>(process.env.GEMINI_API_KEY || '');

  useEffect(() => {
    // Detect if running as an extension
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      setIsExtension(true);
      
      // Load saved state from storage
      chrome.storage.local.get(['gemini_api_key', 'scrapedData', 'suggestions'], (result) => {
        if (result.gemini_api_key) {
          setApiKey(result.gemini_api_key as string);
        } else {
          // Only show settings if key is actually missing
          setShowSettings(true);
        }
        if (result.scrapedData) {
          setScrapedData(result.scrapedData as ScrapedFormData);
        }
        if (result.suggestions) {
          setSuggestions(result.suggestions as FormSuggestion[]);
        }
      });

      checkCurrentTab();
    }
  }, []);

  // Persist state changes to storage
  useEffect(() => {
    if (isExtension) {
      chrome.storage.local.set({ scrapedData, suggestions });
    }
  }, [scrapedData, suggestions, isExtension]);

  const handleReset = () => {
    setScrapedData(null);
    setSuggestions([]);
    setError(null);
    if (isExtension) {
      chrome.storage.local.remove(['scrapedData', 'suggestions']);
    }
  };

  const [fillSuccess, setFillSuccess] = useState(false);

  const handleFillForm = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      chrome.tabs.sendMessage(tab.id, { action: "FILL_FORM", suggestions }, (response) => {
        if (response?.success) {
          setFillSuccess(true);
          setTimeout(() => setFillSuccess(false), 2000);
        }
      });
    } catch (err) {
      console.error("Error filling form:", err);
    }
  };

  const [saveSuccess, setSaveSuccess] = useState(false);

  const saveApiKey = () => {
    const trimmedKey = apiKey.trim();
    if (isExtension) {
      chrome.storage.local.set({ gemini_api_key: trimmedKey }, () => {
        setApiKey(trimmedKey);
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
          setShowSettings(false);
        }, 1000);
      });
    } else {
      setApiKey(trimmedKey);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setShowSettings(false);
      }, 1000);
    }
  };

  const checkCurrentTab = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        setActiveTabUrl(tab.url);
        // Only auto-read if we don't have suggestions already
        if (tab.url.includes('docs.google.com/forms') && suggestions.length === 0) {
          handleReadPage();
        }
      }
    } catch (err) {
      console.error("Error checking tab:", err);
    }
  };

  const handleReadPage = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      setError("Extension environment not detected. Use the 'Demo Mode' below.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab found");

      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { action: "GET_FORM_DATA" }, (response) => {
        if (chrome.runtime.lastError) {
          setError("Could not connect to the page. Please refresh the Google Form and try again.");
          setLoading(false);
          return;
        }

        if (response) {
          setScrapedData(response);
          generateAiAnswers(response);
        } else {
          setError("No form data found on this page.");
          setLoading(false);
        }
      });
    } catch (err: any) {
      setError(err.message || "Failed to read page content");
      setLoading(false);
    }
  };

  const generateAiAnswers = async (data: ScrapedFormData) => {
    if (!apiKey) {
      setError("Please set your Gemini API Key in Settings first.");
      setLoading(false);
      setShowSettings(true);
      return;
    }

    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const model = "gemini-3-flash-preview";
      
      // Optimized prompt for speed and precision
      const prompt = `
        Form: ${data.info?.title}
        Questions:
        ${data.items?.map((item: any) => `${item.index}. ${item.title} (${item.type}) ${item.options.length > 0 ? `[${item.options.join("|")}]` : ""}`).join("\n")}

        Task: Suggest accurate answers. Return JSON: {suggestions: [{questionIndex, questionTitle, suggestedAnswer, reasoning}]}.
      `;

      const aiRes = await ai.models.generateContent({
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

      const result = JSON.parse(aiRes.text || '{}');
      setSuggestions(result.suggestions || []);
    } catch (err: any) {
      setError(err.message || "AI Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  // Demo Mode for the web preview
  const handleDemoMode = () => {
    const mockData: ScrapedFormData = {
      info: { title: "Job Application Form", description: "Apply for the Senior Web Engineer position." },
      items: [
        { index: 1, title: "What is your primary programming language?", type: "Multiple Choice", options: ["JavaScript", "Python", "Go", "Rust"] },
        { index: 2, title: "How many years of experience do you have?", type: "Text", options: [] },
        { index: 3, title: "Why do you want to join our team?", type: "Text", options: [] }
      ]
    };
    setScrapedData(mockData);
    generateAiAnswers(mockData);
  };

  const isGoogleForm = activeTabUrl.includes('docs.google.com/forms');

  return (
    <div className="w-[400px] min-h-[520px] bg-zinc-50 font-sans text-zinc-900 flex flex-col overflow-hidden">
      {/* Extension Popup UI */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden shadow-inner">
        {/* Header */}
        <div className="bg-white border-b border-zinc-100 p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200/50">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight text-zinc-800">VADAPAV GENIUS</h1>
              <div className="flex items-center gap-1.5">
                <div className={cn("w-1.5 h-1.5 rounded-full", isExtension ? "bg-emerald-500" : "bg-amber-500")} />
                <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-widest">
                  {isExtension ? "Active" : "Preview"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(suggestions.length > 0 || scrapedData) && (
              <button 
                onClick={handleReset}
                className="p-2 hover:bg-rose-50 rounded-full transition-all text-zinc-400 hover:text-rose-600 active:scale-90"
                title="Reset Memory"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            {isExtension && (
              <button 
                onClick={handleReadPage}
                className="p-2 hover:bg-zinc-50 rounded-full transition-all text-zinc-400 hover:text-indigo-600 active:scale-90"
                title="Refresh Form"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={() => {
                setError(null);
                setShowSettings(!showSettings);
              }}
              className={cn(
                "p-2 rounded-full transition-all active:scale-90",
                showSettings ? "bg-indigo-50 text-indigo-600" : "text-zinc-400 hover:bg-zinc-50 hover:text-indigo-600"
              )}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            {showSettings ? (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-6 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-zinc-800 flex items-center gap-2 text-lg">
                    <Settings className="w-5 h-5 text-indigo-600" />
                    Settings
                  </h2>
                  <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                      Gemini API Key
                    </label>
                    {apiKey ? (
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">Active</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-rose-500 rounded-full" />
                        <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">Missing</span>
                      </div>
                    )}
                  </div>
                  <div className="relative group">
                    <input 
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your API key..."
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl py-4 pl-12 pr-12 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm group-hover:bg-white"
                    />
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-300 group-focus-within:text-indigo-500 transition-colors" />
                    {apiKey && (
                      <button 
                        onClick={() => setApiKey('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed px-1">
                    Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-indigo-600 font-bold hover:underline">AI Studio</a>. 
                    Stored locally and never shared.
                  </p>
                </div>

                <div className="bg-zinc-50 rounded-2xl p-4 space-y-3 border border-zinc-100">
                  <h3 className="text-[11px] font-bold text-zinc-500 uppercase flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-indigo-500" />
                    Quick Guide
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 bg-white border border-zinc-200 rounded-full flex items-center justify-center text-[9px] font-bold text-zinc-400 shrink-0">1</span>
                      <p className="text-[10px] text-zinc-500 leading-tight">Open any Google Form</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 bg-white border border-zinc-200 rounded-full flex items-center justify-center text-[9px] font-bold text-zinc-400 shrink-0">2</span>
                      <p className="text-[10px] text-zinc-500 leading-tight">Click "Analyze Form"</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 bg-white border border-zinc-200 rounded-full flex items-center justify-center text-[9px] font-bold text-zinc-400 shrink-0">3</span>
                      <p className="text-[10px] text-zinc-500 leading-tight">Use "Auto-Fill" for MCQs</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={saveApiKey}
                  className={cn(
                    "w-full font-semibold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2",
                    saveSuccess 
                      ? "bg-emerald-500 text-white shadow-emerald-100" 
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100"
                  )}
                >
                  {saveSuccess ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Saved Successfully
                    </>
                  ) : (
                    "Save Settings"
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="main"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-5 space-y-5"
              >
                {!scrapedData && !loading && (
                  <div className="text-center py-10 space-y-6">
                    <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-zinc-100">
                      <FileText className="w-8 h-8 text-zinc-300" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="font-bold text-zinc-800 text-lg">Ready to Analyze</h2>
                      <p className="text-xs text-zinc-500 leading-relaxed px-10">
                        {isExtension 
                          ? isGoogleForm 
                            ? "Click below to read the questions on this page." 
                            : "Navigate to a Google Form to start using VADAPAV GENIUS."
                          : "This is a preview. Click 'Demo Mode' to see how it works on a real form."}
                      </p>
                    </div>
                    
                    {isExtension && isGoogleForm && (
                      <button 
                        onClick={handleReadPage}
                        className="w-[80%] bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-xl shadow-indigo-200/50 flex items-center justify-center gap-2 mx-auto active:scale-[0.98]"
                      >
                        <Sparkles className="w-4 h-4" />
                        Analyze Form
                      </button>
                    )}

                    {!isExtension && (
                      <button 
                        onClick={handleDemoMode}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        Try Demo Mode
                      </button>
                    )}
                  </div>
                )}

                {loading && (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-xs font-semibold text-slate-500 animate-pulse">AI is thinking...</p>
                  </div>
                )}

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-rose-50 border border-rose-100 p-4 rounded-xl space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-rose-700 leading-relaxed font-semibold">{error}</p>
                    </div>
                    {error.includes("API Key") && (
                      <button 
                        onClick={() => {
                          setError(null);
                          setShowSettings(true);
                        }}
                        className="w-full bg-rose-100 hover:bg-rose-200 text-rose-700 text-[10px] font-bold py-2 rounded-lg transition-colors uppercase tracking-wider"
                      >
                        Open Settings to Add Key
                      </button>
                    )}
                  </motion.div>
                )}

                {/* Results Area */}
                {suggestions.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Suggested Answers
                      </h3>
                      <button 
                        onClick={handleFillForm}
                        className={cn(
                          "text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5",
                          fillSuccess 
                            ? "bg-emerald-500 text-white shadow-emerald-100" 
                            : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100"
                        )}
                      >
                        {fillSuccess ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Done!
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            Auto-Fill MCQs
                          </>
                        )}
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
                      {suggestions.map((s, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="bg-zinc-50/50 border border-zinc-100 rounded-2xl p-4 space-y-3 hover:bg-zinc-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="w-6 h-6 bg-white border border-zinc-200 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                              <span className="text-[10px] font-bold text-zinc-400">Q{s.questionIndex}</span>
                            </div>
                            <p className="text-xs font-bold text-zinc-800 flex-1 leading-relaxed">{s.questionTitle}</p>
                          </div>
                          <div className="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm flex items-center justify-between gap-3 group/item">
                            <p className="text-sm text-indigo-600 font-bold flex-1 leading-snug">{s.suggestedAnswer}</p>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(s.suggestedAnswer);
                              }}
                              className="p-2 bg-zinc-50 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover/item:opacity-100 active:scale-90"
                              title="Copy Answer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {s.reasoning && (
                            <div className="flex items-start gap-2 px-1">
                              <div className="w-1 h-1 bg-zinc-200 rounded-full mt-1.5 shrink-0" />
                              <p className="text-[10px] text-zinc-400 leading-relaxed italic">
                                {s.reasoning}
                              </p>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                    
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                      <p className="text-[9px] text-center text-amber-700 font-medium leading-tight">
                        ⚠️ These suggestions are AI-generated. Always review before submitting your form.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-center shrink-0">
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">VADAPAV GENIUS v1.0</p>
        </div>
      </div>

      {/* Background Decoration */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-100/20 rounded-full blur-[120px]" />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #CBD5E1;
        }
      `}} />
    </div>
  );
}
