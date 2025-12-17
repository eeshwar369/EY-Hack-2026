import axios from 'axios';

export interface SentimentAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
  confidence: number;
}

export interface Intent {
  primary: 'browsing' | 'comparing' | 'ready_to_buy' | 'seeking_support';
  confidence: number;
  entities: Entity[];
}

export interface Entity {
  type: 'product' | 'category' | 'price' | 'size' | 'color';
  value: string;
  confidence: number;
}

export interface EmotionalTone {
  tone: 'excited' | 'frustrated' | 'confused' | 'satisfied' | 'neutral';
  intensity: number;
}

class EmotionEngine {
  private huggingFaceApiKey: string;

  constructor() {
    this.huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY || '';
  }

  async analyzeSentiment(text: string): Promise<SentimentAnalysis> {
    try {
      // Using Hugging Face Inference API for sentiment analysis
      const response = await axios.post(
        'https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english',
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${this.huggingFaceApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data[0];
      const positiveScore = result.find((r: any) => r.label === 'POSITIVE')?.score || 0;
      const negativeScore = result.find((r: any) => r.label === 'NEGATIVE')?.score || 0;

      // Calculate sentiment score (-1 to 1)
      const score = positiveScore - negativeScore;
      
      let sentiment: 'positive' | 'negative' | 'neutral';
      if (score > 0.3) sentiment = 'positive';
      else if (score < -0.3) sentiment = 'negative';
      else sentiment = 'neutral';

      return {
        sentiment,
        score,
        confidence: Math.max(positiveScore, negativeScore)
      };
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      // Fallback to simple keyword-based sentiment
      return this.fallbackSentimentAnalysis(text);
    }
  }

  private fallbackSentimentAnalysis(text: string): SentimentAnalysis {
    const lowerText = text.toLowerCase();
    const positiveWords = ['love', 'great', 'excellent', 'amazing', 'perfect', 'wonderful', 'fantastic'];
    const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'worst', 'disappointed', 'frustrated'];

    let score = 0;
    positiveWords.forEach(word => {
      if (lowerText.includes(word)) score += 0.2;
    });
    negativeWords.forEach(word => {
      if (lowerText.includes(word)) score -= 0.2;
    });

    score = Math.max(-1, Math.min(1, score));

    let sentiment: 'positive' | 'negative' | 'neutral';
    if (score > 0.3) sentiment = 'positive';
    else if (score < -0.3) sentiment = 'negative';
    else sentiment = 'neutral';

    return { sentiment, score, confidence: 0.7 };
  }

  async detectTone(text: string): Promise<EmotionalTone> {
    const lowerText = text.toLowerCase();
    
    // Frustrated indicators
    if (
      (lowerText.includes('waiting') || lowerText.includes('problem') || 
       lowerText.includes('issue') || lowerText.includes('disappointed')) &&
      (lowerText.includes('!') || lowerText.includes('??'))
    ) {
      return { tone: 'frustrated', intensity: 0.8 };
    }

    // Excited indicators
    if (
      (lowerText.includes('love') || lowerText.includes('amazing') || 
       lowerText.includes('perfect') || lowerText.includes('great')) &&
      lowerText.includes('!')
    ) {
      return { tone: 'excited', intensity: 0.9 };
    }

    // Confused indicators
    if (
      lowerText.includes('?') &&
      (lowerText.includes('not sure') || lowerText.includes('confused') || 
       lowerText.includes("don't understand") || lowerText.includes('how'))
    ) {
      return { tone: 'confused', intensity: 0.7 };
    }

    // Satisfied indicators
    if (
      lowerText.includes('thanks') || lowerText.includes('thank you') || 
      lowerText.includes('helpful') || lowerText.includes('appreciate')
    ) {
      return { tone: 'satisfied', intensity: 0.8 };
    }

    return { tone: 'neutral', intensity: 0.5 };
  }

  async classifyIntent(text: string): Promise<Intent> {
    const lowerText = text.toLowerCase();
    const entities: Entity[] = [];

    // Extract entities
    const priceMatch = text.match(/\$(\d+)/);
    if (priceMatch) {
      entities.push({
        type: 'price',
        value: priceMatch[1],
        confidence: 0.9
      });
    }

    const sizeMatch = text.match(/\b(XS|S|M|L|XL|XXL|\d+)\b/i);
    if (sizeMatch) {
      entities.push({
        type: 'size',
        value: sizeMatch[1],
        confidence: 0.85
      });
    }

    // Classify intent
    let primary: Intent['primary'];
    let confidence: number;

    if (
      lowerText.includes('buy') || lowerText.includes('purchase') || 
      lowerText.includes('checkout') || lowerText.includes('order')
    ) {
      primary = 'ready_to_buy';
      confidence = 0.9;
    } else if (
      lowerText.includes('compare') || lowerText.includes('difference') || 
      lowerText.includes('vs') || lowerText.includes('better')
    ) {
      primary = 'comparing';
      confidence = 0.85;
    } else if (
      lowerText.includes('help') || lowerText.includes('support') || 
      lowerText.includes('problem') || lowerText.includes('issue')
    ) {
      primary = 'seeking_support';
      confidence = 0.9;
    } else {
      primary = 'browsing';
      confidence = 0.7;
    }

    return { primary, confidence, entities };
  }
}

export default EmotionEngine;
