import Head from "next/head";
import { useState, useEffect } from "react";
import styles from "./index.module.css";
import { signInWithGoogle, listenToAuthChanges, signOutUser } from '../firebase/firebase';

export default function Home() {
  const [questionInput, setQuestionInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadedMessages = JSON.parse(localStorage.getItem('messages')) || [];
    if (isMounted) {
      setMessages(loadedMessages);
    }

    const unsubscribe = listenToAuthChanges((authUser) => {
      if (isMounted) {
        if (authUser) {
          setUser(authUser);
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
        body: JSON.stringify({ messages: updatedMessages }),
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
    <div className={`container-fluid ${styles.container}`}>
      <div className={`row justify-content-center`}>
        <div className={`col-md-8`}>
          <Head>
            <title>CSC 452/652/752 - Theory of Computation Teaching Assistant (beta)</title>
            <link rel="icon" href="/icon.png" />
            <link href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet" />
          </Head>

          <div className={`bg-light p-3 text-center fixed-top`}>
            CSC 452/652/752 - Theory of Computation Teaching Assistant (beta)
          </div>


          {user ? (
            <main className={`mt-5 ${styles.main}`}>
              <div className={`d-flex align-items-center mb-3 ${styles.userInfo}`}>
                <img
                  src={user.photoURL || '/default-profile-picture.png'}
                  alt="User Profile"
                  className={`rounded-circle ${styles.profilePicture}`}
                />
                <p className="mr-2">{user.displayName || user.email}</p>
                <button onClick={signOutUser} className={`btn btn-danger ${styles.signOutButton}`}>Sign Out</button>
              </div>

              <div className="d-flex flex-column mb-5">
                <div className={`overflow-auto ${styles.chatContainer}`}>
                  {messages.map((message, idx) => (
                    <div key={idx} className={`p-3 mb-2 rounded ${message.role === "user" ? 'bg-info text-white' : 'bg-light'} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`}>
                      {message.content}
                    </div>
                  ))}
                </div>
              </div>

              <div className={`d-flex flex-column mb-5`}>
                {messages.length > 0 && (
                  <div className="mt-3 mb-3">
                    <button onClick={clearChat} className={`btn btn-danger ${styles.clearButton}`}>Clear Chat</button>
                  </div>
                )}
              </div>

              <form onSubmit={onSubmit} className="d-flex p-3 fixed-bottom bg-light border-top">
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
            </main>
          ) : (
            <div className="text-center mt-5">
              <h2>Please sign in to continue</h2>
              <button onClick={signInWithGoogle} className={`btn btn-primary ${styles.signInButton}`}>Sign in with Google</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}