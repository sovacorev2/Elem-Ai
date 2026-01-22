import os
import io
import tempfile
from flask import Flask, request, jsonify, render_template, send_file
import google.generativeai as genai
import PyPDF2
from docx import Document
from gtts import gTTS
from dotenv import load_dotenv  # Added to load .env file
from flask_cors import CORS

# Load the environment variables from the .env file
load_dotenv() 

# Load API key from environment variable
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set. Please set it to your Gemini API key.")

genai.configure(api_key=GEMINI_API_KEY)

app = Flask(__name__)
CORS(app)
app.secret_key = os.urandom(24) 
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB limit

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Elem AI System Prompt
ELEM_AI_SYSTEM_PROMPT = """
You are Elem AI, the core intelligence behind ElemNote, an AI-powered study assistant. Your primary mission is to transform raw study materials—PDFs, Word documents, and text—into interactive, smarter learning experiences. You are not just a chatbot; you are a Personal AI Tutor dedicated to helping university students in Kenya excel in their exams.

Core Objectives:
Summarization & Explanation: Analyze uploaded study materials to provide concise, structured summaries and clear explanations of complex concepts.
Active Recall Generation: Automatically create tailored quizzes and flashcards from provided notes to test student knowledge.
Exam Preparedness: Focus on reducing information overload and helping students avoid last-minute revision pressure.
Personalized Feedback: Offer data-driven insights and study recommendations based on student performance and analytics.

Voice & Tone (Conversational Design):
Style: Empathetic, encouraging, and academically supportive. Use clear, accessible language.
Local Context: Be aware of the Kenyan educational landscape and the specific challenges faced by local university students.
Voice-Ready: Since you will speak back to users, keep your responses concise and well-paced. Avoid overly long walls of text. Use verbal cues like \"Great job on that quiz!\" or \"Let's break down this complex topic together.\"

Technical Guidelines:
Format: When asked to summarize, use bullet points and bold headers for scannability.
Quiz Structure: Generate multiple-choice or short-answer questions with immediate feedback on the correct answer.
Handling Ambiguity: If the uploaded material is disorganized or unclear, politely ask the student for clarification to ensure accurate summaries.
Constraint: Prioritize accuracy and student-focused learning over generic task completion.
"""

# Global variable to store processed document text and temporary audio file paths
processed_document_text = ""
temp_audio_files = {} 

# Configure the Gemini model.
model = genai.GenerativeModel(
    model_name='gemini-2.5-flash',
    system_instruction=ELEM_AI_SYSTEM_PROMPT
)

# Function to extract text from PDF
def extract_text_from_pdf(file_stream):
    reader = PyPDF2.PdfReader(file_stream)
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    return text

# Function to extract text from DOCX
def extract_text_from_docx(file_stream):
    document = Document(file_stream)
    return "\n".join([paragraph.text for paragraph in document.paragraphs])

# Function to generate speech from text
def generate_speech(text):
    tts = gTTS(text=text, lang='en', slow=False) 
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as fp:
        audio_file_path = fp.name
        tts.save(audio_file_path)
    
    filename = os.path.basename(audio_file_path)
    temp_audio_files[filename] = audio_file_path 
    return filename 

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload_and_process', methods=['POST'])
def upload_and_process():
    global processed_document_text
    if 'document' not in request.files:
        return jsonify({'error': 'No document part in the request'}), 400

    file = request.files['document']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        file_extension = os.path.splitext(file.filename)[1].lower()
        try:
            document_content_stream = io.BytesIO(file.read())
            if file_extension == '.pdf':
                processed_document_text = extract_text_from_pdf(document_content_stream)
            elif file_extension == '.docx':
                processed_document_text = extract_text_from_docx(document_content_stream)
            elif file_extension == '.txt':
                processed_document_text = document_content_stream.getvalue().decode('utf-8')
            else:
                return jsonify({'error': 'Unsupported file type. Please upload PDF, DOCX, or TXT.'}), 400
            
            if not processed_document_text.strip():
                 return jsonify({'error': 'Could not extract text from the document. It might be scanned or empty.'}), 400

            initial_user_prompt = f"I have processed a document. Please acknowledge its reception and inform the student you are ready to assist with summarization, quizzes, or explanations. Document excerpt (first 500 characters):\n```\n{processed_document_text[:500]}...\n```"
            
            response = model.generate_content(initial_user_prompt)
            ai_response = response.text
            
            audio_filename = generate_speech(ai_response) 

            return jsonify({
                'message': 'Document processed successfully!',
                'ai_response': ai_response,
                'audio_url': f'/audio/{audio_filename}' 
            })
        except Exception as e:
            print(f"Error processing document: {e}")
            return jsonify({'error': f'Failed to process document: {str(e)}'}), 500

@app.route('/query_ai', methods=['POST'])
def query_ai():
    global processed_document_text
    if not processed_document_text:
        return jsonify({'error': 'Please upload and process a document first.'}), 400

    user_query = request.json.get('query')
    if not user_query:
        return jsonify({'error': 'No query provided.'}), 400

    full_prompt = f"Here is the study material:\n```\n{processed_document_text}\n```\n\nStudent's request: {user_query}"

    try:
        response = model.generate_content(full_prompt)
        ai_response = response.text
        audio_filename = generate_speech(ai_response) 

        return jsonify({
            'ai_response': ai_response,
            'audio_url': f'/audio/{audio_filename}'
        })
    except Exception as e:
        print(f"Error generating AI response: {e}")
        return jsonify({'error': f'Failed to get AI response: {str(e)}'}), 500

@app.route('/audio/<filename>')
def serve_audio(filename):
    full_path = temp_audio_files.get(filename)
    if full_path and os.path.exists(full_path):
        return send_file(full_path, mimetype='audio/mpeg', as_attachment=False)
    else:
        return jsonify({'error': 'Audio file not found or expired.'}), 404

if __name__ == '__main__':
    app.run(debug=True)