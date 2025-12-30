"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const metrics_1 = require("../utils/metrics");
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
const handler = async (event) => {
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
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        throw error;
    }
};
exports.handler = handler;
/**
 * Obtener recomendaciones de Trini basadas en texto del usuario
 */
async function getTriniRecommendations(userText) {
    const timer = new metrics_1.PerformanceTimer('TriniRecommendations');
    console.log(`🧠 Trini analizando: "${userText}"`);
    try {
        // 1. Construir prompt con personalidad de Trini
        const prompt = buildTriniPrompt(userText);
        // 2. Llamar a Hugging Face Inference API
        const aiResponse = await callSalamandraAPI(prompt);
        // 3. Procesar respuesta y extraer JSON de Trini
        const triniResponse = parseTriniResponse(aiResponse, userText);
        // Log business metric
        (0, metrics_1.logBusinessMetric)('AI_RECOMMENDATION', undefined, undefined, {
            userTextLength: userText.length,
            responseSource: 'salamandra',
            recommendedGenres: triniResponse.recommendedGenres,
            emotionalState: detectEmotionalState(userText.toLowerCase())
        });
        console.log(`✅ Trini responde: "${triniResponse.chatResponse.substring(0, 50)}..."`);
        timer.finish(true, undefined, {
            source: 'salamandra',
            genreCount: triniResponse.recommendedGenres.length
        });
        return triniResponse;
    }
    catch (error) {
        console.warn('⚠️ Error en Salamandra, usando fallback de Trini:', error);
        const fallbackResponse = getTriniFallbackResponse(userText);
        // Log business metric for fallback
        (0, metrics_1.logBusinessMetric)('AI_RECOMMENDATION', undefined, undefined, {
            userTextLength: userText.length,
            responseSource: 'fallback',
            recommendedGenres: fallbackResponse.recommendedGenres,
            emotionalState: detectEmotionalState(userText.toLowerCase()),
            errorType: error.name
        });
        timer.finish(true, 'SalamandraFallback', {
            source: 'fallback',
            genreCount: fallbackResponse.recommendedGenres.length
        });
        return fallbackResponse;
    }
}
/**
 * Construir prompt con la personalidad de Trini
 */
function buildTriniPrompt(userText) {
    return `${TRINI_SYSTEM_PROMPT}

Usuario: "${userText}"

Respuesta JSON:`;
}
/**
 * Llamar a la API de Hugging Face con Salamandra
 */
