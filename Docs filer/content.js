/**
 * Content script for Google Forms & Docs Auto-Answer extension
 * Detects Google Forms/Docs and provides appropriate functionality
 */

// Configuration for Google Forms
const formsConfig = {
  // Selectors for Google Forms elements
  selectors: {
    formContainer: '.freebirdFormviewerViewFormCard',
    questionContainer: '.freebirdFormviewerViewItemsItemItem',
    questionTitle: '.freebirdFormviewerViewItemsItemItemTitle',
    shortAnswerInput: '.quantumWizTextinputPaperinputInput',
    paragraphInput: '.quantumWizTextinputPapertextareaInput',
    multipleChoiceOption: '.docssharedWizToggleLabeledLabelWrapper',
    checkboxOption: '.docssharedWizToggleLabeledLabelWrapper',
    dropdownContainer: '.quantumWizMenuPaperselectEl',
    dropdownOptions: '.exportSelectPopup .quantumWizMenuPaperselectOption',
    nextButton: '.freebirdFormviewerViewNavigationButtons .appsMaterialWizButtonPaperbuttonLabel',
    submitButton: '.freebirdFormviewerViewNavigationSubmitButton',
    requiredIndicator: '.freebirdFormviewerViewItemsItemRequiredAsterisk',
    sectionIndicator: '.freebirdFormviewerViewNumberedPageContainer',
  },
  // Delay between operations (ms)
  delay: 1000,
  // Maximum retries for API calls
  maxRetries: 3,
};

// Configuration for Google Docs
const docsConfig = {
  selectors: {
    editor: '.kix-appview-editor',
    toolbar: '.docs-toolbar-wrap',
    textContent: '.kix-page',
    cursor: '.kix-cursor',
    menuButton: '.docs-toolbar-more-toolbar',
  },
  delay: 1000,
  maxRetries: 3,
};

// Determine which Google service we're on and initialize accordingly
function initializeExtension() {
  // Check if API key is set
  browser.runtime.sendMessage({ action: "getApiKey" }).then(apiKeyResponse => {
    if (!apiKeyResponse.apiKey) {
      console.error('Google Forms & Docs Auto-Answer: API key not set');
      alert('Please set your z.ai API key in the extension options before using this extension.');
      return;
    }
    
    // Determine which Google service we're on
    const url = window.location.href;
    
    if (url.includes('docs.google.com/forms')) {
      console.log('Google Forms & Docs Auto-Answer: Google Forms detected');
      processGoogleForm();
    } else if (url.includes('docs.google.com/document')) {
      console.log('Google Forms & Docs Auto-Answer: Google Docs detected');
      setupGoogleDocs();
    } else {
      console.log('Google Forms & Docs Auto-Answer: Unsupported Google service');
    }
  }).catch(error => {
    console.error('Google Forms & Docs Auto-Answer: Error initializing extension', error);
  });
}

// Main function to process the form
async function processGoogleForm() {
  console.log('Google Forms & Docs Auto-Answer: Starting to process form');
  
  // Wait for form to fully load
  await waitForElement(formsConfig.selectors.formContainer);
  console.log('Google Forms & Docs Auto-Answer: Form detected');
  
  // Process visible questions
  await processVisibleQuestions();
  
  // Set up observer for form changes (new sections, etc.)
  setupFormObserver();
}

// Process all currently visible questions
async function processVisibleQuestions() {
  const questions = document.querySelectorAll(formsConfig.selectors.questionContainer);
  console.log(`Google Forms & Docs Auto-Answer: Found ${questions.length} questions`);
  
  for (const questionElement of questions) {
    // Skip already answered questions
    if (questionElement.dataset.processed === 'true') {
      continue;
    }
    
    await processQuestion(questionElement);
    
    // Mark as processed
    questionElement.dataset.processed = 'true';
    
    // Small delay between questions to avoid rate limiting
    await delay(formsConfig.delay);
  }
  
  // Check if we need to go to next page
  const nextButton = findNextButton();
  if (nextButton) {
    console.log('Google Forms & Docs Auto-Answer: Moving to next section');
    nextButton.click();
    // Wait for new section to load
    await delay(formsConfig.delay * 2);
    // Process the new section
    await processVisibleQuestions();
  }
}

