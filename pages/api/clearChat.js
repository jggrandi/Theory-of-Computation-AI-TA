
const { verifyToken, updateLastClearedTimestamp } = require('./common');

export default async function (req, res) {
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

  try {
    const uid = user.uid;
    const currentTimestamp = Date.now();

    // Update the user's lastClearedTimestamp in the database
    await updateLastClearedTimestamp(uid, currentTimestamp);

    res.status(200).json({ message: "Chat cleared successfully." });

  } catch (error) {
    console.error("Error clearing chat:", error);
    res.status(500).json({
      error: {
        message: `Internal server error: ${error.message}`,
      }
    });
  }
}
