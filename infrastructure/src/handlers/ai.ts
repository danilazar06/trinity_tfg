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

interface TriniResponse {
  chatResponse: string;
  recommendedGenres: string[];
}

// ============================================
// TRINI - System Prompt con Personalidad
// ============================================
const TRINI_SYSTEM_PROMPT = `Eres Trini, una experta en cine, empática y cercana (como una hermana mayor). 
Has iniciado la conversación preguntando "Hola, soy Trini. ¿Qué te apetece ver hoy?".

Tu objetivo es recomendar cine terapéutico según el ánimo del usuario:
- CATARSIS: Películas que ayudan a procesar emociones difíciles (dramas, películas emotivas)
- EVASIÓN: Películas que distraen y alegran (comedias, aventuras, animación)
- CONFRONTACIÓN: Películas que abordan directamente el tema que preocupa al usuario

Si detectas temas sensibles (bullying, depresión, ansiedad, soledad), sé especialmente cuidadosa, validante y constructiva.
Nunca minimices los sentimientos del usuario. Muestra empatía genuina.

GÉNEROS DISPONIBLES: acción, aventura, animación, comedia, crimen, documental, drama, familia, fantasía, historia, terror, música, misterio, romance, ciencia ficción, thriller, guerra, western

IMPORTANTE: Tu respuesta debe ser ÚNICAMENTE un objeto JSON válido con esta estructura estricta:
{ "chatResponse": "Tu mensaje de texto empático aquí", "recommendedGenres": ["género1", "género2", "género3"] }

No incluyas nada más que el JSON. No uses markdown, comillas triples ni explicaciones adicionales.`;

/**
 * AIHandler: Chat Contextual con Trini (Salamandra)
 * Integración con Hugging Face Inference API usando el modelo Salamandra-7b-instruct
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🤖 Trini AI Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;

  try {
    switch (fieldName) {
      case 'getChatRecommendations':
        return await getTriniRecommendations(args.text);
      
      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Obtener recomendaciones de Trini basadas en texto del usuario
 */
async function getTriniRecommendations(userText: string): Promise<TriniResponse> {
  console.log(`🧠 Trini analizando: "${userText}"`);

  try {
    // 1. Construir prompt con personalidad de Trini
    const prompt = buildTriniPrompt(userText);
    
    // 2. Llamar a Hugging Face Inference API
    const aiResponse = await callSalamandraAPI(prompt);
    
    // 3. Procesar respuesta y extraer JSON de Trini
    const triniResponse = parseTriniResponse(aiResponse, userText);
    
    console.log(`✅ Trini responde: "${triniResponse.chatResponse.substring(0, 50)}..."`);
    return triniResponse;

  } catch (error) {
    console.warn('⚠️ Error en Salamandra, usando fallback de Trini:', error);
    return getTriniFallbackResponse(userText);
  }
}

/**
 * Construir prompt con la personalidad de Trini
 */
function buildTriniPrompt(userText: string): string {
  return `${TRINI_SYSTEM_PROMPT}

Usuario: "${userText}"

Respuesta JSON:`;
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
      max_new_tokens: 200,
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
        'User-Agent': 'Trinity-Trini/1.0',
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
  
  console.log(`🤖 Salamandra raw response: "${generatedText}"`);
  return generatedText;
}

/**
 * Parsear respuesta de Salamandra y extraer JSON de Trini
 */
function parseTriniResponse(aiResponse: string, originalText: string): TriniResponse {
  try {
    // Intentar extraer JSON de la respuesta
    const jsonMatch = aiResponse.match(/\{[\s\S]*?"chatResponse"[\s\S]*?"recommendedGenres"[\s\S]*?\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.chatResponse && Array.isArray(parsed.recommendedGenres)) {
        // Validar y normalizar géneros
        const validGenres = validateGenres(parsed.recommendedGenres);
        
        return {
          chatResponse: parsed.chatResponse,
          recommendedGenres: validGenres.length > 0 ? validGenres : getDefaultGenresForMood(originalText),
        };
      }
    }
    
    throw new Error('JSON inválido en respuesta de Salamandra');
  } catch (error) {
    console.warn('⚠️ Error parseando respuesta de Trini:', error);
    return getTriniFallbackResponse(originalText);
  }
}

/**
 * Validar y normalizar géneros cinematográficos
 */
function validateGenres(genres: string[]): string[] {
  const validGenreMap: { [key: string]: string } = {
    'accion': 'acción', 'acción': 'acción', 'action': 'acción',
    'aventura': 'aventura', 'adventure': 'aventura',
    'animacion': 'animación', 'animación': 'animación', 'animation': 'animación',
    'comedia': 'comedia', 'comedy': 'comedia',
    'crimen': 'crimen', 'crime': 'crimen',
    'documental': 'documental', 'documentary': 'documental',
    'drama': 'drama',
    'familia': 'familia', 'family': 'familia',
    'fantasia': 'fantasía', 'fantasía': 'fantasía', 'fantasy': 'fantasía',
    'historia': 'historia', 'history': 'historia',
    'terror': 'terror', 'horror': 'terror',
    'musica': 'música', 'música': 'música', 'music': 'música',
    'misterio': 'misterio', 'mystery': 'misterio',
    'romance': 'romance',
    'ciencia ficcion': 'ciencia ficción', 'ciencia ficción': 'ciencia ficción',
    'science fiction': 'ciencia ficción', 'sci-fi': 'ciencia ficción',
    'thriller': 'thriller', 'suspense': 'thriller',
    'guerra': 'guerra', 'war': 'guerra',
    'western': 'western',
  };

  return genres
    .map(genre => validGenreMap[genre.toLowerCase().trim()])
    .filter(genre => genre !== undefined)
    .slice(0, 3);
}

