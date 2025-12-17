import { getPineconeIndex } from '../config/pinecone';
import { OpenAI } from 'openai';
import pool from '../config/database';
import redisClient from '../config/redis';
import crypto from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface Message {
  messageId: string;
  sessionId: string;
  sender: 'customer' | 'aura';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ContextItem {
  messageId: string;
  content: string;
  timestamp: Date;
  relevanceScore: number;
  metadata: Record<string, any>;
}

export interface CustomerProfile {
  customerId: string;
  preferences: {
    stylePreferences?: string[];
    priceRange?: { min: number; max: number };
    favoriteCategories?: string[];
    sizes?: Record<string, string>;
  };
  lifetimeValue: number;
  createdAt: Date;
  updatedAt: Date;
}

class ContextMemory {
  private encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  private encrypt(text: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `encrypted:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    if (!encryptedText.startsWith('encrypted:')) {
      return encryptedText;
    }
    const text = encryptedText.replace('encrypted:', '');
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async storeMessage(message: Message, embedding?: number[]): Promise<void> {
    try {
      // Store in MySQL
      await pool.query(
        `INSERT INTO messages (message_id, session_id, sender, content, timestamp) 
         VALUES (?, ?, ?, ?, ?)`,
        [message.messageId, message.sessionId, message.sender, message.content, message.timestamp]
      );

      // Generate embedding if not provided
      if (!embedding) {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: message.content
        });
        embedding = embeddingResponse.data[0].embedding;
      }

      // Store in Pinecone
      const index = getPineconeIndex();
      await index.upsert([{
        id: message.messageId,
        values: embedding,
        metadata: {
          sessionId: message.sessionId,
          sender: message.sender,
          content: message.content,
          timestamp: message.timestamp.getTime(),
          ...message.metadata
        }
      }]);

      console.log(`✅ Message stored: ${message.messageId}`);
    } catch (error) {
      console.error('Error storing message:', error);
      throw error;
    }
  }

  async retrieveContext(query: string, customerId: string, limit: number = 5): Promise<ContextItem[]> {
    try {
      const startTime = Date.now();

      // Generate query embedding
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query
      });
      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Search in Pinecone
      const index = getPineconeIndex();
      const searchResults = await index.query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true,
        filter: {
          customerId: { $eq: customerId }
        }
      });

      const contextItems: ContextItem[] = searchResults.matches.map(match => ({
        messageId: match.id,
        content: match.metadata?.content as string || '',
        timestamp: new Date(match.metadata?.timestamp as number || Date.now()),
        relevanceScore: match.score || 0,
        metadata: match.metadata as Record<string, any> || {}
      }));

      const duration = Date.now() - startTime;
      console.log(`✅ Context retrieved in ${duration}ms`);

      return contextItems;
    } catch (error) {
      console.error('Error retrieving context:', error);
      return [];
    }
  }

  async updateProfile(customerId: string, profile: Partial<CustomerProfile>): Promise<void> {
    try {
      const encryptedPreferences = profile.preferences 
        ? JSON.stringify(profile.preferences)
        : null;

      await pool.query(
        `INSERT INTO customer_profiles (customer_id, style_preferences, price_range_min, price_range_max, favorite_categories, sizes, lifetime_value)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         style_preferences = VALUES(style_preferences),
         price_range_min = VALUES(price_range_min),
         price_range_max = VALUES(price_range_max),
         favorite_categories = VALUES(favorite_categories),
         sizes = VALUES(sizes),
         lifetime_value = VALUES(lifetime_value)`,
        [
          customerId,
          encryptedPreferences,
          profile.preferences?.priceRange?.min || null,
          profile.preferences?.priceRange?.max || null,
          profile.preferences?.favoriteCategories ? JSON.stringify(profile.preferences.favoriteCategories) : null,
          profile.preferences?.sizes ? JSON.stringify(profile.preferences.sizes) : null,
          profile.lifetimeValue || 0
        ]
      );

      // Invalidate cache
      await redisClient.del(`profile:${customerId}`);

      console.log(`✅ Profile updated for customer: ${customerId}`);
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  async getProfile(customerId: string): Promise<CustomerProfile | null> {
    try {
      // Check cache first
      const cached = await redisClient.get(`profile:${customerId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Query database
      const [rows] = await pool.query(
        `SELECT * FROM customer_profiles WHERE customer_id = ?`,
        [customerId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      const row: any = rows[0];
      const profile: CustomerProfile = {
        customerId: row.customer_id,
        preferences: row.style_preferences ? JSON.parse(row.style_preferences) : {},
        lifetimeValue: parseFloat(row.lifetime_value || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      // Cache for 30 minutes
      await redisClient.setEx(`profile:${customerId}`, 1800, JSON.stringify(profile));

      return profile;
    } catch (error) {
      console.error('Error getting profile:', error);
      return null;
    }
  }
}

export default ContextMemory;
