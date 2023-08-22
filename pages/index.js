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
  
  useEffect(() => {
    if (messages.length === 0) {
      // Add a greeting message if the messages array is empty
      addMessage({
        role: "assistant",
        content: "Hello! How can I assist you with Theory of Computation today?"
      });
    }
  }, [messages]);
  
  const scrollToTop = () => {
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    let isMounted = true;

    const loadedMessages = JSON.parse(localStorage.getItem('messages')) || [];
    if (isMounted) {
      setMessages(loadedMessages);
    }

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
      unsubscribe(); // Cleanup listener on unmount
    };
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

  function addMessage(newMessages) {
    if (!Array.isArray(newMessages)) {
      newMessages = [newMessages];
    }
  
    setMessages(prevMessages => {
      // If adding a placeholder message, remove any existing placeholder first
      if (newMessages.some(msg => msg.isPlaceholder)) {
        prevMessages = prevMessages.filter(msg => !msg.isPlaceholder);
      }
  
      const updatedMessages = [...prevMessages, ...newMessages];
      localStorage.setItem('messages', JSON.stringify(updatedMessages));
      return updatedMessages;
    });
  }
  

  async function onSubmit(event) {
    event.preventDefault();

    if (!questionInput.trim()) {
      addMessage([{ role: "system", content: "Please enter a question before submitting." }]);
      return;
    }

    if (questionInput.length > 200) {
      addMessage([{ role: "system", content: "Your message exceeds the 200 character limit." }]);
      return;
    } 

    const firebaseToken = await getFirebaseToken();

    if (!firebaseToken) {
      alert("Authentication token not found. Please sign in again.");
      return;
    }

    const messagesContext = [...messages, { role: "user", content: questionInput }];
    const sanitizedMessages = messagesContext.map(({ role, content }) => ({ role, content }));
    addMessage({ role: "user", content: questionInput })
    setIsLoading(true);

    const placeholderMessage = {
      role: "system",
      content: "", // Empty since the content is now handled by the JSX logic
      isPlaceholder: true
    };
    addMessage(placeholderMessage);

    try {
      const serverResponse = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${firebaseToken}` // Attaching the Firebase token here
        },
        body: JSON.stringify({
          message: questionInput,
          messages: sanitizedMessages,
          user: {
            displayName: user.displayName,
            uid: user.uid,  // this is the unique user id from Firebase
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

  function clearChat() {
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

            <div className="col-md-2">
              {/* Possibly some content here or just leave it empty */}
            </div>

            <div className={`col-md-8 text-center ${styles.header}`}>
              <h1> CSC 452/652/752 - Theory of Computation Teaching Assistant</h1>
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
                        roleClass = 'bg-light';
                    }

                    let highlightClass = message.highlight ? styles.highlightMessage : '';

                    let finalClass = `${baseClasses} ${roleClass} ${highlightClass}`;

                    return (
                      <div key={idx} className={finalClass}>
                        {message.isPlaceholder ? (
                          <span>
                            <span className={styles.animatedDots}></span>
                          </span>
                        ) : message.role !== "assistant" ? (
                          message.content
                        ) : (
                          <div dangerouslySetInnerHTML={markdownToHtml(message.content)} />
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