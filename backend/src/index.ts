import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initDatabase } from './config/database';
import { initRedis } from './config/redis';
import { initPinecone } from './config/pinecone';
import chatRoutes from './routes/chat';
import authRoutes from './routes/auth';
import AURAOrchestrator from './services/AURAOrchestrator';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:4200'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket connection
const orchestrator = new AURAOrchestrator();

io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  socket.on('join-session', async (data: { sessionId: string }) => {
    socket.join(data.sessionId);
    console.log(`Client ${socket.id} joined session: ${data.sessionId}`);
  });

  socket.on('send-message', async (data: { sessionId: string; message: string }) => {
    try {
      socket.to(data.sessionId).emit('typing', { isTyping: true });

      const response = await orchestrator.processMessage(data.sessionId, data.message);

      io.to(data.sessionId).emit('message', {
        sender: 'aura',
        content: response.content,
        suggestions: response.suggestions,
        timestamp: new Date().toISOString()
      });

      socket.to(data.sessionId).emit('typing', { isTyping: false });
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Failed to process message' });
    }
  });

  socket.on('typing', (data: { sessionId: string; isTyping: boolean }) => {
    socket.to(data.sessionId).emit('typing', { isTyping: data.isTyping });
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Initialize services and start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('🚀 Initializing AURA Backend...');
    
    await initDatabase();
    await initRedis();
    await initPinecone();

    httpServer.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ WebSocket server ready`);
      console.log(`✅ CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:4200'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { io };
