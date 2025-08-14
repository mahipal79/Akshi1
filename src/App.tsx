import { useState, useEffect, useRef } from 'react';
import { Mic, Camera, Settings, Home, MessageCircle, Volume2, VolumeX, MicOff } from 'lucide-react';

// Replace with your actual Gemini API key
const GEMINI_API_KEY = "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78";

type Page = 'home' | 'chat' | 'settings' | 'camera';
type CameraMode = 'user' | 'environment';

function App() {
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
  const [isRecording, setIsRecording] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Test speech recognition support
  const hasSpeechRecognition = !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Convert canvas to base64
  const canvasToBase64 = (canvas: HTMLCanvasElement): string => {
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  };

  // Capture single image from camera
  const captureImage = (): string | null => {
    if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 2) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        console.log('Image captured successfully');
        return imageDataUrl;
      }
    }
    console.log('Failed to capture image');
    return null;
  };

  // Analyze image with Gemini Vision API
  const analyzeImageWithGemini = async (imageBase64: string, question: string): Promise<string> => {
    if (GEMINI_API_KEY === "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78") {
      return getFallbackResponse(question);
    }

    try {
      console.log('Sending request to Gemini API...');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `You are a visual assistant helping visually impaired users. Analyze this image and answer the question: "${question}". 

Be descriptive, helpful, and specific. Focus on details that would be most useful for someone who cannot see the image. If the question asks about:
- "What do you see" or "describe": Give a comprehensive description of the scene, objects, people, colors, and layout
- Text reading: Read any visible text accurately
- Colors: Describe colors and their locations in detail
- People: Describe people, their clothing, activities, and positions
- Objects: Identify and count objects, describe their characteristics
- Safety: Assess potential hazards or safety concerns
- Navigation: Describe the environment for mobility purposes

Keep your response clear, organized, and under 200 words.`
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
            temperature: 0.3,
            topK: 40,
            topP: 0.9,
            maxOutputTokens: 1024,
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Gemini API Error ${response.status}:`, errorText);
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Gemini API Response:', data);
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      } else {
        console.error('Unexpected API response format:', data);
        throw new Error('Unexpected API response format');
      }
    } catch (error) {
      console.error('Gemini API Error:', error);
      return getFallbackResponse(question);
    }
  };

  // Fallback responses for demo/testing
  const getFallbackResponse = (question: string): string => {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('what') && (lowerQuestion.includes('see') || lowerQuestion.includes('look'))) {
      return "I can see the camera view that was just captured. This is a demo response - to get real scene analysis, please add your Gemini API key. I would normally describe all objects, people, colors, and details in the image to help you understand what's in front of the camera.";
    } else if (lowerQuestion.includes('read') || lowerQuestion.includes('text')) {
      return "I would read any text visible in the captured image, including signs, labels, documents, or written content. Please configure your Gemini API key for real text recognition from the camera image.";
    } else if (lowerQuestion.includes('color')) {
      return "I would describe all the colors visible in the captured scene in detail. With the API configured, I can identify specific colors, their shades, and their locations in the image.";
    } else if (lowerQuestion.includes('person') || lowerQuestion.includes('people')) {
      return "I would describe any people in the captured image, including their appearance, clothing, activities, and positions. Real person detection requires the API to be configured.";
    } else if (lowerQuestion.includes('safe') || lowerQuestion.includes('danger') || lowerQuestion.includes('hazard')) {
      return "I would analyze the captured scene for potential safety concerns, hazards, or obstacles, then provide guidance for safe navigation. This requires API configuration for real analysis.";
    } else if (lowerQuestion.includes('count') || lowerQuestion.includes('how many')) {
      return "I would count the specific objects you're asking about in the captured image. With the API configured, I can provide accurate counts and descriptions.";
    } else {
      return `I heard your question: "${question}". This is a demo response. To get real visual analysis of the captured camera image, please add your Gemini API key to the code. I would analyze the image and provide detailed information based on your question.`;
    }
  };

  // Speech synthesis
  const speak = (text: string) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Use better voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.includes('Google') || voice.name.includes('Microsoft'))
    ) || voices.find(voice => voice.lang.startsWith('en'));
    
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

  // Initialize Speech Recognition
  useEffect(() => {
    if (!hasSpeechRecognition) {
      console.log('Speech Recognition not supported');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';
    recognitionRef.current.maxAlternatives = 1;

    recognitionRef.current.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
      setIsRecording(true);
    };

    recognitionRef.current.onresult = (event: any) => {
      const result = event.results[0][0];
      const transcript = result.transcript.trim();
      const confidence = result.confidence;
      
      console.log('Speech recognized:', transcript, 'Confidence:', confidence);
      setCurrentQuestion(transcript);
      
      if (transcript && transcript.length > 1) {
        speak(`I heard: ${transcript}. Let me analyze the image and answer your question.`);
        setTimeout(() => processQuestion(transcript), 2000);
      } else {
        speak('I didn\'t catch that clearly. Please try asking your question again.');
        setIsProcessing(false);
      }
    };

    recognitionRef.current.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
      setIsRecording(false);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setIsRecording(false);
      
      let errorMessage = 'Sorry, there was an issue with voice recognition. ';
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage += 'Microphone access was denied. Please allow microphone permissions and try again.';
          break;
        case 'no-speech':
          errorMessage += 'No speech was detected. Please try speaking louder and clearer.';
          break;
        case 'audio-capture':
          errorMessage += 'No microphone was found. Please check your microphone connection.';
          break;
        case 'network':
          errorMessage += 'Network error occurred. Please check your internet connection.';
          break;
        default:
          errorMessage += 'Please try again.';
      }
      
      speak(errorMessage);
      setIsProcessing(false);
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Process the question with captured image
  const processQuestion = async (question: string) => {
    if (!isCameraActive) {
      speak('Please turn on the camera first, then ask your question.');
      setIsProcessing(false);
      return;
    }

    // Capture image at the moment of asking
    const imageDataUrl = captureImage();
    if (!imageDataUrl) {
      speak('Unable to capture image from camera. Please make sure the camera is working and try again.');
      setIsProcessing(false);
      return;
    }

    setCapturedImage(imageDataUrl);
    
    try {
      console.log('Processing question with captured image');
      const imageBase64 = canvasToBase64(canvasRef.current!);
      const response = await analyzeImageWithGemini(imageBase64, question);
      
      console.log('AI Response:', response);
      setAssistantResponse(response);
      speak(response);
    } catch (error) {
      console.error('Error processing question:', error);
      const errorMessage = 'Sorry, I had trouble analyzing the image. Please try again.';
      setAssistantResponse(errorMessage);
      speak(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // Start listening for question
  const startListening = () => {
    if (!hasSpeechRecognition) {
      speak('Speech recognition is not supported in this browser. Please try using Chrome or Edge.');
      return;
    }

    if (!isCameraActive) {
      speak('Please turn on the camera first.');
      return;
    }

    if (isListening || isProcessing) return;

    setIsProcessing(true);
    setCurrentQuestion('');
    setAssistantResponse('');
    
    speak('I\'m ready to listen. Please ask your question about what the camera sees.');
    
    setTimeout(() => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          console.error('Error starting recognition:', error);
          speak('Unable to start voice recognition. Please check your microphone permissions.');
          setIsProcessing(false);
        }
      }
    }, 2500);
  };

  // Toggle camera with improved error handling
  const toggleCamera = async () => {
    if (isCameraActive) {
      console.log('Stopping camera');
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      setIsCameraActive(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setMediaStream(null);
      setCapturedImage(null);
      speak("Camera turned off.");
    } else {
      try {
        console.log('Starting camera with mode:', cameraMode);
        
        // Check if camera is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera not supported in this browser');
        }

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
          // Wait for video to load
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play();
            }
          };
        }
        
        setMediaStream(stream);
        setIsCameraActive(true);
        setCurrentPage('camera');
        speak("Camera is now active. You can ask questions about what I can see.");
      } catch (error) {
        console.error('Error accessing camera:', error);
        let errorMessage = 'Unable to access camera. ';
        
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Please allow camera permissions and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (error.name === 'NotReadableError') {
          errorMessage += 'Camera is being used by another application.';
        } else {
          errorMessage += 'Please check your camera and try again.';
        }
        
        speak(errorMessage);
      }
    }
  };

  // Switch camera mode and restart if active
  const switchCamera = async () => {
    const newMode = cameraMode === 'user' ? 'environment' : 'user';
    setCameraMode(newMode);
    
    if (isCameraActive) {
      // Stop current camera
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      
      // Start with new mode
      try {
        const constraints = { 
          video: { 
            facingMode: newMode,
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
        speak(`Switched to ${newMode === 'user' ? 'front' : 'back'} camera.`);
      } catch (error) {
        console.error('Error switching camera:', error);
        speak('Unable to switch camera. Using current camera.');
      }
    } else {
      speak(`Camera mode set to ${newMode === 'user' ? 'front' : 'back'} camera.`);
    }
  };

  // Page announcements
  useEffect(() => {
    const announcements = {
      home: 'Welcome to AKSHI Global AI Assistant. Turn on the camera, then click Ask Question to get voice-powered visual assistance.',
      chat: 'Features page showing available visual assistance capabilities.',
      settings: 'Settings page for audio and camera preferences.',
      camera: 'Camera page. The camera is ready for visual analysis. Click Ask Question to speak your query.',
    };
    
    if (speechEnabled) {
      const timer = setTimeout(() => speak(announcements[currentPage]), 800);
      return () => clearTimeout(timer);
    }
  }, [currentPage, speechEnabled]);

  // Load voices when available
  useEffect(() => {
    if ('speechSynthesis' in window) {
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
                {isProcessing 
                  ? 'Processing your question...'
                  : isListening 
                  ? 'Listening to your question...'
                  : 'Voice Assistant for Visual Accessibility'
                }
              </p>
              
              {currentQuestion && (
                <div className="max-w-2xl mx-auto mt-4 mb-4">
                  <p className="text-yellow-400 font-medium text-base">
                    Question: "{currentQuestion}"
                  </p>
                </div>
              )}
              
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
                <div className={`absolute inset-0 rounded-full border-2 border-blue-400/30 transition-all duration-300 ${(isListening || isProcessing) ? 'animate-pulse scale-110' : ''}`}>
                  <div className="absolute inset-2 rounded-full border border-blue-400/50"></div>
                  <div className="absolute inset-4 rounded-full border border-blue-400/70"></div>
                </div>
                
                <div className="absolute inset-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                  {isListening ? (
                    <MicOff className="w-12 h-12 text-red-400 animate-pulse" />
                  ) : isProcessing ? (
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
                  ) : (
                    <Mic className="w-12 h-12 text-blue-400" />
                  )}
                </div>
                
                {isListening && (
                  <div className="absolute inset-0">
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-3 h-3 bg-red-400 rounded-full animate-bounce"
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

            {/* API Configuration Notice */}
            {GEMINI_API_KEY === "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78" && (
              <div className="mb-8 max-w-2xl mx-auto bg-yellow-900/20 border border-yellow-600/50 rounded-xl p-4">
                <p className="text-yellow-300 text-sm text-center">
                  <strong>Demo Mode:</strong> Add your Gemini API key for real scene analysis. Currently showing demo responses.
                </p>
              </div>
            )}

            {/* Browser Support Check */}
            {!hasSpeechRecognition && (
              <div className="mb-8 max-w-2xl mx-auto bg-red-900/20 border border-red-600/50 rounded-xl p-4">
                <p className="text-red-300 text-sm text-center">
                  <strong>Unsupported Browser:</strong> Speech recognition requires Chrome, Edge, or Safari. Text input alternative coming soon.
                </p>
              </div>
            )}

            {/* Main Controls */}
            <div className="text-center mb-8">
              <button
                onClick={startListening}
                disabled={!hasSpeechRecognition || isProcessing || isListening || !isCameraActive}
                className={`inline-flex items-center space-x-3 px-8 py-4 rounded-full font-medium text-lg transition-all duration-300 ${
                  !isCameraActive
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    : !hasSpeechRecognition
                    ? 'bg-red-600/50 text-red-300 cursor-not-allowed'
                    : isListening
                    ? 'bg-red-600 text-white shadow-lg animate-pulse'
                    : isProcessing
                    ? 'bg-yellow-600 text-white shadow-lg'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
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
                    <span>Turn on Camera First</span>
                  </>
                ) : !hasSpeechRecognition ? (
                  <>
                    <MicOff size={24} />
                    <span>Voice Not Supported</span>
                  </>
                ) : (
                  <>
                    <Mic size={24} />
                    <span>Ask Question</span>
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
                disabled={isProcessing || isListening}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
              >
                <Camera size={20} />
                <span>{isCameraActive ? 'Stop Camera' : 'Start Camera'}</span>
              </button>
              
              <button
                onClick={() => speak("AKSHI Global AI Assistant helps you understand what you see. First, turn on the camera. Then click 'Ask Question' and speak clearly. I will capture an image and analyze it to answer your question with detailed descriptions.")}
                disabled={isProcessing || isListening}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
              >
                <Volume2 size={20} />
                <span>How to Use</span>
              </button>
            </div>

            {/* Camera Mode Switch */}
            <div className="mt-8">
              <button
                onClick={switchCamera}
                disabled={isProcessing || isListening}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full text-sm font-medium transition-colors"
              >
                <span>Switch to {cameraMode === 'user' ? 'Back' : 'Front'} Camera</span>
              </button>
            </div>

            {/* Current Response Display */}
            {assistantResponse && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-6 mb-8 max-w-3xl mt-8">
                <h3 className="font-semibold text-lg text-blue-300 mb-3">AI Response:</h3>
                <p className="text-gray-200 text-base leading-relaxed">{assistantResponse}</p>
                {currentQuestion && (
                  <p className="text-gray-400 text-sm mt-3 italic">Question: "{currentQuestion}"</p>
                )}
              </div>
            )}

            {/* Example Commands */}
            <div className="text-center mt-8">
              <p className="text-gray-400 text-sm mb-3">Example voice commands:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "What do you see?",
                  "Read any text",
                  "Describe the scene",
                  "Are there any people?",
                  "What colors do you see?",
                  "Count the objects",
                  "Is this place safe?",
                  "What's in front of me?"
                ].map((command, index) => (
                  <span key={index} className="bg-gray-800/50 px-3 py-1 rounded-full text-xs text-gray-300 border border-gray-700">
                    "{command}"
                  </span>
                ))}
              </div>
            </div>
          </main>
        )}

        {/* Chat Page - Features */}
        {currentPage === 'chat' && (
          <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
            <div className="max-w-4xl mx-auto">
              <h1 className="font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-8">
                Visual Assistance Features
              </h1>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Mic className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Voice Questions</h3>
                  <p className="text-gray-400 text-sm">Ask questions using your voice - clear speech recognition with one question at a time.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Camera className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Instant Image Capture</h3>
                  <p className="text-gray-400 text-sm">Captures image exactly when you ask your question for accurate, contextual analysis.</p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                  <Volume2 className="w-8 h-8 mb-4 text-blue-400" />
                  <h3 className="font-semibold text-lg mb-2">Audio Responses</h3>
                  <p className="text-gray-400 text-sm">Detailed spoken answers with clear, natural speech synthesis for complete accessibility.</p>
                </div>
              </div>

              <div className="bg-blue-900/20 rounded-xl p-6 border border-blue-500/30 mb-8">
                <h3 className="font-semibold text-lg text-blue-300 mb-4">How It Works</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                  <div>
                    <h4 className="font-medium text-white mb-3">Simple Process:</h4>
                    <ol className="space-y-2 text-gray-300 list-decimal list-inside">
                      <li>Turn on camera</li>
                      <li>Click "Ask Question"</li>
                      <li>Speak your question clearly</li>
                      <li>Image is captured automatically</li>
                      <li>Get detailed audio answer</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-3">Question Types:</h4>
                    <ul className="space-y-1 text-gray-300">
                      <li>• Scene description</li>
                      <li>• Text reading (OCR)</li>
                      <li>• Object identification</li>
                      <li>• People detection</li>
                      <li>• Color analysis</li>
                      <li>• Safety assessment</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-green-900/20 rounded-xl p-6 border border-green-500/30">
                <h3 className="font-semibold text-lg text-green-300 mb-4">Best Practices</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <h4 className="font-medium text-white mb-3">For Clear Recognition:</h4>
                    <ul className="space-y-1 text-gray-300">
                      <li>• Speak clearly and at normal speed</li>
                      <li>• Reduce background noise</li>
                      <li>• Use Chrome or Edge browser</li>
                      <li>• Allow microphone permissions</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-3">For Best Analysis:</h4>
                    <ul className="space-y-1 text-gray-300">
                      <li>• Ensure good lighting</li>
                      <li>• Hold camera steady</li>
                      <li>• Point at what you want analyzed</li>
                      <li>• Ask specific questions</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* Camera Page */}
        {currentPage === 'camera' && (
          <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-32 sm:pb-24 pt-8">
            <div className="max-w-4xl w-full mx-auto">
              <h1 className="font-bold text-2xl sm:text-3xl md:text-4xl text-center mb-4">
                Camera Vision Assistant
              </h1>
              <p className="text-gray-400 text-center mb-8">
                {isProcessing 
                  ? 'Analyzing captured image...'
                  : isListening 
                  ? 'Listening to your question...'
                  : isCameraActive
                  ? "Camera is ready - click Ask Question to get visual assistance"
                  : "Turn on camera to begin visual analysis"
                }
              </p>
              
              <div className="relative w-full aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 mb-6">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Show captured image overlay when processing */}
                {capturedImage && isProcessing && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="text-center">
                      <img src={capturedImage} alt="Captured" className="max-w-xs max-h-48 rounded-lg mb-4 border border-blue-400" />
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
                      <p className="text-white font-medium">Analyzing this image...</p>
                    </div>
                  </div>
                )}
                
                {isListening && (
                  <div className="absolute top-4 right-4 bg-red-500/90 text-white px-4 py-2 rounded-full font-bold animate-pulse">
                    🎤 Listening
                  </div>
                )}
                
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                      <span className="text-gray-400">Camera is off. Click Start Camera below.</span>
                    </div>
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
                
                <button
                  onClick={switchCamera}
                  disabled={isProcessing || isListening}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full text-sm font-medium transition-colors"
                >
                  <span>Switch to {cameraMode === 'user' ? 'Back' : 'Front'} Camera</span>
                </button>
                
                {isCameraActive && (
                  <button
                    onClick={startListening}
                    disabled={!hasSpeechRecognition || isProcessing || isListening}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                      !hasSpeechRecognition
                        ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                        : isListening
                        ? 'bg-red-600 text-white shadow-lg animate-pulse'
                        : isProcessing
                        ? 'bg-yellow-600 text-white shadow-lg'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {isListening ? (
                      <>
                        <MicOff size={20} />
                        <span>Listening...</span>
                      </>
                    ) : isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Mic size={20} />
                        <span>Ask Question</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Current Response Display */}
              {assistantResponse && (
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-6 mb-8">
                  <h3 className="font-semibold text-lg text-blue-300 mb-3">AI Response:</h3>
                  <p className="text-gray-200 text-base leading-relaxed">{assistantResponse}</p>
                  {currentQuestion && (
                    <p className="text-gray-400 text-sm mt-3 italic">Question: "{currentQuestion}"</p>
                  )}
                </div>
              )}
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
                    <span className="font-medium">Voice Recognition</span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      hasSpeechRecognition ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                    }`}>
                      {hasSpeechRecognition ? 'Supported' : 'Not Supported'}
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
                    <span className="font-medium">Current Camera</span>
                    <span className="text-blue-400 font-medium">
                      {cameraMode === 'user' ? 'Front Camera' : 'Back Camera'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Image Quality</span>
                    <span className="text-gray-400">720p JPEG</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Capture Method</span>
                    <span className="text-gray-400">On-Demand</span>
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
                <h3 className="font-semibold text-lg text-purple-300 mb-4">API Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2">
                    <span className="font-medium">Gemini Vision API</span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      GEMINI_API_KEY !== "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78"
                        ? 'bg-green-600/20 text-green-400' 
                        : 'bg-yellow-600/20 text-yellow-400'
                    }`}>
                      {GEMINI_API_KEY !== "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78" ? 'Active' : 'Demo Mode'}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm">
                    {GEMINI_API_KEY !== "AIzaSyDokKlMSGtrR6fi51uGeMP-H1R2hYV7k78" 
                      ? 'Real-time visual analysis is active with Gemini AI.'
                      : 'Using demo responses. Add your Gemini API key for real analysis.'
                    }
                  </p>
                </div>
              </div>

              <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-6 mb-8">
                <h3 className="font-semibold text-lg text-green-300 mb-4">Test System</h3>
                <div className="space-y-3">
                  <button 
                    onClick={() => speak("Audio test successful. Speech synthesis is working correctly. The voice assistant is ready to help you understand what you see through your camera.")}
                    className="w-full bg-green-600/20 hover:bg-green-600/30 border border-green-600/50 rounded-xl p-3 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Volume2 className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-green-400">Test Audio</span>
                  </button>
                  
                  <button 
                    onClick={() => speak("To use AKSHI: First, click Start Camera to activate your camera. Then point it at what you want to understand. Click Ask Question and speak clearly. I will capture the image and provide detailed audio descriptions of what I see.")}
                    className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 rounded-xl p-3 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Mic className="w-5 h-5 text-blue-400" />
                    <span className="font-medium text-blue-400">Usage Guide</span>
                  </button>
                  
                  <button 
                    onClick={async () => {
                      if (!navigator.mediaDevices) {
                        speak('Camera is not available in this browser or device.');
                        return;
                      }
                      try {
                        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                        stream.getTracks().forEach(track => track.stop());
                        speak('Camera access test successful. Your camera is working and permissions are granted.');
                      } catch (error) {
                        speak('Camera access test failed. Please check your camera permissions and try again.');
                      }
                    }}
                    className="w-full bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/50 rounded-xl p-3 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Camera className="w-5 h-5 text-purple-400" />
                    <span className="font-medium text-purple-400">Test Camera Access</span>
                  </button>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                <h2 className="font-semibold text-xl mb-6 flex items-center">
                  <Settings className="w-6 h-6 mr-2 text-blue-400" />
                  System Information
                </h2>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Version</span>
                    <span className="text-gray-400">v2.0 Simplified</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Processing</span>
                    <span className="text-green-400">On-Demand Capture</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-700/50">
                    <span className="font-medium">Browser</span>
                    <span className="text-gray-400">{navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Other'}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3">
                    <span className="font-medium">Status</span>
                    <span className="text-green-400">Ready</span>
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