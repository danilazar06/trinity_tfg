# 🧠 Integración IA Salamandra/ALIA - Trinity MVP

## 🎯 Resumen de la Integración

Trinity integra **Salamandra/ALIA**, la IA soberana española desarrollada por el Barcelona Supercomputing Center (BSC), para proporcionar recomendaciones contextuales de contenido multimedia basadas en el estado emocional del usuario.

## 🏛️ Sobre Salamandra/ALIA

### Información del Modelo
- **Desarrollador**: Barcelona Supercomputing Center (BSC)
- **Modelo**: BSC-LT/salamandra-7b-instruct
- **Tipo**: Large Language Model (LLM) especializado en español
- **Parámetros**: 7 billones
- **Especialización**: Comprensión contextual y emocional en español

### Características Clave
- **IA Soberana**: Desarrollada en España, datos europeos
- **Multilingüe**: Especializada en español, catalán, gallego, euskera
- **Contextual**: Comprende matices culturales y emocionales
- **Eficiente**: Optimizada para inference rápida

## 🔧 Implementación Técnica

### Arquitectura de Integración

```
Usuario → Texto Emocional → AIService → Salamandra/ALIA → Análisis Emocional → TMDB → Recomendaciones
```

### Componentes Implementados

#### 1. AIService (Backend)
```typescript
@Injectable()
export class ALIAService {
  async getChatRecommendations(userText: string): Promise<AIRecommendation> {
    // 1. Enviar texto a Salamandra
    // 2. Analizar respuesta emocional
    // 3. Mapear a géneros cinematográficos
    // 4. Convertir a IDs de TMDB
    // 5. Retornar recomendaciones
  }
}
```

#### 2. AIController (Backend)
```typescript
@Controller('ai')
export class AIController {
  @Post('chat-recommendations')
  async getChatRecommendations(@Body() dto: ChatRecommendationDto) {
    return this.aliaService.getChatRecommendations(dto.userText);
  }
}
```

#### 3. GraphQL Integration
```graphql
type Query {
  getChatRecommendations(userText: String!): AIRecommendation
}

type AIRecommendation {
  movies: [String!]!
  reasoning: String!
  confidence: Float!
  emotionalState: String!
  suggestedGenres: [String!]!
}
```

## 🎭 Análisis Emocional

### Estados Emocionales Detectados
- **Estrés/Ansiedad**: Recomienda comedias, animación
- **Tristeza/Melancolía**: Recomienda dramas emotivos, musicales
- **Aburrimiento**: Recomienda acción, aventura, thriller
- **Celebración/Alegría**: Recomienda comedias, musicales, familiares
- **Nostalgia**: Recomienda clásicos, dramas de época
- **Energía/Motivación**: Recomienda deportes, biografías inspiradoras

### Mapeo Emocional → Géneros

```typescript
const emotionalMapping = {
  stressed: ['Comedy', 'Animation', 'Family'],
  sad: ['Drama', 'Music', 'Romance'],
  bored: ['Action', 'Adventure', 'Thriller'],
  happy: ['Comedy', 'Musical', 'Family'],
  nostalgic: ['Drama', 'History', 'Classic'],
  energetic: ['Sport', 'Biography', 'Documentary']
};
```

## 📡 API de Hugging Face

### Configuración
```typescript
const HF_CONFIG = {
  model: 'BSC-LT/salamandra-7b-instruct',
  endpoint: 'https://api-inference.huggingface.co/models/',
  headers: {
    'Authorization': `Bearer ${process.env.HF_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
};
```

### Prompt Engineering
```typescript
const SYSTEM_PROMPT = `
Eres ALIA, una IA especializada en recomendar contenido audiovisual basándote en el estado emocional del usuario.

Analiza el siguiente texto del usuario y determina:
1. Su estado emocional actual
2. Géneros cinematográficos que le ayudarían
3. Razón de la recomendación

Responde SOLO con géneros de esta lista: Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Music, Mystery, Romance, Science Fiction, TV Movie, Thriller, War, Western.

Formato de respuesta:
Estado emocional: [estado]
Géneros recomendados: [género1, género2, género3]
Razón: [explicación breve]
`;
```

## 🎬 Integración con TMDB

### Flujo de Recomendación
1. **Análisis Emocional**: Salamandra analiza el texto del usuario
2. **Mapeo de Géneros**: Se mapean emociones a géneros cinematográficos
3. **Búsqueda TMDB**: Se buscan películas por géneros recomendados
4. **Filtrado**: Se filtran por popularidad y calificación
5. **Selección**: Se seleccionan las mejores 3-5 recomendaciones

### Algoritmo de Selección
```typescript
async selectMoviesFromGenres(genres: string[]): Promise<string[]> {
  const movies = [];
  
  for (const genre of genres) {
    const genreMovies = await this.tmdbService.getMoviesByGenre(genre, {
      sort_by: 'popularity.desc',
      vote_average_gte: 7.0,
      vote_count_gte: 100
    });
    
    movies.push(...genreMovies.slice(0, 2)); // Top 2 por género
  }
  
  return this.shuffleAndLimit(movies, 5);
}
```

## 🔄 Casos de Uso Implementados

### 1. Recomendación Personal
```typescript
// Usuario: "Me siento muy estresado por el trabajo"
// Salamandra: Estado emocional: estresado
// Géneros: Comedy, Animation, Family
// Películas: ["Toy Story", "The Grand Budapest Hotel", "Paddington"]
```

### 2. Recomendación Grupal
```typescript
// Usuario: "Estamos celebrando un cumpleaños en familia"
// Salamandra: Estado emocional: celebrativo
// Géneros: Comedy, Family, Musical
// Películas: ["Coco", "The Greatest Showman", "Moana"]
```

### 3. Recomendación Contextual
```typescript
// Usuario: "Es viernes por la noche y queremos algo emocionante"
// Salamandra: Estado emocional: energético
// Géneros: Action, Adventure, Thriller
// Películas: ["Mad Max: Fury Road", "John Wick", "Mission Impossible"]
```

## 📊 Métricas y Analytics

### Métricas Tracked
- **Precisión de Recomendaciones**: % de recomendaciones aceptadas
- **Tiempo de Respuesta**: Latencia de Salamandra + TMDB
- **Estados Emocionales**: Distribución de emociones detectadas
- **Géneros Populares**: Géneros más recomendados
- **Satisfacción del Usuario**: Ratings de recomendaciones

### Dashboard de IA
```typescript
interface AIMetrics {
  totalRecommendations: number;
  averageConfidence: number;
  topEmotionalStates: string[];
  recommendationAccuracy: number;
  averageResponseTime: number;
}
```

## 🛡️ Manejo de Errores y Fallbacks

### Estrategia de Resilencia
1. **Circuit Breaker**: Protección ante fallos de Hugging Face
2. **Fallback Local**: Recomendaciones basadas en géneros populares
3. **Cache Inteligente**: Cache de respuestas frecuentes
4. **Retry Logic**: Reintentos con backoff exponencial

### Fallback Implementation
```typescript
async getChatRecommendationsWithFallback(userText: string): Promise<AIRecommendation> {
  try {
    return await this.getChatRecommendations(userText);
  } catch (error) {
    this.logger.warn('🧠 Salamandra fallback activated', error.message);
    return this.getFallbackRecommendations(userText);
  }
}

