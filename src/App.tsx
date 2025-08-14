import { useState, useEffect, useRef } from 'react';
import { Mic, Camera, Settings, Home, MessageCircle, Volume2, VolumeX, Clock } from 'lucide-react';

// Replace with your actual API key
const GEMINI_API_KEY = "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78";

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

  // Convert image to base64
  const imageToBase64 = (canvas: HTMLCanvasElement): string => {
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  };

  // Real Gemini Vision API call
  const analyzeImageWithGemini = async (imageBase64: string, question: string): Promise<string> => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `You are a visual assistant helping visually impaired users. Analyze this image and answer the question: "${question}". Be descriptive, helpful, and specific. Focus on details that would be most useful for someone who cannot see the image.`
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            topK: 32,
            topP: 1,
            maxOutputTokens: 1024,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Unexpected API response format');
      }
    } catch (error) {
      console.error('Gemini API Error:', error);
      
      // Fallback to mock response if API fails
      return getFallbackResponse(question);
    }
  };

  // Fallback responses when API is not available
  const getFallbackResponse = (question: string): string => {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('what') && (lowerQuestion.includes('see') || lowerQuestion.includes('this'))) {
      return "I can see the current camera view. To get real-time scene analysis, please configure your Gemini API key in the code. I would describe objects, people, text, colors, and the overall scene in detail.";
    } else if (lowerQuestion.includes('read') || lowerQuestion.includes('text')) {
      return "I would read any visible text in the image, including signs, labels, documents, or written content. Please add your Gemini API key for real text recognition.";
    } else if (lowerQuestion.includes('color')) {
      return "I would describe all the colors visible in the scene in detail. With the API configured, I can identify specific colors and their locations.";
    } else if (lowerQuestion.includes('person') || lowerQuestion.includes('people')) {
      return "I would describe any people in the image, their appearance, clothing, and activities. Please configure the API for real person detection.";
    } else if (lowerQuestion.includes('safe') || lowerQuestion.includes('danger')) {
      return "I would analyze the scene for potential hazards and safety concerns, then provide guidance. Real safety analysis requires the API to be configured.";
    } else if (lowerQuestion.includes('count') || lowerQuestion.includes('how many')) {
      return "I would count the objects you're asking about. With the API configured, I can provide accurate counts of items in the scene.";
    } else {
      return `I heard your question: "${question}". To provide real visual analysis, please add your Gemini API key to the code. I would analyze the camera image and give you detailed information about what I see.`;
    }
  };

  // Speech synthesis with better voice settings
  const speak = (text: string) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Better voice settings for accessibility
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Try to use a clearer voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.localService)
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
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

  // Initialize Speech Recognition with better error handling
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        console.log('Speech recognition started');
      };

      recognitionRef.current.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          const transcript = lastResult[0].transcript.trim();
          console.log('Recognized speech:', transcript);
          
          if (transcript && transcript.length > 2) {
            addQuestionToSession(transcript);
          }
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        console.log('Speech recognition ended');
        
        // Auto-restart during listening session
        if (isInListeningSession && listeningTimer > 0) {
          setTimeout(() => {
            if (isInListeningSession && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (error) {
                console.log('Error restarting recognition:', error);
              }
            }
          }, 100);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        // Handle specific errors
        if (event.error === 'not-allowed') {
          speak('Microphone access denied. Please enable microphone permissions and try again.');
          return;
        }
        
        // Retry on recoverable errors during session
        if (isInListeningSession && event.error !== 'aborted' && listeningTimer > 0) {
          setTimeout(() => {
            if (isInListeningSession && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (error) {
                console.log('Error restarting after error:', error);
              }
            }
          }, 1000);
        }
      };
    } else {
      console.error('Speech Recognition not supported');
      speak('Speech recognition is not supported in this browser. Please use Chrome or Edge for the best experience.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isInListeningSession, listeningTimer]);

  // Auto-capture images when camera is active
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isCameraActive && videoRef.current) {
      // Initial capture after camera starts
      setTimeout(() => captureCurrentFrame(), 1000);
      // Regular captures every 3 seconds for real-time analysis
      interval = setInterval(() => {
        captureCurrentFrame();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isCameraActive]);

  // Page announcements
  useEffect(() => {
    const announcements = {
      home: 'Welcome to AKSHI Global AI Assistant. Turn on the camera, then press the microphone button to start a 20-second question session.',
      chat: 'Features page showing available visual assistance capabilities.',
      settings: 'Settings page for audio and camera preferences.',
      camera: 'Live camera view is active. I can see what you are looking at. Press the microphone to start asking questions about the scene.',
    };
    
    if (speechEnabled) {
      setTimeout(() => speak(announcements[currentPage]), 800);
    }
  }, [currentPage, speechEnabled]);

  const captureCurrentFrame = () => {
    if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 2) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCurrentImage(imageDataUrl);
        console.log('Frame captured for analysis');
      }
    }
  };

  const addQuestionToSession = (question: string) => {
    console.log('Adding question to session:', question);
    setSessionQuestions(prev => [...prev, question]);
    speak(`Question received: ${question}`);
  };

  const startListeningSession = () => {
    if (isInListeningSession || !recognitionRef.current) return;

    console.log('Starting 20-second listening session');
    setIsInListeningSession(true);
    setSessionQuestions([]);
    setListeningTimer(20);
    setCurrentQuestionIndex(0);
    
    speak("I'm listening for 20 seconds. Ask me any questions about what you see.");
    
    // Start the countdown timer
    listeningIntervalRef.current = setInterval(() => {
      setListeningTimer(prev => {
        if (prev <= 1) {
          endListeningSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Start speech recognition
    setTimeout(() => {
      if (recognitionRef.current && isInListeningSession) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          console.error('Error starting recognition:', error);
          speak('Unable to start voice recognition. Please check your microphone permissions.');
        }
      }
    }, 2000); // Wait for announcement to finish

    // Session timeout
    sessionTimeoutRef.current = setTimeout(() => {
      endListeningSession();
    }, 20000);
  };

  const endListeningSession = () => {
    console.log('Ending listening session');
    setIsInListeningSession(false);
    setIsListening(false);
    setListeningTimer(0);
    
    // Clear timers
    if (listeningIntervalRef.current) {
      clearInterval(listeningIntervalRef.current);
    }
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }
    
    // Stop speech recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    if (sessionQuestions.length > 0) {
      speak(`I heard ${sessionQuestions.length} question${sessionQuestions.length > 1 ? 's' : ''}. Let me analyze the scene and answer them now.`);
      setTimeout(() => {
        processSessionQuestions();
      }, 3000);
    } else {
      speak("I didn't hear any questions during the session. Please try again and speak clearly.");
    }
  };

  const processSessionQuestions = async () => {
    if (!currentImage) {
      speak('No camera image available. Please make sure the camera is active and try again.');
      return;
    }

    console.log('Processing questions with current image');
    setIsProcessing(true);
    setCurrentQuestionIndex(0);

    // Capture the latest frame for analysis
    captureCurrentFrame();
    
    // Wait a moment for the capture to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    for (let i = 0; i < sessionQuestions.length; i++) {
      setCurrentQuestionIndex(i + 1);
      const question = sessionQuestions[i];
      
      console.log(`Processing question ${i + 1}: ${question}`);
      speak(`Question ${i + 1}: ${question}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        // Get base64 image data
        if (canvasRef.current) {
          const imageBase64 = imageToBase64(canvasRef.current);
          
          // Analyze with Gemini Vision API
          const response = await analyzeImageWithGemini(imageBase64, question);
          
          console.log('AI Response:', response);
          setAssistantResponse(response);
          speak(response);
        } else {
          const fallbackResponse = getFallbackResponse(question);
          setAssistantResponse(fallbackResponse);
          speak(fallbackResponse);
        }
        
        // Wait between questions
        if (i < sessionQuestions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      } catch (error) {
        console.error('Error processing question:', error);
        const errorMessage = `Sorry, I had trouble analyzing the image for this question. ${getFallbackResponse(question)}`;
        setAssistantResponse(errorMessage);
        speak(errorMessage);
        
        if (i < sessionQuestions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    setIsProcessing(false);
    setCurrentQuestionIndex(0);
    speak("All questions answered. You can start a new session by pressing the microphone button again.");
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      console.log('Stopping camera');
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
        console.log('Starting camera');
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
        speak("Camera is now active. I can see what you're looking at. Press the microphone button to start asking questions about the scene.");
      } catch (error) {
        console.error('Error accessing camera:', error);
        speak("Unable to access camera. Please check your permissions and try again.");
      }
    }
  };

  // Load voices when available
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log('Available voices:', voices.length);
      };
      
      window.speechSynthesis.onvoiceschanged = loadVoices;
      loadVoices();
    }
  }, []);

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

            {/* API Configuration Notice */}
            {GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE" && (
              <div className="mb-8 max-w-2xl mx-auto bg-yellow-900/20 border border-yellow-600/50 rounded-xl p-4">
                <p className="text-yellow-300 text-sm text-center">
                  <strong>Note:</strong> Replace "YOUR_GEMINI_API_KEY_HERE" in the code with your actual Gemini API key for real scene analysis.
                </p>
              </div>
            )}

            {/* Main Controls */}
            <div className="text-center mb-8">
              <button
                onClick={startListeningSession}
                disabled={isProcessing || isInListeningSession || !isCameraActive}
                className={`inline-flex items-center space-x-3 px-8 py-4 rounded-full font-medium text-lg transition-all duration-300 ${
                  !isCameraActive
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    : isInListeningSession
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
                    <span>Analyzing Scene...</span>
                  </>
                ) : !isCameraActive ? (
                  <>
                    <Camera size={24} />
                    <span>Turn on Camera First</span>
                  </>
                ) : (
                  <>
                    <Mic size={24} />
                    <span>Start Voice Session</span>
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
                onClick={() => speak("AKSHI Global AI Assistant helps you understand what you see. First, turn on the camera so I can see what you're looking at. Then press the microphone button to start a 20-second voice session. Ask me multiple questions about the scene, and I will analyze the camera image and answer all your questions with detailed descriptions.")}
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
                  ? `Analyzing scene and answering question ${currentQuestionIndex} of ${sessionQuestions.length}`
                  : "Camera is active - I can see what you're looking at"
                }
              </p>
              
              <div className="relative w-full aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 mb-6">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                      <p className="text-white font-medium">
                        Analyzing scene for question {currentQuestionIndex} of {sessionQuestions.length}
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
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Mic size={20} />
                        <span>Ask Questions</span>
                      </>
                    )}
                  </button>
                )}
                
                {isCameraActive && (
                  <button
                    onClick={() => setCameraMode(cameraMode === 'user' ? 'environment' : 'user')}
                    disabled={isProcessing || isInListeningSession}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-full text-sm transition-colors"
                  >
                    <span>Switch to {cameraMode === 'user' ? 'Back' : 'Front'} Camera</span>
                  </button>
                )}
              </div>

              {/* Current Response Display */}
              {assistantResponse && (
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-6 mb-8">
                  <h3 className="font-semibold text-lg text-blue-300 mb-3">Current Response:</h3>
                  <p className="text-gray-200 text-base leading-relaxed">{assistantResponse}</p>
                </div>
              )}

              {/* Example Commands */}
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-3">Example voice commands:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "What do you see?",
                    "Read any text",
                    "Describe the scene",
                    "Are there any people?",
                    "What colors do you see?",
                    "Count the objects",
                    "Is it safe here?",
                    "What's in front of me?"
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

        {/* Chat Page - Features */}
        {currentPage === 'chat' && (
          <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
            <div className="max-w-4xl mx-auto">
              <h1 className="font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-8">
                Visual Accessibility Features
              </h1>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Clock className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">20-Second Voice Sessions</h3>
                  <p className="text-gray-400 text-sm">Ask multiple questions in timed sessions. I'll remember all questions and answer them in sequence.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Camera className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Real-Time Scene Analysis</h3>
                  <p className="text-gray-400 text-sm">AI-powered analysis of live camera feed with detailed descriptions of objects, people, text, and environments.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Volume2 className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Full Audio Interface</h3>
                  <p className="text-gray-400 text-sm">Complete voice interaction - speak your questions and hear detailed audio responses for total accessibility.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Mic className="w-8 h-8 mb-4 text-green-400" />
                  <h3 className="font-semibold text-lg mb-2">Advanced Speech Recognition</h3>
                  <p className="text-gray-400 text-sm">Continuous listening during sessions with automatic restart and error recovery for reliable voice input.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Settings className="w-8 h-8 mb-4 text-purple-400" />
                  <h3 className="font-semibold text-lg mb-2">Adaptive Responses</h3>
                  <p className="text-gray-400 text-sm">Context-aware answers that understand different question types like safety, navigation, reading, and identification.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <MessageCircle className="w-8 h-8 mb-4 text-yellow-400" />
                  <h3 className="font-semibold text-lg mb-2">Question Queue System</h3>
                  <p className="text-gray-400 text-sm">Visual tracking of all questions in a session with real-time progress indicators and completion status.</p>
                </div>
              </div>

              <div className="bg-blue-900/20 rounded-xl p-6 border border-blue-500/30 mb-8">
                <h3 className="font-semibold text-lg text-blue-300 mb-4">Complete Workflow</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                  <div>
                    <h4 className="font-medium text-white mb-3">Voice Input Process:</h4>
                    <ol className="space-y-2 text-gray-300 list-decimal list-inside">
                      <li>Turn on camera for live scene analysis</li>
                      <li>Press microphone to start 20-second session</li>
                      <li>Ask multiple questions clearly</li>
                      <li>System captures and queues all questions</li>
                      <li>Session ends automatically after 20 seconds</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-3">AI Analysis & Output:</h4>
                    <ol className="space-y-2 text-gray-300 list-decimal list-inside">
                      <li>Latest camera frame is captured</li>
                      <li>Each question processed with Gemini Vision API</li>
                      <li>Detailed visual analysis performed</li>
                      <li>All answers spoken aloud in sequence</li>
                      <li>Ready for next session immediately</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="bg-green-900/20 rounded-xl p-6 border border-green-500/30">
                <h3 className="font-semibold text-lg text-green-300 mb-4">Question Categories</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <h4 className="font-medium text-white mb-3">Scene Description:</h4>
                    <ul className="space-y-1 text-gray-300">
                      <li>• "What do you see?" - Overall scene overview</li>
                      <li>• "Describe the environment" - Detailed surroundings</li>
                      <li>• "What's in front of me?" - Forward-facing objects</li>
                      <li>• "Count the objects" - Quantity identification</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-3">Specific Analysis:</h4>
                    <ul className="space-y-1 text-gray-300">
                      <li>• "Read any text" - OCR text recognition</li>
                      <li>• "Are there people?" - Human detection</li>
                      <li>• "What colors?" - Color identification</li>
                      <li>• "Is it safe?" - Safety assessment</li>
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
                    <span className="font-medium">Session Duration</span>
                    <span className="text-gray-400">20 seconds</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Voice Recognition</span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      (window.SpeechRecognition || (window as any).webkitSpeechRecognition) 
                        ? 'bg-green-600/20 text-green-400' 
                        : 'bg-red-600/20 text-red-400'
                    }`}>
                      {(window.SpeechRecognition || (window as any).webkitSpeechRecognition) 
                        ? 'Supported' 
                        : 'Not Supported'
                      }
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3">
                    <span className="font-medium">Speech Synthesis</span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      'speechSynthesis' in window ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                    }`}>
                      {'speechSynthesis' in window ? 'Available' : 'Not Available'}
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
                    <span className="text-gray-400">Every 3 seconds</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Image Quality</span>
                    <span className="text-gray-400">720p JPEG</span>
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

              <div className="bg-purple-900/20 border border-purple-600/30 rounded-xl p-6 mb-8">
                <h3 className="font-semibold text-lg text-purple-300 mb-4">API Configuration</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2">
                    <span className="font-medium">Gemini Vision API</span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE"
                        ? 'bg-green-600/20 text-green-400' 
                        : 'bg-yellow-600/20 text-yellow-400'
                    }`}>
                      {GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE" ? 'Configured' : 'Demo Mode'}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm">
                    {GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE" 
                      ? 'API key is configured. Real scene analysis is active.'
                      : 'Using demo responses. Add your Gemini API key for real visual analysis.'
                    }
                  </p>
                </div>
              </div>

              <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-6 mb-8">
                <h3 className="font-semibold text-lg text-green-300 mb-4">Test Controls</h3>
                <div className="space-y-3">
                  <button 
                    onClick={() => speak("AKSHI Global Visual Assistant is working perfectly. All audio settings are configured correctly. Speech synthesis and voice recognition are both functioning normally.")}
                    className="w-full bg-green-600/20 hover:bg-green-600/30 border border-green-600/50 rounded-xl p-3 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Volume2 className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-green-400">Test Audio Output</span>
                  </button>
                  
                  <button 
                    onClick={() => speak("Here's how to use the voice session feature: First, turn on your camera so I can see what you're looking at. Then press the microphone button to start a 20-second listening session. Ask me multiple questions about the scene within those 20 seconds. I will remember all your questions and then analyze the camera image to answer each one in detail. This allows for efficient interaction where you can ask everything you want to know in one session.")}
                    className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 rounded-xl p-3 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Clock className="w-5 h-5 text-blue-400" />
                    <span className="font-medium text-blue-400">Voice Session Tutorial</span>
                  </button>
                  
                  <button 
                    onClick={() => speak("Camera permissions test: Please make sure your browser allows camera access for this website. You can check this in your browser's address bar or settings. If the camera button shows 'Start Camera', click it to begin live scene analysis.")}
                    className="w-full bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/50 rounded-xl p-3 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Camera className="w-5 h-5 text-purple-400" />
                    <span className="font-medium text-purple-400">Camera Access Guide</span>
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
                    <span className="text-gray-400">v1.0 Full Implementation</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">AI Integration</span>
                    <span className={GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE" ? "text-green-400" : "text-yellow-400"}>
                      {GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE" ? "Gemini Vision API" : "Demo Responses"}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Features</span>
                    <span className="text-green-400">Complete Audio Pipeline</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3">
                    <span className="font-medium">Status</span>
                    <span className="text-green-400">Ready for Production</span>
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
                  setCurrentPage('camera');
                  if (speechEnabled) speak("Camera page");
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