/**
 * Respuesta de fallback empática de Trini
 */
function getTriniFallbackResponse(userText: string): TriniResponse {
  const text = userText.toLowerCase();
  const emotionalState = detectEmotionalState(text);
  
  const responses: { [key: string]: TriniResponse } = {
    sad: {
      chatResponse: "Entiendo cómo te sientes, y está bien sentirse así a veces. Te propongo algo: ¿qué tal si vemos algo que te ayude a soltar esas emociones? A veces un buen drama nos permite conectar con lo que sentimos, o si prefieres, una comedia ligera para desconectar un poco. Tú decides qué necesitas ahora.",
      recommendedGenres: ['drama', 'comedia', 'animación'],
    },
    stressed: {
      chatResponse: "Vaya, parece que has tenido días intensos. Lo primero: respira. Ahora, déjame ayudarte a desconectar. Te recomiendo algo ligero y entretenido que te saque de la rutina por un rato. ¿Te apetece reír o prefieres una aventura que te transporte a otro mundo?",
      recommendedGenres: ['comedia', 'animación', 'aventura'],
    },
    angry: {
      chatResponse: "Entiendo esa frustración, es válido sentirse así. A veces necesitamos canalizar esa energía. Te propongo algo con acción que te ayude a liberar tensión, o si prefieres, un thriller que te mantenga enganchado y te haga olvidar por un rato lo que te molesta.",
      recommendedGenres: ['acción', 'thriller', 'drama'],
    },
    lonely: {
      chatResponse: "Oye, que sepas que no estás solo/a en esto. Todos nos sentimos así a veces. Te propongo películas con historias de conexión humana, de esas que te recuerdan lo bonito de las relaciones. ¿Qué te parece algo emotivo o quizás una comedia romántica?",
      recommendedGenres: ['romance', 'drama', 'comedia'],
    },
    anxious: {
      chatResponse: "Tranquilo/a, estoy aquí para ayudarte. Cuando la ansiedad aprieta, a veces lo mejor es algo que nos calme y nos haga sentir bien. Te recomiendo algo visualmente bonito y reconfortante, sin sobresaltos. ¿Te apetece animación o un documental de naturaleza?",
      recommendedGenres: ['animación', 'documental', 'familia'],
    },
    happy: {
      chatResponse: "¡Qué bien que estés de buen humor! Vamos a mantener esa energía. Te propongo algo divertido y emocionante que potencie esas buenas vibraciones. ¿Aventura, comedia o quizás algo musical?",
      recommendedGenres: ['comedia', 'aventura', 'música'],
    },
    bored: {
      chatResponse: "¡Hora de sacudir ese aburrimiento! Tengo justo lo que necesitas: algo que te enganche desde el primer minuto. ¿Te apetece acción trepidante, un thriller que te mantenga en vilo, o una aventura épica?",
      recommendedGenres: ['acción', 'thriller', 'aventura'],
    },
    default: {
      chatResponse: "Cuéntame más sobre cómo te sientes o qué tipo de experiencia buscas. Mientras tanto, te propongo una selección variada que suele gustar a todo el mundo. ¿Qué te parece empezar por aquí?",
      recommendedGenres: ['drama', 'comedia', 'aventura'],
    },
  };

  return responses[emotionalState] || responses.default;
}

/**
 * Detectar estado emocional del usuario
 */
function detectEmotionalState(text: string): string {
  const emotionKeywords: { [key: string]: string[] } = {
    sad: ['triste', 'deprimido', 'melancólico', 'llorar', 'pena', 'dolor', 'mal', 'bajón'],
    stressed: ['estresado', 'agobiado', 'presión', 'trabajo', 'cansado', 'exhausto', 'saturado'],
    angry: ['enfadado', 'furioso', 'molesto', 'irritado', 'rabia', 'cabreado', 'frustrado'],
    lonely: ['solo', 'solitario', 'aislado', 'abandonado', 'vacío', 'nadie'],
    anxious: ['ansioso', 'nervioso', 'preocupado', 'inquieto', 'ansiedad', 'miedo'],
    happy: ['feliz', 'alegre', 'contento', 'bien', 'genial', 'celebrar', 'emocionado'],
    bored: ['aburrido', 'nada que hacer', 'sin planes', 'monotonía'],
  };

  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return emotion;
    }
  }

  return 'default';
}

/**
 * Obtener géneros por defecto según el estado de ánimo
 */
function getDefaultGenresForMood(text: string): string[] {
  const state = detectEmotionalState(text.toLowerCase());
  const moodGenres: { [key: string]: string[] } = {
    sad: ['drama', 'comedia', 'animación'],
    stressed: ['comedia', 'animación', 'aventura'],
    angry: ['acción', 'thriller', 'drama'],
    lonely: ['romance', 'drama', 'comedia'],
    anxious: ['animación', 'documental', 'familia'],
    happy: ['comedia', 'aventura', 'música'],
    bored: ['acción', 'thriller', 'aventura'],
    default: ['drama', 'comedia', 'aventura'],
  };
  
  return moodGenres[state] || moodGenres.default;
}
