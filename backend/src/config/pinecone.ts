import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || ''
});

export const initPinecone = async () => {
  try {
    const indexName = process.env.PINECONE_INDEX_NAME || 'aura-context-memory';
    
    // Check if index exists
    const indexes = await pinecone.listIndexes();
    const indexExists = indexes.indexes?.some(index => index.name === indexName);
    
    if (!indexExists) {
      console.log(`Creating Pinecone index: ${indexName}`);
      await pinecone.createIndex({
        name: indexName,
        dimension: 1536,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      console.log('✅ Pinecone index created');
    } else {
      console.log('✅ Pinecone index already exists');
    }
    
    console.log('✅ Pinecone initialized successfully');
  } catch (error) {
    console.error('❌ Pinecone initialization error:', error);
    throw error;
  }
};

export const getPineconeIndex = () => {
  const indexName = process.env.PINECONE_INDEX_NAME || 'aura-context-memory';
  return pinecone.index(indexName);
};

export default pinecone;