// Process a single question
async function processQuestion(questionElement) {
  // Extract question text
  const questionTitleElement = questionElement.querySelector(formsConfig.selectors.questionTitle);
  if (!questionTitleElement) return;
  
  const questionText = questionTitleElement.textContent.trim();
  console.log(`Google Forms & Docs Auto-Answer: Processing question: ${questionText}`);
  
  // Determine question type and extract options if applicable
  const questionData = extractQuestionData(questionElement, questionText);
  
  // Skip if we couldn't determine the question type
  if (!questionData.type) {
    console.log(`Google Forms & Docs Auto-Answer: Could not determine type for question: ${questionText}`);
    return;
  }
  
  // Generate answer using z.ai API
  const answer = await getAnswerFromAPI(questionData);
  if (!answer) {
    console.log(`Google Forms & Docs Auto-Answer: Failed to get answer for question: ${questionText}`);
    return;
  }
  
  // Fill in the answer
  await fillAnswer(questionElement, questionData.type, answer, questionData.options);
}

// Extract question data including type and options
function extractQuestionData(questionElement, questionText) {
  const data = {
    text: questionText,
    type: null,
    options: [],
    required: questionElement.querySelector(formsConfig.selectors.requiredIndicator) !== null
  };
  
  // Check for short answer input
  if (questionElement.querySelector(formsConfig.selectors.shortAnswerInput)) {
    data.type = 'shortAnswer';
  }
  // Check for paragraph input
  else if (questionElement.querySelector(formsConfig.selectors.paragraphInput)) {
    data.type = 'paragraph';
  }
  // Check for multiple choice
  else if (questionElement.querySelectorAll(formsConfig.selectors.multipleChoiceOption).length > 0) {
    data.type = 'multipleChoice';
    const options = questionElement.querySelectorAll(formsConfig.selectors.multipleChoiceOption);
    options.forEach(option => {
      data.options.push(option.textContent.trim());
    });
  }
  // Check for checkboxes (similar to multiple choice in Google Forms)
  else if (questionElement.querySelectorAll(formsConfig.selectors.checkboxOption).length > 0) {
    data.type = 'checkbox';
    const options = questionElement.querySelectorAll(formsConfig.selectors.checkboxOption);
    options.forEach(option => {
      data.options.push(option.textContent.trim());
    });
  }
  // Check for dropdown
  else if (questionElement.querySelector(formsConfig.selectors.dropdownContainer)) {
    data.type = 'dropdown';
    // We'll need to click to open the dropdown to get options
    // This will be handled in the fillAnswer function
  }
  
  return data;
}

// Get answer from z.ai API
async function getAnswerFromAPI(questionData) {
  let prompt = `Please answer this question concisely: ${questionData.text}`;
  
  // Include options in the prompt if available
  if (questionData.options.length > 0) {
    prompt += `\nOptions: ${questionData.options.join(', ')}`;
    prompt += `\nPlease respond with the exact text of the best option(s).`;
  }
  
  // Add instruction based on question type
  if (questionData.type === 'shortAnswer' || questionData.type === 'paragraph') {
    prompt += `\nProvide a concise answer suitable for a ${questionData.type} field.`;
  } else if (questionData.type === 'multipleChoice' || questionData.type === 'dropdown') {
    prompt += `\nSelect exactly one option from the list above.`;
  } else if (questionData.type === 'checkbox') {
    prompt += `\nSelect all applicable options from the list above.`;
  }
  
  console.log(`Google Forms & Docs Auto-Answer: Sending prompt to z.ai: ${prompt}`);
  
  // Send request to background script to query z.ai API
  try {
    const response = await browser.runtime.sendMessage({
      action: "queryZAI",
      prompt: prompt
    });
    
    if (response.error) {
      console.error(`Google Forms & Docs Auto-Answer: API error: ${response.error}`);
      return null;
    }
    
    console.log(`Google Forms & Docs Auto-Answer: Received answer: ${response.answer}`);
    return response.answer;
  } catch (error) {
    console.error(`Google Forms & Docs Auto-Answer: Error querying API: ${error}`);
    return null;
  }
}

