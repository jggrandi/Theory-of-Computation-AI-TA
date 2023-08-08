import Head from "next/head";
import { useState, useEffect } from "react";
import styles from "./index.module.css";

export default function Home() {
  const [questionInput, setQuestionInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadedMessages = JSON.parse(localStorage.getItem('messages')) || [];
    setMessages(loadedMessages);
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
  
    // Check if the questionInput is empty or only contains whitespace
    if (!questionInput.trim()) {
      alert("Please enter a question before submitting.");
      return; // Exit the function if the input is empty or only contains whitespace
    }
  
    const updatedMessages = [...messages, { role: "user", content: questionInput }];
    setIsLoading(true); // Start loading

    try {
      const serverResponse = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      setIsLoading(false); // End loading after success
  
    } catch(error) {
      console.error(error);
      alert(error.message);
      setIsLoading(false); // End loading in case of an error
    }
  }
  

  function clearChat() {
    setMessages([]);
    localStorage.removeItem('messages');
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Theory of Computation Assistant</title>
        <link rel="icon" href="/icon.png" />
      </Head>

      <div className={styles.header}>CSC 452/652/752 - Theory of Computation Teaching Assistant (beta)</div>

      <main className={styles.main}>
        <div className={styles.chatWrapper}>
          <div className={styles.chatContainer}>
            {messages.map((message, idx) => (
              <div key={idx} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
                {message.content}
              </div>
            ))}
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className={styles.clearButton}>Clear Chat</button>
        )}
        <form onSubmit={onSubmit} className={styles.inputForm}>
          <input
            type="text"
            name="question"
            placeholder="Enter your question"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
          />
          <input type="submit" value={isLoading ? "Processing..." : "Ask"} disabled={isLoading} />
        </form>
    </main>

    </div>
  );
}
