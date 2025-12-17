import { ChatOpenAI } from 'langchain/chat_models/openai';
import { HumanMessage, SystemMessage, AIMessage } from 'langchain/schema';
import EmotionEngine from './EmotionEngine';
import ContextMemory from './ContextMemory';
import pool from '../config/database';
import redisClient from '../config/redis';
import { v4 as uuidv4 } from 'uuid';

export interface Session {
  sessionId: string;
  customerId: string;
  channel: string;
  startTime: Date;
  lastActivity: Date;
  context: ConversationContext;
  emotionalState: EmotionalState;
}

export interface ConversationContext {
  messageHistory: Array<{ role: string; content: string }>;
  preferences: Record<string, any>;
  recentInteractions: any[];
}

export interface EmotionalState {
  sentiment: string;
  tone: string;
  intent: string;
  confidence: number;
}

export interface Response {
  content: string;
  suggestions?: string[];
  actions?: Action[];
  emotionalTone: string;
}

export interface Action {
  type: string;
  data: any;
}

class AURAOrchestrator {
  private llm: ChatOpenAI;
  private emotionEngine: EmotionEngine;
  private contextMemory: ContextMemory;

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4',
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
    this.emotionEngine = new EmotionEngine();
    this.contextMemory = new ContextMemory();
  }

  async initializeSession(customerId: string, channel: string): Promise<Session> {
    try {
      const sessionId = uuidv4();
      const now = new Date();

      // Get customer profile and history
      const profile = await this.contextMemory.getProfile(customerId);
      const recentContext = await this.contextMemory.retrieveContext('', customerId, 5);

      const session: Session = {
        sessionId,
        customerId,
        channel,
        startTime: now,
        lastActivity: now,
        context: {
          messageHistory: [],
          preferences: profile?.preferences || {},
          recentInteractions: recentContext
        },
        emotionalState: {
          sentiment: 'neutral',
          tone: 'neutral',
          intent: 'browsing',
          confidence: 0.5
        }
      };

      // Store session in database
      await pool.query(
        `INSERT INTO sessions (session_id, customer_id, channel, start_time, last_activity, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [sessionId, customerId, channel, now, now]
      );

      // Cache session in Redis (1 hour TTL)
      await redisClient.setEx(`session:${sessionId}`, 3600, JSON.stringify(session));

      console.log(`✅ Session initialized: ${sessionId}`);
      return session;
    } catch (error) {
      console.error('Error initializing session:', error);
      throw error;
    }
  }

  async processMessage(sessionId: string, messageContent: string): Promise<Response> {
    try {
      const startTime = Date.now();

      // Get session from cache or database
      const sessionData = await redisClient.get(`session:${sessionId}`);
      if (!sessionData) {
        throw new Error('Session not found');
      }
      const session: Session = JSON.parse(sessionData);

      // Analyze emotion
      const [sentiment, tone, intent] = await Promise.all([
        this.emotionEngine.analyzeSentiment(messageContent),
        this.emotionEngine.detectTone(messageContent),
        this.emotionEngine.classifyIntent(messageContent)
      ]);

      session.emotionalState = {
        sentiment: sentiment.sentiment,
        tone: tone.tone,
        intent: intent.primary,
        confidence: sentiment.confidence
      };

      // Retrieve relevant context
      const relevantContext = await this.contextMemory.retrieveContext(
        messageContent,
        session.customerId,
        5
      );

      // Build conversation history
      session.context.messageHistory.push({
        role: 'user',
        content: messageContent
      });

      // Generate system prompt based on emotional state
      const systemPrompt = this.buildSystemPrompt(session);

      // Generate response using LLM
      const messages = [
        new SystemMessage(systemPrompt),
        ...session.context.messageHistory.slice(-10).map(msg =>
          msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
        )
      ];

      const llmResponse = await this.llm.call(messages);
      const responseContent = llmResponse.content as string;

      // Store message in context memory
      const messageId = uuidv4();
      await this.contextMemory.storeMessage({
        messageId,
        sessionId,
        sender: 'customer',
        content: messageContent,
        timestamp: new Date()
      });

      const auraMessageId = uuidv4();
      await this.contextMemory.storeMessage({
        messageId: auraMessageId,
        sessionId,
        sender: 'aura',
        content: responseContent,
        timestamp: new Date()
      });

      // Update session
      session.context.messageHistory.push({
        role: 'assistant',
        content: responseContent
      });
      session.lastActivity = new Date();

      // Update cache
      await redisClient.setEx(`session:${sessionId}`, 3600, JSON.stringify(session));

      // Update database
      await pool.query(
        `UPDATE sessions SET last_activity = ? WHERE session_id = ?`,
        [session.lastActivity, sessionId]
      );

      const duration = Date.now() - startTime;
      console.log(`✅ Message processed in ${duration}ms`);

      return {
        content: responseContent,
        suggestions: this.generateSuggestions(intent.primary),
        emotionalTone: tone.tone
      };
    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  private buildSystemPrompt(session: Session): string {
    const { emotionalState, context } = session;
    
    let prompt = `You are AURA, an intelligent and empathetic retail assistant. `;

    // Adapt based on emotional state
    if (emotionalState.tone === 'frustrated') {
      prompt += `The customer seems frustrated. Be extra empathetic, apologize for any inconvenience, and focus on solving their problem quickly. `;
    } else if (emotionalState.tone === 'excited') {
      prompt += `The customer seems excited! Match their enthusiasm and help them find exactly what they're looking for. `;
    } else if (emotionalState.tone === 'confused') {
      prompt += `The customer seems confused. Use simple language, provide clear explanations, and ask clarifying questions. `;
    }

    // Add context about preferences
    if (context.preferences && Object.keys(context.preferences).length > 0) {
      prompt += `\n\nCustomer preferences: ${JSON.stringify(context.preferences)}. `;
    }

    // Add intent-specific guidance
    if (emotionalState.intent === 'ready_to_buy') {
      prompt += `The customer is ready to make a purchase. Help them complete the transaction smoothly. `;
    } else if (emotionalState.intent === 'comparing') {
      prompt += `The customer is comparing options. Provide detailed comparisons and help them make an informed decision. `;
    } else if (emotionalState.intent === 'seeking_support') {
      prompt += `The customer needs support. Focus on resolving their issue efficiently. `;
    }

    prompt += `\n\nBe conversational, helpful, and personalized. Keep responses concise but informative.`;

    return prompt;
  }

  private generateSuggestions(intent: string): string[] {
    const suggestions: Record<string, string[]> = {
      browsing: [
        'Show me trending items',
        'What\'s on sale?',
        'I need help finding something'
      ],
      comparing: [
        'What are the key differences?',
        'Which one is better for me?',
        'Show me customer reviews'
      ],
      ready_to_buy: [
        'Add to cart',
        'Check availability',
        'Apply discount code'
      ],
      seeking_support: [
        'Track my order',
        'Return an item',
        'Speak to a human agent'
      ]
    };

    return suggestions[intent] || suggestions.browsing;
  }

  async getHistory(sessionId: string, limit: number = 20): Promise<any[]> {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [sessionId, limit]
      );
      return Array.isArray(rows) ? rows.reverse() : [];
    } catch (error) {
      console.error('Error getting history:', error);
      return [];
    }
  }

  async endSession(sessionId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE sessions SET end_time = ?, status = 'ended' WHERE session_id = ?`,
        [new Date(), sessionId]
      );
      await redisClient.del(`session:${sessionId}`);
      console.log(`✅ Session ended: ${sessionId}`);
    } catch (error) {
      console.error('Error ending session:', error);
      throw error;
    }
  }
}

export default AURAOrchestrator;
