"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
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

  useEffect(() => {
    const onCallStart = () => {
      setCallStatus(CallStatus.ACTIVE);
      setTimerActive(true);
      setTimeRemaining(15 * 60); // Reset timer to 15 minutes
    };

    const onCallEnd = () => {
      setCallStatus(CallStatus.FINISHED);
      setTimerActive(false);
    };

    const onMessage = (message: Message) => {
      console.log("Message received:", message);
      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage = { role: message.role, content: message.transcript };
        setMessages((prev) => [...prev, newMessage]);
        console.log("Added message:", newMessage);
      }
      
      // Handle user speech detection
      if (message.type === "transcript" && message.role === "user") {
        console.log("User is speaking:", message.transcript);
        setIsListening(false); // User is speaking, so not listening anymore
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
            // Time's up! Automatically end the call
            setCallStatus(CallStatus.FINISHED);
            setTimerActive(false);
            vapi.stop();
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

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    setTimerActive(false);
    vapi.stop();
  };

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <>
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