// Fill in the answer based on question type
async function fillAnswer(questionElement, questionType, answer, options) {
  switch (questionType) {
    case 'shortAnswer':
      const shortInput = questionElement.querySelector(formsConfig.selectors.shortAnswerInput);
      if (shortInput) {
        fillInputField(shortInput, answer);
      }
      break;
      
    case 'paragraph':
      const paragraphInput = questionElement.querySelector(formsConfig.selectors.paragraphInput);
      if (paragraphInput) {
        fillInputField(paragraphInput, answer);
      }
      break;
      
    case 'multipleChoice':
      await selectMultipleChoiceOption(questionElement, answer, options);
      break;
      
    case 'checkbox':
      await selectCheckboxOptions(questionElement, answer, options);
      break;
      
    case 'dropdown':
      await selectDropdownOption(questionElement, answer);
      break;
      
    default:
      console.log(`Google Forms & Docs Auto-Answer: Unsupported question type: ${questionType}`);
  }
}

// Fill text input field
function fillInputField(inputElement, text) {
  // Focus the element
  inputElement.focus();
  
  // Set the value
  inputElement.value = text;
  
  // Dispatch events to trigger Google Forms validation
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  inputElement.dispatchEvent(new Event('change', { bubbles: true }));
  inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
  
  console.log('Google Forms & Docs Auto-Answer: Filled text input');
}

// Select option in multiple choice question
async function selectMultipleChoiceOption(questionElement, answer, options) {
  const optionElements = questionElement.querySelectorAll(formsConfig.selectors.multipleChoiceOption);
  let bestMatch = findBestMatchingOption(answer, options, optionElements);
  
  if (bestMatch) {
    // Click the option
    bestMatch.click();
    console.log(`Google Forms & Docs Auto-Answer: Selected multiple choice option: ${bestMatch.textContent.trim()}`);
  } else {
    console.log('Google Forms & Docs Auto-Answer: Could not find matching multiple choice option');
  }
}

// Select options in checkbox question
async function selectCheckboxOptions(questionElement, answer, options) {
  const optionElements = questionElement.querySelectorAll(formsConfig.selectors.checkboxOption);
  const selectedOptions = parseMultipleSelections(answer, options);
  
  let selectionMade = false;
  
  for (let i = 0; i < optionElements.length; i++) {
    const optionText = optionElements[i].textContent.trim();
    const shouldSelect = selectedOptions.some(selected => 
      optionText.toLowerCase().includes(selected.toLowerCase()) || 
      selected.toLowerCase().includes(optionText.toLowerCase()));
    
    if (shouldSelect) {
      // Check if already selected
      const isAlreadySelected = optionElements[i].querySelector('input[type="checkbox"]:checked') !== null;
      
      if (!isAlreadySelected) {
        optionElements[i].click();
        console.log(`Google Forms & Docs Auto-Answer: Selected checkbox option: ${optionText}`);
        selectionMade = true;
        // Small delay between selections
        await delay(300);
      }
    }
  }
  
  if (!selectionMade) {
    console.log('Google Forms & Docs Auto-Answer: Could not find matching checkbox options');
  }
}

// Select option in dropdown
async function selectDropdownOption(questionElement, answer) {
  const dropdownElement = questionElement.querySelector(formsConfig.selectors.dropdownContainer);
  if (!dropdownElement) return;
  
  // Click to open dropdown
  dropdownElement.click();
  await delay(500); // Wait for dropdown to open
  
  // Get dropdown options
  const optionElements = document.querySelectorAll(formsConfig.selectors.dropdownOptions);
  const options = Array.from(optionElements).map(el => el.textContent.trim());
  
  // Find best match
  let bestMatch = findBestMatchingOption(answer, options, optionElements);
  
  if (bestMatch) {
    // Click the option
    bestMatch.click();
    console.log(`Google Forms & Docs Auto-Answer: Selected dropdown option: ${bestMatch.textContent.trim()}`);
  } else {
    // Close dropdown if no match found
    document.body.click();
    console.log('Google Forms & Docs Auto-Answer: Could not find matching dropdown option');
  }
}

