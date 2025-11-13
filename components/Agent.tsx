"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";

enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
  selectedTopic,
  topicName,
}: AgentProps) => {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState<number>(15 * 60); // 15 minutes in seconds
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<Array<{id: string, role: 'user' | 'assistant', content: string, timestamp: Date}>>([]);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState<boolean>(false);
  const [showFeedback, setShowFeedback] = useState<boolean>(false);

  useEffect(() => {
    const onCallStart = () => {
      setCallStatus(CallStatus.ACTIVE);
      setTimerActive(true);
      setTimeRemaining(15 * 60); // Reset timer to 15 minutes
      
      // Add a test transcript entry to verify UI is working
      console.log("🧪 Adding test transcript entry");
      const testEntry = {
        id: `test-${Date.now()}`,
        role: 'assistant' as const,
        content: "Test message: Transcript UI is working!",
        timestamp: new Date()
      };
      setTranscript([testEntry]);
      console.log("🧪 Test transcript added:", testEntry);
    };

    const onCallEnd = () => {
      setCallStatus(CallStatus.FINISHED);
      setTimerActive(false);
      // Clear transcript when call ends
      setTranscript([]);
    };

    const onMessage = (message: any) => {
      console.log("🔔 VAPI Message received:", message);
      console.log("🔔 Message type:", message.type);
      console.log("🔔 Full message object:", JSON.stringify(message, null, 2));
      
      // Try to capture any transcript-related messages
      if (message.type === "transcript" || message.type === "speech-update" || message.transcript) {
        console.log("📝 Potential transcript message:", {
          type: message.type,
          role: message.role,
          transcriptType: message.transcriptType,
          transcript: message.transcript,
          content: message.content,
          text: message.text
        });
        
        // Try different possible transcript formats
        const transcriptText = message.transcript || message.content || message.text;
        const messageRole = message.role || (message.type === "speech-update" ? "assistant" : "user");
        
        if (transcriptText && (message.transcriptType === "final" || !message.transcriptType)) {
          const newMessage = { role: messageRole, content: transcriptText };
          setMessages((prev) => [...prev, newMessage]);
          console.log("✅ Added message:", newMessage);
          
          // Add to transcript for display
          const transcriptEntry = {
            id: `${messageRole}-${Date.now()}`,
            role: messageRole as 'user' | 'assistant',
            content: transcriptText,
            timestamp: new Date()
          };
          console.log("✅ Adding to transcript:", transcriptEntry);
          setTranscript((prev) => {
            const updated = [...prev, transcriptEntry];
            console.log("✅ Updated transcript:", updated);
            return updated;
          });
        }
      }
      
      // Handle user speech detection
      if ((message.type === "transcript" || message.transcript) && (message.role === "user" || !message.role)) {
        console.log("🎤 User is speaking:", message.transcript || message.content);
        setIsListening(false);
      }
    };

    const onSpeechStart = () => {
      console.log("AI speech start");
      setIsSpeaking(true);
      setIsListening(false); // AI is speaking, so not listening for user
    };

    const onSpeechEnd = () => {
      console.log("AI speech end - now listening for user response");
      setIsSpeaking(false);
      setIsListening(true); // AI finished speaking, now listening for user
    };

    const onError = (error: Error) => {
      console.error("VAPI Error:", error);
    };

    const onVolumeLevel = (volume: number) => {
      // This helps debug if microphone is working
      if (volume > 0.1) {
        console.log("User speaking - volume:", volume);
      }
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("volume-level", onVolumeLevel);
    vapi.on("error", onError);
    
    // Log all events to see what's available
    console.log("🔧 VAPI instance:", vapi);
    console.log("🔧 Available VAPI methods:", Object.getOwnPropertyNames(vapi));

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("volume-level", onVolumeLevel);
      vapi.off("error", onError);
    };
  }, []);

  // Timer countdown effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timerActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setTimerActive(false);
            setCallStatus(CallStatus.FINISHED);
            vapi.stop();
            console.log("Interview time completed - stopping call");
            
            // Generate feedback when time runs out
            setTimeout(() => {
              if (transcript.length > 0) {
                generateInterviewFeedback(transcript, topicName || selectedTopic || "General");
              }
            }, 1000); // Delay to ensure transcript is updated
            
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [timerActive, timeRemaining]);

  // Auto-scroll transcript to bottom when new messages are added
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcript]);

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }

    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      console.log("handleGenerateFeedback");

      const { success, feedbackId: id } = await createFeedback({
        interviewId: interviewId!,
        userId: userId!,
        transcript: messages,
        feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        console.log("Error saving feedback");
        router.push("/");
      }
    };

    if (callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        // Only redirect if we have some messages (indicating the interview actually happened)
        if (messages.length > 0) {
          console.log("Interview completed with messages:", messages.length);
          // For now, just stay on the same page or show a completion message
          // router.push("/");
        } else {
          console.log("Call ended without messages - possible connection issue");
        }
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);

  const checkMicrophonePermission = async () => {
    try {
      // Check if we already have permission
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log("Current microphone permission:", permission.state);
      
      if (permission.state === 'granted') {
        console.log("Microphone permission already granted");
        return true;
      }
      
      // Request permission by trying to access the microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone permission granted via getUserMedia");
      stream.getTracks().forEach(track => track.stop()); // Stop the stream
      return true;
    } catch (error: any) {
      console.error("Microphone permission error:", error);
      
      // More specific error handling
      if (error?.name === 'NotAllowedError') {
        alert("Microphone access was denied. Please allow microphone access in your browser settings and try again.");
      } else if (error?.name === 'NotFoundError') {
        alert("No microphone found. Please connect a microphone and try again.");
      } else {
        alert("Error accessing microphone: " + (error?.message || error));
      }
      return false;
    }
  };

  const handleCall = async () => {
    setCallStatus(CallStatus.CONNECTING);
    console.log("Starting call with type:", type, "topic:", selectedTopic, "topicName:", topicName);

    // Check microphone permission first
    console.log("Checking microphone permission...");
    const hasPermission = await checkMicrophonePermission();
    if (!hasPermission) {
      console.log("Microphone permission denied, aborting call");
      setCallStatus(CallStatus.INACTIVE);
      return;
    }

    console.log("Microphone permission granted, proceeding with call...");

    // Check VAPI configuration
    console.log("VAPI Public Key:", process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ? "Present" : "Missing");
    console.log("VAPI Workflow ID:", process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID ? "Present" : "Missing");

    try {
      if (type === "generate") {
        // Generate topic-specific questions based on selected topic
        const topicQuestions = getTopicQuestions(selectedTopic || "general");
        const formattedQuestions = topicQuestions
          .map((question) => `- ${question}`)
          .join("\n");

        // Use the direct interviewer approach for better conversation handling
        console.log("Starting topic-based interview for:", topicName);
        console.log("Questions:", formattedQuestions);
        console.log("Interviewer config:", interviewer);
        
        console.log("Calling vapi.start...");
        
        // Try different approaches based on what works
        let result;
        try {
          // First try with the interviewer configuration
          result = await vapi.start(interviewer, {
            variableValues: {
              questions: formattedQuestions,
            },
          } as any);
          console.log("VAPI start with interviewer successful:", result);
        } catch (interviewerError: any) {
          console.error("Interviewer approach failed:", interviewerError);
          
          // Fallback to workflow approach
          console.log("Trying workflow approach as fallback...");
          try {
            result = await vapi.start(process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID!, {
              variableValues: {
                username: userName,
                userid: userId,
                topic: selectedTopic || "general",
                topicName: topicName || "General",
              },
            } as any);
            console.log("VAPI start with workflow successful:", result);
          } catch (workflowError: any) {
            console.error("Workflow approach also failed:", workflowError);
            throw workflowError; // Re-throw to be caught by outer try-catch
          }
        }
      } else {
        let formattedQuestions = "";
        if (questions) {
          formattedQuestions = questions
            .map((question) => `- ${question}`)
            .join("\n");
        }

        await vapi.start(interviewer, {
          variableValues: {
            questions: formattedQuestions,
          },
        } as any);
      }
    } catch (error) {
      console.error("Error starting call:", error);
      setCallStatus(CallStatus.INACTIVE);
    }
  };

  // Generate topic-specific questions
  const getTopicQuestions = (topic: string): string[] => {
    const questionBank: Record<string, string[]> = {
      java: [
        "What are the main principles of Object-Oriented Programming in Java?",
        "Explain the difference between abstract classes and interfaces in Java.",
        "How does garbage collection work in Java?",
        "What is the difference between ArrayList and LinkedList?",
        "Explain the concept of multithreading in Java."
      ],
      cpp: [
        "What is the difference between C and C++?",
        "Explain the concept of pointers and references in C++.",
        "What are virtual functions and why are they used?",
        "Describe the difference between stack and heap memory allocation.",
        "What is RAII and why is it important in C++?"
      ],
      python: [
        "What are the key features that make Python popular?",
        "Explain the difference between lists and tuples in Python.",
        "What is a decorator in Python and how do you use it?",
        "How does Python's garbage collection work?",
        "What is the difference between deep copy and shallow copy?"
      ],
      ml: [
        "What is the difference between supervised and unsupervised learning?",
        "Explain the bias-variance tradeoff in machine learning.",
        "What is overfitting and how can you prevent it?",
        "Describe the difference between classification and regression.",
        "What are some common evaluation metrics for machine learning models?"
      ],
      frontend: [
        "What is the difference between HTML, CSS, and JavaScript?",
        "Explain the concept of responsive web design.",
        "What are the differences between React, Angular, and Vue.js?",
        "How do you optimize website performance?",
        "What is the DOM and how do you manipulate it?"
      ],
      "data-analyst": [
        "What is the difference between descriptive and inferential statistics?",
        "How do you handle missing data in a dataset?",
        "Explain the difference between correlation and causation.",
        "What are some common data visualization techniques?",
        "How do you validate the accuracy of your analysis?"
      ],
      backend: [
        "What is the difference between REST and GraphQL APIs?",
        "Explain the concept of database normalization.",
        "How do you handle authentication and authorization?",
        "What are microservices and their advantages?",
        "How do you ensure API security?"
      ],
      fullstack: [
        "How do you design a scalable web application architecture?",
        "What is the difference between SQL and NoSQL databases?",
        "Explain the concept of version control and Git workflow.",
        "How do you handle state management in frontend applications?",
        "What are some common security vulnerabilities in web applications?"
      ],
      general: [
        "Tell me about yourself and your background.",
        "What are your greatest strengths and weaknesses?",
        "Why are you interested in this position?",
        "Describe a challenging project you worked on.",
        "Where do you see yourself in 5 years?"
      ]
    };

    return questionBank[topic] || questionBank.general;
  };

  const generateInterviewFeedback = async (conversationTranscript: Array<{role: string, content: string, timestamp: Date}>, interviewTopic: string) => {
    setIsGeneratingFeedback(true);
    console.log("🔄 Generating interview feedback...");
    
    try {
      // Create a comprehensive feedback based on the conversation
      const conversationSummary = conversationTranscript
        .map(entry => `${entry.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${entry.content}`)
        .join('\n');
      
      // Generate structured feedback
      const feedbackSections = {
        overview: `Interview completed for ${interviewTopic} position`,
        duration: `Interview duration: ${Math.ceil((15 * 60 - timeRemaining) / 60)} minutes`,
        questionsAsked: conversationTranscript.filter(entry => entry.role === 'assistant').length,
        responsesGiven: conversationTranscript.filter(entry => entry.role === 'user').length,
        strengths: [
          "Participated in the full interview session",
          "Engaged with the AI interviewer",
          "Provided responses to interview questions"
        ],
        areasForImprovement: [
          "Consider providing more detailed responses",
          "Practice articulating technical concepts clearly",
          "Prepare specific examples from your experience"
        ],
        recommendations: [
          `Continue practicing ${interviewTopic} interview questions`,
          "Review fundamental concepts in your field",
          "Practice explaining complex topics in simple terms",
          "Prepare STAR method examples for behavioral questions"
        ]
      };
      
      const formattedFeedback = `
# Interview Feedback Report

## Overview
${feedbackSections.overview}
${feedbackSections.duration}

## Interview Statistics
- **Questions Asked**: ${feedbackSections.questionsAsked}
- **Responses Given**: ${feedbackSections.responsesGiven}
- **Topic**: ${interviewTopic}
- **Date**: ${new Date().toLocaleDateString()}

## Strengths Demonstrated
${feedbackSections.strengths.map(strength => `• ${strength}`).join('\n')}

## Areas for Improvement
${feedbackSections.areasForImprovement.map(area => `• ${area}`).join('\n')}

## Recommendations for Next Steps
${feedbackSections.recommendations.map(rec => `• ${rec}`).join('\n')}

## Conversation Summary
The interview covered various aspects of ${interviewTopic}. You engaged with ${feedbackSections.questionsAsked} questions and provided ${feedbackSections.responsesGiven} responses during the session.

---
*This feedback is generated based on your interview performance. Use it as a guide for continued improvement in your interview skills.*
      `;
      
      setFeedback(formattedFeedback);
      setShowFeedback(true);
      console.log("✅ Feedback generated successfully");
      
    } catch (error) {
      console.error("❌ Error generating feedback:", error);
      setFeedback("Unable to generate feedback at this time. Please try again later.");
      setShowFeedback(true);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    setTimerActive(false);
    vapi.stop();
    
    // Generate feedback if there's conversation data
    if (transcript.length > 0) {
      generateInterviewFeedback(transcript, topicName || selectedTopic || "General");
    }
  };

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Timer Display */}
      {(callStatus === CallStatus.ACTIVE || timerActive) && (
        <div className="text-center my-6 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 rounded-full border border-neutral-300">
            <span className="text-sm font-medium text-neutral-600">Time Remaining:</span>
            <span className={`text-lg font-bold ${timeRemaining <= 60 ? 'text-error-100' : 'text-primary-100'}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
          
          {/* Listening Indicator */}
          {callStatus === CallStatus.ACTIVE && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm">
              {isSpeaking ? (
                <div className="flex items-center gap-2 text-primary-100">
                  <div className="w-2 h-2 bg-primary-100 rounded-full animate-pulse"></div>
                  <span>AI Speaking...</span>
                </div>
              ) : isListening ? (
                <div className="flex items-center gap-2 text-success-100">
                  <div className="w-2 h-2 bg-success-100 rounded-full animate-pulse"></div>
                  <span>Listening for your response...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-neutral-500">
                  <div className="w-2 h-2 bg-neutral-400 rounded-full"></div>
                  <span>Connecting...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="call-view">
        {/* AI Interviewer Card */}
        <div className="card-interviewer">
          <div className="avatar">
            <Image
              src="/ai-avatar.png"
              alt="profile-image"
              width={65}
              height={54}
              className="object-cover"
            />
            {isSpeaking && <span className="animate-speak" />}
          </div>
          <h3>AI Interviewer</h3>
        </div>

        {/* User Profile Card */}
        <div className="card-border">
          <div className="card-content">
            <Image
              src="/user-avatar.png"
              alt="profile-image"
              width={539}
              height={539}
              className="rounded-full object-cover size-[120px]"
            />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {/* Conversation Transcript */}
      {callStatus === CallStatus.ACTIVE && (
        <div className="transcript-container max-w-4xl mx-auto my-6">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary-100 rounded-full animate-pulse"></div>
                <h3 className="text-lg font-semibold text-neutral-800">Conversation</h3>
              </div>
              <span className="text-xs text-neutral-500">Live Transcript</span>
            </div>
            
            <div 
              ref={transcriptScrollRef} 
              className="transcript-messages max-h-80 overflow-y-auto p-4 space-y-4"
            >
              {transcript.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-neutral-500">Conversation will appear here...</p>
                  <p className="text-xs text-neutral-400 mt-2">Debug: Transcript array length: {transcript.length}</p>
                </div>
              ) : (
                transcript.map((entry) => (
                  <div key={entry.id} className="message-entry">
                    <div className={`flex gap-3 ${entry.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        entry.role === 'assistant' 
                          ? 'bg-neutral-100 text-neutral-800' 
                          : 'bg-primary-100 text-white'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">
                            {entry.role === 'assistant' ? 'AI Interviewer' : 'You'}
                          </span>
                          <span className="text-xs opacity-70">
                            {entry.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed">{entry.content}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="transcript-border">
          <div className="transcript">
            <p
              key={lastMessage}
              className={cn(
                "transition-opacity duration-500 opacity-0",
                "animate-fadeIn opacity-100"
              )}
            >
              {lastMessage}
            </p>
          </div>
        </div>
      )}

      {/* Interview Feedback */}
      {showFeedback && (
        <div className="feedback-container max-w-4xl mx-auto my-6">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-success-100 rounded-full"></div>
                <h3 className="text-lg font-semibold text-neutral-800">Interview Feedback</h3>
              </div>
              <button 
                onClick={() => setShowFeedback(false)}
                className="text-neutral-500 hover:text-neutral-700 text-sm"
              >
                Close
              </button>
            </div>
            
            <div className="p-6">
              {isGeneratingFeedback ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center gap-2">
                    <div className="w-4 h-4 bg-primary-100 rounded-full animate-pulse"></div>
                    <span className="text-neutral-600">Generating your feedback...</span>
                  </div>
                </div>
              ) : (
                <div className="feedback-content prose prose-sm max-w-none">
                  <div className="whitespace-pre-line text-neutral-700 leading-relaxed">
                    {feedback.split('\n').map((line, index) => {
                      if (line.startsWith('# ')) {
                        return <h1 key={index} className="text-2xl font-bold text-neutral-800 mt-6 mb-4">{line.substring(2)}</h1>;
                      } else if (line.startsWith('## ')) {
                        return <h2 key={index} className="text-xl font-semibold text-neutral-800 mt-5 mb-3">{line.substring(3)}</h2>;
                      } else if (line.startsWith('- **') && line.includes('**:')) {
                        const [label, ...rest] = line.substring(2).split('**:');
                        return <p key={index} className="mb-2"><strong>{label}</strong>: {rest.join('**:')}</p>;
                      } else if (line.startsWith('• ')) {
                        return <p key={index} className="mb-1 ml-4">• {line.substring(2)}</p>;
                      } else if (line.startsWith('---')) {
                        return <hr key={index} className="my-4 border-neutral-200" />;
                      } else if (line.trim()) {
                        return <p key={index} className="mb-3">{line}</p>;
                      }
                      return <br key={index} />;
                    })}
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-neutral-200">
                    <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(feedback);
                          alert('Feedback copied to clipboard!');
                        }}
                        className="px-4 py-2 bg-primary-100 text-white rounded-lg hover:bg-primary-200 transition-colors text-sm"
                      >
                        Copy Feedback
                      </button>
                      <button 
                        onClick={() => {
                          const blob = new Blob([feedback], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `interview-feedback-${new Date().toISOString().split('T')[0]}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors text-sm"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center">
        {callStatus !== "ACTIVE" ? (
          <button className="relative btn-call" onClick={() => handleCall()}>
            <span
              className={cn(
                "absolute animate-ping rounded-full opacity-75",
                callStatus !== "CONNECTING" && "hidden"
              )}
            />

            <span className="relative">
              {callStatus === "INACTIVE" || callStatus === "FINISHED"
                ? "Call"
                : ". . ."}
            </span>
          </button>
        ) : (
          <button className="btn-disconnect" onClick={() => handleDisconnect()}>
            End
          </button>
        )}
      </div>
    </>
  );
};

export default Agent;
