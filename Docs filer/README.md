# Google Forms & Docs Auto-Answer Firefox Extension

This Firefox extension automatically answers questions in Google Forms and provides AI assistance in Google Docs using the z.ai API. It extracts questions and their possible answers from forms, sends them to z.ai for processing, and fills in the form with the generated responses. In Google Docs, it provides various AI-powered writing assistance features.

## Features

### Google Forms
- Automatically detects Google Forms pages
- Extracts all visible questions and their possible answers
- Sends questions to z.ai's API to generate academically appropriate answers
- Automatically fills in the form with the generated answers
- Handles different question types:
  - Short answer
  - Paragraph
  - Multiple choice
  - Checkboxes
  - Dropdown
- Handles multi-page forms and dynamically loaded content

### Google Docs
- Provides a floating AI assistant button in Google Docs
- Offers multiple AI-powered features:
  - Summarize selected text
  - Expand selected text with more details
  - Answer questions in the selected text
  - Improve writing (grammar, style, clarity)
  - Generate new content based on prompts
- Easy insertion of AI-generated content at cursor position

### General
- Secure API key storage
- Simple configuration through options page

## Installation

### Temporary Installation (for Development)

1. Download or clone this repository to your local machine
2. Open Firefox and navigate to `about:debugging`
3. Click on "This Firefox" in the left sidebar
4. Click on "Load Temporary Add-on..."
5. Navigate to the folder containing the extension files and select `manifest.json`

### Permanent Installation

1. Zip all the extension files
2. Open Firefox and navigate to `about:addons`
3. Click the gear icon and select "Install Add-on From File..."
4. Select the zip file you created

## Setup

1. After installing the extension, go to Firefox's Add-ons Manager (about:addons)
2. Find "Google Forms & Docs Auto-Answer" in the list and click on "Options"
3. Enter your z.ai API key in the provided field and click "Save"

## Usage

### Google Forms

1. Navigate to any Google Form
2. The extension will automatically detect the form and start processing questions
3. Wait for the extension to fill in all answers
4. Review the answers before submitting the form

### Google Docs

1. Navigate to any Google Doc
2. Look for the "AI Assist" button in the bottom-right corner
3. Click the button to see available AI features
4. Select text in the document before using features that require text selection
5. Use the dialog that appears to insert or copy the AI-generated content

## How It Works

### Question Mapping Logic (Forms)

- **Short Answer/Paragraph**: The extension sends the question text to z.ai and fills the input field with the generated response.
- **Multiple Choice/Dropdown**: The extension sends both the question and all available options to z.ai, asking it to select the best option. It then selects the option that best matches the API response.
- **Checkboxes**: Similar to multiple choice, but allows for multiple selections. The extension parses the API response to determine which options to select.

### DOM Handling

- The extension uses MutationObserver to detect when new questions are loaded (for multi-page forms or dynamically loaded content).
- It identifies form elements using Google Forms' CSS class names, making it adaptable to different form layouts.
- The extension simulates user interactions (clicks, typing) to fill in the form naturally.

## Customization

You can modify the following files to customize the extension's behavior:

- `content.js`: Adjust selectors, delays, or the question processing logic
- `background.js`: Modify the API request parameters or error handling
- `options.html` and `options.js`: Change the options page UI or add additional settings

## Troubleshooting

- If the extension isn't filling in answers, make sure your z.ai API key is correctly set in the options.
- Check the browser console for error messages (press F12 to open developer tools).
- If the extension isn't detecting questions correctly, it might be due to changes in Google Forms' HTML structure. Update the selectors in `content.js` accordingly.
- For Google Docs functionality, ensure you have allowed clipboard access if prompted.

## Privacy and Security

- Your z.ai API key is stored securely in Firefox's sync storage.
- Form questions, document text, and answers are processed locally and sent directly to z.ai's API.
- No data is stored or sent to any third-party servers other than z.ai.

## License

This project is licensed under the MIT License - see the LICENSE file for details.