private getFallbackRecommendations(userText: string): AIRecommendation {
  // Análisis simple basado en palabras clave
  const keywords = this.extractKeywords(userText);
  const genres = this.mapKeywordsToGenres(keywords);
  
  return {
    movies: this.getPopularMoviesByGenres(genres),
    reasoning: 'Recomendación basada en análisis de palabras clave',
    confidence: 0.6,
    emotionalState: 'neutral',
    suggestedGenres: genres
  };
}
```

## 🔧 Configuración y Setup

### Variables de Entorno
```bash
# Hugging Face API Token
HF_API_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Salamandra Model Configuration
HF_MODEL_NAME=BSC-LT/salamandra-7b-instruct
HF_API_URL=https://api-inference.huggingface.co/models/

# AI Service Configuration
AI_CONFIDENCE_THRESHOLD=0.7
AI_MAX_RETRIES=3
AI_TIMEOUT_MS=10000
```

### Health Check
```typescript
@Get('health')
async checkAIHealth(): Promise<AIHealthStatus> {
  try {
    const testResponse = await this.aliaService.getChatRecommendations(
      'Test de conectividad'
    );
    
    return {
      status: 'healthy',
      model: 'BSC-LT/salamandra-7b-instruct',
      responseTime: testResponse.responseTime,
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      lastCheck: new Date().toISOString()
    };
  }
}
```

## 🚀 Optimizaciones Implementadas

### 1. Cache Inteligente
- **Cache de Respuestas**: Respuestas similares se cachean por 1 hora
- **Cache de Géneros**: Mapeos emocionales se cachean por 24 horas
- **Cache de Películas**: Resultados TMDB se cachean por 6 horas

### 2. Procesamiento Asíncrono
- **Queue System**: Recomendaciones se procesan en cola
- **Batch Processing**: Múltiples requests se agrupan
- **Background Updates**: Cache se actualiza en background

### 3. Optimización de Prompts
- **Prompt Compression**: Prompts optimizados para menor latencia
- **Context Limiting**: Contexto limitado a 500 caracteres
- **Response Parsing**: Parsing optimizado de respuestas

## 🔮 Roadmap Futuro

### Mejoras Planificadas
- **Fine-tuning**: Entrenar modelo específico para Trinity
- **Multi-modal**: Análisis de imágenes y audio
- **Personalización**: Aprendizaje de preferencias individuales
- **Tiempo Real**: Recomendaciones en tiempo real durante swipes

### Integraciones Adicionales
- **Análisis de Sentimientos**: Análisis más profundo de emociones
- **Recomendaciones Grupales**: IA para consenso grupal
- **Predicción de Matches**: Predicción de éxito de matches
- **Optimización de Salas**: IA para optimizar configuración de salas

## 📚 Referencias y Documentación

### Enlaces Útiles
- **Salamandra Model**: https://huggingface.co/BSC-LT/salamandra-7b-instruct
- **BSC Website**: https://www.bsc.es/
- **Hugging Face Docs**: https://huggingface.co/docs/api-inference/
- **TMDB API**: https://developers.themoviedb.org/3

### Papers y Investigación
- **Salamandra Paper**: [Enlace al paper cuando esté disponible]
- **Emotional AI**: Research on emotional analysis in Spanish
- **Recommendation Systems**: ML approaches for content recommendation

---

**Integración completada**: ✅ 100% Funcional  
**Estado**: 🚀 Producción Ready  
**Última actualización**: 29 de diciembre de 2025