// Find the best matching option from a list based on the answer
function findBestMatchingOption(answer, options, optionElements) {
  if (!options || !optionElements || options.length === 0 || optionElements.length === 0) {
    return null;
  }
  
  // Clean up the answer text
  const cleanAnswer = answer.toLowerCase().trim();
  
  // First try exact match
  for (let i = 0; i < optionElements.length; i++) {
    const optionText = optionElements[i].textContent.trim();
    if (cleanAnswer === optionText.toLowerCase() || 
        cleanAnswer.includes(optionText.toLowerCase()) || 
        optionText.toLowerCase().includes(cleanAnswer)) {
      return optionElements[i];
    }
  }
  
  // If no exact match, try to find the option with most words in common
  const answerWords = cleanAnswer.split(/\s+/);
  let bestMatchScore = 0;
  let bestMatchIndex = -1;
  
  for (let i = 0; i < optionElements.length; i++) {
    const optionText = optionElements[i].textContent.trim().toLowerCase();
    const optionWords = optionText.split(/\s+/);
    
    let matchScore = 0;
    for (const word of answerWords) {
      if (word.length > 3 && optionText.includes(word)) { // Only count significant words
        matchScore++;
      }
    }
    
    if (matchScore > bestMatchScore) {
      bestMatchScore = matchScore;
      bestMatchIndex = i;
    }
  }
  
  return bestMatchIndex >= 0 ? optionElements[bestMatchIndex] : null;
}

// Parse multiple selections from answer text
function parseMultipleSelections(answer, options) {
  if (!options || options.length === 0) return [];
  
  const selectedOptions = [];
  const cleanAnswer = answer.toLowerCase();
  
  // Check each option
  for (const option of options) {
    const cleanOption = option.toLowerCase();
    
    // Check if the option is explicitly mentioned in the answer
    if (cleanAnswer.includes(cleanOption)) {
      selectedOptions.push(option);
      continue;
    }
    
    // Check for partial matches with significant words
    const optionWords = cleanOption.split(/\s+/).filter(word => word.length > 3);
    let significantWordsFound = 0;
    
    for (const word of optionWords) {
      if (cleanAnswer.includes(word)) {
        significantWordsFound++;
      }
    }
    
    // If more than half of significant words are found, consider it a match
    if (optionWords.length > 0 && significantWordsFound / optionWords.length > 0.5) {
      selectedOptions.push(option);
    }
  }
  
  return selectedOptions;
}

// Find the next button in the form
function findNextButton() {
  const nextButtons = document.querySelectorAll(formsConfig.selectors.nextButton);
  for (const button of nextButtons) {
    if (button.textContent.trim().toLowerCase() === 'next') {
      return button;
    }
  }
  return null;
}

// Set up observer for form changes
function setupFormObserver() {
  const formContainer = document.querySelector(formsConfig.selectors.formContainer);
  if (!formContainer) return;
  
  const observer = new MutationObserver(async (mutations) => {
    let newQuestionsAdded = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if new questions or sections were added
            if (node.querySelector(formsConfig.selectors.questionContainer) || 
                node.matches(formsConfig.selectors.questionContainer) ||
                node.querySelector(formsConfig.selectors.sectionIndicator) ||
                node.matches(formsConfig.selectors.sectionIndicator)) {
              newQuestionsAdded = true;
              break;
            }
          }
        }
      }
      
      if (newQuestionsAdded) break;
    }
    
    if (newQuestionsAdded) {
      console.log('Google Forms & Docs Auto-Answer: New questions detected');
      await delay(formsConfig.delay); // Wait for DOM to stabilize
      await processVisibleQuestions();
    }
  });
  
  observer.observe(formContainer, { childList: true, subtree: true });
  console.log('Google Forms & Docs Auto-Answer: Form observer set up');
}

