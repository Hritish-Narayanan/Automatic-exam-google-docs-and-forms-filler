/**
 * Background script for Google Forms Auto-Answer extension
 * Handles API key storage and communication with z.ai API
 */

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getApiKey") {
    // Retrieve API key from storage
    browser.storage.sync.get("apiKey").then(data => {
      sendResponse({ apiKey: data.apiKey || "" });
    }).catch(error => {
      console.error("Error retrieving API key:", error);
      sendResponse({ apiKey: "" });
    });
    return true; // Required for asynchronous sendResponse
  }
  
  if (message.action === "queryZAI") {
    // Get API key and make request to z.ai
    browser.storage.sync.get("apiKey").then(data => {
      if (!data.apiKey) {
        sendResponse({ error: "API key not set. Please set it in the extension options." });
        return;
      }
      
      // Make API request to z.ai
      fetch("https://api.z.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${data.apiKey}`
        },
        body: JSON.stringify({
          model: "z-code-2", // Use appropriate model
          messages: [
            {
              role: "system",
              content: "You are an academic assistant helping to answer questions accurately and concisely. Provide direct answers that can be used in a form."
            },
            {
              role: "user",
              content: message.prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          sendResponse({ error: data.error.message || "Error from z.ai API" });
        } else {
          // Extract the answer from the API response
          const answer = data.choices && data.choices[0] && data.choices[0].message ? 
                        data.choices[0].message.content : "";
          sendResponse({ answer });
        }
      })
      .catch(error => {
        console.error("Error querying z.ai API:", error);
        sendResponse({ error: "Failed to connect to z.ai API" });
      });
    });
    return true; // Required for asynchronous sendResponse
  }
});