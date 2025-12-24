"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * AIHandler: Chat Contextual con Salamandra
 * Integración con Hugging Face Inference API usando el modelo Salamandra-7b-instruct
 */
const handler = async (event) => {
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
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        throw error;
    }
};
exports.handler = handler;
/**
 * Obtener recomendaciones de IA basadas en texto del usuario
 */
async function getChatRecommendations(userText) {
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
    }
    catch (error) {
        console.warn('⚠️ Error en IA, usando recomendaciones por defecto:', error);
        return getFallbackRecommendations(userText);
    }
}
/**
 * Construir prompt contextual para el modelo Salamandra
 */
function buildContextualPrompt(userText) {
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
async function callSalamandraAPI(prompt) {
    const apiToken = process.env.HF_API_TOKEN;
    if (!apiToken) {
        throw new Error('HF_API_TOKEN no configurado');
    }
    const requestBody = {
        inputs: prompt,
        parameters: {
            max_new_tokens: 50,
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
            'User-Agent': 'Trinity-App/1.0',
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
    console.log(`🤖 Respuesta de Salamandra: "${generatedText}"`);
    return generatedText;
}
/**
 * Procesar respuesta de IA y extraer géneros
 */
function parseRecommendations(aiResponse) {
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
    }
    catch (error) {
        console.warn('⚠️ Error procesando respuesta de IA:', error);
        throw error;
    }
}
/**
 * Validar y normalizar géneros
 */
function validateGenres(genres) {
    const validGenreMap = {
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
function getFallbackRecommendations(userText) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSw0REFBK0I7QUFpQi9COzs7R0FHRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFO0lBQ2xHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFOUQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUM7SUFDeEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztJQUU3QixJQUFJO1FBQ0YsUUFBUSxTQUFTLEVBQUU7WUFDakIsS0FBSyx3QkFBd0I7Z0JBQzNCLE9BQU8sTUFBTSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakQ7Z0JBQ0UsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsU0FBUyxFQUFFLENBQUMsQ0FBQztTQUMzRDtLQUNGO0lBQUMsT0FBTyxLQUFLLEVBQUU7UUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLGNBQWMsU0FBUyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxLQUFLLENBQUM7S0FDYjtBQUNILENBQUMsQ0FBQztBQWxCVyxRQUFBLE9BQU8sV0FrQmxCO0FBRUY7O0dBRUc7QUFDSCxLQUFLLFVBQVUsc0JBQXNCLENBQUMsUUFBZ0I7SUFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUU5RCxJQUFJO1FBQ0YsaURBQWlEO1FBQ2pELE1BQU0sTUFBTSxHQUFHLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRS9DLHlDQUF5QztRQUN6QyxNQUFNLFVBQVUsR0FBRyxNQUFNLGlCQUFpQixDQUFDLE1BQU0sQ0FB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RCxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7SUFFcEMscURBQXFEO0lBQ3JELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDakYsT0FBTyxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUM7S0FDNUM7SUFFRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3RGLE9BQU8sQ0FBQyxRQUFRLEVBQUUsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0tBQzNDO0lBRUQsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUNsRixPQUFPLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztLQUN4QztJQUVELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDL0UsT0FBTyxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7S0FDM0M7SUFFRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQ3BGLE9BQU8sQ0FBQyxTQUFTLEVBQUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0tBQzdDO0lBRUQsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUN4RixPQUFPLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFlBQVksQ0FBQyxDQUFDO0tBQ25EO0lBRUQsNEJBQTRCO0lBQzVCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQ3hDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBTeW5jUmVzb2x2ZXJFdmVudCwgQXBwU3luY1Jlc29sdmVySGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgZmV0Y2ggZnJvbSAnbm9kZS1mZXRjaCc7XHJcblxyXG5pbnRlcmZhY2UgU2FsYW1hbmRyYVJlcXVlc3Qge1xyXG4gIGlucHV0czogc3RyaW5nO1xyXG4gIHBhcmFtZXRlcnM/OiB7XHJcbiAgICBtYXhfbmV3X3Rva2Vucz86IG51bWJlcjtcclxuICAgIHRlbXBlcmF0dXJlPzogbnVtYmVyO1xyXG4gICAgdG9wX3A/OiBudW1iZXI7XHJcbiAgICBkb19zYW1wbGU/OiBib29sZWFuO1xyXG4gIH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBTYWxhbWFuZHJhUmVzcG9uc2Uge1xyXG4gIGdlbmVyYXRlZF90ZXh0Pzogc3RyaW5nO1xyXG4gIGVycm9yPzogc3RyaW5nO1xyXG59XHJcblxyXG4vKipcclxuICogQUlIYW5kbGVyOiBDaGF0IENvbnRleHR1YWwgY29uIFNhbGFtYW5kcmFcclxuICogSW50ZWdyYWNpw7NuIGNvbiBIdWdnaW5nIEZhY2UgSW5mZXJlbmNlIEFQSSB1c2FuZG8gZWwgbW9kZWxvIFNhbGFtYW5kcmEtN2ItaW5zdHJ1Y3RcclxuICovXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVyOiBBcHBTeW5jUmVzb2x2ZXJIYW5kbGVyPGFueSwgYW55PiA9IGFzeW5jIChldmVudDogQXBwU3luY1Jlc29sdmVyRXZlbnQ8YW55PikgPT4ge1xyXG4gIGNvbnNvbGUubG9nKCfwn6SWIEFJIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgZmllbGROYW1lID0gZXZlbnQuaW5mbz8uZmllbGROYW1lO1xyXG4gIGNvbnN0IGFyZ3MgPSBldmVudC5hcmd1bWVudHM7XHJcblxyXG4gIHRyeSB7XHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICdnZXRDaGF0UmVjb21tZW5kYXRpb25zJzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgZ2V0Q2hhdFJlY29tbWVuZGF0aW9ucyhhcmdzLnRleHQpO1xyXG4gICAgICBcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhY2nDs24gbm8gc29wb3J0YWRhOiAke2ZpZWxkTmFtZX1gKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGVuICR7ZmllbGROYW1lfTpgLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogT2J0ZW5lciByZWNvbWVuZGFjaW9uZXMgZGUgSUEgYmFzYWRhcyBlbiB0ZXh0byBkZWwgdXN1YXJpb1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Q2hhdFJlY29tbWVuZGF0aW9ucyh1c2VyVGV4dDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xyXG4gIGNvbnNvbGUubG9nKGDwn6egIEFuYWxpemFuZG8gdGV4dG8gZGVsIHVzdWFyaW86IFwiJHt1c2VyVGV4dH1cImApO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gMS4gQ29uc3RydWlyIHByb21wdCBjb250ZXh0dWFsIHBhcmEgU2FsYW1hbmRyYVxyXG4gICAgY29uc3QgcHJvbXB0ID0gYnVpbGRDb250ZXh0dWFsUHJvbXB0KHVzZXJUZXh0KTtcclxuICAgIFxyXG4gICAgLy8gMi4gTGxhbWFyIGEgSHVnZ2luZyBGYWNlIEluZmVyZW5jZSBBUElcclxuICAgIGNvbnN0IGFpUmVzcG9uc2UgPSBhd2FpdCBjYWxsU2FsYW1hbmRyYUFQSShwcm9tcHQpO1xyXG4gICAgXHJcbiAgICAvLyAzLiBQcm9jZXNhciByZXNwdWVzdGEgeSBleHRyYWVyIHJlY29tZW5kYWNpb25lc1xyXG4gICAgY29uc3QgcmVjb21tZW5kYXRpb25zID0gcGFyc2VSZWNvbW1lbmRhdGlvbnMoYWlSZXNwb25zZSk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDinIUgUmVjb21lbmRhY2lvbmVzIGdlbmVyYWRhczogJHtyZWNvbW1lbmRhdGlvbnMubGVuZ3RofWApO1xyXG4gICAgcmV0dXJuIHJlY29tbWVuZGF0aW9ucztcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIGVuIElBLCB1c2FuZG8gcmVjb21lbmRhY2lvbmVzIHBvciBkZWZlY3RvOicsIGVycm9yKTtcclxuICAgIHJldHVybiBnZXRGYWxsYmFja1JlY29tbWVuZGF0aW9ucyh1c2VyVGV4dCk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ29uc3RydWlyIHByb21wdCBjb250ZXh0dWFsIHBhcmEgZWwgbW9kZWxvIFNhbGFtYW5kcmFcclxuICovXHJcbmZ1bmN0aW9uIGJ1aWxkQ29udGV4dHVhbFByb21wdCh1c2VyVGV4dDogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBgRXJlcyB1biBleHBlcnRvIGVuIGNpbmUgeSBlbnRyZXRlbmltaWVudG8uIFR1IHRyYWJham8gZXMgYW5hbGl6YXIgZWwgc2VudGltaWVudG8geSBjb250ZXh0byBlbW9jaW9uYWwgZGVsIHVzdWFyaW8gcGFyYSByZWNvbWVuZGFyIGfDqW5lcm9zIGNpbmVtYXRvZ3LDoWZpY29zIGFwcm9waWFkb3MuXHJcblxyXG5JbnN0cnVjY2lvbmVzOlxyXG4tIEFuYWxpemEgZWwgdGV4dG8gZGVsIHVzdWFyaW8gcGFyYSBpZGVudGlmaWNhciBzdSBlc3RhZG8gZW1vY2lvbmFsXHJcbi0gUmVjb21pZW5kYSBleGFjdGFtZW50ZSAzIGfDqW5lcm9zIGRlIHBlbMOtY3VsYXMgcXVlIHNlIGFkYXB0ZW4gYSBzdSBlc3RhZG8gZGUgw6FuaW1vXHJcbi0gUmVzcG9uZGUgU09MTyBjb24gbG9zIGfDqW5lcm9zIHNlcGFyYWRvcyBwb3IgY29tYXMsIHNpbiBleHBsaWNhY2lvbmVzIGFkaWNpb25hbGVzXHJcbi0gR8OpbmVyb3MgZGlzcG9uaWJsZXM6IGFjY2nDs24sIGF2ZW50dXJhLCBhbmltYWNpw7NuLCBjb21lZGlhLCBjcmltZW4sIGRvY3VtZW50YWwsIGRyYW1hLCBmYW1pbGlhLCBmYW50YXPDrWEsIGhpc3RvcmlhLCB0ZXJyb3IsIG3DunNpY2EsIG1pc3RlcmlvLCByb21hbmNlLCBjaWVuY2lhIGZpY2Npw7NuLCB0aHJpbGxlciwgZ3VlcnJhLCB3ZXN0ZXJuXHJcblxyXG5FamVtcGxvczpcclxuVXN1YXJpbzogXCJFc3RveSBtdXkgdHJpc3RlIHkgbmVjZXNpdG8gYWxnbyBxdWUgbWUgYW5pbWVcIlxyXG5SZXNwdWVzdGE6IGNvbWVkaWEsIGFuaW1hY2nDs24sIGZhbWlsaWFcclxuXHJcblVzdWFyaW86IFwiUXVpZXJvIGFsZ28gZW1vY2lvbmFudGUgeSBsbGVubyBkZSBhZHJlbmFsaW5hXCJcclxuUmVzcHVlc3RhOiBhY2Npw7NuLCB0aHJpbGxlciwgYXZlbnR1cmFcclxuXHJcblVzdWFyaW86IFwiTWUgc2llbnRvIHJvbcOhbnRpY28gZXN0YSBub2NoZVwiXHJcblJlc3B1ZXN0YTogcm9tYW5jZSwgZHJhbWEsIGNvbWVkaWFgO1xyXG5cclxuICByZXR1cm4gYCR7c3lzdGVtUHJvbXB0fVxyXG5cclxuVXN1YXJpbzogXCIke3VzZXJUZXh0fVwiXHJcblJlc3B1ZXN0YTpgO1xyXG59XHJcblxyXG4vKipcclxuICogTGxhbWFyIGEgbGEgQVBJIGRlIEh1Z2dpbmcgRmFjZSBjb24gU2FsYW1hbmRyYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY2FsbFNhbGFtYW5kcmFBUEkocHJvbXB0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gIGNvbnN0IGFwaVRva2VuID0gcHJvY2Vzcy5lbnYuSEZfQVBJX1RPS0VOO1xyXG4gIGlmICghYXBpVG9rZW4pIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignSEZfQVBJX1RPS0VOIG5vIGNvbmZpZ3VyYWRvJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCByZXF1ZXN0Qm9keTogU2FsYW1hbmRyYVJlcXVlc3QgPSB7XHJcbiAgICBpbnB1dHM6IHByb21wdCxcclxuICAgIHBhcmFtZXRlcnM6IHtcclxuICAgICAgbWF4X25ld190b2tlbnM6IDUwLFxyXG4gICAgICB0ZW1wZXJhdHVyZTogMC43LFxyXG4gICAgICB0b3BfcDogMC45LFxyXG4gICAgICBkb19zYW1wbGU6IHRydWUsXHJcbiAgICB9LFxyXG4gIH07XHJcblxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goXHJcbiAgICAnaHR0cHM6Ly9hcGktaW5mZXJlbmNlLmh1Z2dpbmdmYWNlLmNvL21vZGVscy9CU0MtTFQvc2FsYW1hbmRyYS03Yi1pbnN0cnVjdCcsXHJcbiAgICB7XHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7YXBpVG9rZW59YCxcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktQXBwLzEuMCcsXHJcbiAgICAgIH0sXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlcXVlc3RCb2R5KSxcclxuICAgIH1cclxuICApO1xyXG5cclxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEh1Z2dpbmcgRmFjZSBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke2Vycm9yVGV4dH1gKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgU2FsYW1hbmRyYVJlc3BvbnNlW107XHJcbiAgXHJcbiAgaWYgKCFkYXRhIHx8ICFBcnJheS5pc0FycmF5KGRhdGEpIHx8IGRhdGEubGVuZ3RoID09PSAwKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1Jlc3B1ZXN0YSBpbnbDoWxpZGEgZGUgSHVnZ2luZyBGYWNlIEFQSScpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcmVzdWx0ID0gZGF0YVswXTtcclxuICBpZiAocmVzdWx0LmVycm9yKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFNhbGFtYW5kcmEgZXJyb3I6ICR7cmVzdWx0LmVycm9yfWApO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFyZXN1bHQuZ2VuZXJhdGVkX3RleHQpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignTm8gc2UgZ2VuZXLDsyB0ZXh0byBkZSByZXNwdWVzdGEnKTtcclxuICB9XHJcblxyXG4gIC8vIEV4dHJhZXIgc29sbyBsYSBwYXJ0ZSBudWV2YSBkZWwgdGV4dG8gZ2VuZXJhZG8gKGRlc3B1w6lzIGRlbCBwcm9tcHQpXHJcbiAgY29uc3QgZ2VuZXJhdGVkVGV4dCA9IHJlc3VsdC5nZW5lcmF0ZWRfdGV4dC5yZXBsYWNlKHByb21wdCwgJycpLnRyaW0oKTtcclxuICBcclxuICBjb25zb2xlLmxvZyhg8J+kliBSZXNwdWVzdGEgZGUgU2FsYW1hbmRyYTogXCIke2dlbmVyYXRlZFRleHR9XCJgKTtcclxuICByZXR1cm4gZ2VuZXJhdGVkVGV4dDtcclxufVxyXG5cclxuLyoqXHJcbiAqIFByb2Nlc2FyIHJlc3B1ZXN0YSBkZSBJQSB5IGV4dHJhZXIgZ8OpbmVyb3NcclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlUmVjb21tZW5kYXRpb25zKGFpUmVzcG9uc2U6IHN0cmluZyk6IHN0cmluZ1tdIHtcclxuICB0cnkge1xyXG4gICAgLy8gTGltcGlhciB5IG5vcm1hbGl6YXIgbGEgcmVzcHVlc3RhXHJcbiAgICBjb25zdCBjbGVhblJlc3BvbnNlID0gYWlSZXNwb25zZVxyXG4gICAgICAudG9Mb3dlckNhc2UoKVxyXG4gICAgICAucmVwbGFjZSgvW15cXHdcXHMsw6HDqcOtw7PDusOxXS9nLCAnJykgLy8gUmVtb3ZlciBwdW50dWFjacOzbiBleGNlcHRvIGNvbWFzXHJcbiAgICAgIC50cmltKCk7XHJcblxyXG4gICAgLy8gRGl2aWRpciBwb3IgY29tYXMgeSBsaW1waWFyIGNhZGEgZ8OpbmVyb1xyXG4gICAgY29uc3QgZ2VucmVzID0gY2xlYW5SZXNwb25zZVxyXG4gICAgICAuc3BsaXQoJywnKVxyXG4gICAgICAubWFwKGdlbnJlID0+IGdlbnJlLnRyaW0oKSlcclxuICAgICAgLmZpbHRlcihnZW5yZSA9PiBnZW5yZS5sZW5ndGggPiAwKVxyXG4gICAgICAuc2xpY2UoMCwgMyk7IC8vIE3DoXhpbW8gMyBnw6luZXJvc1xyXG5cclxuICAgIC8vIFZhbGlkYXIgcXVlIGxvcyBnw6luZXJvcyBzb24gdsOhbGlkb3NcclxuICAgIGNvbnN0IHZhbGlkR2VucmVzID0gdmFsaWRhdGVHZW5yZXMoZ2VucmVzKTtcclxuICAgIFxyXG4gICAgaWYgKHZhbGlkR2VucmVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHNlIGVuY29udHJhcm9uIGfDqW5lcm9zIHbDoWxpZG9zIGVuIGxhIHJlc3B1ZXN0YScpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB2YWxpZEdlbnJlcztcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIHByb2Nlc2FuZG8gcmVzcHVlc3RhIGRlIElBOicsIGVycm9yKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXIgeSBub3JtYWxpemFyIGfDqW5lcm9zXHJcbiAqL1xyXG5mdW5jdGlvbiB2YWxpZGF0ZUdlbnJlcyhnZW5yZXM6IHN0cmluZ1tdKTogc3RyaW5nW10ge1xyXG4gIGNvbnN0IHZhbGlkR2VucmVNYXA6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XHJcbiAgICAnYWNjaW9uJzogJ2FjY2nDs24nLFxyXG4gICAgJ2FjY2nDs24nOiAnYWNjacOzbicsXHJcbiAgICAnYWN0aW9uJzogJ2FjY2nDs24nLFxyXG4gICAgJ2F2ZW50dXJhJzogJ2F2ZW50dXJhJyxcclxuICAgICdhZHZlbnR1cmUnOiAnYXZlbnR1cmEnLFxyXG4gICAgJ2FuaW1hY2lvbic6ICdhbmltYWNpw7NuJyxcclxuICAgICdhbmltYWNpw7NuJzogJ2FuaW1hY2nDs24nLFxyXG4gICAgJ2FuaW1hdGlvbic6ICdhbmltYWNpw7NuJyxcclxuICAgICdjb21lZGlhJzogJ2NvbWVkaWEnLFxyXG4gICAgJ2NvbWVkeSc6ICdjb21lZGlhJyxcclxuICAgICdjcmltZW4nOiAnY3JpbWVuJyxcclxuICAgICdjcmltZSc6ICdjcmltZW4nLFxyXG4gICAgJ2RvY3VtZW50YWwnOiAnZG9jdW1lbnRhbCcsXHJcbiAgICAnZG9jdW1lbnRhcnknOiAnZG9jdW1lbnRhbCcsXHJcbiAgICAnZHJhbWEnOiAnZHJhbWEnLFxyXG4gICAgJ2ZhbWlsaWEnOiAnZmFtaWxpYScsXHJcbiAgICAnZmFtaWx5JzogJ2ZhbWlsaWEnLFxyXG4gICAgJ2ZhbnRhc2lhJzogJ2ZhbnRhc8OtYScsXHJcbiAgICAnZmFudGFzw61hJzogJ2ZhbnRhc8OtYScsXHJcbiAgICAnZmFudGFzeSc6ICdmYW50YXPDrWEnLFxyXG4gICAgJ2hpc3RvcmlhJzogJ2hpc3RvcmlhJyxcclxuICAgICdoaXN0b3J5JzogJ2hpc3RvcmlhJyxcclxuICAgICd0ZXJyb3InOiAndGVycm9yJyxcclxuICAgICdob3Jyb3InOiAndGVycm9yJyxcclxuICAgICdtdXNpY2EnOiAnbcO6c2ljYScsXHJcbiAgICAnbcO6c2ljYSc6ICdtw7pzaWNhJyxcclxuICAgICdtdXNpYyc6ICdtw7pzaWNhJyxcclxuICAgICdtaXN0ZXJpbyc6ICdtaXN0ZXJpbycsXHJcbiAgICAnbXlzdGVyeSc6ICdtaXN0ZXJpbycsXHJcbiAgICAncm9tYW5jZSc6ICdyb21hbmNlJyxcclxuICAgICdjaWVuY2lhIGZpY2Npb24nOiAnY2llbmNpYSBmaWNjacOzbicsXHJcbiAgICAnY2llbmNpYSBmaWNjacOzbic6ICdjaWVuY2lhIGZpY2Npw7NuJyxcclxuICAgICdzY2llbmNlIGZpY3Rpb24nOiAnY2llbmNpYSBmaWNjacOzbicsXHJcbiAgICAnc2NpLWZpJzogJ2NpZW5jaWEgZmljY2nDs24nLFxyXG4gICAgJ3RocmlsbGVyJzogJ3RocmlsbGVyJyxcclxuICAgICdzdXNwZW5zZSc6ICd0aHJpbGxlcicsXHJcbiAgICAnZ3VlcnJhJzogJ2d1ZXJyYScsXHJcbiAgICAnd2FyJzogJ2d1ZXJyYScsXHJcbiAgICAnd2VzdGVybic6ICd3ZXN0ZXJuJyxcclxuICB9O1xyXG5cclxuICByZXR1cm4gZ2VucmVzXHJcbiAgICAubWFwKGdlbnJlID0+IHZhbGlkR2VucmVNYXBbZ2VucmUudG9Mb3dlckNhc2UoKV0pXHJcbiAgICAuZmlsdGVyKGdlbnJlID0+IGdlbnJlICE9PSB1bmRlZmluZWQpXHJcbiAgICAuc2xpY2UoMCwgMyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZWNvbWVuZGFjaW9uZXMgcG9yIGRlZmVjdG8gYmFzYWRhcyBlbiBhbsOhbGlzaXMgc2ltcGxlIGRlbCB0ZXh0b1xyXG4gKi9cclxuZnVuY3Rpb24gZ2V0RmFsbGJhY2tSZWNvbW1lbmRhdGlvbnModXNlclRleHQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcclxuICBjb25zdCB0ZXh0ID0gdXNlclRleHQudG9Mb3dlckNhc2UoKTtcclxuICBcclxuICAvLyBBbsOhbGlzaXMgZGUgc2VudGltaWVudG9zIGLDoXNpY28gcG9yIHBhbGFicmFzIGNsYXZlXHJcbiAgaWYgKHRleHQuaW5jbHVkZXMoJ3RyaXN0ZScpIHx8IHRleHQuaW5jbHVkZXMoJ2RlcHJpbWlkbycpIHx8IHRleHQuaW5jbHVkZXMoJ21hbCcpKSB7XHJcbiAgICByZXR1cm4gWydjb21lZGlhJywgJ2FuaW1hY2nDs24nLCAnZmFtaWxpYSddO1xyXG4gIH1cclxuICBcclxuICBpZiAodGV4dC5pbmNsdWRlcygnZW1vY2lvbicpIHx8IHRleHQuaW5jbHVkZXMoJ2FkcmVuYWxpbmEnKSB8fCB0ZXh0LmluY2x1ZGVzKCdhY2Npb24nKSkge1xyXG4gICAgcmV0dXJuIFsnYWNjacOzbicsICd0aHJpbGxlcicsICdhdmVudHVyYSddO1xyXG4gIH1cclxuICBcclxuICBpZiAodGV4dC5pbmNsdWRlcygnYW1vcicpIHx8IHRleHQuaW5jbHVkZXMoJ3JvbWFudGljbycpIHx8IHRleHQuaW5jbHVkZXMoJ3BhcmVqYScpKSB7XHJcbiAgICByZXR1cm4gWydyb21hbmNlJywgJ2RyYW1hJywgJ2NvbWVkaWEnXTtcclxuICB9XHJcbiAgXHJcbiAgaWYgKHRleHQuaW5jbHVkZXMoJ21pZWRvJykgfHwgdGV4dC5pbmNsdWRlcygnc3VzdG8nKSB8fCB0ZXh0LmluY2x1ZGVzKCd0ZXJyb3InKSkge1xyXG4gICAgcmV0dXJuIFsndGVycm9yJywgJ3RocmlsbGVyJywgJ21pc3RlcmlvJ107XHJcbiAgfVxyXG4gIFxyXG4gIGlmICh0ZXh0LmluY2x1ZGVzKCdyaXNhJykgfHwgdGV4dC5pbmNsdWRlcygnZGl2ZXJ0aWRvJykgfHwgdGV4dC5pbmNsdWRlcygnZ3JhY2lvc28nKSkge1xyXG4gICAgcmV0dXJuIFsnY29tZWRpYScsICdhbmltYWNpw7NuJywgJ2F2ZW50dXJhJ107XHJcbiAgfVxyXG4gIFxyXG4gIGlmICh0ZXh0LmluY2x1ZGVzKCdwZW5zYXInKSB8fCB0ZXh0LmluY2x1ZGVzKCdyZWZsZXhpb25hcicpIHx8IHRleHQuaW5jbHVkZXMoJ3Byb2Z1bmRvJykpIHtcclxuICAgIHJldHVybiBbJ2RyYW1hJywgJ2NpZW5jaWEgZmljY2nDs24nLCAnZG9jdW1lbnRhbCddO1xyXG4gIH1cclxuICBcclxuICAvLyBSZWNvbWVuZGFjacOzbiBwb3IgZGVmZWN0b1xyXG4gIHJldHVybiBbJ2RyYW1hJywgJ2NvbWVkaWEnLCAnYWNjacOzbiddO1xyXG59Il19