// Google Docs functionality
// -------------------------

// Set up Google Docs functionality
async function setupGoogleDocs() {
  console.log('Google Forms & Docs Auto-Answer: Setting up Google Docs functionality');
  
  // Wait for the editor to load
  await waitForElement(docsConfig.selectors.editor);
  console.log('Google Forms & Docs Auto-Answer: Google Docs editor detected');
  
  // Add a floating button to the docs interface
  addDocsInterface();
}

// Add interface elements to Google Docs
function addDocsInterface() {
  // Create a floating button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.position = 'fixed';
  buttonContainer.style.bottom = '20px';
  buttonContainer.style.right = '20px';
  buttonContainer.style.zIndex = '9999';
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'column';
  buttonContainer.style.gap = '10px';
  
  // Create the main button
  const assistButton = document.createElement('button');
  assistButton.textContent = 'AI Assist';
  assistButton.style.padding = '10px 15px';
  assistButton.style.backgroundColor = '#4285f4';
  assistButton.style.color = 'white';
  assistButton.style.border = 'none';
  assistButton.style.borderRadius = '4px';
  assistButton.style.cursor = 'pointer';
  assistButton.style.fontWeight = 'bold';
  assistButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  
  // Add hover effect
  assistButton.addEventListener('mouseover', () => {
    assistButton.style.backgroundColor = '#3367d6';
  });
  assistButton.addEventListener('mouseout', () => {
    assistButton.style.backgroundColor = '#4285f4';
  });
  
  // Add click event
  assistButton.addEventListener('click', () => {
    showDocsMenu(buttonContainer);
  });
  
  // Add button to container
  buttonContainer.appendChild(assistButton);
  
  // Add container to page
  document.body.appendChild(buttonContainer);
  console.log('Google Forms & Docs Auto-Answer: Added interface to Google Docs');
}

// Show the menu with different options
function showDocsMenu(container) {
  // Remove any existing menu
  const existingMenu = container.querySelector('.ai-menu');
  if (existingMenu) {
    container.removeChild(existingMenu);
    return;
  }
  
  // Create menu
  const menu = document.createElement('div');
  menu.className = 'ai-menu';
  menu.style.backgroundColor = 'white';
  menu.style.border = '1px solid #ccc';
  menu.style.borderRadius = '4px';
  menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  menu.style.marginBottom = '10px';
  
  // Add menu options
  const options = [
    { text: 'Summarize selected text', action: summarizeText },
    { text: 'Expand selected text', action: expandText },
    { text: 'Answer question in selection', action: answerQuestion },
    { text: 'Improve writing', action: improveWriting },
    { text: 'Generate content', action: generateContent }
  ];
  
  options.forEach(option => {
    const optionElement = document.createElement('div');
    optionElement.textContent = option.text;
    optionElement.style.padding = '10px 15px';
    optionElement.style.cursor = 'pointer';
    
    // Add hover effect
    optionElement.addEventListener('mouseover', () => {
      optionElement.style.backgroundColor = '#f1f3f4';
    });
    optionElement.addEventListener('mouseout', () => {
      optionElement.style.backgroundColor = 'transparent';
    });
    
    // Add click event
    optionElement.addEventListener('click', () => {
      option.action();
      container.removeChild(menu);
    });
    
    menu.appendChild(optionElement);
  });
  
  // Insert menu before the button
  container.insertBefore(menu, container.firstChild);
}

// Get selected text from Google Docs
function getSelectedText() {
  // This is tricky in Google Docs as it uses a complex editor
  // We'll use a workaround by checking if text is selected and using document.getSelection()
  const selection = document.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    return selection.toString();
  }
  
  // If no text is directly selectable, we might need to inform the user
  alert('Please select some text in the document first.');
  return null;
}

