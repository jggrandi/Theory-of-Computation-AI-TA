// pages/api/last10MessageTimestamps.js

const { getLast10MessageTimestamps } = require('./common');

export default async (req, res) => {
  try {
    // Ensure request method is GET and a UID is provided
    if (req.method !== 'GET' || !req.query.uid) {
      return res.status(400).json({ error: 'Invalid request method or missing UID.' });
    }

    const uid = req.query.uid;
    const timestamps = await getLast10MessageTimestamps(uid);
    res.status(200).json({ timestamps });
    
  } catch (error) {
    console.error('Error fetching last 10 message timestamps:', error);
    res.status(500).json({ error: 'Failed to fetch message timestamps.' });
  }
};