const { verifyToken, getStoredMessages } = require('./common');

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
    const messages = await getStoredMessages({uid:uid});

    //console.log(messages);

    // Since the new structure already has individual messages, we can just send them directly
    res.status(200).json({ messages: messages });
  } catch (error) {
    console.error("Error fetching messages for user:", error);
    res.status(500).json({
      error: {
        message: `Internal server error: ${error.message}`,
      }
    });
  }
}