// Insert text at cursor position
async function insertTextAtCursor(text) {
  // Since we can't directly manipulate the Google Docs editor,
  // we'll use clipboard and keyboard shortcuts
  
  // Store original clipboard content
  const originalClipboard = await navigator.clipboard.readText().catch(() => '');
  
  // Copy new text to clipboard
  await navigator.clipboard.writeText(text).catch(err => {
    console.error('Failed to write to clipboard:', err);
    alert('Could not access clipboard. Please check permissions.');
    return false;
  });
  
  // Simulate paste keyboard shortcut (Ctrl+V)
  document.execCommand('paste');
  
  // Restore original clipboard after a short delay
  setTimeout(async () => {
    await navigator.clipboard.writeText(originalClipboard).catch(() => {});
  }, 100);
  
  return true;
}

// AI functions for Google Docs
async function summarizeText() {
  const selectedText = getSelectedText();
  if (!selectedText) return;
  
  const prompt = `Please summarize the following text concisely:\n${selectedText}`;
  
  try {
    const response = await browser.runtime.sendMessage({
      action: "queryZAI",
      prompt: prompt
    });
    
    if (response.error) {
      alert(`Error: ${response.error}`);
      return;
    }
    
    // Create a result dialog
    showResultDialog('Summary', response.answer);
    
  } catch (error) {
    console.error('Error summarizing text:', error);
    alert('Failed to summarize text. Please try again.');
  }
}

async function expandText() {
  const selectedText = getSelectedText();
  if (!selectedText) return;
  
  const prompt = `Please expand on the following text with more details and explanation:\n${selectedText}`;
  
  try {
    const response = await browser.runtime.sendMessage({
      action: "queryZAI",
      prompt: prompt
    });
    
    if (response.error) {
      alert(`Error: ${response.error}`);
      return;
    }
    
    // Create a result dialog
    showResultDialog('Expanded Text', response.answer);
    
  } catch (error) {
    console.error('Error expanding text:', error);
    alert('Failed to expand text. Please try again.');
  }
}

async function answerQuestion() {
  const selectedText = getSelectedText();
  if (!selectedText) return;
  
  const prompt = `Please answer this question with academic accuracy:\n${selectedText}`;
  
  try {
    const response = await browser.runtime.sendMessage({
      action: "queryZAI",
      prompt: prompt
    });
    
    if (response.error) {
      alert(`Error: ${response.error}`);
      return;
    }
    
    // Create a result dialog
    showResultDialog('Answer', response.answer);
    
  } catch (error) {
    console.error('Error answering question:', error);
    alert('Failed to answer question. Please try again.');
  }
}

async function improveWriting() {
  const selectedText = getSelectedText();
  if (!selectedText) return;
  
  const prompt = `Please improve the following text for clarity, grammar, and style while maintaining the original meaning:\n${selectedText}`;
  
  try {
    const response = await browser.runtime.sendMessage({
      action: "queryZAI",
      prompt: prompt
    });
    
    if (response.error) {
      alert(`Error: ${response.error}`);
      return;
    }
    
    // Create a result dialog
    showResultDialog('Improved Writing', response.answer);
    
  } catch (error) {
    console.error('Error improving writing:', error);
    alert('Failed to improve writing. Please try again.');
  }
}

async function generateContent() {
  // Show a dialog to get user input
  const userPrompt = prompt('What kind of content would you like to generate?', 'Write a paragraph about...');
  if (!userPrompt) return;
  
  try {
    const response = await browser.runtime.sendMessage({
      action: "queryZAI",
      prompt: userPrompt
    });
    
    if (response.error) {
      alert(`Error: ${response.error}`);
      return;
    }
    
    // Create a result dialog
    showResultDialog('Generated Content', response.answer);
    
  } catch (error) {
    console.error('Error generating content:', error);
    alert('Failed to generate content. Please try again.');
  }
}

