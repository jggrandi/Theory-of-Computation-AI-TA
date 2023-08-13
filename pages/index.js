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
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
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
    // Quota and cooldown checks

    const response = await fetch(`/api/messagesTimestamps?uid=${user.uid}`);
    if (!response.ok) {
      console.error('Error fetching last 10 message timestamps:', response.statusText);
      return;  // Exit the function or handle the error as needed
    }
    const data = await response.json();
    const messageTimestamps = data.timestamps;

    if (messageTimestamps.length >= 10) {
      const oldestMessageTime = messageTimestamps[0];
      const currentTime = Date.now();
      const timeDifference = currentTime - oldestMessageTime;
      const cooldown = 10 * 60 * 1000; // 10 minutes in milliseconds

      if (timeDifference < cooldown) {
        const timeRemaining = Math.ceil((cooldown - timeDifference) / (60 * 1000)); // Convert milliseconds to minutes
        alert(`You have reached your message quota. Please wait ${timeRemaining} minutes before sending another message.`);
        return;
      }
    }

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
        <link rel="icon" href="/icon.png" />
        <link href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet" />
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
                    alt="User Profile"
                    className={`rounded-circle ${styles.profilePicture}`}
                  />
                  <button onClick={signOutUser} className={`btn btn-danger`}>Sign Out</button>
                </div>
              ) : (
                <div className="d-flex align-items-center justify-content-center">
                  <button onClick={signInWithGoogle} className={`btn btn-primary`}>Sign in with Google</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`col-md-10`}>
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
                <div className={`col-md-1`}></div>
                <div className={`col-md-10`}>
                  <form onSubmit={onSubmit} className={`d-flex`}>
                    <input
                      type="text"
                      name="question"
                      placeholder="Enter your question"
                      value={questionInput}
                      onChange={(e) => setQuestionInput(e.target.value)}
                      className="form-control mr-2"
                    />
                    <input type="submit" value={isLoading ? "Processing..." : "Submit"} disabled={isLoading} className="btn btn-success" />
                  </form>
                </div>
                <div className={`col-md-1`}></div>
              </div>
            </main>
          ) : (
            <div className="text-center mt-5">
              Disclaimer
            </div>
          )}
        </div>
      </div>
    </div>
  );

} 