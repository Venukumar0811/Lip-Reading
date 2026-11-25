import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Mic, MicOff, Trash2, Download, Info, Zap, Languages, ChevronDown, Video, VideoOff, Settings, Maximize, Target, CheckCircle2, AlertCircle } from 'lucide-react';
import { ConnectionStatus, TranscriptionItem } from './types';
import { encode } from './services/audioUtils';
import Visualizer from './components/Visualizer';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Auto Detect', instruction: 'Transcribe the speech accurately in its native script.' },
  { code: 'en', name: 'English', instruction: 'Transcribe the speech accurately in English.' },
  { code: 'te', name: 'Telugu', instruction: 'Transcribe the speech accurately using Telugu script (తెలుగు).' },
  { code: 'hi', name: 'Hindi', instruction: 'Transcribe the speech accurately using Hindi script (हिन्दी).' },
  { code: 'ta', name: 'Tamil', instruction: 'Transcribe the speech accurately using Tamil script (தமிழ்).' },
  { code: 'kn', name: 'Kannada', instruction: 'Transcribe the speech accurately using Kannada script (ಕನ್ನಡ).' },
  { code: 'ml', name: 'Malayalam', instruction: 'Transcribe the speech accurately using Malayalam script (മലയാളം).' },
  { code: 'es', name: 'Spanish', instruction: 'Transcribe the speech accurately in Spanish.' },
  { code: 'fr', name: 'French', instruction: 'Transcribe the speech accurately in French.' },
  { code: 'de', name: 'German', instruction: 'Transcribe the speech accurately in German.' },
];

