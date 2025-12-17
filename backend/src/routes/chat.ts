import express from 'express';
import AURAOrchestrator from '../services/AURAOrchestrator';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
const orchestrator = new AURAOrchestrator();

// Initialize chat session
router.post('/session', authMiddleware, async (req, res) => {
  try {
    const { customerId } = req.body.user;
    const { channel } = req.body;

    const session = await orchestrator.initializeSession(
      customerId,
      channel || 'web'
    );

    res.json({
      message: 'Session initialized',
      session: {
        sessionId: session.sessionId,
        customerId: session.customerId,
        channel: session.channel
      }
    });
  } catch (error) {
    console.error('Session initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize session' });
  }
});

// Send message
router.post('/message', authMiddleware, async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Session ID and message are required' });
    }

    const response = await orchestrator.processMessage(sessionId, message);

    res.json({
      message: 'Message processed',
      response
    });
  } catch (error) {
    console.error('Message processing error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Get conversation history
router.get('/history/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await orchestrator.getHistory(sessionId, limit);

    res.json({
      sessionId,
      history
    });
  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

// End session
router.post('/session/end', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body;

    await orchestrator.endSession(sessionId);

    res.json({
      message: 'Session ended successfully'
    });
  } catch (error) {
    console.error('Session end error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

export default router;
