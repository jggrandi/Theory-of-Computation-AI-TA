// middleware.js
const { getUserQuota, incrementUserQuota } = require('./common');

async function checkAndUpdateUserQuota(req, res, next) {
    try {
        const userUid = req.uid; // Assuming you've populated this from verifyToken function

        // Get the current user's quota
        const currentQuota = await getUserQuota(userUid);

        // If it exceeds the limit
        if (currentQuota >= 5) {
            req.isResponseSent = true;
            return res.status(429).json({
                error: {
                    message: "You have exceeded your request limit for today.",
                }
            });
        }

        // If everything is okay, increase the quota and continue to the next middleware or route
        await incrementUserQuota(userUid);
        next();
    } catch (error) {
        req.isResponseSent = true;
        console.error("Error checking quota:", error);
        res.status(500).send({ error: { message: "Internal Server Error" } });
    }
}

module.exports = {
    checkAndUpdateUserQuota,
};
