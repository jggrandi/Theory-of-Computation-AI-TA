import Head from "next/head";
import { useState, useEffect, useRef } from "react";
import styles from "./index.module.css";
import { signInWithGoogle, listenToAuthChanges, signOutUser } from '../firebase/firebase';

export default function Home() {
  const messagesEndRef = useRef(null);
  const [questionInput, setQuestionInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }, 100);  // 100ms delay
    }
  };


  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let isMounted = true;

    const loadedMessages = JSON.parse(localStorage.getItem('messages')) || [];
    if (isMounted) {
      setMessages(loadedMessages);
    }

    const unsubscribe = listenToAuthChanges(async (authUser) => {
      if (isMounted) {
        if (authUser) {
          setUser(authUser);

          // Register User to database when they log in
          const firebaseToken = await authUser.getIdToken();
          await fetch("/api/registerUser", {
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
          scrollToBottom();
        } else {
          setUser(null);
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

  async function onSubmit(event) {
    event.preventDefault();

    if (!questionInput.trim()) {
      alert("Please enter a question before submitting.");
      return;
    }

    const firebaseToken = await getFirebaseToken();

    if (!firebaseToken) {
      alert("Authentication token not found. Please sign in again.");
      return;
    }

    const updatedMessages = [...messages, { role: "user", content: questionInput }];
    setIsLoading(true);

    try {
      const serverResponse = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${firebaseToken}` // Attaching the Firebase token here
        },
        body: JSON.stringify({
          message: questionInput,
          messages: updatedMessages,
          user: {
            displayName: user.displayName,
            uid: user.uid,  // this is the unique user id from Firebase
          }
        }),

      });

      if (serverResponse.status === 429) {
        const errorData = await serverResponse.json();
        alert(errorData.error.message);
        setIsLoading(false);  // Reset the loading state
        return;
      }

      const data = await serverResponse.json();

      if (serverResponse.status !== 200) {
        throw data.error || new Error(`Request failed with status ${serverResponse.status}`);
      }

      updatedMessages.push({ role: "assistant", content: data.result });
      setMessages(updatedMessages);

      localStorage.setItem('messages', JSON.stringify(updatedMessages));

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
        <div className={`bg-light p-3 sticky-top container-fluid`}>
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
                  <button onClick={signInWithGoogle} className={`btn btn-primary`}>Sign in with UNCG account</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`container`}>
          {user ? (
            <main>

              <div className="d-flex flex-column pb-5 mb-5">
                <div className={`overflow-auto`}>
                  {messages.map((message, idx) => (
                    <div key={idx} className={`p-3 mb-2 rounded ${message.role === "user" ? styles.userMessage : 'bg-light'}`}>
                      {message.content}
                    </div>
                  ))}
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
                <img src="/TOC_bg.png" alt="Midjourney generated image: a beautiful representation of turing machines in an abstract arts" className="img-fluid" />
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