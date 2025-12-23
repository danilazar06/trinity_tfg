import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface SalamandraRecommendation {
  recommendations: string[]; // Géneros o temáticas recomendadas
}

export interface AIRecommendation {
  recommendations: string[]; // Géneros cinematográficos recomendados
  reasoning: string;
  contextAnalysis: string;
  confidence: number;
  emotionalState: string;
  approach: 'catarsis' | 'evasion' | 'mixed';
}

export interface ALIARequest {
  userText: string; // Descripción del estado emocional del usuario
  userId?: string;
  previousRecommendations?: string[];
}

@Injectable()
export class ALIAService {
  private readonly logger = new Logger(ALIAService.name);
  private readonly httpClient: AxiosInstance;
  private readonly salamandraEndpoint: string;
  private readonly hfApiToken: string;
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.salamandraEndpoint = 'https://api-inference.huggingface.co/models/BSC-LT/salamandra-7b-instruct';
    this.hfApiToken = this.configService.get('HF_API_TOKEN', '');
    this.isEnabled = !!this.hfApiToken;

    this.httpClient = axios.create({
      timeout: 30000, // 30 segundos para modelos de IA
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.hfApiToken}`,
        'User-Agent': 'Trinity-MVP/1.0',
      },
    });

    if (this.isEnabled) {
      this.logger.log('ALIA Service initialized with Salamandra-7B model');
    } else {
      this.logger.warn('ALIA Service disabled - no HF_API_TOKEN configured');
    }
  }

  /**
   * Obtener recomendaciones cinematográficas de Salamandra basadas en estado emocional
   */
  async getChatRecommendations(request: ALIARequest): Promise<AIRecommendation> {
    if (!this.isEnabled) {
      return this.getFallbackRecommendations(request.userText);
    }

    try {
      this.logger.log(`Getting Salamandra recommendations for: "${request.userText}"`);

      // System prompt específico para Salamandra
      const systemPrompt = this.buildSalamandraPrompt(request.userText);

      const response = await this.httpClient.post(this.salamandraEndpoint, {
        inputs: systemPrompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.7,
          do_sample: true,
          return_full_text: false,
        },
        options: {
          wait_for_model: true,
        },
      });

      // Procesar respuesta de Salamandra
      const salamandraResponse = response.data;
      return this.parseSalamandraResponse(salamandraResponse, request.userText);

    } catch (error) {
      this.logger.error(`Error calling Salamandra API: ${error.message}`);
      
      // Fallback a recomendaciones locales
      return this.getFallbackRecommendations(request.userText);
    }
  }

  /**
   * Construir prompt específico para Salamandra (BSC-LT/salamandra-7b-instruct)
   */
  private buildSalamandraPrompt(userText: string): string {
    return `Eres un psicólogo experto en cine. El usuario te describirá su estado de ánimo. Recomienda 3 géneros o temáticas de cine que le ayuden (Catarsis o Evasión). Responde estrictamente en JSON: { "recommendations": ["género1", "género2", "género3"], "approach": "catarsis|evasion" }.

Usuario: "${userText}"

Respuesta JSON:`;
  }

  /**
   * Procesar respuesta de Salamandra
   */
  private parseSalamandraResponse(salamandraResponse: any, originalContext: string): AIRecommendation {
    try {
      // Salamandra devuelve un array con la respuesta generada
      const generatedText = Array.isArray(salamandraResponse) 
        ? salamandraResponse[0]?.generated_text 
        : salamandraResponse.generated_text;

      if (!generatedText) {
        throw new Error('No generated text in response');
      }

      // Intentar extraer JSON de la respuesta
      const jsonMatch = generatedText.match(/\{[^}]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed: SalamandraRecommendation & { approach?: string } = JSON.parse(jsonMatch[0]);

      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new Error('Invalid recommendations format');
      }

      return {
        recommendations: parsed.recommendations,
        reasoning: `Salamandra-7B recomienda estos géneros basándose en el análisis psicológico del estado: "${originalContext}"`,
        contextAnalysis: this.analyzeEmotionalContext(originalContext),
        confidence: 0.85, // Alta confianza en Salamandra
        emotionalState: this.detectEmotionalState(originalContext),
        approach: (parsed.approach as 'catarsis' | 'evasion') || 'mixed',
      };
    } catch (error) {
      this.logger.warn(`Could not parse Salamandra response: ${error.message}`);
      return this.getFallbackRecommendations(originalContext);
    }
  }

  /**
   * Recomendaciones de fallback cuando Salamandra no está disponible
   */
  private getFallbackRecommendations(userText: string): AIRecommendation {
    const analysis = this.analyzeEmotionalContext(userText);
    const emotionalState = this.detectEmotionalState(userText);
    
    // Mapeo de emociones a géneros cinematográficos (enfoque psicológico)
    const emotionToGenres: { [key: string]: { genres: string[], approach: 'catarsis' | 'evasion' } } = {
      sad: { genres: ['Drama', 'Romance', 'Biografía'], approach: 'catarsis' },
      happy: { genres: ['Comedia', 'Musical', 'Aventura'], approach: 'evasion' },
      stressed: { genres: ['Comedia', 'Documental', 'Animación'], approach: 'evasion' },
      angry: { genres: ['Drama', 'Thriller', 'Deportes'], approach: 'catarsis' },
      lonely: { genres: ['Romance', 'Drama familiar', 'Comedia romántica'], approach: 'catarsis' },
      anxious: { genres: ['Comedia', 'Animación', 'Documental de naturaleza'], approach: 'evasion' },
      depressed: { genres: ['Drama inspiracional', 'Biografía', 'Comedia'], approach: 'catarsis' },
      default: { genres: ['Drama', 'Comedia', 'Aventura'], approach: 'mixed' },
    };

    const recommendation = emotionToGenres[emotionalState] || emotionToGenres.default;

    return {
      recommendations: recommendation.genres,
      reasoning: `Análisis local: Detectado estado "${emotionalState}". Recomendación de ${recommendation.approach} mediante géneros que pueden ayudar con este estado emocional.`,
      contextAnalysis: analysis,
      confidence: 0.6, // Menor confianza para fallback
      emotionalState,
      approach: recommendation.approach,
    };
  }

  /**
   * Análisis psicológico del contexto emocional
   */
  private analyzeEmotionalContext(userText: string): string {
    const lowerText = userText.toLowerCase();
    
    if (lowerText.includes('bullying') || lowerText.includes('acoso')) {
      return 'Situación de acoso detectada. Se recomienda catarsis a través de dramas que aborden superación personal y apoyo social.';
    }
    
    if (lowerText.includes('triste') || lowerText.includes('deprimido') || lowerText.includes('melancolía')) {
      return 'Estado depresivo detectado. Catarsis recomendada con dramas inspiracionales seguidos de comedias ligeras.';
    }
    
    if (lowerText.includes('estresado') || lowerText.includes('ansiedad') || lowerText.includes('agobiado')) {
      return 'Estrés/ansiedad detectados. Evasión recomendada con comedias y contenido relajante.';
    }
    
    if (lowerText.includes('enfadado') || lowerText.includes('furioso') || lowerText.includes('rabia')) {
      return 'Estado de ira detectado. Catarsis recomendada con thrillers o deportes para canalizar la energía.';
    }
    
    if (lowerText.includes('solo') || lowerText.includes('aislado') || lowerText.includes('abandonado')) {
      return 'Sentimientos de soledad detectados. Catarsis con dramas familiares y romances.';
    }

    if (lowerText.includes('feliz') || lowerText.includes('celebrar') || lowerText.includes('eufórico')) {
      return 'Estado positivo detectado. Evasión para mantener y amplificar el buen ánimo.';
    }

    return 'Estado emocional neutro. Se recomienda variedad de géneros según preferencias personales.';
  }

  /**
   * Detección de estado emocional principal
   */
  private detectEmotionalState(userText: string): string {
    const lowerText = userText.toLowerCase();
    
    const emotionKeywords = {
      sad: ['triste', 'deprimido', 'melancólico', 'llorar', 'pena', 'dolor'],
      happy: ['feliz', 'alegre', 'contento', 'celebrar', 'emocionado', 'eufórico'],
      stressed: ['estresado', 'ansiedad', 'nervioso', 'preocupado', 'agobiado'],
      angry: ['enfadado', 'furioso', 'molesto', 'irritado', 'rabioso', 'ira'],
      lonely: ['solo', 'solitario', 'aislado', 'abandonado', 'vacío'],
      anxious: ['ansioso', 'nervioso', 'inquieto', 'intranquilo'],
      depressed: ['deprimido', 'hundido', 'sin esperanza', 'desesperanzado'],
    };

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        return emotion;
      }
    }

    return 'neutral';
  }

  /**
   * Verificar estado del servicio Salamandra
   */
  async healthCheck(): Promise<{ available: boolean; latency?: number; model?: string }> {
    if (!this.isEnabled) {
      return { available: false };
    }

    try {
      const startTime = Date.now();
      
      // Test simple con Salamandra
      const testResponse = await this.httpClient.post(this.salamandraEndpoint, {
        inputs: "Test de conectividad",
        parameters: {
          max_new_tokens: 10,
          temperature: 0.1,
        },
        options: {
          wait_for_model: true,
        },
      });
      
      const latency = Date.now() - startTime;
      
      return { 
        available: true, 
        latency,
        model: 'BSC-LT/salamandra-7b-instruct'
      };
    } catch (error) {
      this.logger.warn(`Salamandra health check failed: ${error.message}`);
      return { available: false };
    }
  }
}