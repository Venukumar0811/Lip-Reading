# Real-Time Video Subtitle & Lip Position Guided Speech-to-Text Web App

A high-performance, real-time transcription platform that combines browser-based computer vision with the Gemini Live API. This application provides live video subtitles and a visual "lip-sync" guidance box to ensure the user is perfectly positioned for optimal audio capture.

![Demo Screenshot Placeholder](https://via.placeholder.com/800x450.png?text=Live+Webcam+Transcription+Preview)

## 🌟 Features

- **Live Video Subtitles**: Real-time transcription overlaid directly onto the webcam feed.
- **Lip Position Guidance**: An intelligent HUD (Heads-Up Display) that uses MediaPipe Face Mesh to detect lip position. The guide box turns **Green** when lips are aligned and **Red** when they are out of the optimal zone.
- **Low-Latency Streaming**: Powered by Google's Gemini 2.5 Flash Native Audio model for near-instant speech-to-text.
- **Multilingual Support**: Select from 10+ languages including English, Hindi, Spanish, French, and more.
- **Subtitle Customization**: Control font size (SM to 2XL) and vertical positioning (Top, Middle, Bottom).
- **Audio Visualization**: Live frequency domain waveform to monitor microphone activity.
- **Responsive Design**: Dark-themed, modern UI that works across desktop and tablet browsers.

## 🛠 Tech Stack

- **Frontend**: React (v19), Tailwind CSS, Lucide Icons.
- **Computer Vision**: MediaPipe Face Landmarker (Tasks Vision).
- **AI/ML**: Google Gemini Live API (Native Audio Preview).
- **Real-time Transport**: Web Audio API (PCM 16-bit encoding).
- **Build Tools**: ES Modules via ESM.sh.

## 🏗 Architecture Overview

1.  **Audio/Video Capture**: Browser requests `getUserMedia` permissions.
2.  **Computer Vision (MediaPipe)**: Local face landmark detection runs in the browser thread at 20fps to track lip coordinates.
3.  **Audio Processing**: Audio is converted to raw 16-bit PCM (16kHz) and Base64 encoded.
4.  **Gemini Live Connection**: A persistent bi-directional stream sends audio chunks and receives transcription events.
5.  **UI Rendering**:
    - Video is rendered locally with a CSS mirror filter.
    - Subtitles are absolute-positioned over the video stream.
    - Guidance box color toggles based on coordinate math.

## 📂 Folder Structure

```text
realtime-stt-app/
 ├─ components/
 │   └─ Visualizer.tsx     # Audio waveform component
 ├─ services/
 │   └─ audioUtils.ts      # PCM Encoding/Decoding logic
 ├─ App.tsx                # Main Application logic & CV Pipeline
 ├─ index.tsx              # React Entry point
 ├─ index.html             # HTML Shell & ESM Import maps
 ├─ types.ts               # TypeScript interfaces & Enums
 ├─ metadata.json          # App manifest & permissions
 └─ README.md              # Documentation
```

## 📋 Prerequisites

- **Node.js**: v18.0.0 or higher.
- **Browser**: Chrome or Edge (highly recommended for MediaPipe/Web Audio support).
- **API Key**: A valid Gemini API Key from [Google AI Studio](https://aistudio.google.com/).

## ⚙️ Environment Setup

The application expects the API key to be available via environment variables.

1. Create a `.env` file in the project root:
   ```bash
   touch .env
   ```
2. Add your key:
   ```env
   API_KEY=your_google_ai_studio_api_key_here
   ```

## 🚀 Local Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/realtime-stt-app.git
   cd realtime-stt-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open the App**:
   Navigate to `http://localhost:3000` in your browser.

## 📖 How To Use

1. **Language Selection**: Choose your spoken language from the dropdown menu in the header.
2. **Permissions**: Click "Start Streaming" and click **Allow** when the browser asks for Camera and Microphone access.
3. **Alignment**: Position your face so that your lips are inside the center box.
   - **Red Outline**: Lips are not detected or outside the zone.
   - **Green Outline**: "Lips Aligned" — You are in the optimal position.
4. **Speak**: Start talking! Your words will appear as white subtitles on the video.
5. **Adjust**: Use the Sidebar settings to change subtitle size or position if they block your face.

## 🌐 Deployment Guide

### Backend Deployment (Node.js/Proxy)
If you build a custom backend proxy for API keys:
- Use **Railway.app** or **Render.com**.
- Set `API_KEY` in the service's Environment Variables panel.

### Frontend Deployment
- **Vercel**: Simply connect your GitHub repo and set the `API_KEY` variable.
- **Netlify**: Ensure your build command is configured correctly to handle ESM imports.

## 🛠 Common Errors & Fixes

| Issue | Potential Fix |
| :--- | :--- |
| **Mic Permission Denied** | Check browser site settings and ensure no other app is using the mic. |
| **Face Not Detected** | Ensure you are in a well-lit environment and not wearing a mask. |
| **WebSocket Failed** | Check if your API Key is valid and that you haven't hit rate limits. |
| **Subtitles Lagging** | Check your internet connection; Gemini Live requires stable upstream bandwidth. |

## 🔒 Security Notes

- **API Key Safety**: The `API_KEY` is retrieved from `process.env`. Never hardcode keys into the frontend source code.
- **Media Privacy**: All computer vision processing (MediaPipe) happens **locally** in your browser. No video frames are sent to a server.

## 🔮 Future Improvements

- **Translation Subtitles**: Real-time translation of detected speech into a second language overlay.
- **Speaker Diarization**: Color-coded subtitles for different people in the frame.
- **Local Recording**: Option to save the video feed with burnt-in subtitles as an MP4.
- **Advanced Lip Reading**: Supplement audio transcription with lip-motion analysis for noisy environments.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
