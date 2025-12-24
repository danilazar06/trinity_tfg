import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import fetch from 'node-fetch';

interface SalamandraRequest {
  inputs: string;
  parameters?: {
    max_new_tokens?: number;
    temperature?: number;
    top_p?: number;
    do_sample?: boolean;
  };
}

interface SalamandraResponse {
  generated_text?: string;
  error?: string;
}

/**
 * AIHandler: Chat Contextual con Salamandra
 * Integración con Hugging Face Inference API usando el modelo Salamandra-7b-instruct
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🤖 AI Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;

  try {
    switch (fieldName) {
      case 'getChatRecommendations':
        return await getChatRecommendations(args.text);
      
      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Obtener recomendaciones de IA basadas en texto del usuario
 */
async function getChatRecommendations(userText: string): Promise<string[]> {
  console.log(`🧠 Analizando texto del usuario: "${userText}"`);

  try {
    // 1. Construir prompt contextual para Salamandra
    const prompt = buildContextualPrompt(userText);
    
    // 2. Llamar a Hugging Face Inference API
    const aiResponse = await callSalamandraAPI(prompt);
    
    // 3. Procesar respuesta y extraer recomendaciones
    const recommendations = parseRecommendations(aiResponse);
    
    console.log(`✅ Recomendaciones generadas: ${recommendations.length}`);
    return recommendations;

  } catch (error) {
    console.warn('⚠️ Error en IA, usando recomendaciones por defecto:', error);
    return getFallbackRecommendations(userText);
  }
}

/**
 * Construir prompt contextual para el modelo Salamandra
 */
function buildContextualPrompt(userText: string): string {
  const systemPrompt = `Eres un experto en cine y entretenimiento. Tu trabajo es analizar el sentimiento y contexto emocional del usuario para recomendar géneros cinematográficos apropiados.

Instrucciones:
- Analiza el texto del usuario para identificar su estado emocional
- Recomienda exactamente 3 géneros de películas que se adapten a su estado de ánimo
- Responde SOLO con los géneros separados por comas, sin explicaciones adicionales
- Géneros disponibles: acción, aventura, animación, comedia, crimen, documental, drama, familia, fantasía, historia, terror, música, misterio, romance, ciencia ficción, thriller, guerra, western

Ejemplos:
Usuario: "Estoy muy triste y necesito algo que me anime"
Respuesta: comedia, animación, familia

Usuario: "Quiero algo emocionante y lleno de adrenalina"
Respuesta: acción, thriller, aventura

Usuario: "Me siento romántico esta noche"
Respuesta: romance, drama, comedia`;

  return `${systemPrompt}

Usuario: "${userText}"
Respuesta:`;
}

/**
 * Llamar a la API de Hugging Face con Salamandra
 */
async function callSalamandraAPI(prompt: string): Promise<string> {
  const apiToken = process.env.HF_API_TOKEN;
  if (!apiToken) {
    throw new Error('HF_API_TOKEN no configurado');
  }

  const requestBody: SalamandraRequest = {
    inputs: prompt,
    parameters: {
      max_new_tokens: 50,
      temperature: 0.7,
      top_p: 0.9,
      do_sample: true,
    },
  };

  const response = await fetch(
    'https://api-inference.huggingface.co/models/BSC-LT/salamandra-7b-instruct',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Trinity-App/1.0',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hugging Face API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as SalamandraResponse[];
  
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error('Respuesta inválida de Hugging Face API');
  }

  const result = data[0];
  if (result.error) {
    throw new Error(`Salamandra error: ${result.error}`);
  }

  if (!result.generated_text) {
    throw new Error('No se generó texto de respuesta');
  }

  // Extraer solo la parte nueva del texto generado (después del prompt)
  const generatedText = result.generated_text.replace(prompt, '').trim();
  
  console.log(`🤖 Respuesta de Salamandra: "${generatedText}"`);
  return generatedText;
}

/**
 * Procesar respuesta de IA y extraer géneros
 */
function parseRecommendations(aiResponse: string): string[] {
  try {
    // Limpiar y normalizar la respuesta
    const cleanResponse = aiResponse
      .toLowerCase()
      .replace(/[^\w\s,áéíóúñ]/g, '') // Remover puntuación excepto comas
      .trim();

    // Dividir por comas y limpiar cada género
    const genres = cleanResponse
      .split(',')
      .map(genre => genre.trim())
      .filter(genre => genre.length > 0)
      .slice(0, 3); // Máximo 3 géneros

    // Validar que los géneros son válidos
    const validGenres = validateGenres(genres);
    
    if (validGenres.length === 0) {
      throw new Error('No se encontraron géneros válidos en la respuesta');
    }

    return validGenres;

  } catch (error) {
    console.warn('⚠️ Error procesando respuesta de IA:', error);
    throw error;
  }
}

/**
 * Validar y normalizar géneros
 */
function validateGenres(genres: string[]): string[] {
  const validGenreMap: { [key: string]: string } = {
    'accion': 'acción',
    'acción': 'acción',
    'action': 'acción',
    'aventura': 'aventura',
    'adventure': 'aventura',
    'animacion': 'animación',
    'animación': 'animación',
    'animation': 'animación',
    'comedia': 'comedia',
    'comedy': 'comedia',
    'crimen': 'crimen',
    'crime': 'crimen',
    'documental': 'documental',
    'documentary': 'documental',
    'drama': 'drama',
    'familia': 'familia',
    'family': 'familia',
    'fantasia': 'fantasía',
    'fantasía': 'fantasía',
    'fantasy': 'fantasía',
    'historia': 'historia',
    'history': 'historia',
    'terror': 'terror',
    'horror': 'terror',
    'musica': 'música',
    'música': 'música',
    'music': 'música',
    'misterio': 'misterio',
    'mystery': 'misterio',
    'romance': 'romance',
    'ciencia ficcion': 'ciencia ficción',
    'ciencia ficción': 'ciencia ficción',
    'science fiction': 'ciencia ficción',
    'sci-fi': 'ciencia ficción',
    'thriller': 'thriller',
    'suspense': 'thriller',
    'guerra': 'guerra',
    'war': 'guerra',
    'western': 'western',
  };

  return genres
    .map(genre => validGenreMap[genre.toLowerCase()])
    .filter(genre => genre !== undefined)
    .slice(0, 3);
}

/**
 * Recomendaciones por defecto basadas en análisis simple del texto
 */
function getFallbackRecommendations(userText: string): string[] {
  const text = userText.toLowerCase();
  
  // Análisis de sentimientos básico por palabras clave
  if (text.includes('triste') || text.includes('deprimido') || text.includes('mal')) {
    return ['comedia', 'animación', 'familia'];
  }
  
  if (text.includes('emocion') || text.includes('adrenalina') || text.includes('accion')) {
    return ['acción', 'thriller', 'aventura'];
  }
  
  if (text.includes('amor') || text.includes('romantico') || text.includes('pareja')) {
    return ['romance', 'drama', 'comedia'];
  }
  
  if (text.includes('miedo') || text.includes('susto') || text.includes('terror')) {
    return ['terror', 'thriller', 'misterio'];
  }
  
  if (text.includes('risa') || text.includes('divertido') || text.includes('gracioso')) {
    return ['comedia', 'animación', 'aventura'];
  }
  
  if (text.includes('pensar') || text.includes('reflexionar') || text.includes('profundo')) {
    return ['drama', 'ciencia ficción', 'documental'];
  }
  
  // Recomendación por defecto
  return ['drama', 'comedia', 'acción'];
}