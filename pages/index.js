import Head from "next/head";
import { useState, useEffect, useRef } from "react";
import styles from "./index.module.css";
import * as markedLib from 'marked';
import { listenToAuthChanges, signOutUser } from '../firebase/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, getAuth } from 'firebase/auth';


export default function Home() {
  const messagesEndRef = useRef(null);
  const [questionInput, setQuestionInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const justLoggedInRef = useRef(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }, 100);  // 100ms delay
    }
  };

  async function handleSignInWithGoogle() {
    const auth = getAuth();  // Get the authentication instance
    const provider = new GoogleAuthProvider();

    // Force account selection every time the user tries to sign in
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    let result;

    try {
      result = await signInWithPopup(auth, provider);  // Use the auth instance here
    } catch (error) {

      console.error("Error during sign-in:", error);
      if (error.code === "auth/user-disabled") {
        // Handle the disabled user here
        alert("Your account has been disabled. Please contact Instructor.");
      }
      return;
    }

    const email = result?.user?.email;

    if (!email.endsWith('@uncg.edu')) {
      // Sign out the user immediately
      signOut(auth);  // Use the auth instance for signing out
      return;
    }

    // If email is valid, the listenToAuthChanges useEffect will handle the rest.
  }

  useEffect(() => {
    if (justLoggedIn) {
      scrollToBottom();

      // Reset the state after scrolling
      setJustLoggedIn(false);
    }
  }, [justLoggedIn]);

  useEffect(() => {
    // Only scroll to bottom if it's not just after login
    if (!justLoggedInRef.current) {
      scrollToBottom();
    }
  }, [messages]);
  
  async function fetchUserMessages(firebaseToken) {
    const msgResponse = await fetch("/api/getUserMessages", {
        headers: {
            "Authorization": `Bearer ${firebaseToken}`
        }
    });

    const msgData = await msgResponse.json();
  
    if (msgResponse.ok && Array.isArray(msgData.messages)) {
        return msgData.messages;
    } else {
        console.error("Error fetching user messages or unexpected data structure:", msgData);
        return [];
    }
  }

  useEffect(() => {
    const greetingMessageContent = "Hello! How can I assist you with Theory of Computation today? \n \n New Update: Get ready for the final exam by asking about the topics that will be covered!";
    const tenMinutesAgo = currentTime - 10 * 60 * 1000;
    const allMessagesExpired = messages.every(message => message.timestamp && message.timestamp < tenMinutesAgo);
  
    if (user && (messages.length === 0 || allMessagesExpired)) {
      // Check if the last message is the greeting message
      const lastMessageIndex = messages.length - 1;
      if (messages[lastMessageIndex] && messages[lastMessageIndex].content === greetingMessageContent) {
        // Update the timestamp of the greeting message
        setMessages(prevMessages => {
          const updatedMessages = [...prevMessages];
          updatedMessages[lastMessageIndex].timestamp = Date.now();
          return updatedMessages;
        });
      } else {
        // Add a new greeting message
        addMessage({
          role: "assistant",
          content: greetingMessageContent
        });
      }
    }
  }, [messages, user, currentTime]);
  
  

  
  const scrollToTop = () => {
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = listenToAuthChanges(async (authUser) => {
      if (isMounted) {
        if (authUser) {
          // Register User to database when they log in
          const firebaseToken = await authUser.getIdToken();
          const response = await fetch("/api/registerUser", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${firebaseToken}`
            },
            body: JSON.stringify({
              uid: authUser.uid,
              userName: authUser.displayName
            })
          });

          const data = await response.json();

          if (!response.ok) {
            // If there's an error from the server, sign out the user and show the error message
            signOutUser();
            alert(data.error.message);
            return;
          }

          const userMessages = await fetchUserMessages(firebaseToken);
          setMessages(userMessages);

          setUser(authUser);
          // Set the ref to true when the user logs in
          setJustLoggedIn(true);

        } else {
          setUser(null);
          scrollToTop();
        }
        setLoadingAuth(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };

  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute

    return () => clearInterval(intervalId); // Clear the interval when the component is unmounted
  }, []);


  async function getFirebaseToken() {
    if (user) {
      return await user.getIdToken();
    }
    return null;
  }


  function markdownToHtml(markdownText) {
    return { __html: markedLib.marked(markdownText) };
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }

  function addMessage(newMessages) {
    if (!Array.isArray(newMessages)) {
      newMessages = [newMessages];
    }

    const currentTimestamp = Date.now();

    // This timestamp is just for visualization and feedback. The correct timestamp is added in the backend for every message.
    // This avoids the need to fetch timestamps in the server and user manipulation of timestamps.
    // Might not be the best solution and might be confusing, but works for now.
    newMessages = newMessages.map(msg => {
      if (!msg.timestamp) {
        msg.timestamp = currentTimestamp;
      }
      return msg;
    });
    
    setMessages(prevMessages => {
      // If adding a placeholder message, remove any existing placeholder first
      if (newMessages.some(msg => msg.isPlaceholder)) {
        prevMessages = prevMessages.filter(msg => !msg.isPlaceholder);
      }
      if (newMessages.some(msg => msg.isSystemAlert)) {
        prevMessages = prevMessages.filter(msg => !msg.isSystemAlert);
      }

      return [...prevMessages, ...newMessages];
    });
}
  
  useEffect(() => {
    localStorage.setItem('messages', JSON.stringify(messages));
  }, [messages]);

  async function onSubmit(event) {
    event.preventDefault();

    if (!questionInput.trim()) {
      addMessage([{ role: "system", content: "Please enter a question before submitting.", isSystemAlert: true }]);
      return;
    }

    if (questionInput.length > 200) {
      addMessage([{ role: "system", content: "Your message exceeds the 200 character limit.", isSystemAlert: true }]);
      return;
    } 

    const firebaseToken = await getFirebaseToken();

    if (!firebaseToken) {
      alert("Authentication token not found. Please sign in again.");
      return;
    }


    //const messagesContext = [...messages, { role: "user", content: questionInput }];
    //const sanitizedMessages = messagesContext.map(({ role, content }) => ({ role, content }));
    const userQuestion = { role: "user", content: questionInput }

    addMessage(userQuestion)
    setIsLoading(true);

    const placeholderMessage = {
      role: "system",
      content: "", // Empty since the content is now handled by the JSX logic
      isPlaceholder: true
    };
    setMessages(prevMessages => prevMessages.filter(msg => !msg.isSystemAlert));
    addMessage(placeholderMessage);

    try {
      const serverResponse = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${firebaseToken}`
        },
        body: JSON.stringify({
          userQuestion: userQuestion,
          user: {
            displayName: user.displayName,
            uid: user.uid,
          }
        }),
      });
      
      // if (serverResponse.status === 429) {
      //   const errorData = await serverResponse.json();
      //   alert(errorData.error.message);
      //   setIsLoading(false);  // Reset the loading state
      //   return;
      // }

      const data = await serverResponse.json();

      if (serverResponse.status !== 200) {
        throw data.error || new Error(`Request failed with status ${serverResponse.status}`);
      }
      // Remove the placeholder message before adding the server response
      setMessages(prevMessages => prevMessages.filter(msg => !msg.isPlaceholder));
            
      data.highlight = true;
      addMessage(data);

      setQuestionInput("");
      setIsLoading(false);

    } catch (error) {
      console.error(error);
      alert(error.message);
      setIsLoading(false);
    }
  }

  async function clearChat() {
    const firebaseToken = await getFirebaseToken();
    const response = await fetch('/api/clearChat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firebaseToken}`
      }
    });
  
    if (!response.ok) {
      const data = await response.json();
      alert(data.error.message);
      return;
    }
  
    // Now, clear the chat messages on the client side
    setMessages([]);
    localStorage.removeItem('messages');
  }
  


  if (loadingAuth) return <div>Loading...</div>;

  return (

    <div className={`container-fluid`}>
      <Head>
        <title>CSC 452/652/752 - Theory of Computation Teaching Assistant</title>
      </Head>
      <div className={`row justify-content-center`}>
        <div className={`bg-light border-bottom p-3 sticky-top container-fluid`}>
          <div className="row align-items-center">

            <div className="col-md-2 d-none d-md-block">
            {user ? (
              <a href="https://github.com/jggrandi/Theory-of-Computation-AI-TA/issues" target="_blank" rel="noopener noreferrer" className="btn btn-warning">Report Bug</a>
            ):(
              <div></div>
            )}
            </div>

            <div className={`col-md-8 text-center ${styles.header}`}>
              <h1> Theory of Computation AI Teaching Assistant</h1>
            </div>

            <div className="col-md-2 align-items-center"> {/* Right block */}
              {user ? (
                <div className={`d-flex align-items-center justify-content-center  ${styles.userInfoSection}`}>
                  <img
                    src={user.photoURL || '/default-profile-picture.png'}
                    alt={user.displayName}
                    title={user.displayName}
                    className={`rounded-circle ${styles.profilePicture}`}
                  />
                  <button onClick={signOutUser} className={`btn btn-danger`}>Sign Out</button>
                </div>
              ) : (
                <div className="d-flex align-items-center justify-content-center">
                  <button onClick={handleSignInWithGoogle} className={`btn btn-primary`}>Sign in with UNCG account</button>

                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`container pt-2`}>
          {user ? (
            <main>

              <div className="d-flex flex-column pb-5 mb-5">
                <div className={`overflow-auto`}>
                  {messages.map((message, idx) => {
                    const tenMinutesAgo = currentTime - 10 * 60 * 1000;
                    let isOldMessage = message.timestamp && message.timestamp < tenMinutesAgo;

                    let baseClasses = "p-3 mb-2 rounded";

                    let roleClass;
                    switch (message.role) {
                      case "user":
                        roleClass = styles.userMessage;
                        break;
                      case "system":
                        roleClass = styles.systemMessage;
                        break;
                      default:
                        roleClass = styles.agentAnswer;
                    }

                    let highlightClass = message.highlight ? styles.highlightMessage : '';
                    let oldMessageClass = isOldMessage ? styles.oldMessage : '';

                    let finalClass = `${baseClasses} ${roleClass} ${highlightClass} ${oldMessageClass}`;

                    return (
                      <div key={idx} className={finalClass}>
                        {message.isPlaceholder ? (
                          <span>
                            <span className={styles.animatedDots}></span>
                          </span>
                        ) : (
                          <>
                            <div dangerouslySetInnerHTML={markdownToHtml(message.content)} />
                            <div className={styles.timestamp}>{formatDate(message.timestamp)}</div>
                          </>
                        )}
                      </div>

                    );
                  })}

                  <div ref={messagesEndRef} />
                </div>
              </div>
              {messages.length > 0 && (
                <div className={`d-flex justify-content-center ${styles.clearButtonContainer}`}>
                  <button onClick={clearChat} className={`btn btn-danger`}>Clear Chat</button>
                </div>
              )}
              <div className={`fixed-bottom bg-light border-top row align-items-center p-3`}>

                <div className={`container`}>
                  <form onSubmit={onSubmit} className={`d-flex`}>
                    <input
                      type="text"
                      name="question"
                      placeholder="Enter your question"
                      value={questionInput}
                      onChange={(e) => setQuestionInput(e.target.value)}
                      className="form-control mr-2"
                      disabled={isLoading}
                    />
                    <input
                      type="submit"
                      value={isLoading ? "Processing..." : "Submit"}
                      disabled={isLoading}
                      className={`btn ${isLoading ? 'btn-warning' : 'btn-success'}`}
                    />

                  </form>
                </div>

              </div>
            </main>
          ) : (

            <div className="mt-5">
              <div className="mb-3">
                <img src="/TOC_bg.jpg" alt="Midjourney generated image: a beautiful representation of turing machines in an abstract arts" className="img-fluid" />
              </div>
              <div className="alert alert-light" role="alert">
                <strong>NOTICE:</strong> AI Teaching Assistant for CSC 452/652/752 - Theory of Computation<br />
                This AI Teaching Assistant tool was specifically developed for the CSC 452/652/752 course at the University of North Carolina at Greensboro (UNCG-Greensboro) by Jeronimo Grandi. Please be advised of the following:<br />
                <ul className="text-left">
                  <li>Data Storage: Messages, login information, and other related data are stored in our database. By using this tool, you consent to such storage practices.</li>
                  <li>Modification Rights: The instructor reserves the right to take the tool offline or make modifications at any time to better suit the needs and requirements of the course.</li>
                  <li>Usage Quota: To ensure the tool's optimal performance and prevent potential misuse, the instructor may impose quota limits on the number of messages sent by each user. Exceeding the quota might result in temporary restrictions or other measures.</li>
                </ul>
                Please use this tool responsibly and in accordance with the guidelines set by the course instructor. Your cooperation ensures a productive learning environment for all students.
              </div>
            </div>


          )}
        </div>
      </div>
    </div>
  );

} 