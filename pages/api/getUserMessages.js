const { verifyToken, getMessagesForUser } = require('./common');

export default async function (req, res) {
  // Token from client request
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: {
        message: "No token provided",
      }
    });
  }

  const user = await verifyToken(token);
  if (!user) {
    return res.status(403).json({
      error: {
        message: "Invalid or expired token",
      }
    });
  }

  const uid = user.uid;

  try {
    const lastTimestamp = req.query.lastTimestamp || null;
    const messages = await getMessagesForUser(uid, lastTimestamp);

    // Transform the messages
    const transformedMessages = messages.map(msg => {
      const userMessage = {
          role: "user",
          content: msg.userMessage,
      };
      const assistantMessage = {
          role: "assistant",
          content: msg.assistantMessage,
      };
      return [userMessage, assistantMessage];
    }).flat();

    res.status(200).json({ messages: transformedMessages });
  } catch (error) {
    console.error("Error fetching messages for user:", error);
    res.status(500).json({
      error: {
        message: `Internal server error: ${error.message}`,
      }
    });
  }
}
