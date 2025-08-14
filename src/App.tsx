import { useState, useEffect, useRef } from 'react';
import { Mic, Camera, Settings, Home, MessageCircle, Volume2, VolumeX, Clock } from 'lucide-react';

const API_KEY = "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78";

type Page = 'home' | 'chat' | 'settings' | 'camera';
type CameraMode = 'user' | 'environment';

function App() {
  const [isListening, setIsListening] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [audioLevel, setAudioLevel] = useState(0);
  const [assistantResponse, setAssistantResponse] = useState('');
  const [cameraMode, setCameraMode] = useState<CameraMode>('environment');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [listeningTimer, setListeningTimer] = useState(0);
  const [isInListeningSession, setIsInListeningSession] = useState(false);
  const [sessionQuestions, setSessionQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listeningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mock API responses
  const mockGeminiVisionResponse = async (prompt: string): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (prompt.includes("what") && (prompt.includes("see") || prompt.includes("this"))) {
      return "I can see this is a camera view. In a real implementation with Gemini Vision API, I would describe objects, people, text, colors, and the overall scene in detail for visually impaired users.";
    } else if (prompt.includes("read") || prompt.includes("text")) {
      return "I would read any visible text in the image, including signs, labels, documents, or written content.";
    } else if (prompt.includes("color")) {
      return "I would describe all the colors visible in the scene in detail.";
    } else if (prompt.includes("person") || prompt.includes("people")) {
      return "I would describe any people in the image, their appearance, clothing, and activities.";
    } else if (prompt.includes("safe") || prompt.includes("danger")) {
      return "I would analyze the scene for potential hazards and safety concerns, then provide guidance.";
    } else {
      return `Based on your question "${prompt}", I would provide detailed visual analysis. Please integrate with actual Gemini Vision API for real scene analysis.`;
    }
  };

  // Speech synthesis
  const speak = (text: string) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.8;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Audio wave animation
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isListening || isInListeningSession) {
      interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 100);
    } else {
      setAudioLevel(0);
    }
    return () => clearInterval(interval);
  }, [isListening, isInListeningSession]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => setIsListening(true);

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript && transcript.length > 3) {
          addQuestionToSession(transcript);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (isInListeningSession) {
          setTimeout(() => {
            if (isInListeningSession) {
              recognitionRef.current?.start();
            }
          }, 100);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'aborted' && isInListeningSession) {
          setTimeout(() => {
            if (isInListeningSession) {
              recognitionRef.current?.start();
            }
          }, 1000);
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isInListeningSession]);

  // Auto-capture images when camera is active
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isCameraActive && videoRef.current) {
      setTimeout(() => captureCurrentFrame(), 1000);
      interval = setInterval(() => {
        captureCurrentFrame();
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isCameraActive]);

  // Page announcements
  useEffect(() => {
    const announcements = {
      home: 'Welcome to AKSHI Global AI Assistant. Press the microphone button to start a 20-second question session.',
      chat: 'Features page showing available visual assistance capabilities.',
      settings: 'Settings page for audio and camera preferences.',
      camera: 'Live camera view is active. Press the microphone to ask questions about what you see.',
    };
    
    if (speechEnabled) {
      setTimeout(() => speak(announcements[currentPage]), 800);
    }
  }, [currentPage, speechEnabled]);

  const captureCurrentFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCurrentImage(imageDataUrl);
      }
    }
  };

  const addQuestionToSession = (question: string) => {
    setSessionQuestions(prev => [...prev, question]);
    speak(`Got it: ${question}`);
  };

  const startListeningSession = () => {
    if (isInListeningSession) return;

    setIsInListeningSession(true);
    setSessionQuestions([]);
    setListeningTimer(20);
    setCurrentQuestionIndex(0);
    
    speak("I'm listening for 20 seconds. Ask me any questions about what you see.");
    
    listeningIntervalRef.current = setInterval(() => {
      setListeningTimer(prev => {
        if (prev <= 1) {
          endListeningSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    recognitionRef.current?.start();

    sessionTimeoutRef.current = setTimeout(() => {
      endListeningSession();
    }, 20000);
  };

  const endListeningSession = () => {
    setIsInListeningSession(false);
    setIsListening(false);
    setListeningTimer(0);
    
    if (listeningIntervalRef.current) {
      clearInterval(listeningIntervalRef.current);
    }
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }
    
    recognitionRef.current?.stop();

    if (sessionQuestions.length > 0) {
      speak(`I heard ${sessionQuestions.length} question${sessionQuestions.length > 1 ? 's' : ''}. Let me answer them now.`);
      setTimeout(() => {
        processSessionQuestions();
      }, 2000);
    } else {
      speak("I didn't hear any questions. Please try again.");
    }
  };

  const processSessionQuestions = async () => {
    setIsProcessing(true);
    setCurrentQuestionIndex(0);

    for (let i = 0; i < sessionQuestions.length; i++) {
      setCurrentQuestionIndex(i + 1);
      const question = sessionQuestions[i];
      
      speak(`Question ${i + 1}: ${question}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const response = await mockGeminiVisionResponse(question);
      setAssistantResponse(response);
      speak(response);
      
      if (i < sessionQuestions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    setIsProcessing(false);
    setCurrentQuestionIndex(0);
    speak("All questions answered. Press the microphone to ask more questions.");
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      mediaStream?.getTracks().forEach(track => track.stop());
      setIsCameraActive(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setMediaStream(null);
      setCurrentImage(null);
      speak("Camera turned off.");
    } else {
      try {
        const constraints = { 
          video: { 
            facingMode: cameraMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }, 
          audio: false 
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setMediaStream(stream);
        setIsCameraActive(true);
        setCurrentPage('camera');
        speak("Camera is now active. I can see what you're looking at. Press the microphone button to start asking questions.");
      } catch (error) {
        console.error('Error accessing camera:', error);
        speak("Unable to access camera. Please check your permissions and try again.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"></div>
      
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex justify-center items-center p-4 sm:p-6 lg:p-8">
          <div className="flex items-center space-x-3">
            <img 
              src="https://res.cloudinary.com/dy9hjd10h/image/upload/v1754862550/Hi_1_hgycbl.svg" 
              alt="AKSHI Global Logo" 
              className="h-16 w-auto sm:h-20"
            />
          </div>
        </header>

        {/* Home Page */}
        {currentPage === 'home' && (
          <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24">
            <div className="text-center mb-8 sm:mb-12">
              <p className="text-gray-400 font-semibold text-sm sm:text-base mb-2">
                {isInListeningSession 
                  ? `Listening... ${listeningTimer} seconds remaining`
                  : isProcessing 
                  ? `Processing questions... ${currentQuestionIndex}/${sessionQuestions.length}`
                  : 'Voice Assistant for Visual Accessibility'
                }
              </p>
              {assistantResponse && (
                <div className="max-w-3xl mx-auto mt-4">
                  <p className="text-blue-400 font-medium text-base sm:text-lg">
                    {assistantResponse}
                  </p>
                </div>
              )}
            </div>

            <div className="text-center mb-12 sm:mb-16 max-w-4xl">
              <h1 className="font-bold text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight mb-4">
                What Can I Help You
              </h1>
              <h1 className="font-bold text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight text-blue-400">
                See Today?
              </h1>
            </div>

            {/* Audio Visualization */}
            <div className="relative mb-12 sm:mb-16">
              <div className="relative w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56">
                <div className={`absolute inset-0 rounded-full border-2 border-blue-400/30 transition-all duration-100 ${(isListening || isInListeningSession || isProcessing) ? 'animate-pulse' : ''}`}>
                  <div className="absolute inset-2 rounded-full border border-blue-400/50"></div>
                  <div className="absolute inset-4 rounded-full border border-blue-400/70"></div>
                </div>
                
                {isInListeningSession && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-blue-500/90 text-white px-6 py-3 rounded-full font-bold text-3xl">
                      {listeningTimer}
                    </div>
                  </div>
                )}
                
                {!isInListeningSession && (
                  <div className="absolute inset-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-blue-400 rounded-full shadow-lg"></div>
                )}
                
                {(isListening || isInListeningSession || isProcessing) && (
                  <div className="absolute inset-0">
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                        style={{
                          top: `${50 + 35 * Math.sin((i * Math.PI) / 4)}%`,
                          left: `${50 + 35 * Math.cos((i * Math.PI) / 4)}%`,
                          animationDelay: `${i * 100}ms`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Questions Queue */}
            {sessionQuestions.length > 0 && (
              <div className="mb-8 max-w-2xl mx-auto w-full">
                <h3 className="text-lg font-semibold mb-4 text-center">Questions in Queue:</h3>
                <div className="space-y-2">
                  {sessionQuestions.map((question, index) => (
                    <div 
                      key={index} 
                      className={`p-3 rounded-lg border text-sm ${
                        index < currentQuestionIndex 
                          ? 'bg-green-900/30 border-green-500/50 text-green-100' 
                          : index === currentQuestionIndex - 1 && isProcessing
                          ? 'bg-yellow-900/30 border-yellow-500/50 text-yellow-100'
                          : 'bg-gray-800/50 border-gray-600/50'
                      }`}
                    >
                      {index + 1}. {question}
                      {index < currentQuestionIndex && ' ✓'}
                      {index === currentQuestionIndex - 1 && isProcessing && ' ⟳'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Main Controls */}
            <div className="text-center mb-8">
              <button
                onClick={startListeningSession}
                disabled={isProcessing || isInListeningSession}
                className={`inline-flex items-center space-x-3 px-8 py-4 rounded-full font-medium text-lg transition-all duration-300 ${
                  isInListeningSession
                    ? 'bg-red-600 text-white shadow-lg'
                    : isProcessing
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                }`}
              >
                {isInListeningSession ? (
                  <>
                    <Clock size={24} />
                    <span>Listening... {listeningTimer}s</span>
                  </>
                ) : isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    <span>Processing Questions...</span>
                  </>
                ) : (
                  <>
                    <Mic size={24} />
                    <span>Start 20s Voice Session</span>
                  </>
                )}
              </button>
              
              <div className="mt-6 flex items-center justify-center space-x-6">
                <button 
                  onClick={() => setSpeechEnabled(!speechEnabled)}
                  className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full transition-colors text-sm ${
                    speechEnabled ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {speechEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  <span>{speechEnabled ? 'Audio On' : 'Audio Off'}</span>
                </button>
                {isSpeaking && (
                  <button 
                    onClick={stopSpeaking}
                    className="inline-flex items-center space-x-2 px-4 py-2 text-red-400 hover:text-red-300 transition-colors text-sm bg-red-400/10 rounded-full"
                  >
                    <span>Stop Speaking</span>
                  </button>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
              <button
                onClick={toggleCamera}
                disabled={isProcessing || isInListeningSession}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
              >
                <Camera size={20} />
                <span>{isCameraActive ? 'Stop Camera' : 'Start Camera'}</span>
              </button>
              
              <button
                onClick={() => speak("AKSHI Global AI Assistant helps you understand what you see. Turn on the camera, then press the microphone button to start a 20-second question session. I will answer all your questions about the visual scene.")}
                disabled={isProcessing || isInListeningSession}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
              >
                <Volume2 size={20} />
                <span>How to Use</span>
              </button>
            </div>
          </main>
        )}

        {/* Camera Page */}
        {currentPage === 'camera' && (
          <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
            <div className="max-w-4xl w-full mx-auto">
              <h1 className="font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-4">
                Live Camera Vision Assistant
              </h1>
              <p className="text-gray-400 text-center mb-8">
                {isInListeningSession 
                  ? `Listening for questions... ${listeningTimer} seconds remaining`
                  : isProcessing 
                  ? `Answering question ${currentQuestionIndex} of ${sessionQuestions.length}`
                  : "Press the microphone to start a 20-second question session"
                }
              </p>
              
              <div className="relative w-full aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 mb-6">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                      <p className="text-white font-medium">
                        Answering question {currentQuestionIndex} of {sessionQuestions.length}
                      </p>
                    </div>
                  </div>
                )}
                
                {isInListeningSession && (
                  <div className="absolute top-4 right-4 bg-blue-500/90 text-white px-4 py-2 rounded-full text-lg font-bold animate-pulse">
                    {listeningTimer}s
                  </div>
                )}
                
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-gray-400">Camera is off. Use the controls below to enable.</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-center items-center gap-4 mb-8">
                <button
                  onClick={toggleCamera}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                    isCameraActive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Camera size={20} />
                  <span>{isCameraActive ? 'Stop Camera' : 'Start Camera'}</span>
                </button>
                
                {isCameraActive && (
                  <button
                    onClick={startListeningSession}
                    disabled={isProcessing || isInListeningSession}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                      isInListeningSession
                        ? 'bg-red-600 text-white shadow-lg'
                        : isProcessing
                        ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {isInListeningSession ? (
                      <>
                        <Clock size={20} />
                        <span>Listening {listeningTimer}s</span>
                      </>
                    ) : isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Mic size={20} />
                        <span>Ask Questions</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Example Commands */}
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-3">Example voice commands:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "What do you see?",
                    "Read the text",
                    "Describe the scene",
                    "Are there any people?",
                    "What colors do you see?",
                    "Is it safe here?"
                  ].map((command, index) => (
                    <span key={index} className="bg-gray-800/50 px-3 py-1 rounded-full text-xs text-gray-300 border border-gray-700">
                      "{command}"
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </main>
        )}

        {/* Chat Page */}
        {currentPage === 'chat' && (
          <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
            <div className="max-w-4xl mx-auto">
              <h1 className="font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-8">
                Visual Accessibility Features
              </h1>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Clock className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">20s Question Sessions</h3>
                  <p className="text-gray-400 text-sm">Ask multiple questions in timed sessions for efficient interaction</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Camera className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Scene Analysis</h3>
                  <p className="text-gray-400 text-sm">Detailed description of everything visible in your camera view</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Volume2 className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Audio Responses</h3>
                  <p className="text-gray-400 text-sm">All responses spoken aloud for complete accessibility</p>
                </div>
              </div>

              <div className="bg-blue-900/20 rounded-xl p-6 border border-blue-500/30">
                <h3 className="font-semibold text-lg text-blue-300 mb-4">How to Use</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <h4 className="font-medium text-white mb-3">Getting Started:</h4>
                    <ol className="space-y-2 text-gray-300 list-decimal list-inside">
                      <li>Turn on camera</li>
                      <li>Press microphone button</li>
                      <li>Ask questions for 20 seconds</li>
                      <li>Listen to all answers</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-3">Example Questions:</h4>
                    <ul className="space-y-1 text-gray-300">
                      <li>• "What do you see?"</li>
                      <li>• "Read the text"</li>
                      <li>• "Are there any people?"</li>
                      <li>• "What colors do you see?"</li>
                      <li>• "Is it safe here?"</li>
                      <li>• "Count the objects"</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* Settings Page */}
        {currentPage === 'settings' && (
          <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
            <div className="max-w-2xl mx-auto">
              <h1 className="font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-8">
                Settings
              </h1>
              
              <div className="bg-gray-800/50 rounded-xl p-6 mb-8 border border-gray-700/50">
                <h2 className="font-semibold text-xl mb-6 flex items-center">
                  <Volume2 className="w-6 h-6 mr-2 text-blue-400" />
                  Audio Settings
                </h2>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Speech Output</span>
                    <button 
                      onClick={() => setSpeechEnabled(!speechEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        speechEnabled ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        speechEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`}></div>
                    </button>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Session Timer</span>
                    <span className="text-gray-400">20 seconds</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3">
                    <span className="font-medium">Voice Recognition</span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      'speechSynthesis' in window ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                    }`}>
                      {'speechSynthesis' in window ? 'Supported' : 'Not Supported'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-xl p-6 mb-8 border border-gray-700/50">
                <h2 className="font-semibold text-xl mb-6 flex items-center">
                  <Camera className="w-6 h-6 mr-2 text-blue-400" />
                  Camera Settings
                </h2>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Default Camera</span>
                    <select 
                      value={cameraMode}
                      onChange={(e) => setCameraMode(e.target.value as CameraMode)}
                      className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600"
                    >
                      <option value="environment">Rear Camera</option>
                      <option value="user">Front Camera</option>
                    </select>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Auto-Capture</span>
                    <span className="text-gray-400">Every 5 seconds</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3">
                    <span className="font-medium">Camera Access</span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      navigator.mediaDevices ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                    }`}>
                      {navigator.mediaDevices ? 'Available' : 'Not Available'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-6 mb-8">
                <h3 className="font-semibold text-lg text-green-300 mb-4">Test Controls</h3>
                <div className="space-y-3">
                  <button 
                    onClick={() => speak("AKSHI Global Visual Assistant is working perfectly. All audio settings are configured correctly.")}
                    className="w-full bg-green-600/20 hover:bg-green-600/30 border border-green-600/50 rounded-xl p-3 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Volume2 className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-green-400">Test Audio Output</span>
                  </button>
                  
                  <button 
                    onClick={() => speak("This is a demonstration of the 20-second listening session. Press the microphone button and ask multiple questions within 20 seconds. I will answer them all in sequence.")}
                    className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 rounded-xl p-3 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Clock className="w-5 h-5 text-blue-400" />
                    <span className="font-medium text-blue-400">Test Session Guide</span>
                  </button>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                <h2 className="font-semibold text-xl mb-6 flex items-center">
                  <Settings className="w-6 h-6 mr-2 text-blue-400" />
                  App Information
                </h2>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Version</span>
                    <span className="text-gray-400">Demo v1.0</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">AI Integration</span>
                    <span className="text-yellow-400">Mock Responses</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3">
                    <span className="font-medium">Status</span>
                    <span className="text-green-400">Ready for Use</span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-lg border-t border-gray-800">
          <div className="flex justify-center items-center py-3 px-4">
            <div className="flex space-x-8 sm:space-x-12">
              <button 
                onClick={() => {
                  setCurrentPage('home');
                  if (speechEnabled) speak("Home page");
                }}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  currentPage === 'home' ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'
                }`}
              >
                <Home size={22} />
                <span className="text-xs font-medium">Home</span>
              </button>
              
              <button 
                onClick={() => {
                  toggleCamera();
                  if (speechEnabled) speak("Camera controls");
                }}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  isCameraActive || currentPage === 'camera' ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'
                }`}
              >
                <Camera size={22} />
                <span className="text-xs font-medium">Camera</span>
              </button>
              
              <button 
                onClick={() => {
                  setCurrentPage('chat');
                  if (speechEnabled) speak("Features page");
                }}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  currentPage === 'chat' ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'
                }`}
              >
                <MessageCircle size={22} />
                <span className="text-xs font-medium">Features</span>
              </button>
              
              <button 
                onClick={() => {
                  setCurrentPage('settings');
                  if (speechEnabled) speak("Settings page");
                }}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  currentPage === 'settings' ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'
                }`}
              >
                <Settings size={22} />
                <span className="text-xs font-medium">Settings</span>
              </button>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

export default App;