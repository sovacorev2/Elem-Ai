require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const textToSpeech = require('@google-cloud/text-to-speech');

const app = express();
const port = process.env.PORT || 3000;

// Configure Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Initialize Google Cloud Text-to-Speech client
const ttsClient = new textToSpeech.TextToSpeechClient();

// Elem AI System Prompt (as provided in the prompt)
const ELEM_AI_SYSTEM_PROMPT = `You are Elem AI, the core intelligence behind ElemNote, an AI-powered study assistant. Your primary mission is to transform raw study materials—PDFs, Word documents, and text—into interactive, smarter learning experiences. You are not just a chatbot; you are a Personal AI Tutor dedicated to helping university students in Kenya excel in their exams.

Core Objectives:
Summarization & Explanation: Analyze uploaded study materials to provide concise, structured summaries and clear explanations of complex concepts.
Active Recall Generation: Automatically create tailored quizzes and flashcards from provided notes to test student knowledge.
Exam Preparedness: Focus on reducing information overload and helping students avoid last-last-minute revision pressure.
Personalized Feedback: Offer data-driven insights and study recommendations based on student performance and analytics.

Voice & Tone (Conversational Design):
Style: Empathetic, encouraging, and academically supportive. Use clear, accessible language.
Local Context: Be aware of the Kenyan educational landscape and the specific challenges faced by local university students.
Voice-Ready: Since you will speak back to users, keep your responses concise and well-paced. Avoid overly long walls of text. Use verbal cues like "Great job on that quiz!" or "Let's break down this complex topic together."

Technical Guidelines:
Format: When asked to summarize, use bullet points and bold headers for scannability.
Quiz Structure: Generate multiple-choice or short-answer questions with immediate feedback on the correct answer.
Handling Ambiguity: If the uploaded material is disorganized or unclear, politely ask the student for clarification to ensure accurate summaries.
Constraint: Prioritize accuracy and student-focused learning over generic task completion.`;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // For parsing application/json

// API endpoint for processing uploaded files and user queries
app.post('/api/process', upload.single('studyMaterial'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No study material uploaded.' });
  }
  if (!req.body.userQuery) {
    return res.status(400).json({ error: 'No user query provided.' });
  }

  let documentText = '';
  try {
    // For PDF files, use pdf-parse
    if (req.file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      documentText = data.text;
    } else if (req.file.mimetype === 'text/plain') {
      documentText = fs.readFileSync(req.file.path, 'utf8');
    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // NOTE: For .docx, you'd integrate a library like 'mammoth.js' here.
      // For simplicity in this example, we'll return an error or placeholder.
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(400).json({ error: 'Word documents (.docx) are not yet fully supported in this example. Please upload PDF or plain text.' });
    } else {
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF or plain text.' });
    }

    // Construct the full prompt for Gemini
    const fullPrompt = `Based on the following study material:

---
${documentText.substring(0, 15000)} 
--- (Content truncated if very long)

Now, ${req.body.userQuery}`; // Truncate to avoid hitting context limits, adjust as needed

    // Call Gemini API
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: ELEM_AI_SYSTEM_PROMPT },
          { text: fullPrompt }
        ]
      }]
    });
    const response = await result.response;
    const aiResponseText = response.text();

    // Call Google Cloud TTS API to convert AI response to audio
    const request = {
      input: { text: aiResponseText },
      voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' }, // Customize voice as needed
      audioConfig: { audioEncoding: 'MP3' },
    };
    const [audioResponse] = await ttsClient.synthesizeSpeech(request);
    const audioContent = audioResponse.audioContent.toString('base64'); // Base64 encode for client

    res.json({ aiResponse: aiResponseText, audio: audioContent });

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Failed to process study material or generate response.', details: error.message });
  } finally {
    // Clean up the uploaded file
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
  }
});

app.listen(port, () => {
  console.log(`ElemNote AI backend listening at http://localhost:${port}`);
});
