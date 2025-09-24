document.addEventListener("DOMContentLoaded", () => {
    const keysToGet = ["geminiApiKey", "chatgptApiKey", "claudeApiKey"];
    
    // Load saved keys
    chrome.storage.sync.get(keysToGet, (result) => {
        if (result.geminiApiKey) document.getElementById("gemini-api-key").value = result.geminiApiKey;
        if (result.chatgptApiKey) document.getElementById("chatgpt-api-key").value = result.chatgptApiKey;
        if (result.claudeApiKey) document.getElementById("claude-api-key").value = result.claudeApiKey;
    });

    // Save settings
    document.getElementById("save-button").addEventListener("click", () => {
        const settings = {
            geminiApiKey: document.getElementById("gemini-api-key").value.trim(),
            chatgptApiKey: document.getElementById("chatgpt-api-key").value.trim(),
            claudeApiKey: document.getElementById("claude-api-key").value.trim(),
        };

        chrome.storage.sync.set(settings, () => {
            const successMessage = document.getElementById("success-message");
            successMessage.style.display = "block";
            setTimeout(() => window.close(), 1500);
        });
    });
});