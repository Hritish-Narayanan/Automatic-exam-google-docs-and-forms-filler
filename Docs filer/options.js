/**
 * Options page script for Google Forms Auto-Answer extension
 * Handles saving and loading the z.ai API key
 */

// Save API key to browser storage
function saveOptions(e) {
  e.preventDefault();
  
  const apiKey = document.getElementById('apiKey').value.trim();
  const statusElement = document.getElementById('status');
  
  if (!apiKey) {
    showStatus('Please enter a valid API key.', 'error');
    return;
  }
  
  browser.storage.sync.set({ apiKey }).then(() => {
    showStatus('API key saved successfully!', 'success');
  }).catch(error => {
    console.error('Error saving API key:', error);
    showStatus('Error saving API key. Please try again.', 'error');
  });
}

// Load saved API key from storage
function restoreOptions() {
  browser.storage.sync.get('apiKey').then(data => {
    if (data.apiKey) {
      document.getElementById('apiKey').value = data.apiKey;
    }
  }).catch(error => {
    console.error('Error loading API key:', error);
  });
}

// Display status message
function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = 'status ' + type;
  statusElement.style.display = 'block';
  
  // Hide status after 3 seconds
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 3000);
}

// Add event listeners
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveButton').addEventListener('click', saveOptions);