import { useState, useEffect, useRef } from 'react';
import { Mic, Keyboard, Camera, Settings, Home, MessageCircle, User, LogOut, RefreshCcw, Volume2, VolumeX } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';

// IMPORTANT: Replace with your actual Gemini API key.
// For production, you should load this from an environment variable for security.
const API_KEY = "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78";

const genAI = new GoogleGenerativeAI(API_KEY);
const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

type Page = 'home' | 'chat' | 'settings' | 'camera';
type CameraMode = 'user' | 'environment';

function App() {
  const [isListening, setIsListening] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcribedText, setTranscribedText] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [cameraMode, setCameraMode] = useState<CameraMode>('environment');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Update document title based on current page
  useEffect(() => {
    const titles = {
      home: 'AKSHI Global - AI Assistant | Voice & Vision AI Technology',
      chat: 'AI Features - AKSHI Global Assistant | Available & Coming Soon',
      settings: 'Settings - AKSHI Global AI Assistant | Account & Preferences',
      camera: 'Live Camera - AKSHI Global Assistant | Scene Detection',
    };
    document.title = titles[currentPage];
  }, [currentPage]);

  // Auto-announce current page for accessibility
  useEffect(() => {
    const announcements = {
      home: 'Welcome to AKSHI Global AI Assistant. You are on the home page. Press the camera button to start visual assistance.',
      chat: 'AI Features page. Here you can see available and upcoming features.',
      settings: 'Settings page. Manage your account and preferences here.',
      camera: 'Live camera view active. Ask me questions about what you see.',
    };
    
    if (speechEnabled) {
      setTimeout(() => {
        speak(announcements[currentPage]);
      }, 500);
    }
  }, [currentPage, speechEnabled]);

  // Simulate audio wave animation
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isListening) {
      interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 100);
    } else {
      setAudioLevel(0);
    }
    return () => clearInterval(interval);
  }, [isListening]);

  // Initialize Web Speech API for voice recognition and synthesis
  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        if (speechEnabled) {
          speak("I'm listening. What would you like to know about the scene?");
        }
      };

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        setTranscribedText(transcript);
        
        // Check if user wants scene analysis
        if (isCameraActive && currentImage) {
          processVoiceCommandWithImage(transcript);
        } else {
          sendToGemini(transcript);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (speechEnabled) {
          speak("Sorry, I couldn't understand that. Please try again.");
        }
      };
    } else {
      console.error('Web Speech API is not supported in this browser.');
      if (speechEnabled) {
        speak("Voice recognition is not supported in this browser.");
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      }
    };
  }, [isCameraActive, currentImage, speechEnabled]);

  // Auto-capture images when camera is active (every 3 seconds)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isCameraActive && videoRef.current) {
      interval = setInterval(() => {
        captureCurrentFrame();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isCameraActive]);

  // Handle Speech Synthesis (Text-to-Speech)
  const speak = (text: string) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;

    // Stop any current speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // Stop speaking
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Capture current video frame
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

  // Process voice commands with image analysis
  const processVoiceCommandWithImage = async (command: string) => {
    if (!currentImage) {
      speak("No image available. Please ensure the camera is working.");
      return;
    }

    setIsProcessing(true);
    setAssistantResponse("Analyzing the scene...");

    try {
      // Convert data URL to proper format for Gemini
      const base64Data = currentImage.split(',')[1];
      
      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg"
        }
      };

      // Create a comprehensive prompt based on the command
      let prompt = "";
      
      if (command.includes("what") && (command.includes("see") || command.includes("this") || command.includes("here"))) {
        prompt = "Describe everything you see in this image in detail. Include objects, people, colors, text, and the overall scene. Be descriptive and helpful for someone who cannot see.";
      } else if (command.includes("read") || command.includes("text")) {
        prompt = "Read all text visible in this image aloud, including signs, labels, documents, or any written content.";
      } else if (command.includes("color") || command.includes("colours")) {
        prompt = "Describe the colors in this image in detail.";
      } else if (command.includes("person") || command.includes("people")) {
        prompt = "Describe any people you see in this image - their appearance, clothing, and what they're doing.";
      } else if (command.includes("object") || command.includes("thing")) {
        prompt = "List and describe all the objects you can identify in this image.";
      } else if (command.includes("where") || command.includes("location")) {
        prompt = "Describe the location or setting shown in this image.";
      } else if (command.includes("count") || command.includes("how many")) {
        prompt = "Count and describe the quantity of items, people, or objects in this image.";
      } else if (command.includes("danger") || command.includes("safe") || command.includes("warning")) {
        prompt = "Analyze this image for any potential dangers, hazards, or safety concerns. Also mention if the area appears safe.";
      } else {
        prompt = `Based on this question: "${command}", analyze the image and provide a helpful, detailed response. Focus on visual elements that would be useful for someone who cannot see the image.`;
      }

      const result = await visionModel.generateContent([prompt, imagePart]);
      const response = result.response.text();
      
      setAssistantResponse(response);
      speak(response);
    } catch (error) {
      console.error('Error with Gemini Vision API:', error);
      const errorMessage = "Sorry, I'm having trouble analyzing the image right now. Please try again.";
      setAssistantResponse(errorMessage);
      speak(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // Send text to Gemini for general queries
  const sendToGemini = async (prompt: string) => {
    if (!prompt.trim()) return;

    setIsProcessing(true);
    setAssistantResponse("Thinking...");
    
    try {
      const result = await textModel.generateContent(prompt);
      const response = result.response.text();
      setAssistantResponse(response);
      speak(response);
    } catch (error) {
      console.error('Error with Gemini API:', error);
      const errorMessage = "Sorry, I'm having trouble right now. Please try again.";
      setAssistantResponse(errorMessage);
      speak(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle voice input
  const handleMicClick = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscribedText('');
      setAssistantResponse('');
      recognitionRef.current?.start();
    }
  };

  // Handle camera access and streaming
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
        speak("Camera is now active. I'm ready to help you understand what you're seeing. Ask me questions like 'what do you see', 'read the text', or 'describe the scene'.");
      } catch (error) {
        console.error('Error accessing camera:', error);
        speak("Unable to access camera. Please check your permissions and try again.");
      }
    }
  };

  // Flip camera between front and rear
  const handleFlipCamera = () => {
    const newMode = cameraMode === 'user' ? 'environment' : 'user';
    setCameraMode(newMode);
    mediaStream?.getTracks().forEach(track => track.stop());
    setMediaStream(null);
    setIsCameraActive(false);
    setTimeout(toggleCamera, 500);
    speak(`Switching to ${newMode === 'user' ? 'front' : 'rear'} camera.`);
  };

  const renderHomePage = () => (
    <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24">
      {/* Status Text */}
      <div className="text-center mb-8 sm:mb-12">
        <p className="text-gray-400 font-manrope font-semibold text-sm sm:text-base mb-2">
          {isListening ? `Listening: "${transcribedText}"` : 'Voice Assistant for Visual Accessibility'}
        </p>
        {assistantResponse && (
          <div className="max-w-2xl mx-auto">
            <p className="text-primary font-manrope font-medium text-base sm:text-lg mt-2">
              {assistantResponse}
            </p>
          </div>
        )}
        {isProcessing && (
          <p className="text-yellow-400 font-manrope font-medium text-sm mt-2">
            Processing your request...
          </p>
        )}
      </div>

      {/* Main Heading */}
      <div className="text-center mb-12 sm:mb-16 max-w-4xl">
        <h1 className="font-lato font-bold text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl leading-tight">
          What Can I Help You
        </h1>
        <h1 className="font-lato font-bold text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl leading-tight text-primary">
          See Today?
        </h1>
      </div>

      {/* Animated Audio Wave Ring */}
      <div className="relative mb-12 sm:mb-16">
        <div className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 xl:w-64 xl:h-64">
          <div className={`absolute inset-0 rounded-full border-2 border-primary/30 transition-all duration-100 ${isListening || isProcessing ? 'animate-pulse' : ''}`}
               style={{ transform: isListening ? `scale(${1 + audioLevel * 0.002})` : 'scale(1)' }}>
            <div className={`absolute inset-2 rounded-full border border-primary/50 transition-all duration-100`}
                 style={{ transform: isListening ? `scale(${1 + audioLevel * 0.003})` : 'scale(1)' }}></div>
            <div className={`absolute inset-4 rounded-full border border-primary/70 transition-all duration-100`}
                 style={{ transform: isListening ? `scale(${1 + audioLevel * 0.004})` : 'scale(1)' }}></div>
          </div>
          
          <div className={`absolute inset-6 rounded-full bg-gradient-to-r from-primary/40 via-primary/60 to-primary/40 blur-sm transition-all duration-100 ${isListening || isProcessing ? 'animate-pulse' : ''}`}
               style={{ opacity: isListening ? 0.4 + audioLevel * 0.006 : 0.4 }}></div>
          <div className={`absolute inset-8 rounded-full bg-primary/20 transition-all duration-100 ${isListening || isProcessing ? 'animate-ping' : ''}`}
               style={{ opacity: isListening ? 0.2 + audioLevel * 0.008 : 0.2 }}></div>
          
          <div className={`absolute inset-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-primary rounded-full shadow-lg shadow-primary/50 transition-all duration-100`}
               style={{ transform: `translate(-50%, -50%) scale(${isListening ? 1 + audioLevel * 0.01 : 1})` }}></div>
          
          {(isListening || isProcessing) && (
            <div className="absolute inset-0">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 bg-primary rounded-full animate-bounce"
                  style={{
                    top: `${50 + 40 * Math.sin((i * Math.PI) / 4)}%`,
                    left: `${50 + 40 * Math.cos((i * Math.PI) / 4)}%`,
                    animationDelay: `${i * 100}ms`,
                    transform: `scale(${1 + audioLevel * 0.02})`,
                  }}
                ></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Voice Input Section */}
      <div className="text-center mb-8">
        <button
          onClick={handleMicClick}
          disabled={isProcessing}
          className={`inline-flex items-center space-x-2 px-6 py-3 rounded-full font-inter font-medium text-sm sm:text-base transition-all duration-300 ${
            isListening
              ? 'bg-primary text-white shadow-lg shadow-primary/25'
              : isProcessing
              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Mic size={18} className={isListening ? 'animate-pulse' : ''} />
          <span>{isListening ? 'Listening...' : isProcessing ? 'Processing...' : 'Use Voice'}</span>
        </button>
        
        <div className="mt-4 flex items-center justify-center space-x-4">
          <button 
            onClick={() => setSpeechEnabled(!speechEnabled)}
            className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full transition-colors font-inter text-sm ${
              speechEnabled ? 'text-primary' : 'text-gray-400 hover:text-white'
            }`}
          >
            {speechEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{speechEnabled ? 'Audio On' : 'Audio Off'}</span>
          </button>
          {isSpeaking && (
            <button 
              onClick={stopSpeaking}
              className="inline-flex items-center space-x-2 px-4 py-2 text-red-400 hover:text-red-300 transition-colors font-inter text-sm"
            >
              <span>Stop Speaking</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
        <button
          onClick={toggleCamera}
          className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-inter font-medium transition-colors"
        >
          <Camera size={18} />
          <span>Start Camera</span>
        </button>
        
        <button
          onClick={() => speak("AKSHI Global AI Assistant is ready to help you. Use voice commands to interact with me. Turn on the camera to get visual assistance.")}
          className="flex items-center justify-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-inter font-medium transition-colors"
        >
          <Volume2 size={18} />
          <span>Audio Guide</span>
        </button>
      </div>
    </main>
  );

  const renderCameraPage = () => (
    <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
      <div className="max-w-4xl w-full mx-auto">
        <h1 className="font-lato font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-4">
          Live Camera Vision Assistant
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Ask me: "What do you see?", "Read the text", "Describe the scene", "Are there any people?"
        </p>
        
        <div className="relative w-full h-auto aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 mb-6">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
          <canvas ref={canvasRef} className="hidden"></canvas>
          
          {/* Processing Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-white font-medium">Analyzing scene...</p>
              </div>
            </div>
          )}
          
          {/* Listening Indicator */}
          {isListening && (
            <div className="absolute top-4 right-4 bg-primary/90 text-white px-3 py-1 rounded-full text-sm font-medium animate-pulse">
              Listening...
            </div>
          )}
          
          {!isCameraActive && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-gray-400">Camera is off. Tap the button to enable.</span>
            </div>
          )}
        </div>

        {/* Response Display */}
        {assistantResponse && (
          <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700">
            <p className="text-gray-100 font-inter leading-relaxed">{assistantResponse}</p>
          </div>
        )}

        <div className="flex flex-wrap justify-center items-center gap-4">
          <button
            onClick={toggleCamera}
            className={`flex items-center space-x-2 px-6 py-3 rounded-full font-inter font-medium transition-all duration-300 ${
              isCameraActive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-primary text-white hover:bg-blue-600'
            }`}
          >
            <Camera size={18} />
            <span>{isCameraActive ? 'Stop Camera' : 'Start Camera'}</span>
          </button>
          
          {isCameraActive && (
            <>
              <button
                onClick={handleFlipCamera}
                className="flex items-center space-x-2 px-6 py-3 rounded-full font-inter font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors duration-200"
              >
                <RefreshCcw size={18} />
                <span>Flip Camera</span>
              </button>
              
              <button
                onClick={handleMicClick}
                disabled={isProcessing}
                className={`flex items-center space-x-2 px-6 py-3 rounded-full font-inter font-medium transition-all duration-300 ${
                  isListening
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : isProcessing
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                <Mic size={18} className={isListening ? 'animate-pulse' : ''} />
                <span>{isListening ? 'Listening...' : isProcessing ? 'Processing...' : 'Ask Question'}</span>
              </button>
            </>
          )}
        </div>

        {/* Voice Command Examples */}
        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm mb-2">Try saying:</p>
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
  );

  const renderChatPage = () => (
    <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-lato font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-8">
          Visual Accessibility Features
        </h1>
        
        {/* Available Features */}
        <div className="mb-12">
          <h2 className="font-manrope font-semibold text-lg sm:text-xl text-primary mb-6">Available Now</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 hover:bg-gray-800/70 transition-all duration-300 border border-gray-700/50">
              <img
                src="https://res.cloudinary.com/dy9hjd10h/image/upload/v1754942245/Group_1321314962_pgea1q.svg"
                alt="Scene Detection"
                className="w-8 h-8 mb-4"
              />
              <h3 className="font-manrope font-semibold text-lg mb-2">Scene Analysis</h3>
              <p className="text-gray-400 text-sm">Detailed description of everything visible in your camera view</p>
            </div>
            
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 hover:bg-gray-800/70 transition-all duration-300 border border-gray-700/50">
              <img
                src="https://res.cloudinary.com/dy9hjd10h/image/upload/v1754942247/Vector_5_st3sme.svg"
                alt="Read Mode"
                className="w-8 h-8 mb-4"
              />
              <h3 className="font-manrope font-semibold text-lg mb-2">Text Reading</h3>
              <p className="text-gray-400 text-sm">Read signs, documents, labels, and any visible text aloud</p>
            </div>
            
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 hover:bg-gray-800/70 transition-all duration-300 border border-gray-700/50">
              <img
                src="https://res.cloudinary.com/dy9hjd10h/image/upload/v1754942245/Group_1321314963_snvhqj.svg"
                alt="Voice Control"
                className="w-8 h-8 mb-4"
              />
              <h3 className="font-manrope font-semibold text-lg mb-2">Voice Control</h3>
              <p className="text-gray-400 text-sm">Complete hands-free operation with voice commands</p>
            </div>
            
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 hover:bg-gray-800/70 transition-all duration-300 border border-gray-700/50">
              <Volume2 className="w-8 h-8 mb-4 text-primary" />
              <h3 className="font-manrope font-semibold text-lg mb-2">Audio Responses</h3>
              <p className="text-gray-400 text-sm">All responses spoken aloud for accessibility</p>
            </div>
            
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 hover:bg-gray-800/70 transition-all duration-300 border border-gray-700/50">
              <User className="w-8 h-8 mb-4 text-primary" />
              <h3 className="font-manrope font-semibold text-lg mb-2">People Detection</h3>
              <p className="text-gray-400 text-sm">Identify and describe people in your surroundings</p>
            </div>
            
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 hover:bg-gray-800/70 transition-all duration-300 border border-gray-700/50">
              <div className="w-8 h-8 mb-4 bg-yellow-400 rounded-full flex items-center justify-center">
                <span className="text-black font-bold">⚠</span>
              </div>
              <h3 className="font-manrope font-semibold text-lg mb-2">Safety Detection</h3>
              <p className="text-gray-400 text-sm">Identify potential hazards and safety concerns</p>
            </div>
          </div>
        </div>

        {/* Coming Soon Features */}
        <div>
          <h2 className="font-manrope font-semibold text-lg sm:text-xl text-yellow-400 mb-6">Launching Soon</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-yellow-400/30 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-yellow-400 text-black text-xs px-2 py-1 rounded-full font-inter font-medium">
                Soon
              </div>
              <img
                src="https://res.cloudinary.com/dy9hjd10h/image/upload/v1754942246/sos-svgrepo-com_ln1clo.svg"
                alt="SOS Emergency"
                className="w-8 h-8 mb-4"
              />
              <h3 className="font-manrope font-semibold text-lg mb-2">SOS Emergency</h3>
              <p className="text-gray-400 text-sm">Emergency assistance and alert system for visually impaired users</p>
            </div>
            
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-yellow-400/30 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-yellow-400 text-black text-xs px-2 py-1 rounded-full font-inter font-medium">
                Soon
              </div>
              <img
                src="https://res.cloudinary.com/dy9hjd10h/image/upload/v1754942246/navigation-svgrepo-com_yadlgl.svg"
                alt="Navigation Assistance"
                className="w-8 h-8 mb-4"
              />
              <h3 className="font-manrope font-semibold text-lg mb-2">Navigation Assistance</h3>
              <p className="text-gray-400 text-sm">Voice-guided navigation with obstacle detection</p>
            </div>
            
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-yellow-400/30 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-yellow-400 text-black text-xs px-2 py-1 rounded-full font-inter font-medium">
                Soon
              </div>
              <div className="w-8 h-8 mb-4 bg-green-400 rounded-full flex items-center justify-center">
                <span className="text-black font-bold">$</span>
              </div>
              <h3 className="font-manrope font-semibold text-lg mb-2">Money Recognition</h3>
              <p className="text-gray-400 text-sm">Identify currency and denominations</p>
            </div>
            
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-yellow-400/30 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-yellow-400 text-black text-xs px-2 py-1 rounded-full font-inter font-medium">
                Soon
              </div>
              <div className="w-8 h-8 mb-4 bg-purple-400 rounded-full flex items-center justify-center">
                <span className="text-white font-bold">🏪</span>
              </div>
              <h3 className="font-manrope font-semibold text-lg mb-2">Store & Product ID</h3>
              <p className="text-gray-400 text-sm">Identify products, prices, and store layouts</p>
            </div>
          </div>
        </div>

        {/* Voice Commands Guide */}
        <div className="mt-12 bg-blue-900/20 rounded-xl p-6 border border-blue-500/30">
          <h3 className="font-manrope font-semibold text-lg text-blue-300 mb-4">Voice Commands Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-white mb-2">Scene Analysis:</h4>
              <ul className="space-y-1 text-gray-300">
                <li>• "What do you see?"</li>
                <li>• "Describe the scene"</li>
                <li>• "What's in front of me?"</li>
                <li>• "Tell me about this place"</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-2">Text Reading:</h4>
              <ul className="space-y-1 text-gray-300">
                <li>• "Read the text"</li>
                <li>• "What does the sign say?"</li>
                <li>• "Read this document"</li>
                <li>• "What's written here?"</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-2">People & Objects:</h4>
              <ul className="space-y-1 text-gray-300">
                <li>• "Are there any people?"</li>
                <li>• "What objects do you see?"</li>
                <li>• "Count the people"</li>
                <li>• "Describe the person"</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-2">Safety & Colors:</h4>
              <ul className="space-y-1 text-gray-300">
                <li>• "Is it safe here?"</li>
                <li>• "What colors do you see?"</li>
                <li>• "Any dangers or obstacles?"</li>
                <li>• "Describe the lighting"</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );

  const renderSettingsPage = () => (
    <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-lato font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-8">
          Accessibility Settings
        </h1>
        
        {/* Audio Settings */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-8 border border-gray-700/50">
          <h2 className="font-manrope font-semibold text-xl mb-6 flex items-center">
            <Volume2 className="w-6 h-6 mr-2 text-primary" />
            Audio Settings
          </h2>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
              <span className="font-inter">Speech Output</span>
              <button 
                onClick={() => setSpeechEnabled(!speechEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  speechEnabled ? 'bg-primary' : 'bg-gray-600'
                }`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  speechEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}></div>
              </button>
            </div>
            
            <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
              <span className="font-inter">Auto-Announce Pages</span>
              <button className="relative w-12 h-6 bg-primary rounded-full">
                <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full"></div>
              </button>
            </div>
            
            <div className="flex justify-between items-center py-3">
              <span className="font-inter">Voice Recognition Language</span>
              <span className="text-gray-400">English (US)</span>
            </div>
          </div>
        </div>

        {/* Camera Settings */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-8 border border-gray-700/50">
          <h2 className="font-manrope font-semibold text-xl mb-6 flex items-center">
            <Camera className="w-6 h-6 mr-2 text-primary" />
            Camera Settings
          </h2>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
              <span className="font-inter">Default Camera</span>
              <select className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600">
                <option value="environment">Rear Camera</option>
                <option value="user">Front Camera</option>
              </select>
            </div>
            
            <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
              <span className="font-inter">Auto-Capture Interval</span>
              <span className="text-gray-400">3 seconds</span>
            </div>
            
            <div className="flex justify-between items-center py-3">
              <span className="font-inter">Image Quality</span>
              <span className="text-gray-400">High</span>
            </div>
          </div>
        </div>

        {/* User Profile Section */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-8 border border-gray-700/50">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="font-manrope font-semibold text-xl">Visual Assistant User</h2>
              <p className="text-gray-400">Accessibility Profile Active</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
              <span className="font-inter">Account Type</span>
              <span className="text-primary font-medium">Accessibility</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
              <span className="font-inter">Features Enabled</span>
              <span className="text-green-400">All Visual Assistance</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="font-inter">API Status</span>
              <span className="text-green-400">Connected</span>
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-red-900/20 border border-red-600/30 rounded-xl p-6 mb-8">
          <h3 className="font-manrope font-semibold text-lg text-red-300 mb-4">Emergency Settings</h3>
          <button className="w-full bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 rounded-xl p-4 transition-all duration-300 text-left">
            <div className="flex justify-between items-center">
              <span className="font-inter text-red-400">Configure Emergency Contacts</span>
              <span className="text-red-400">→</span>
            </div>
          </button>
        </div>

        {/* Test Voice Button */}
        <button 
          onClick={() => speak("AKSHI Global Visual Assistant is working perfectly. All audio settings are configured correctly.")}
          className="w-full bg-green-600/20 hover:bg-green-600/30 border border-green-600/50 rounded-xl p-4 transition-all duration-300 flex items-center justify-center space-x-2 mb-8"
        >
          <Volume2 className="w-5 h-5 text-green-400" />
          <span className="font-inter font-medium text-green-400">Test Audio Output</span>
        </button>
      </div>
    </main>
  );

  return (
    <div className="min-h-screen bg-background text-white overflow-hidden">
      {/* Background Gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-background via-gray-900 to-background"></div>
      
      {/* Main Content Container */}
      <div className="relative z-10 min-h-screen flex flex-col">
        
        {/* Header */}
        <header className="flex justify-center items-center p-4 sm:p-6 lg:p-8">
          <div className="flex items-center space-x-3">
            <a 
              href="https://akshi-landing.netlify.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
              onClick={() => speak("Opening AKSHI Global website")}
            >
              <img 
                src="https://res.cloudinary.com/dy9hjd10h/image/upload/v1754862550/Hi_1_hgycbl.svg" 
                alt="AKSHI Global Logo" 
                className="h-20 w-auto sm:h-20 md:h-20"
              />
            </a>
          </div>
        </header>

        {/* Page Content */}
        {currentPage === 'home' && renderHomePage()}
        {currentPage === 'camera' && renderCameraPage()}
        {currentPage === 'chat' && renderChatPage()}
        {currentPage === 'settings' && renderSettingsPage()}

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-lg border-t border-gray-800">
          <div className="flex justify-center items-center py-3 px-4 sm:px-6">
            <div className="flex space-x-6 sm:space-x-8 md:space-x-12">
              <button 
                onClick={() => { 
                  setCurrentPage('home'); 
                  if(isCameraActive) toggleCamera(); 
                  speak("Home page");
                }}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  currentPage === 'home' && !isCameraActive ? 'text-primary' : 'text-gray-400 hover:text-primary'
                }`}
              >
                <Home size={20} />
                <span className="text-xs font-inter">Home</span>
              </button>
              
              <button 
                onClick={toggleCamera}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  isCameraActive ? 'text-primary' : 'text-gray-400 hover:text-primary'
                }`}
              >
                <Camera size={20} />
                <span className="text-xs font-inter">Camera</span>
              </button>
              
              <button 
                onClick={() => { 
                  setCurrentPage('home'); 
                  if(isCameraActive) toggleCamera(); 
                  speak("Assistant page");
                }}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  currentPage === 'home' && !isCameraActive ? 'text-primary' : 'text-gray-400 hover:text-primary'
                }`}
              >
                <img 
                  src="https://res.cloudinary.com/dy9hjd10h/image/upload/v1754942246/image_21_ywvhgh.svg" 
                  alt="Assistant" 
                  className="w-5 h-5"
                />
                <span className="text-xs font-inter">Assistant</span>
              </button>
              
              <button 
                onClick={() => { 
                  setCurrentPage('chat'); 
                  if(isCameraActive) toggleCamera(); 
                  speak("Features page");
                }}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  currentPage === 'chat' ? 'text-primary' : 'text-gray-400 hover:text-primary'
                }`}
              >
                <MessageCircle size={20} />
                <span className="text-xs font-inter">Features</span>
              </button>
              
              <button 
                onClick={() => { 
                  setCurrentPage('settings'); 
                  if(isCameraActive) toggleCamera(); 
                  speak("Settings page");
                }}
                className={`flex flex-col items-center space-y-1 p-2 transition-colors duration-200 ${
                  currentPage === 'settings' ? 'text-primary' : 'text-gray-400 hover:text-primary'
                }`}
              >
                <Settings size={20} />
                <span className="text-xs font-inter">Settings</span>
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* Add custom styles */}
      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&family=Manrope:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
        
        .font-lato { font-family: 'Lato', sans-serif; }
        .font-manrope { font-family: 'Manrope', sans-serif; }
        .font-inter { font-family: 'Inter', sans-serif; }
        .bg-background { background-color: #0a0a0a; }
        .text-primary, .bg-primary { color: #3b82f6; background-color: #3b82f6; }
        .border-primary { border-color: #3b82f6; }
      `}</style>
    </div>
  );
}

export default App;