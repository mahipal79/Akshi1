import { useState, useEffect, useRef } from 'react';
import { Mic, Camera, Settings, Home, MessageCircle, Volume2, VolumeX, MicOff, Play, Pause } from 'lucide-react';

// Configuration - Replace with your actual API key
const GEMINI_API_KEY = "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

type Page = 'home' | 'chat' | 'settings' | 'camera';
type CameraMode = 'user' | 'environment';

// TypeScript interfaces for Speech Recognition
interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new(): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new(): SpeechRecognition;
    };
  }
}

function App() {
  // Core states
  const [isListening, setIsListening] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [cameraMode, setCameraMode] = useState<CameraMode>('environment');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check browser support
  const hasSpeechRecognition = !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
  const hasSpeechSynthesis = !!window.speechSynthesis;

  // Capture image from video
  const captureImage = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState < 2 || video.videoWidth === 0) return null;
    
    const context = canvas.getContext('2d');
    if (!context) return null;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to base64
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  // Analyze image with Gemini Vision API
  const analyzeImageWithGemini = async (imageDataUrl: string, question: string): Promise<string> => {
    // Check if API key is configured
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_ACTUAL_API_KEY_HERE") {
      throw new Error('Please configure your Gemini API key in the code');
    }

    try {
      // Extract base64 data from data URL
      const base64Data = imageDataUrl.split(',')[1];
      
      const requestBody = {
        contents: [{
          parts: [
            {
              text: `You are a visual assistant helping users understand what they see. Analyze this image and answer the question: "${question}"

Please provide a clear, detailed, and helpful response. Focus on:
- Being descriptive and specific about what you observe
- Answering the user's question directly
- Including relevant details about colors, objects, people, text, or scenes
- Keeping the response conversational and accessible
- If there's text in the image, read it accurately
- If asked about safety or navigation, provide practical guidance

Keep your response under 200 words but be thorough and helpful.`
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH", 
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      };

      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('API Error:', errorData);
        throw new Error(`API request failed: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      } else {
        console.error('Unexpected API response:', data);
        throw new Error('Invalid response from AI service');
      }
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw error;
    }
  };

  // Enhanced speech synthesis with better voice selection
  const speak = (text: string) => {
    if (!speechEnabled || !hasSpeechSynthesis) return;

    // Stop any current speech
    if (utteranceRef.current) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    
    // Configure speech parameters
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Select best available voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('Natural'))
    ) || voices.find(voice => voice.lang.startsWith('en') && !voice.name.includes('eSpeak'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
      utteranceRef.current = null;
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (utteranceRef.current) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      utteranceRef.current = null;
    }
  };

  // Initialize Speech Recognition
  useEffect(() => {
    if (!hasSpeechRecognition) return;

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0][0];
      const transcript = result.transcript.trim();
      const confidence = result.confidence;
      
      console.log('Recognized:', transcript, 'Confidence:', confidence);
      
      if (transcript && transcript.length > 2) {
        setCurrentQuestion(transcript);
        speak(`I heard: ${transcript}. Let me analyze what I can see.`);
        
        // Wait for confirmation speech to finish, then process
        setTimeout(() => {
          processQuestion(transcript);
        }, 3000);
      } else {
        speak('I didn\'t catch that clearly. Please try asking your question again.');
        setIsProcessing(false);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      
      let errorMessage = '';
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone permissions and try again.';
          break;
        case 'no-speech':
          errorMessage = 'No speech detected. Please try speaking more clearly.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your microphone.';
          break;
        case 'network':
          errorMessage = 'Network error. Please check your internet connection.';
          break;
        case 'aborted':
          return; // Don't show error for intentional stops
        default:
          errorMessage = 'Speech recognition failed. Please try again.';
      }
      
      setError(errorMessage);
      speak(errorMessage);
      setIsProcessing(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Process question with image analysis
  const processQuestion = async (question: string) => {
    if (!isCameraActive) {
      const message = 'Camera is not active. Please turn on the camera first.';
      setError(message);
      speak(message);
      setIsProcessing(false);
      return;
    }

    try {
      // Capture current image
      const imageDataUrl = captureImage();
      if (!imageDataUrl) {
        const message = 'Unable to capture image. Please ensure the camera is working.';
        setError(message);
        speak(message);
        setIsProcessing(false);
        return;
      }

      setCapturedImage(imageDataUrl);
      
      console.log('Analyzing image with question:', question);
      
      // Get AI response
      const response = await analyzeImageWithGemini(imageDataUrl, question);
      
      console.log('AI Response:', response);
      setAssistantResponse(response);
      setError(null);
      
      // Speak the response
      speak(response);
      
    } catch (error: any) {
      console.error('Error processing question:', error);
      const errorMessage = error.message || 'Sorry, I encountered an error analyzing the image. Please try again.';
      setError(errorMessage);
      setAssistantResponse(errorMessage);
      speak(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // Start listening for questions
  const startListening = () => {
    if (!hasSpeechRecognition) {
      const message = 'Speech recognition is not supported in this browser. Please try Chrome or Edge.';
      setError(message);
      speak(message);
      return;
    }

    if (!isCameraActive) {
      const message = 'Please turn on the camera first.';
      setError(message);
      speak(message);
      return;
    }

    if (isListening || isProcessing) return;

    setIsProcessing(true);
    setCurrentQuestion('');
    setAssistantResponse('');
    setError(null);
    
    speak('I\'m listening. Please ask your question about what you see.');
    
    setTimeout(() => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          console.error('Error starting recognition:', error);
          const message = 'Unable to start voice recognition. Please try again.';
          setError(message);
          speak(message);
          setIsProcessing(false);
        }
      }
    }, 2500);
  };

  // Camera controls
  const toggleCamera = async () => {
    if (isCameraActive) {
      // Stop camera
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      setIsCameraActive(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setMediaStream(null);
      setCapturedImage(null);
      setError(null);
      speak("Camera stopped.");
    } else {
      // Start camera
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera not supported in this browser');
        }

        const constraints = {
          video: {
            facingMode: cameraMode,
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 }
          },
          audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
          };
        }
        
        setMediaStream(stream);
        setIsCameraActive(true);
        setError(null);
        speak("Camera started. You can now ask questions about what I see.");
        
        // Auto-navigate to camera page
        if (currentPage !== 'camera') {
          setCurrentPage('camera');
        }
        
      } catch (error: any) {
        console.error('Camera error:', error);
        let errorMessage = 'Unable to access camera. ';
        
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Please allow camera permissions and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (error.name === 'NotReadableError') {
          errorMessage += 'Camera is being used by another application.';
        } else {
          errorMessage += 'Please check your camera settings and try again.';
        }
        
        setError(errorMessage);
        speak(errorMessage);
      }
    }
  };

  // Switch camera mode
  const switchCamera = async () => {
    const newMode = cameraMode === 'user' ? 'environment' : 'user';
    setCameraMode(newMode);
    
    if (isCameraActive && mediaStream) {
      try {
        // Stop current stream
        mediaStream.getTracks().forEach(track => track.stop());
        
        // Start with new mode
        const constraints = {
          video: {
            facingMode: newMode,
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 }
          },
          audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        setMediaStream(stream);
        speak(`Switched to ${newMode === 'user' ? 'front' : 'back'} camera.`);
        
      } catch (error) {
        console.error('Error switching camera:', error);
        speak('Unable to switch camera. Please try again.');
        // Revert camera mode
        setCameraMode(cameraMode);
      }
    } else {
      speak(`Camera mode set to ${newMode === 'user' ? 'front' : 'back'} camera.`);
    }
  };

  // Load speech synthesis voices
  useEffect(() => {
    if (hasSpeechSynthesis) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log('Available voices:', voices.length);
      };
      
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
      loadVoices();
    }
  }, []);

  // Page announcements
  useEffect(() => {
    if (!speechEnabled) return;
    
    const announcements = {
      home: 'Home page. Turn on the camera and click Ask Question to get visual assistance.',
      chat: 'Features page showing visual assistance capabilities.',
      settings: 'Settings page for configuring audio and camera preferences.',
      camera: isCameraActive 
        ? 'Camera page. Camera is active and ready for questions.' 
        : 'Camera page. Click Start Camera to begin.'
    };
    
    const timer = setTimeout(() => {
      speak(announcements[currentPage]);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [currentPage, speechEnabled, isCameraActive]);

  return (
    <div className="min-h-screen bg-gray-900 text-white overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 opacity-50"></div>
      
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex justify-center items-center p-6">
          <div className="flex items-center space-x-3">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold">👁️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">AKSHI Visual Assistant</h1>
              <p className="text-sm text-gray-400">AI-Powered Vision for Accessibility</p>
            </div>
          </div>
        </header>

        {/* Error Display */}
        {error && (
          <div className="mx-4 mb-4 bg-red-900/50 border border-red-600/50 rounded-lg p-4">
            <p className="text-red-200 text-center">{error}</p>
          </div>
        )}

        {/* Home Page */}
        {currentPage === 'home' && (
          <main className="flex-1 flex flex-col items-center justify-center px-6 pb-32">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-4">
                What Can I Help You
                <br />
                <span className="text-blue-400">See Today?</span>
              </h2>
              
              {currentQuestion && (
                <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 mb-4 max-w-2xl">
                  <p className="text-yellow-200">
                    <strong>Question:</strong> "{currentQuestion}"
                  </p>
                </div>
              )}
              
              {assistantResponse && (
                <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-6 mb-6 max-w-3xl text-left">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-blue-300">AI Response:</h3>
                    <div className="flex space-x-2">
                      {isSpeaking ? (
                        <button 
                          onClick={stopSpeaking}
                          className="text-red-400 hover:text-red-300"
                          title="Stop speaking"
                        >
                          <Pause size={20} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => speak(assistantResponse)}
                          className="text-green-400 hover:text-green-300"
                          title="Repeat response"
                        >
                          <Play size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-200 leading-relaxed">{assistantResponse}</p>
                </div>
              )}
            </div>

            {/* Audio Visualizer */}
            <div className="relative mb-12">
              <div className="relative w-48 h-48">
                <div className={`absolute inset-0 rounded-full border-2 border-blue-400/30 transition-all duration-300 ${
                  isListening || isProcessing ? 'animate-pulse scale-110' : ''
                }`}>
                  <div className="absolute inset-2 rounded-full border border-blue-400/50"></div>
                  <div className="absolute inset-4 rounded-full border border-blue-400/70"></div>
                </div>
                
                <div className="absolute inset-0 flex items-center justify-center">
                  {isListening ? (
                    <div className="text-red-400 animate-pulse">
                      <MicOff size={48} />
                    </div>
                  ) : isProcessing ? (
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
                  ) : (
                    <Mic size={48} className="text-blue-400" />
                  )}
                </div>
              </div>
            </div>

            {/* Main Controls */}
            <div className="space-y-6">
              <button
                onClick={startListening}
                disabled={!hasSpeechRecognition || isProcessing || isListening || !isCameraActive}
                className={`flex items-center space-x-3 px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 ${
                  !isCameraActive
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    : !hasSpeechRecognition
                    ? 'bg-red-600/50 text-red-300 cursor-not-allowed'
                    : isListening
                    ? 'bg-red-600 text-white shadow-lg animate-pulse'
                    : isProcessing
                    ? 'bg-yellow-600 text-white shadow-lg'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg'
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff size={24} />
                    <span>Listening...</span>
                  </>
                ) : isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : !isCameraActive ? (
                  <>
                    <Camera size={24} />
                    <span>Turn Camera On First</span>
                  </>
                ) : (
                  <>
                    <Mic size={24} />
                    <span>Ask Question</span>
                  </>
                )}
              </button>
              
              <div className="flex justify-center space-x-4">
                <button
                  onClick={toggleCamera}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all ${
                    isCameraActive 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  <Camera size={20} />
                  <span>{isCameraActive ? 'Stop Camera' : 'Start Camera'}</span>
                </button>
                
                <button 
                  onClick={() => setSpeechEnabled(!speechEnabled)}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all ${
                    speechEnabled 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'bg-gray-600 hover:bg-gray-700 text-white'
                  }`}
                >
                  {speechEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                  <span>{speechEnabled ? 'Audio On' : 'Audio Off'}</span>
                </button>
              </div>
            </div>

            {/* Quick Commands */}
            <div className="mt-8 text-center">
              <p className="text-gray-400 mb-4">Try these voice commands:</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-4xl">
                {[
                  "What do you see?",
                  "Read the text",
                  "Describe the scene",
                  "Are there people?",
                  "What colors?",
                  "Count objects",
                  "Is this safe?",
                  "Help me navigate"
                ].map((cmd, i) => (
                  <span key={i} className="bg-gray-800/50 px-3 py-1 rounded-full text-sm text-gray-300">
                    "{cmd}"
                  </span>
                ))}
              </div>
            </div>
          </main>
        )}

        {/* Camera Page */}
        {currentPage === 'camera' && (
          <main className="flex-1 px-4 pb-32 pt-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-center mb-6">Live Camera Feed</h2>
              
              <div className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden mb-6">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                
                {capturedImage && isProcessing && (
                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                    <div className="text-center">
                      <img src={capturedImage} alt="Captured" className="max-w-xs max-h-48 rounded-lg mb-4" />
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
                      <p className="text-white">Analyzing image...</p>
                    </div>
                  </div>
                )}
                
                {isListening && (
                  <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full font-bold animate-pulse">
                    🎤 Listening
                  </div>
                )}
                
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                      <p className="text-gray-400">Camera is off</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-center space-x-4 mb-6">
                <button
                  onClick={toggleCamera}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${
                    isCameraActive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  <Camera size={20} />
                  <span>{isCameraActive ? 'Stop' : 'Start'}</span>
                </button>
                
                <button
                  onClick={switchCamera}
                  className="flex items-center space-x-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium"
                >
                  <span>Switch Camera</span>
                </button>
                
                <button
                  onClick={startListening}
                  disabled={!isCameraActive}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${
                    !isCameraActive 
                      ? 'bg-gray-600 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  <Mic size={20} />
                  <span>Ask Question</span>
                </button>
              </div>

              {assistantResponse && (
                <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-6">
                  <h3 className="font-semibold text-blue-300 mb-3">AI Response:</h3>
                  <p className="text-gray-200">{assistantResponse}</p>
                  {currentQuestion && (
                    <p className="text-gray-400 text-sm mt-2 italic">Question: "{currentQuestion}"</p>
                  )}
                </div>
              )}
            </div>
          </main>
        )}

        {/* Features Page */}
        {currentPage === 'chat' && (
          <main className="flex-1 px-6 pb-32 pt-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-8">Visual Assistant Features</h2>
              
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Mic className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Voice Control</h3>
                  <p className="text-gray-400 text-sm">Ask questions using natural speech. Advanced recognition with error handling.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Camera className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Real-time Capture</h3>
                  <p className="text-gray-400 text-sm">Instant image capture when you ask questions for accurate analysis.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Volume2 className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Audio Feedback</h3>
                  <p className="text-gray-400 text-sm">Clear spoken responses with natural voice synthesis.</p>
                </div>
              </div>

              <div className="mt-12 bg-blue-900/20 rounded-xl p-6 border border-blue-500/30">
                <h3 className="text-xl font-semibold text-blue-300 mb-4">Capabilities</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Scene Analysis</h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>• Complete scene description</li>
                      <li>• Object identification & counting</li>
                      <li>• People detection & description</li>
                      <li>• Color analysis</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Text & Navigation</h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>• OCR text reading</li>
                      <li>• Safety assessment</li>
                      <li>• Navigation assistance</li>
                      <li>• Obstacle detection</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* Settings Page */}
        {currentPage === 'settings' && (
          <main className="flex-1 px-6 pb-32 pt-8">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-8">Settings</h2>
              
              <div className="space-y-6">
                {/* Audio Settings */}
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <h3 className="font-semibold text-xl mb-4 flex items-center">
                    <Volume2 className="w-6 h-6 mr-2 text-blue-400" />
                    Audio Settings
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Speech Output</span>
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
                    
                    <div className="flex justify-between items-center">
                      <span>Voice Recognition</span>
                      <span className={`text-sm px-3 py-1 rounded-full ${
                        hasSpeechRecognition ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                      }`}>
                        {hasSpeechRecognition ? 'Supported' : 'Not Supported'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Camera Settings */}
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <h3 className="font-semibold text-xl mb-4 flex items-center">
                    <Camera className="w-6 h-6 mr-2 text-blue-400" />
                    Camera Settings
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Current Mode</span>
                      <span className="text-blue-400">
                        {cameraMode === 'user' ? 'Front Camera' : 'Back Camera'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span>Status</span>
                      <span className={`text-sm px-3 py-1 rounded-full ${
                        isCameraActive ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {isCameraActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* API Configuration */}
                <div className="bg-purple-900/20 rounded-xl p-6 border border-purple-500/30">
                  <h3 className="font-semibold text-xl mb-4 text-purple-300">API Configuration</h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Gemini Vision API</span>
                      <span className={`text-sm px-3 py-1 rounded-full ${
                        GEMINI_API_KEY !== "YOUR_ACTUAL_API_KEY_HERE" 
                          ? 'bg-green-600/20 text-green-400' 
                          : 'bg-yellow-600/20 text-yellow-400'
                      }`}>
                        {GEMINI_API_KEY !== "YOUR_ACTUAL_API_KEY_HERE" ? 'Configured' : 'Needs Setup'}
                      </span>
                    </div>
                    
                    {GEMINI_API_KEY === "YOUR_ACTUAL_API_KEY_HERE" && (
                      <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4">
                        <p className="text-yellow-300 text-sm">
                          ⚠️ Please replace "YOUR_ACTUAL_API_KEY_HERE" with your Gemini API key in the code to enable real AI analysis.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* System Tests */}
                <div className="bg-green-900/20 rounded-xl p-6 border border-green-500/30">
                  <h3 className="font-semibold text-xl mb-4 text-green-300">System Tests</h3>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => speak("Audio test successful. Speech synthesis is working perfectly. The system is ready to provide voice responses.")}
                      className="bg-green-600/20 hover:bg-green-600/30 border border-green-600/50 rounded-lg p-4 transition-all text-left"
                    >
                      <Volume2 className="w-5 h-5 inline mr-2" />
                      <span className="font-medium">Test Audio Output</span>
                    </button>
                    
                    <button 
                      onClick={async () => {
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                          stream.getTracks().forEach(track => track.stop());
                          speak('Camera test successful. Your camera is accessible and working properly.');
                        } catch (error) {
                          speak('Camera test failed. Please check permissions and try again.');
                        }
                      }}
                      className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 rounded-lg p-4 transition-all text-left"
                    >
                      <Camera className="w-5 h-5 inline mr-2" />
                      <span className="font-medium">Test Camera Access</span>
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (hasSpeechRecognition) {
                          speak('Voice recognition is supported and ready. You can ask questions using your voice.');
                        } else {
                          speak('Voice recognition is not supported in this browser. Please use Chrome or Edge for best results.');
                        }
                      }}
                      className="bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/50 rounded-lg p-4 transition-all text-left"
                    >
                      <Mic className="w-5 h-5 inline mr-2" />
                      <span className="font-medium">Test Voice Recognition</span>
                    </button>
                  </div>
                </div>

                {/* Browser Compatibility */}
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <h3 className="font-semibold text-xl mb-4">Browser Compatibility</h3>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span>Speech Recognition</span>
                      <span className={hasSpeechRecognition ? 'text-green-400' : 'text-red-400'}>
                        {hasSpeechRecognition ? '✓ Supported' : '✗ Not Supported'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span>Speech Synthesis</span>
                      <span className={hasSpeechSynthesis ? 'text-green-400' : 'text-red-400'}>
                        {hasSpeechSynthesis ? '✓ Supported' : '✗ Not Supported'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span>Camera Access</span>
                      <span className={navigator.mediaDevices ? 'text-green-400' : 'text-red-400'}>
                        {navigator.mediaDevices ? '✓ Available' : '✗ Not Available'}
                      </span>
                    </div>
                  </div>
                  
                  {(!hasSpeechRecognition || !hasSpeechSynthesis) && (
                    <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-600/50 rounded-lg">
                      <p className="text-yellow-300 text-sm">
                        For best experience, use Chrome, Edge, or Safari with up-to-date versions.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        )}

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800">
          <div className="flex justify-center items-center py-4 px-6">
            <div className="flex space-x-8">
              <button 
                onClick={() => setCurrentPage('home')}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors ${
                  currentPage === 'home' ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'
                }`}
              >
                <Home size={24} />
                <span className="text-xs font-medium">Home</span>
              </button>
              
              <button 
                onClick={() => setCurrentPage('camera')}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors ${
                  currentPage === 'camera' ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'
                }`}
              >
                <Camera size={24} />
                <span className="text-xs font-medium">Camera</span>
              </button>
              
              <button 
                onClick={() => setCurrentPage('chat')}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors ${
                  currentPage === 'chat' ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'
                }`}
              >
                <MessageCircle size={24} />
                <span className="text-xs font-medium">Features</span>
              </button>
              
              <button 
                onClick={() => setCurrentPage('settings')}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors ${
                  currentPage === 'settings' ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'
                }`}
              >
                <Settings size={24} />
                <span className="text-xs font-medium">Settings</span>
              </button>
            </div>
          </div>
        </nav>

        {/* Speaking Indicator */}
        {isSpeaking && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg animate-pulse">
            <div className="flex items-center space-x-2">
              <Volume2 size={20} />
              <span className="font-medium">Speaking...</span>
              <button 
                onClick={stopSpeaking}
                className="ml-2 hover:bg-green-700 rounded p-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;