// Show a dialog with the result and options to insert or copy
function showResultDialog(title, content) {
  // Create dialog container
  const dialog = document.createElement('div');
  dialog.style.position = 'fixed';
  dialog.style.top = '50%';
  dialog.style.left = '50%';
  dialog.style.transform = 'translate(-50%, -50%)';
  dialog.style.backgroundColor = 'white';
  dialog.style.padding = '20px';
  dialog.style.borderRadius = '8px';
  dialog.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  dialog.style.zIndex = '10000';
  dialog.style.maxWidth = '600px';
  dialog.style.width = '80%';
  dialog.style.maxHeight = '80vh';
  dialog.style.display = 'flex';
  dialog.style.flexDirection = 'column';
  
  // Add title
  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  titleElement.style.margin = '0 0 10px 0';
  dialog.appendChild(titleElement);
  
  // Add content
  const contentElement = document.createElement('div');
  contentElement.style.overflowY = 'auto';
  contentElement.style.maxHeight = 'calc(80vh - 120px)';
  contentElement.style.marginBottom = '15px';
  contentElement.style.padding = '10px';
  contentElement.style.border = '1px solid #e0e0e0';
  contentElement.style.borderRadius = '4px';
  contentElement.style.backgroundColor = '#f8f9fa';
  contentElement.style.whiteSpace = 'pre-wrap';
  contentElement.textContent = content;
  dialog.appendChild(contentElement);
  
  // Add buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.display = 'flex';
  buttonsContainer.style.justifyContent = 'flex-end';
  buttonsContainer.style.gap = '10px';
  
  // Add insert button
  const insertButton = document.createElement('button');
  insertButton.textContent = 'Insert at Cursor';
  insertButton.style.padding = '8px 16px';
  insertButton.style.backgroundColor = '#4285f4';
  insertButton.style.color = 'white';
  insertButton.style.border = 'none';
  insertButton.style.borderRadius = '4px';
  insertButton.style.cursor = 'pointer';
  insertButton.addEventListener('click', async () => {
    const success = await insertTextAtCursor(content);
    if (success) {
      document.body.removeChild(dialog);
    }
  });
  buttonsContainer.appendChild(insertButton);
  
  // Add copy button
  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy to Clipboard';
  copyButton.style.padding = '8px 16px';
  copyButton.style.backgroundColor = '#f1f3f4';
  copyButton.style.color = '#202124';
  copyButton.style.border = '1px solid #dadce0';
  copyButton.style.borderRadius = '4px';
  copyButton.style.cursor = 'pointer';
  copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(content).catch(err => {
      console.error('Failed to copy to clipboard:', err);
      alert('Could not copy to clipboard. Please check permissions.');
    });
    copyButton.textContent = 'Copied!';
    setTimeout(() => {
      copyButton.textContent = 'Copy to Clipboard';
    }, 2000);
  });
  buttonsContainer.appendChild(copyButton);
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.padding = '8px 16px';
  closeButton.style.backgroundColor = '#f1f3f4';
  closeButton.style.color = '#202124';
  closeButton.style.border = '1px solid #dadce0';
  closeButton.style.borderRadius = '4px';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', () => {
    document.body.removeChild(dialog);
  });
  buttonsContainer.appendChild(closeButton);
  
  dialog.appendChild(buttonsContainer);
  
  // Add click outside to close
  const backdropElement = document.createElement('div');
  backdropElement.style.position = 'fixed';
  backdropElement.style.top = '0';
  backdropElement.style.left = '0';
  backdropElement.style.width = '100%';
  backdropElement.style.height = '100%';
  backdropElement.style.backgroundColor = 'rgba(0,0,0,0.5)';
  backdropElement.style.zIndex = '9999';
  backdropElement.addEventListener('click', (e) => {
    if (e.target === backdropElement) {
      document.body.removeChild(backdropElement);
      document.body.removeChild(dialog);
    }
  });
  
  // Add to page
  document.body.appendChild(backdropElement);
  document.body.appendChild(dialog);
}

// Helper function to wait for an element to appear in the DOM
async function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }
    
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector)); // Resolve anyway, might be null
    }, timeout);
  });
}

// Helper function for delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start processing when the page is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}