async function callSalamandraAPI(prompt) {
    const apiToken = process.env.HF_API_TOKEN;
    if (!apiToken) {
        throw new Error('HF_API_TOKEN no configurado');
    }
    const requestBody = {
        inputs: prompt,
        parameters: {
            max_new_tokens: 200,
            temperature: 0.7,
            top_p: 0.9,
            do_sample: true,
        },
    };
    const response = await (0, node_fetch_1.default)('https://api-inference.huggingface.co/models/BSC-LT/salamandra-7b-instruct', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Trinity-Trini/1.0',
        },
        body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face API error: ${response.status} ${errorText}`);
    }
    const data = await response.json();
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
function parseTriniResponse(aiResponse, originalText) {
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
    }
    catch (error) {
        console.warn('⚠️ Error parseando respuesta de Trini:', error);
        return getTriniFallbackResponse(originalText);
    }
}
/**
 * Validar y normalizar géneros cinematográficos
 */
function validateGenres(genres) {
    const validGenreMap = {
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
function getTriniFallbackResponse(userText) {
    const text = userText.toLowerCase();
    const emotionalState = detectEmotionalState(text);
    const responses = {
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
function detectEmotionalState(text) {
    const emotionKeywords = {
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
function getDefaultGenresForMood(text) {
    const state = detectEmotionalState(text.toLowerCase());
    const moodGenres = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSw0REFBK0I7QUFDL0IsOENBQWlGO0FBc0JqRiwrQ0FBK0M7QUFDL0MseUNBQXlDO0FBQ3pDLCtDQUErQztBQUMvQyxNQUFNLG1CQUFtQixHQUFHOzs7Ozs7Ozs7Ozs7Ozs7O21HQWdCdUUsQ0FBQztBQUVwRzs7O0dBR0c7QUFDSSxNQUFNLE9BQU8sR0FBcUMsS0FBSyxFQUFFLEtBQWdDLEVBQUUsRUFBRTtJQUNsRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXBFLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDO0lBQ3hDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7SUFFN0IsSUFBSTtRQUNGLFFBQVEsU0FBUyxFQUFFO1lBQ2pCLEtBQUssd0JBQXdCO2dCQUMzQixPQUFPLE1BQU0sdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWxEO2dCQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFNBQVMsRUFBRSxDQUFDLENBQUM7U0FDM0Q7S0FDRjtJQUFDLE9BQU8sS0FBSyxFQUFFO1FBQ2QsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sS0FBSyxDQUFDO0tBQ2I7QUFDSCxDQUFDLENBQUM7QUFsQlcsUUFBQSxPQUFPLFdBa0JsQjtBQUVGOztHQUVHO0FBQ0gsS0FBSyxVQUFVLHVCQUF1QixDQUFDLFFBQWdCO0lBQ3JELE1BQU0sS0FBSyxHQUFHLElBQUksMEJBQWdCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUMzRCxPQUFPLENBQUMsR0FBRyxDQUFD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LENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUU7WUFDcEQsT0FBTyxPQUFPLENBQUM7U0FDaEI7S0FDRjtJQUVELE9BQU8sU0FBUyxDQUFDO0FBQ25CLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsdUJBQXVCLENBQUMsSUFBWTtJQUMzQyxNQUFNLEtBQUssR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUN2RCxNQUFNLFVBQVUsR0FBZ0M7UUFDOUMsR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUM7UUFDdEMsUUFBUSxFQUFFLENBQUMsU0FBUyxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUM7UUFDOUMsS0FBSyxFQUFFLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUM7UUFDdEMsTUFBTSxFQUFFLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUM7UUFDdkMsT0FBTyxFQUFFLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxTQUFTLENBQUM7UUFDL0MsS0FBSyxFQUFFLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUM7UUFDeEMsS0FBSyxFQUFFLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxVQUFVLENBQUM7UUFDekMsT0FBTyxFQUFFLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLENBQUM7S0FDMUMsQ0FBQztJQUVGLE9BQU8sVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUM7QUFDakQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcFN5bmNSZXNvbHZlckV2ZW50LCBBcHBTeW5jUmVzb2x2ZXJIYW5kbGVyIH0gZnJvbSAnYXdzLWxhbWJkYSc7XHJcbmltcG9ydCBmZXRjaCBmcm9tICdub2RlLWZldGNoJztcclxuaW1wb3J0IHsgbG9nQnVzaW5lc3NNZXRyaWMsIGxvZ0Vycm9yLCBQZXJmb3JtYW5jZVRpbWVyIH0gZnJvbSAnLi4vdXRpbHMvbWV0cmljcyc7XHJcblxyXG5pbnRlcmZhY2UgU2FsYW1hbmRyYVJlcXVlc3Qge1xyXG4gIGlucHV0czogc3RyaW5nO1xyXG4gIHBhcmFtZXRlcnM/OiB7XHJcbiAgICBtYXhfbmV3X3Rva2Vucz86IG51bWJlcjtcclxuICAgIHRlbXBlcmF0dXJlPzogbnVtYmVyO1xyXG4gICAgdG9wX3A/OiBudW1iZXI7XHJcbiAgICBkb19zYW1wbGU/OiBib29sZWFuO1xyXG4gIH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBTYWxhbWFuZHJhUmVzcG9uc2Uge1xyXG4gIGdlbmVyYXRlZF90ZXh0Pzogc3RyaW5nO1xyXG4gIGVycm9yPzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVHJpbmlSZXNwb25zZSB7XHJcbiAgY2hhdFJlc3BvbnNlOiBzdHJpbmc7XHJcbiAgcmVjb21tZW5kZWRHZW5yZXM6IHN0cmluZ1tdO1xyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBUUklOSSAtIFN5c3RlbSBQcm9tcHQgY29uIFBlcnNvbmFsaWRhZFxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5jb25zdCBUUklOSV9TWVNURU1fUFJPTVBUID0gYEVyZXMgVHJpbmksIHVuYSBleHBlcnRhIGVuIGNpbmUsIGVtcMOhdGljYSB5IGNlcmNhbmEgKGNvbW8gdW5hIGhlcm1hbmEgbWF5b3IpLiBcclxuSGFzIGluaWNpYWRvIGxhIGNvbnZlcnNhY2nDs24gcHJlZ3VudGFuZG8gXCJIb2xhLCBzb3kgVHJpbmkuIMK/UXXDqSB0ZSBhcGV0ZWNlIHZlciBob3k/XCIuXHJcblxyXG5UdSBvYmpldGl2byBlcyByZWNvbWVuZGFyIGNpbmUgdGVyYXDDqXV0aWNvIHNlZ8O6biBlbCDDoW5pbW8gZGVsIHVzdWFyaW86XHJcbi0gQ0FUQVJTSVM6IFBlbMOtY3VsYXMgcXVlIGF5dWRhbiBhIHByb2Nlc2FyIGVtb2Npb25lcyBkaWbDrWNpbGVzIChkcmFtYXMsIHBlbMOtY3VsYXMgZW1vdGl2YXMpXHJcbi0gRVZBU0nDk046IFBlbMOtY3VsYXMgcXVlIGRpc3RyYWVuIHkgYWxlZ3JhbiAoY29tZWRpYXMsIGF2ZW50dXJhcywgYW5pbWFjacOzbilcclxuLSBDT05GUk9OVEFDScOTTjogUGVsw61jdWxhcyBxdWUgYWJvcmRhbiBkaXJlY3RhbWVudGUgZWwgdGVtYSBxdWUgcHJlb2N1cGEgYWwgdXN1YXJpb1xyXG5cclxuU2kgZGV0ZWN0YXMgdGVtYXMgc2Vuc2libGVzIChidWxseWluZywgZGVwcmVzacOzbiwgYW5zaWVkYWQsIHNvbGVkYWQpLCBzw6kgZXNwZWNpYWxtZW50ZSBjdWlkYWRvc2EsIHZhbGlkYW50ZSB5IGNvbnN0cnVjdGl2YS5cclxuTnVuY2EgbWluaW1pY2VzIGxvcyBzZW50aW1pZW50b3MgZGVsIHVzdWFyaW8uIE11ZXN0cmEgZW1wYXTDrWEgZ2VudWluYS5cclxuXHJcbkfDiU5FUk9TIERJU1BPTklCTEVTOiBhY2Npw7NuLCBhdmVudHVyYSwgYW5pbWFjacOzbiwgY29tZWRpYSwgY3JpbWVuLCBkb2N1bWVudGFsLCBkcmFtYSwgZmFtaWxpYSwgZmFudGFzw61hLCBoaXN0b3JpYSwgdGVycm9yLCBtw7pzaWNhLCBtaXN0ZXJpbywgcm9tYW5jZSwgY2llbmNpYSBmaWNjacOzbiwgdGhyaWxsZXIsIGd1ZXJyYSwgd2VzdGVyblxyXG5cclxuSU1QT1JUQU5URTogVHUgcmVzcHVlc3RhIGRlYmUgc2VyIMOaTklDQU1FTlRFIHVuIG9iamV0byBKU09OIHbDoWxpZG8gY29uIGVzdGEgZXN0cnVjdHVyYSBlc3RyaWN0YTpcclxueyBcImNoYXRSZXNwb25zZVwiOiBcIlR1IG1lbnNhamUgZGUgdGV4dG8gZW1ww6F0aWNvIGFxdcOtXCIsIFwicmVjb21tZW5kZWRHZW5yZXNcIjogW1wiZ8OpbmVybzFcIiwgXCJnw6luZXJvMlwiLCBcImfDqW5lcm8zXCJdIH1cclxuXHJcbk5vIGluY2x1eWFzIG5hZGEgbcOhcyBxdWUgZWwgSlNPTi4gTm8gdXNlcyBtYXJrZG93biwgY29taWxsYXMgdHJpcGxlcyBuaSBleHBsaWNhY2lvbmVzIGFkaWNpb25hbGVzLmA7XHJcblxyXG4vKipcclxuICogQUlIYW5kbGVyOiBDaGF0IENvbnRleHR1YWwgY29uIFRyaW5pIChTYWxhbWFuZHJhKVxyXG4gKiBJbnRlZ3JhY2nDs24gY29uIEh1Z2dpbmcgRmFjZSBJbmZlcmVuY2UgQVBJIHVzYW5kbyBlbCBtb2RlbG8gU2FsYW1hbmRyYS03Yi1pbnN0cnVjdFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFwcFN5bmNSZXNvbHZlckhhbmRsZXI8YW55LCBhbnk+ID0gYXN5bmMgKGV2ZW50OiBBcHBTeW5jUmVzb2x2ZXJFdmVudDxhbnk+KSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ/CfpJYgVHJpbmkgQUkgSGFuZGxlcjonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG5cclxuICBjb25zdCBmaWVsZE5hbWUgPSBldmVudC5pbmZvPy5maWVsZE5hbWU7XHJcbiAgY29uc3QgYXJncyA9IGV2ZW50LmFyZ3VtZW50cztcclxuXHJcbiAgdHJ5IHtcclxuICAgIHN3aXRjaCAoZmllbGROYW1lKSB7XHJcbiAgICAgIGNhc2UgJ2dldENoYXRSZWNvbW1lbmRhdGlvbnMnOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRUcmluaVJlY29tbWVuZGF0aW9ucyhhcmdzLnRleHQpO1xyXG4gICAgICBcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhY2nDs24gbm8gc29wb3J0YWRhOiAke2ZpZWxkTmFtZX1gKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGVuICR7ZmllbGROYW1lfTpgLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogT2J0ZW5lciByZWNvbWVuZGFjaW9uZXMgZGUgVHJpbmkgYmFzYWRhcyBlbiB0ZXh0byBkZWwgdXN1YXJpb1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0VHJpbmlSZWNvbW1lbmRhdGlvbnModXNlclRleHQ6IHN0cmluZyk6IFByb21pc2U8VHJpbmlSZXNwb25zZT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ1RyaW5pUmVjb21tZW5kYXRpb25zJyk7XHJcbiAgY29uc29sZS5sb2coYPCfp6AgVHJpbmkgYW5hbGl6YW5kbzogXCIke3VzZXJUZXh0fVwiYCk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyAxLiBDb25zdHJ1aXIgcHJvbXB0IGNvbiBwZXJzb25hbGlkYWQgZGUgVHJpbmlcclxuICAgIGNvbnN0IHByb21wdCA9IGJ1aWxkVHJpbmlQcm9tcHQodXNlclRleHQpO1xyXG4gICAgXHJcbiAgICAvLyAyLiBMbGFtYXIgYSBIdWdnaW5nIEZhY2UgSW5mZXJlbmNlIEFQSVxyXG4gICAgY29uc3QgYWlSZXNwb25zZSA9IGF3YWl0IGNhbGxTYWxhbWFuZHJhQVBJKHByb21wdCk7XHJcbiAgICBcclxuICAgIC8vIDMuIFByb2Nlc2FyIHJlc3B1ZXN0YSB5IGV4dHJhZXIgSlNPTiBkZSBUcmluaVxyXG4gICAgY29uc3QgdHJpbmlSZXNwb25zZSA9IHBhcnNlVHJpbmlSZXNwb25zZShhaVJlc3BvbnNlLCB1c2VyVGV4dCk7XHJcbiAgICBcclxuICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWNcclxuICAgIGxvZ0J1c2luZXNzTWV0cmljKCdBSV9SRUNPTU1FTkRBVElPTicsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7XHJcbiAgICAgIHVzZXJUZXh0TGVuZ3RoOiB1c2VyVGV4dC5sZW5ndGgsXHJcbiAgICAgIHJlc3BvbnNlU291cmNlOiAnc2FsYW1hbmRyYScsXHJcbiAgICAgIHJlY29tbWVuZGVkR2VucmVzOiB0cmluaVJlc3BvbnNlLnJlY29tbWVuZGVkR2VucmVzLFxyXG4gICAgICBlbW90aW9uYWxTdGF0ZTogZGV0ZWN0RW1vdGlvbmFsU3RhdGUodXNlclRleHQudG9Mb3dlckNhc2UoKSlcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFRyaW5pIHJlc3BvbmRlOiBcIiR7dHJpbmlSZXNwb25zZS5jaGF0UmVzcG9uc2Uuc3Vic3RyaW5nKDAsIDUwKX0uLi5cImApO1xyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyBcclxuICAgICAgc291cmNlOiAnc2FsYW1hbmRyYScsXHJcbiAgICAgIGdlbnJlQ291bnQ6IHRyaW5pUmVzcG9uc2UucmVjb21tZW5kZWRHZW5yZXMubGVuZ3RoIFxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdHJpbmlSZXNwb25zZTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIGVuIFNhbGFtYW5kcmEsIHVzYW5kbyBmYWxsYmFjayBkZSBUcmluaTonLCBlcnJvcik7XHJcbiAgICBcclxuICAgIGNvbnN0IGZhbGxiYWNrUmVzcG9uc2UgPSBnZXRUcmluaUZhbGxiYWNrUmVzcG9uc2UodXNlclRleHQpO1xyXG4gICAgXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljIGZvciBmYWxsYmFja1xyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ0FJX1JFQ09NTUVOREFUSU9OJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHtcclxuICAgICAgdXNlclRleHRMZW5ndGg6IHVzZXJUZXh0Lmxlbmd0aCxcclxuICAgICAgcmVzcG9uc2VTb3VyY2U6ICdmYWxsYmFjaycsXHJcbiAgICAgIHJlY29tbWVuZGVkR2VucmVzOiBmYWxsYmFja1Jlc3BvbnNlLnJlY29tbWVuZGVkR2VucmVzLFxyXG4gICAgICBlbW90aW9uYWxTdGF0ZTogZGV0ZWN0RW1vdGlvbmFsU3RhdGUodXNlclRleHQudG9Mb3dlckNhc2UoKSksXHJcbiAgICAgIGVycm9yVHlwZTogKGVycm9yIGFzIEVycm9yKS5uYW1lXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgdGltZXIuZmluaXNoKHRydWUsICdTYWxhbWFuZHJhRmFsbGJhY2snLCB7IFxyXG4gICAgICBzb3VyY2U6ICdmYWxsYmFjaycsXHJcbiAgICAgIGdlbnJlQ291bnQ6IGZhbGxiYWNrUmVzcG9uc2UucmVjb21tZW5kZWRHZW5yZXMubGVuZ3RoIFxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gZmFsbGJhY2tSZXNwb25zZTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb25zdHJ1aXIgcHJvbXB0IGNvbiBsYSBwZXJzb25hbGlkYWQgZGUgVHJpbmlcclxuICovXHJcbmZ1bmN0aW9uIGJ1aWxkVHJpbmlQcm9tcHQodXNlclRleHQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIGAke1RSSU5JX1NZU1RFTV9QUk9NUFR9XHJcblxyXG5Vc3VhcmlvOiBcIiR7dXNlclRleHR9XCJcclxuXHJcblJlc3B1ZXN0YSBKU09OOmA7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBMbGFtYXIgYSBsYSBBUEkgZGUgSHVnZ2luZyBGYWNlIGNvbiBTYWxhbWFuZHJhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBjYWxsU2FsYW1hbmRyYUFQSShwcm9tcHQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgY29uc3QgYXBpVG9rZW4gPSBwcm9jZXNzLmVudi5IRl9BUElfVE9LRU47XHJcbiAgaWYgKCFhcGlUb2tlbikge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdIRl9BUElfVE9LRU4gbm8gY29uZmlndXJhZG8nKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHJlcXVlc3RCb2R5OiBTYWxhbWFuZHJhUmVxdWVzdCA9IHtcclxuICAgIGlucHV0czogcHJvbXB0LFxyXG4gICAgcGFyYW1ldGVyczoge1xyXG4gICAgICBtYXhfbmV3X3Rva2VuczogMjAwLFxyXG4gICAgICB0ZW1wZXJhdHVyZTogMC43LFxyXG4gICAgICB0b3BfcDogMC45LFxyXG4gICAgICBkb19zYW1wbGU6IHRydWUsXHJcbiAgICB9LFxyXG4gIH07XHJcblxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goXHJcbiAgICAnaHR0cHM6Ly9hcGktaW5mZXJlbmNlLmh1Z2dpbmdmYWNlLmNvL21vZGVscy9CU0MtTFQvc2FsYW1hbmRyYS03Yi1pbnN0cnVjdCcsXHJcbiAgICB7XHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7YXBpVG9rZW59YCxcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktVHJpbmkvMS4wJyxcclxuICAgICAgfSxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdEJvZHkpLFxyXG4gICAgfVxyXG4gICk7XHJcblxyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcclxuICAgIHRocm93IG5ldyBFcnJvcihgSHVnZ2luZyBGYWNlIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7ZXJyb3JUZXh0fWApO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBTYWxhbWFuZHJhUmVzcG9uc2VbXTtcclxuICBcclxuICBpZiAoIWRhdGEgfHwgIUFycmF5LmlzQXJyYXkoZGF0YSkgfHwgZGF0YS5sZW5ndGggPT09IDApIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignUmVzcHVlc3RhIGludsOhbGlkYSBkZSBIdWdnaW5nIEZhY2UgQVBJJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCByZXN1bHQgPSBkYXRhWzBdO1xyXG4gIGlmIChyZXN1bHQuZXJyb3IpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgU2FsYW1hbmRyYSBlcnJvcjogJHtyZXN1bHQuZXJyb3J9YCk7XHJcbiAgfVxyXG5cclxuICBpZiAoIXJlc3VsdC5nZW5lcmF0ZWRfdGV4dCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBzZSBnZW5lcsOzIHRleHRvIGRlIHJlc3B1ZXN0YScpO1xyXG4gIH1cclxuXHJcbiAgLy8gRXh0cmFlciBzb2xvIGxhIHBhcnRlIG51ZXZhIGRlbCB0ZXh0byBnZW5lcmFkbyAoZGVzcHXDqXMgZGVsIHByb21wdClcclxuICBjb25zdCBnZW5lcmF0ZWRUZXh0ID0gcmVzdWx0LmdlbmVyYXRlZF90ZXh0LnJlcGxhY2UocHJvbXB0LCAnJykudHJpbSgpO1xyXG4gIFxyXG4gIGNvbnNvbGUubG9nKGDwn6SWIFNhbGFtYW5kcmEgcmF3IHJlc3BvbnNlOiBcIiR7Z2VuZXJhdGVkVGV4dH1cImApO1xyXG4gIHJldHVybiBnZW5lcmF0ZWRUZXh0O1xyXG59XHJcblxyXG4vKipcclxuICogUGFyc2VhciByZXNwdWVzdGEgZGUgU2FsYW1hbmRyYSB5IGV4dHJhZXIgSlNPTiBkZSBUcmluaVxyXG4gKi9cclxuZnVuY3Rpb24gcGFyc2VUcmluaVJlc3BvbnNlKGFpUmVzcG9uc2U6IHN0cmluZywgb3JpZ2luYWxUZXh0OiBzdHJpbmcpOiBUcmluaVJlc3BvbnNlIHtcclxuICB0cnkge1xyXG4gICAgLy8gSW50ZW50YXIgZXh0cmFlciBKU09OIGRlIGxhIHJlc3B1ZXN0YVxyXG4gICAgY29uc3QganNvbk1hdGNoID0gYWlSZXNwb25zZS5tYXRjaCgvXFx7W1xcc1xcU10qP1wiY2hhdFJlc3BvbnNlXCJbXFxzXFxTXSo/XCJyZWNvbW1lbmRlZEdlbnJlc1wiW1xcc1xcU10qP1xcfS8pO1xyXG4gICAgXHJcbiAgICBpZiAoanNvbk1hdGNoKSB7XHJcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvbk1hdGNoWzBdKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChwYXJzZWQuY2hhdFJlc3BvbnNlICYmIEFycmF5LmlzQXJyYXkocGFyc2VkLnJlY29tbWVuZGVkR2VucmVzKSkge1xyXG4gICAgICAgIC8vIFZhbGlkYXIgeSBub3JtYWxpemFyIGfDqW5lcm9zXHJcbiAgICAgICAgY29uc3QgdmFsaWRHZW5yZXMgPSB2YWxpZGF0ZUdlbnJlcyhwYXJzZWQucmVjb21tZW5kZWRHZW5yZXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBjaGF0UmVzcG9uc2U6IHBhcnNlZC5jaGF0UmVzcG9uc2UsXHJcbiAgICAgICAgICByZWNvbW1lbmRlZEdlbnJlczogdmFsaWRHZW5yZXMubGVuZ3RoID4gMCA/IHZhbGlkR2VucmVzIDogZ2V0RGVmYXVsdEdlbnJlc0Zvck1vb2Qob3JpZ2luYWxUZXh0KSxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcignSlNPTiBpbnbDoWxpZG8gZW4gcmVzcHVlc3RhIGRlIFNhbGFtYW5kcmEnKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgcGFyc2VhbmRvIHJlc3B1ZXN0YSBkZSBUcmluaTonLCBlcnJvcik7XHJcbiAgICByZXR1cm4gZ2V0VHJpbmlGYWxsYmFja1Jlc3BvbnNlKG9yaWdpbmFsVGV4dCk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVmFsaWRhciB5IG5vcm1hbGl6YXIgZ8OpbmVyb3MgY2luZW1hdG9ncsOhZmljb3NcclxuICovXHJcbmZ1bmN0aW9uIHZhbGlkYXRlR2VucmVzKGdlbnJlczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XHJcbiAgY29uc3QgdmFsaWRHZW5yZU1hcDogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcclxuICAgICdhY2Npb24nOiAnYWNjacOzbicsICdhY2Npw7NuJzogJ2FjY2nDs24nLCAnYWN0aW9uJzogJ2FjY2nDs24nLFxyXG4gICAgJ2F2ZW50dXJhJzogJ2F2ZW50dXJhJywgJ2FkdmVudHVyZSc6ICdhdmVudHVyYScsXHJcbiAgICAnYW5pbWFjaW9uJzogJ2FuaW1hY2nDs24nLCAnYW5pbWFjacOzbic6ICdhbmltYWNpw7NuJywgJ2FuaW1hdGlvbic6ICdhbmltYWNpw7NuJyxcclxuICAgICdjb21lZGlhJzogJ2NvbWVkaWEnLCAnY29tZWR5JzogJ2NvbWVkaWEnLFxyXG4gICAgJ2NyaW1lbic6ICdjcmltZW4nLCAnY3JpbWUnOiAnY3JpbWVuJyxcclxuICAgICdkb2N1bWVudGFsJzogJ2RvY3VtZW50YWwnLCAnZG9jdW1lbnRhcnknOiAnZG9jdW1lbnRhbCcsXHJcbiAgICAnZHJhbWEnOiAnZHJhbWEnLFxyXG4gICAgJ2ZhbWlsaWEnOiAnZmFtaWxpYScsICdmYW1pbHknOiAnZmFtaWxpYScsXHJcbiAgICAnZmFudGFzaWEnOiAnZmFudGFzw61hJywgJ2ZhbnRhc8OtYSc6ICdmYW50YXPDrWEnLCAnZmFudGFzeSc6ICdmYW50YXPDrWEnLFxyXG4gICAgJ2hpc3RvcmlhJzogJ2hpc3RvcmlhJywgJ2hpc3RvcnknOiAnaGlzdG9yaWEnLFxyXG4gICAgJ3RlcnJvcic6ICd0ZXJyb3InLCAnaG9ycm9yJzogJ3RlcnJvcicsXHJcbiAgICAnbXVzaWNhJzogJ23DunNpY2EnLCAnbcO6c2ljYSc6ICdtw7pzaWNhJywgJ211c2ljJzogJ23DunNpY2EnLFxyXG4gICAgJ21pc3RlcmlvJzogJ21pc3RlcmlvJywgJ215c3RlcnknOiAnbWlzdGVyaW8nLFxyXG4gICAgJ3JvbWFuY2UnOiAncm9tYW5jZScsXHJcbiAgICAnY2llbmNpYSBmaWNjaW9uJzogJ2NpZW5jaWEgZmljY2nDs24nLCAnY2llbmNpYSBmaWNjacOzbic6ICdjaWVuY2lhIGZpY2Npw7NuJyxcclxuICAgICdzY2llbmNlIGZpY3Rpb24nOiAnY2llbmNpYSBmaWNjacOzbicsICdzY2ktZmknOiAnY2llbmNpYSBmaWNjacOzbicsXHJcbiAgICAndGhyaWxsZXInOiAndGhyaWxsZXInLCAnc3VzcGVuc2UnOiAndGhyaWxsZXInLFxyXG4gICAgJ2d1ZXJyYSc6ICdndWVycmEnLCAnd2FyJzogJ2d1ZXJyYScsXHJcbiAgICAnd2VzdGVybic6ICd3ZXN0ZXJuJyxcclxuICB9O1xyXG5cclxuICByZXR1cm4gZ2VucmVzXHJcbiAgICAubWFwKGdlbnJlID0+IHZhbGlkR2VucmVNYXBbZ2VucmUudG9Mb3dlckNhc2UoKS50cmltKCldKVxyXG4gICAgLmZpbHRlcihnZW5yZSA9PiBnZW5yZSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgLnNsaWNlKDAsIDMpO1xyXG59XHJcblxyXG4vKipcclxuICogUmVzcHVlc3RhIGRlIGZhbGxiYWNrIGVtcMOhdGljYSBkZSBUcmluaVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0VHJpbmlGYWxsYmFja1Jlc3BvbnNlKHVzZXJUZXh0OiBzdHJpbmcpOiBUcmluaVJlc3BvbnNlIHtcclxuICBjb25zdCB0ZXh0ID0gdXNlclRleHQudG9Mb3dlckNhc2UoKTtcclxuICBjb25zdCBlbW90aW9uYWxTdGF0ZSA9IGRldGVjdEVtb3Rpb25hbFN0YXRlKHRleHQpO1xyXG4gIFxyXG4gIGNvbnN0IHJlc3BvbnNlczogeyBba2V5OiBzdHJpbmddOiBUcmluaVJlc3BvbnNlIH0gPSB7XHJcbiAgICBzYWQ6IHtcclxuICAgICAgY2hhdFJlc3BvbnNlOiBcIkVudGllbmRvIGPDs21vIHRlIHNpZW50ZXMsIHkgZXN0w6EgYmllbiBzZW50aXJzZSBhc8OtIGEgdmVjZXMuIFRlIHByb3BvbmdvIGFsZ286IMK/cXXDqSB0YWwgc2kgdmVtb3MgYWxnbyBxdWUgdGUgYXl1ZGUgYSBzb2x0YXIgZXNhcyBlbW9jaW9uZXM/IEEgdmVjZXMgdW4gYnVlbiBkcmFtYSBub3MgcGVybWl0ZSBjb25lY3RhciBjb24gbG8gcXVlIHNlbnRpbW9zLCBvIHNpIHByZWZpZXJlcywgdW5hIGNvbWVkaWEgbGlnZXJhIHBhcmEgZGVzY29uZWN0YXIgdW4gcG9jby4gVMO6IGRlY2lkZXMgcXXDqSBuZWNlc2l0YXMgYWhvcmEuXCIsXHJcbiAgICAgIHJlY29tbWVuZGVkR2VucmVzOiBbJ2RyYW1hJywgJ2NvbWVkaWEnLCAnYW5pbWFjacOzbiddLFxyXG4gICAgfSxcclxuICAgIHN0cmVzc2VkOiB7XHJcbiAgICAgIGNoYXRSZXNwb25zZTogXCJWYXlhLCBwYXJlY2UgcXVlIGhhcyB0ZW5pZG8gZMOtYXMgaW50ZW5zb3MuIExvIHByaW1lcm86IHJlc3BpcmEuIEFob3JhLCBkw6lqYW1lIGF5dWRhcnRlIGEgZGVzY29uZWN0YXIuIFRlIHJlY29taWVuZG8gYWxnbyBsaWdlcm8geSBlbnRyZXRlbmlkbyBxdWUgdGUgc2FxdWUgZGUgbGEgcnV0aW5hIHBvciB1biByYXRvLiDCv1RlIGFwZXRlY2UgcmXDrXIgbyBwcmVmaWVyZXMgdW5hIGF2ZW50dXJhIHF1ZSB0ZSB0cmFuc3BvcnRlIGEgb3RybyBtdW5kbz9cIixcclxuICAgICAgcmVjb21tZW5kZWRHZW5yZXM6IFsnY29tZWRpYScsICdhbmltYWNpw7NuJywgJ2F2ZW50dXJhJ10sXHJcbiAgICB9LFxyXG4gICAgYW5ncnk6IHtcclxuICAgICAgY2hhdFJlc3BvbnNlOiBcIkVudGllbmRvIGVzYSBmcnVzdHJhY2nDs24sIGVzIHbDoWxpZG8gc2VudGlyc2UgYXPDrS4gQSB2ZWNlcyBuZWNlc2l0YW1vcyBjYW5hbGl6YXIgZXNhIGVuZXJnw61hLiBUZSBwcm9wb25nbyBhbGdvIGNvbiBhY2Npw7NuIHF1ZSB0ZSBheXVkZSBhIGxpYmVyYXIgdGVuc2nDs24sIG8gc2kgcHJlZmllcmVzLCB1biB0aHJpbGxlciBxdWUgdGUgbWFudGVuZ2EgZW5nYW5jaGFkbyB5IHRlIGhhZ2Egb2x2aWRhciBwb3IgdW4gcmF0byBsbyBxdWUgdGUgbW9sZXN0YS5cIixcclxuICAgICAgcmVjb21tZW5kZWRHZW5yZXM6IFsnYWNjacOzbicsICd0aHJpbGxlcicsICdkcmFtYSddLFxyXG4gICAgfSxcclxuICAgIGxvbmVseToge1xyXG4gICAgICBjaGF0UmVzcG9uc2U6IFwiT3llLCBxdWUgc2VwYXMgcXVlIG5vIGVzdMOhcyBzb2xvL2EgZW4gZXN0by4gVG9kb3Mgbm9zIHNlbnRpbW9zIGFzw60gYSB2ZWNlcy4gVGUgcHJvcG9uZ28gcGVsw61jdWxhcyBjb24gaGlzdG9yaWFzIGRlIGNvbmV4acOzbiBodW1hbmEsIGRlIGVzYXMgcXVlIHRlIHJlY3VlcmRhbiBsbyBib25pdG8gZGUgbGFzIHJlbGFjaW9uZXMuIMK/UXXDqSB0ZSBwYXJlY2UgYWxnbyBlbW90aXZvIG8gcXVpesOhcyB1bmEgY29tZWRpYSByb23DoW50aWNhP1wiLFxyXG4gICAgICByZWNvbW1lbmRlZEdlbnJlczogWydyb21hbmNlJywgJ2RyYW1hJywgJ2NvbWVkaWEnXSxcclxuICAgIH0sXHJcbiAgICBhbnhpb3VzOiB7XHJcbiAgICAgIGNoYXRSZXNwb25zZTogXCJUcmFucXVpbG8vYSwgZXN0b3kgYXF1w60gcGFyYSBheXVkYXJ0ZS4gQ3VhbmRvIGxhIGFuc2llZGFkIGFwcmlldGEsIGEgdmVjZXMgbG8gbWVqb3IgZXMgYWxnbyBxdWUgbm9zIGNhbG1lIHkgbm9zIGhhZ2Egc2VudGlyIGJpZW4uIFRlIHJlY29taWVuZG8gYWxnbyB2aXN1YWxtZW50ZSBib25pdG8geSByZWNvbmZvcnRhbnRlLCBzaW4gc29icmVzYWx0b3MuIMK/VGUgYXBldGVjZSBhbmltYWNpw7NuIG8gdW4gZG9jdW1lbnRhbCBkZSBuYXR1cmFsZXphP1wiLFxyXG4gICAgICByZWNvbW1lbmRlZEdlbnJlczogWydhbmltYWNpw7NuJywgJ2RvY3VtZW50YWwnLCAnZmFtaWxpYSddLFxyXG4gICAgfSxcclxuICAgIGhhcHB5OiB7XHJcbiAgICAgIGNoYXRSZXNwb25zZTogXCLCoVF1w6kgYmllbiBxdWUgZXN0w6lzIGRlIGJ1ZW4gaHVtb3IhIFZhbW9zIGEgbWFudGVuZXIgZXNhIGVuZXJnw61hLiBUZSBwcm9wb25nbyBhbGdvIGRpdmVydGlkbyB5IGVtb2Npb25hbnRlIHF1ZSBwb3RlbmNpZSBlc2FzIGJ1ZW5hcyB2aWJyYWNpb25lcy4gwr9BdmVudHVyYSwgY29tZWRpYSBvIHF1aXrDoXMgYWxnbyBtdXNpY2FsP1wiLFxyXG4gICAgICByZWNvbW1lbmRlZEdlbnJlczogWydjb21lZGlhJywgJ2F2ZW50dXJhJywgJ23DunNpY2EnXSxcclxuICAgIH0sXHJcbiAgICBib3JlZDoge1xyXG4gICAgICBjaGF0UmVzcG9uc2U6IFwiwqFIb3JhIGRlIHNhY3VkaXIgZXNlIGFidXJyaW1pZW50byEgVGVuZ28ganVzdG8gbG8gcXVlIG5lY2VzaXRhczogYWxnbyBxdWUgdGUgZW5nYW5jaGUgZGVzZGUgZWwgcHJpbWVyIG1pbnV0by4gwr9UZSBhcGV0ZWNlIGFjY2nDs24gdHJlcGlkYW50ZSwgdW4gdGhyaWxsZXIgcXVlIHRlIG1hbnRlbmdhIGVuIHZpbG8sIG8gdW5hIGF2ZW50dXJhIMOpcGljYT9cIixcclxuICAgICAgcmVjb21tZW5kZWRHZW5yZXM6IFsnYWNjacOzbicsICd0aHJpbGxlcicsICdhdmVudHVyYSddLFxyXG4gICAgfSxcclxuICAgIGRlZmF1bHQ6IHtcclxuICAgICAgY2hhdFJlc3BvbnNlOiBcIkN1w6ludGFtZSBtw6FzIHNvYnJlIGPDs21vIHRlIHNpZW50ZXMgbyBxdcOpIHRpcG8gZGUgZXhwZXJpZW5jaWEgYnVzY2FzLiBNaWVudHJhcyB0YW50bywgdGUgcHJvcG9uZ28gdW5hIHNlbGVjY2nDs24gdmFyaWFkYSBxdWUgc3VlbGUgZ3VzdGFyIGEgdG9kbyBlbCBtdW5kby4gwr9RdcOpIHRlIHBhcmVjZSBlbXBlemFyIHBvciBhcXXDrT9cIixcclxuICAgICAgcmVjb21tZW5kZWRHZW5yZXM6IFsnZHJhbWEnLCAnY29tZWRpYScsICdhdmVudHVyYSddLFxyXG4gICAgfSxcclxuICB9O1xyXG5cclxuICByZXR1cm4gcmVzcG9uc2VzW2Vtb3Rpb25hbFN0YXRlXSB8fCByZXNwb25zZXMuZGVmYXVsdDtcclxufVxyXG5cclxuLyoqXHJcbiAqIERldGVjdGFyIGVzdGFkbyBlbW9jaW9uYWwgZGVsIHVzdWFyaW9cclxuICovXHJcbmZ1bmN0aW9uIGRldGVjdEVtb3Rpb25hbFN0YXRlKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgY29uc3QgZW1vdGlvbktleXdvcmRzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZ1tdIH0gPSB7XHJcbiAgICBzYWQ6IFsndHJpc3RlJywgJ2RlcHJpbWlkbycsICdtZWxhbmPDs2xpY28nLCAnbGxvcmFyJywgJ3BlbmEnLCAnZG9sb3InLCAnbWFsJywgJ2JhasOzbiddLFxyXG4gICAgc3RyZXNzZWQ6IFsnZXN0cmVzYWRvJywgJ2Fnb2JpYWRvJywgJ3ByZXNpw7NuJywgJ3RyYWJham8nLCAnY2Fuc2FkbycsICdleGhhdXN0bycsICdzYXR1cmFkbyddLFxyXG4gICAgYW5ncnk6IFsnZW5mYWRhZG8nLCAnZnVyaW9zbycsICdtb2xlc3RvJywgJ2lycml0YWRvJywgJ3JhYmlhJywgJ2NhYnJlYWRvJywgJ2ZydXN0cmFkbyddLFxyXG4gICAgbG9uZWx5OiBbJ3NvbG8nLCAnc29saXRhcmlvJywgJ2Fpc2xhZG8nLCAnYWJhbmRvbmFkbycsICd2YWPDrW8nLCAnbmFkaWUnXSxcclxuICAgIGFueGlvdXM6IFsnYW5zaW9zbycsICduZXJ2aW9zbycsICdwcmVvY3VwYWRvJywgJ2lucXVpZXRvJywgJ2Fuc2llZGFkJywgJ21pZWRvJ10sXHJcbiAgICBoYXBweTogWydmZWxpeicsICdhbGVncmUnLCAnY29udGVudG8nLCAnYmllbicsICdnZW5pYWwnLCAnY2VsZWJyYXInLCAnZW1vY2lvbmFkbyddLFxyXG4gICAgYm9yZWQ6IFsnYWJ1cnJpZG8nLCAnbmFkYSBxdWUgaGFjZXInLCAnc2luIHBsYW5lcycsICdtb25vdG9uw61hJ10sXHJcbiAgfTtcclxuXHJcbiAgZm9yIChjb25zdCBbZW1vdGlvbiwga2V5d29yZHNdIG9mIE9iamVjdC5lbnRyaWVzKGVtb3Rpb25LZXl3b3JkcykpIHtcclxuICAgIGlmIChrZXl3b3Jkcy5zb21lKGtleXdvcmQgPT4gdGV4dC5pbmNsdWRlcyhrZXl3b3JkKSkpIHtcclxuICAgICAgcmV0dXJuIGVtb3Rpb247XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gJ2RlZmF1bHQnO1xyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBnw6luZXJvcyBwb3IgZGVmZWN0byBzZWfDum4gZWwgZXN0YWRvIGRlIMOhbmltb1xyXG4gKi9cclxuZnVuY3Rpb24gZ2V0RGVmYXVsdEdlbnJlc0Zvck1vb2QodGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xyXG4gIGNvbnN0IHN0YXRlID0gZGV0ZWN0RW1vdGlvbmFsU3RhdGUodGV4dC50b0xvd2VyQ2FzZSgpKTtcclxuICBjb25zdCBtb29kR2VucmVzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZ1tdIH0gPSB7XHJcbiAgICBzYWQ6IFsnZHJhbWEnLCAnY29tZWRpYScsICdhbmltYWNpw7NuJ10sXHJcbiAgICBzdHJlc3NlZDogWydjb21lZGlhJywgJ2FuaW1hY2nDs24nLCAnYXZlbnR1cmEnXSxcclxuICAgIGFuZ3J5OiBbJ2FjY2nDs24nLCAndGhyaWxsZXInLCAnZHJhbWEnXSxcclxuICAgIGxvbmVseTogWydyb21hbmNlJywgJ2RyYW1hJywgJ2NvbWVkaWEnXSxcclxuICAgIGFueGlvdXM6IFsnYW5pbWFjacOzbicsICdkb2N1bWVudGFsJywgJ2ZhbWlsaWEnXSxcclxuICAgIGhhcHB5OiBbJ2NvbWVkaWEnLCAnYXZlbnR1cmEnLCAnbcO6c2ljYSddLFxyXG4gICAgYm9yZWQ6IFsnYWNjacOzbicsICd0aHJpbGxlcicsICdhdmVudHVyYSddLFxyXG4gICAgZGVmYXVsdDogWydkcmFtYScsICdjb21lZGlhJywgJ2F2ZW50dXJhJ10sXHJcbiAgfTtcclxuICBcclxuICByZXR1cm4gbW9vZEdlbnJlc1tzdGF0ZV0gfHwgbW9vZEdlbnJlcy5kZWZhdWx0O1xyXG59XHJcbiJdfQ==