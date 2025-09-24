function getArticleText() {
  const selectors = [
    "article",
    'main',
    '[role="main"]',
    '#content',
    '#main',
    '.post',
    '.entry',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      element.querySelectorAll('script, style, noscript, a[aria-hidden="true"]').forEach(el => el.remove());
      const text = element.innerText.trim().replace(/\s{2,}/g, '\n');
      if (text.length > 200) {
        return text;
      }
    }
  }

  console.log("No specific article container found, falling back to paragraphs.");
  const paragraphs = Array.from(document.querySelectorAll("p"));
  if (paragraphs.length > 0) {
    return paragraphs.map((p) => p.innerText.trim()).join("\n\n");
  }

  console.log("No paragraphs found, falling back to body text.");
  return document.body.innerText.trim().replace(/\s{2,}/g, '\n');
}


chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "GET_ARTICLE_TEXT") {
    const text = getArticleText();
    if (text && text.length > 100) {
      sendResponse({ text });
    } else {
      sendResponse({ text: null });
    }
  }
  return true;
});

document.addEventListener("DOMContentLoaded", () => {
  const modelButtons = document.querySelectorAll(".model-btn");
  let selectedModel = "gemini";

  chrome.storage.local.get("selectedModel", (result) => {
    if (result.selectedModel && result.selectedModel !== "perplexity") {
      selectedModel = result.selectedModel;
    }
    updateSelectedButtonUI();
  });

  function updateSelectedButtonUI() {
    modelButtons.forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.model === selectedModel);
    });
  }
  modelButtons.forEach(button => {
    button.addEventListener("click", () => {
      selectedModel = button.dataset.model;
      chrome.storage.local.set({ selectedModel: selectedModel });
      updateSelectedButtonUI();
    });
  });

  document.getElementById("summarize").addEventListener("click", () => {
    summarizePage(selectedModel);
  });
});

/**
 * Main function to initiate the summarization process.
 * @param {string} model The AI model to use (e.g., 'gemini', 'chatgpt').
 */
function summarizePage(model) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = '<div class="loading"><div class="loader"></div></div>';
  const summaryType = document.getElementById("summary-type").value;

  const keysToGet = ["geminiApiKey", "chatgptApiKey", "claudeApiKey"];

  chrome.storage.sync.get(keysToGet, (result) => {
    let apiKey;
    switch (model) {
      case "gemini": apiKey = result.geminiApiKey; break;
      case "chatgpt": apiKey = result.chatgptApiKey; break;
      case "claude": apiKey = result.claudeApiKey; break;
    }

    if (!apiKey) {
      resultDiv.innerHTML = `API key for ${model} not found. Please go to the extension's options page to set it.`;
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { type: "GET_ARTICLE_TEXT" }, async (res) => {
        if (!res || !res.text) {
          resultDiv.innerText = "Could not extract article text from this page.";
          return;
        }
        try {
          const summary = await getSummary(res.text, summaryType, model, apiKey);
          resultDiv.innerText = summary;
        } catch (error) {
          resultDiv.innerText = `Error: ${error.message || "Failed to generate summary."}`;
        }
      });
    });
  });
}

document.getElementById("copy-btn").addEventListener("click", () => {
  const summaryText = document.getElementById("result").innerText;
  if (summaryText && summaryText.trim() !== "") {
    navigator.clipboard.writeText(summaryText).then(() => {
      const copyBtn = document.getElementById("copy-btn");
      const originalText = copyBtn.innerText;
      copyBtn.innerText = "Copied!";
      setTimeout(() => { copyBtn.innerText = originalText; }, 2000);
    });
  }
});

async function getSummary(text, summaryType, model, apiKey) {
  switch (model) {
    case "gemini": return getGeminiSummary(text, summaryType, apiKey);
    case "chatgpt": return getChatGptSummary(text, summaryType, apiKey);
    case "claude": return getClaudeSummary(text, summaryType, apiKey);
    default: throw new Error("Invalid AI model selected.");
  }
}

function getPrompt(text, summaryType) {
  const maxLength = 20000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  switch (summaryType) {
    case "brief": return `Provide a brief summary of the following article in 2-3 sentences:\n\n${truncatedText}`;
    case "detailed": return `Provide a detailed summary of the following article, covering all main points and key details:\n\n${truncatedText}`;
    case "bullets": return `Summarize the following article in 5-7 key points using dashes (-):\n\n${truncatedText}`;
    default: return `Summarize the following article:\n\n${truncatedText}`;
  }
}

async function getGeminiSummary(text, summaryType, apiKey) {
  const prompt = getPrompt(text, summaryType);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
  });
  if (!res.ok) { const errorData = await res.json(); throw new Error(errorData.error?.message || "Gemini API request failed"); }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No summary available.";
}

async function getChatGptSummary(text, summaryType, apiKey) {
  const prompt = getPrompt(text, summaryType);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes text." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || "ChatGPT API request failed");
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "No summary available.";
}


async function getClaudeSummary(text, summaryType, apiKey) {
  const prompt = getPrompt(text, summaryType);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-3-sonnet-20240229",
      max_tokens: 2048,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || "Claude API request failed");
  }

  const data = await res.json();
  return data?.content?.[0]?.text || "No summary available.";
}