type SubtitlePos = 'top' | 'middle' | 'bottom';
type SubtitleSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [currentText, setCurrentText] = useState<string>('');
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [selectedLang, setSelectedLang] = useState(SUPPORTED_LANGUAGES[0]);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  // Subtitle Settings
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [subPos, setSubPos] = useState<SubtitlePos>('bottom');
  const [subSize, setSubSize] = useState<SubtitleSize>('lg');

  // Lip Alignment State
  const [isLipsAligned, setIsLipsAligned] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [isTranscriptionActive, setIsTranscriptionActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Initialize FaceLandmarker
  useEffect(() => {
    const initFaceDetection = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        console.log("Face Landmarker initialized");
      } catch (e) {
        console.error("Failed to initialize Face Landmarker:", e);
      }
    };
    initFaceDetection();
  }, []);

  const detectLips = useCallback(() => {
    if (!videoRef.current || !faceLandmarkerRef.current || !isVideoActive) {
      setIsFaceDetected(false);
      setIsLipsAligned(false);
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(detectLips);
      return;
    }

    const startTimeMs = performance.now();
    const results = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      setIsFaceDetected(true);
      const landmarks = results.faceLandmarks[0];

      // Points 13 and 14 are center of lips
      const lip13 = landmarks[13];
      const lip14 = landmarks[14];

      const lipX = (lip13.x + lip14.x) / 2;
      const lipY = (lip13.y + lip14.y) / 2;

      // Safe Zone: Center 20% of the screen
      // Normalized coordinates: 0.5 is center
      const inX = lipX > 0.4 && lipX < 0.6;
      const inY = lipY > 0.4 && lipY < 0.6;

      setIsLipsAligned(inX && inY);
    } else {
      setIsFaceDetected(false);
      setIsLipsAligned(false);
    }

    animationFrameRef.current = requestAnimationFrame(detectLips);
  }, [isVideoActive]);

  useEffect(() => {
    if (isVideoActive) {
      detectLips();
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setIsFaceDetected(false);
      setIsLipsAligned(false);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isVideoActive, detectLips]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const stopStreaming = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus(ConnectionStatus.DISCONNECTED);
    setAnalyser(null);
    setIsVideoActive(false);
    setIsTranscriptionActive(false);
    // Explicitly reset flags on full stop
    setIsLipsAligned(false);
  }, []);

  const stopTranscriptionSession = useCallback(() => {
    // We don't want to close the WebSocket every time head moves
    // Just stop the audio transmission flag
    setIsTranscriptionActive(false);
  }, []);

  const startVideoPreview = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 1280, height: 720 }
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      setAnalyser(analyserNode);
      source.connect(analyserNode);

      setIsVideoActive(true);
      setStatus(ConnectionStatus.CONNECTED);
    } catch (err) {
      console.error('Failed to start video preview:', err);
      setStatus(ConnectionStatus.ERROR);
      stopStreaming();
    }
  };

  const startTranscriptionSession = async () => {
    if (!isVideoActive || isTranscriptionActive || !audioContextRef.current || !streamRef.current) return;

    try {
      setIsTranscriptionActive(true);
      setCurrentText(''); // Clear existing text for new session
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const audioCtx = audioContextRef.current;
      const stream = streamRef.current;
      const source = audioCtx.createMediaStreamSource(stream);

      const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      const systemInstruction = `You are a specialized transcription assistant. Your primary job is to listen and transcribe speech accurately. ${selectedLang.instruction} Only output the exact words spoken. Do not translate. Do not add conversational filler. Output only the transcript.`;

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: systemInstruction
        },
        callbacks: {
          onopen: () => {
            scriptProcessor.onaudioprocess = (e) => {
              // Only send if the flag is active AND lips are aligned
              if (!isTranscriptionActive || !isLipsAligned) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmData = encode(new Uint8Array(int16.buffer));

              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  media: {
                    data: pcmData,
                    mimeType: 'audio/pcm;rate=16000'
                  }
                });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            console.log("Gemini Raw Message:", message); // Debug log
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              console.log("Transcript Received:", text);
              setCurrentText(prev => prev + text);
            }

            if (message.serverContent?.turnComplete) {
              setCurrentText(text => {
                if (text.trim()) {
                  const newItem: TranscriptionItem = {
                    id: Math.random().toString(36).substring(7),
                    text: text.trim(),
                    timestamp: new Date(),
                    isFinal: true,
                    speaker: 'user'
                  };
                  setTranscriptions(prev => [...prev, newItem]);
                }
                return '';
              });
            }
          },
          onerror: (e) => {
            console.error('Gemini Live error:', e);
            stopTranscriptionSession();
          },
          onclose: () => {
            setIsTranscriptionActive(false);
            sessionRef.current = null;
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed to start transcription session:', err);
      setIsTranscriptionActive(false);
    }
  };

  useEffect(() => {
    if (isVideoActive) {
      if (isLipsAligned) {
        if (!sessionRef.current) {
          startTranscriptionSession();
        } else {
          setIsTranscriptionActive(true);
        }
      } else {
        // Just pause, don't close
        setIsTranscriptionActive(false);
      }
    }
  }, [isLipsAligned, isVideoActive]);

  // Clear text when lips align (start of new "sentence" bubble)
  useEffect(() => {
    if (isLipsAligned) {
      setCurrentText('');
    }
  }, [isLipsAligned]);

  const toggleFullscreen = () => {
    if (videoRef.current?.parentElement?.requestFullscreen) {
      videoRef.current.parentElement.requestFullscreen();
    }
  };

  const getSubtitleText = () => {
    if (!showSubtitles) return null;
    const lastFinal = transcriptions[transcriptions.length - 1]?.text || '';
    return currentText || lastFinal;
  };

  const posClasses = {
    top: 'top-8',
    middle: 'top-1/2 -translate-y-1/2',
    bottom: 'bottom-12'
  };

  const sizeClasses = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl md:text-3xl'
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col p-4 md:p-8">
      <header className="max-w-6xl w-full mx-auto flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
            <Video className="text-emerald-400" size={28} />
            Gemini Live Cam & Subtitles
          </h1>
          <p className="text-slate-500 text-sm mt-1">Real-time video preview with lip alignment guidance</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex flex-col" ref={langMenuRef}>
            <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 ml-1">Language</label>
            <button
              onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
              disabled={status === ConnectionStatus.CONNECTED}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 min-w-[140px] justify-between"
            >
              <span className="text-sm font-medium">{selectedLang.name}</span>
              <ChevronDown size={14} />
            </button>
            {isLangMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden py-1 max-h-64 overflow-y-auto">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => { setSelectedLang(lang); setIsLangMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-emerald-500/10 ${selectedLang.code === lang.code ? 'text-emerald-400 bg-emerald-500/5' : ''}`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 mr-1">Status</label>
            <div className={`px-3 py-2 bg-slate-900 rounded-lg border border-slate-800 flex items-center gap-2 text-xs font-mono tracking-wider ${isVideoActive ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`w-2 h-2 rounded-full ${isVideoActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-600'}`} />
              {!isVideoActive ? 'DISCONNECTED' : isTranscriptionActive ? 'TRANSCRIPTION ACTIVE' : 'VIDEO STARTED'}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Player Section */}
        <section className="lg:col-span-2 flex flex-col gap-4">
          <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl group">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover mirror"
            />

            {/* Lip Guidance Box */}
            {isVideoActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-[20%] h-[20%] border-4 rounded-xl transition-all duration-300 flex flex-col items-center justify-center ${isLipsAligned
                    ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                    : 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                    }`}
                >
                  <div className={`absolute -top-10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors ${isLipsAligned ? 'bg-emerald-500 text-emerald-950' : 'bg-red-500 text-white'
                    }`}>
                    {isLipsAligned ? (
                      <><CheckCircle2 size={12} /> Lips Aligned</>
                    ) : (
                      <><AlertCircle size={12} /> Adjust Position</>
                    )}
                  </div>
                  <Target size={32} className={`opacity-40 transition-colors ${isLipsAligned ? 'text-emerald-500' : 'text-red-500'}`} />

                  {/* Status Indicator */}
                  <div className="absolute -bottom-10 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {isTranscriptionActive ? (
                      <span className="text-emerald-400 animate-pulse">● Transcription Active</span>
                    ) : (
                      <span>Waiting for Alignment...</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Subtitle Overlay */}
            {showSubtitles && getSubtitleText() && (
              <div
                id="subtitle"
                className={`absolute left-0 right-0 px-8 pointer-events-none flex justify-center transition-all duration-300 z-[100] opacity-100 ${posClasses[subPos]}`}
              >
                <div className={`bg-black/80 backdrop-blur-lg text-white font-bold px-8 py-4 rounded-3xl border-2 border-white/20 shadow-[0_0_30px_rgba(0,0,0,0.5)] text-center max-w-[90%] scale-100 ${sizeClasses[subSize]}`}>
                  {getSubtitleText()}
                </div>
              </div>
            )}

            {/* In-video Controls */}
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <button
                onClick={toggleFullscreen}
                className="p-3 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-all border border-white/10"
              >
                <Maximize size={20} />
              </button>
            </div>

            {status === ConnectionStatus.DISCONNECTED && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                <VideoOff size={48} className="text-slate-700 mb-4" />
                <p className="text-slate-400 font-medium">Camera preview hidden</p>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <button
              onClick={isVideoActive ? stopStreaming : startVideoPreview}
              className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-bold transition-all transform active:scale-[0.98] shadow-lg ${isVideoActive
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'
                }`}
            >
              {isVideoActive ? <MicOff size={24} /> : <Video size={24} />}
              {isVideoActive ? 'Stop All' : 'Start Video Preview'}
            </button>
          </div>
        </section>

        {/* Sidebar Controls */}
        <section className="flex flex-col gap-6">
          {/* Subtitle Customization */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Settings size={18} className="text-emerald-400" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-300">Settings</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Show Subtitles</span>
                <button
                  onClick={() => setShowSubtitles(!showSubtitles)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${showSubtitles ? 'bg-emerald-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${showSubtitles ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-2 font-mono">Position</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['top', 'middle', 'bottom'] as SubtitlePos[]).map(pos => (
                    <button
                      key={pos}
                      onClick={() => setSubPos(pos)}
                      className={`py-2 text-xs rounded-lg border capitalize transition-all ${subPos === pos ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-2 font-mono">Font Size</label>
                <div className="flex flex-wrap gap-2">
                  {(['sm', 'base', 'lg', 'xl', '2xl'] as SubtitleSize[]).map(size => (
                    <button
                      key={size}
                      onClick={() => setSubSize(size)}
                      className={`px-3 py-2 text-xs rounded-lg border uppercase transition-all ${subSize === size ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* History / Info */}
          <div className="bg-slate-900 flex-1 rounded-3xl border border-slate-800 flex flex-col overflow-hidden shadow-xl min-h-[300px]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Session Logs</h2>
              <button onClick={() => setTranscriptions([])} className="p-1.5 hover:bg-slate-800 rounded text-slate-500"><Trash2 size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[11px]">
              {!isFaceDetected && isVideoActive && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg flex items-center gap-2 border border-red-500/20">
                  <AlertCircle size={14} /> Face not detected
                </div>
              )}
              {isVideoActive && !isTranscriptionActive && isFaceDetected && (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center gap-2 border border-emerald-500/20">
                  <Info size={14} /> Align lips to start transcription
                </div>
              )}
              {transcriptions.length === 0 && <p className="text-slate-700 italic">Logs appear here...</p>}
              {transcriptions.map((t, idx) => (
                <div key={idx} className="text-slate-400 leading-tight">
                  <span className="text-emerald-500/60 mr-2">[{t.timestamp.toLocaleTimeString([], { hour12: false })}]</span>
                  {t.text}
                </div>
              ))}
            </div>
            {analyser && <div className="p-4 bg-slate-950/50"><Visualizer analyser={analyser} isActive={isTranscriptionActive} /></div>}
          </div>
        </section>
      </main>

      <footer className="max-w-6xl w-full mx-auto mt-8 pt-4 border-t border-slate-900 flex justify-between items-center text-slate-600 text-[10px] font-mono">
        <div className="flex items-center gap-4">
          <span>CV: MEDIAPIPE FACE MESH</span>
          <span>STT: GEMINI LIVE</span>
        </div>
        <div className="flex items-center gap-4">
          <span>SPACEBAR: TOGGLE STREAM</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
