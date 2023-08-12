const { 
    verifyToken, 
    registerUserToDatabase 
} = require('./common');



export default async function registerUser(req, res) {
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
    const userName = user.name || "Unknown User";

    try {
        await registerUserToDatabase(uid, userName);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).json({
            error: {
                message: `Failed to register user: ${error.message}`,
            },
        });
    }
}

// If this is meant to be a default export:
// export default registerUser;
