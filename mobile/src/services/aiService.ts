import { apiClient } from './apiClient';

export interface TriniResponse {
  chatResponse: string;
  recommendedGenres: string[];
  recommendedMovies?: Array<{
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    release_date: string;
  }>;
}

/**
 * Servicio de IA - Trini
 * Comunicación con el agente de recomendaciones cinematográficas
 */
export const aiService = {
  /**
   * Obtener recomendaciones de Trini basadas en el estado emocional del usuario
   */
  async getChatRecommendations(userText: string): Promise<TriniResponse> {
    try {
      // apiClient ya devuelve los datos directamente, no response.data
      const response = await apiClient.post<TriniResponse>('/ai/chat-recommendations', {
        userText,
      });
      
      // Validar que la respuesta tenga el formato esperado
      if (response && response.chatResponse && response.recommendedGenres) {
        return response;
      }
      
      // Si la respuesta no tiene el formato esperado, usar fallback
      console.warn('⚠️ Trini response format invalid, using fallback');
      return getFallbackResponse(userText);
    } catch (error: any) {
      console.error('❌ Error getting Trini recommendations:', error);
      // Fallback local si el backend falla
      return getFallbackResponse(userText);
    }
  },
};

/**
 * Respuesta de fallback cuando el backend no está disponible
 */
function getFallbackResponse(userText: string): TriniResponse {
  const text = userText.toLowerCase();
  
  // Detección de emociones y preferencias
  if (text.includes('triste') || text.includes('mal') || text.includes('deprimido') || text.includes('bajón') || text.includes('fatal')) {
    return {
      chatResponse: 'Entiendo cómo te sientes. A veces un buen drama nos ayuda a conectar con nuestras emociones, o una comedia ligera para desconectar. ¿Qué prefieres?',
      recommendedGenres: ['drama', 'comedia', 'animación'],
    };
  }
  
  if (text.includes('estresado') || text.includes('agobiado') || text.includes('cansado') || text.includes('trabajo') || text.includes('agotado')) {
    return {
      chatResponse: 'Parece que necesitas desconectar un poco. Te recomiendo algo ligero y entretenido que te saque de la rutina.',
      recommendedGenres: ['comedia', 'animación', 'aventura'],
    };
  }
  
  if (text.includes('aburrido') || text.includes('nada que hacer') || text.includes('no sé qué ver')) {
    return {
      chatResponse: '¡Hora de sacudir ese aburrimiento! Tengo justo lo que necesitas: algo que te enganche desde el primer minuto.',
      recommendedGenres: ['acción', 'thriller', 'aventura'],
    };
  }
  
  if (text.includes('feliz') || text.includes('bien') || text.includes('celebrar') || text.includes('genial') || text.includes('contento')) {
    return {
      chatResponse: '¡Qué bien que estés de buen humor! Vamos a mantener esa energía con algo divertido.',
      recommendedGenres: ['comedia', 'aventura', 'musical'],
    };
  }

  if (text.includes('acción') || text.includes('pelea') || text.includes('explosiones') || text.includes('adrenalina')) {
    return {
      chatResponse: '¡Te gusta la acción! Tengo películas que te van a mantener al borde del asiento.',
      recommendedGenres: ['acción', 'thriller', 'ciencia ficción'],
    };
  }

  if (text.includes('terror') || text.includes('miedo') || text.includes('susto') || text.includes('horror')) {
    return {
      chatResponse: '¿Quieres pasar miedo? Tengo algunas joyas del terror que te van a poner los pelos de punta.',
      recommendedGenres: ['terror', 'thriller', 'misterio'],
    };
  }

  if (text.includes('romance') || text.includes('amor') || text.includes('romántico') || text.includes('pareja')) {
    return {
      chatResponse: 'Ah, el amor... Tengo historias románticas que te van a hacer suspirar.',
      recommendedGenres: ['romance', 'comedia romántica', 'drama'],
    };
  }

  if (text.includes('reír') || text.includes('comedia') || text.includes('divertido') || text.includes('gracioso')) {
    return {
      chatResponse: '¡Risas garantizadas! Te recomiendo comedias que te van a hacer soltar carcajadas.',
      recommendedGenres: ['comedia', 'animación', 'comedia romántica'],
    };
  }

  if (text.includes('solo') || text.includes('solitario') || text.includes('nadie')) {
    return {
      chatResponse: 'Oye, que sepas que no estás solo/a. Te propongo películas con historias de conexión humana que te van a hacer sentir acompañado/a.',
      recommendedGenres: ['drama', 'romance', 'aventura'],
    };
  }
  
  // Respuesta por defecto más variada
  const defaultResponses = [
    {
      chatResponse: '¿Qué tipo de experiencia buscas hoy? ¿Algo que te haga pensar, reír, o simplemente desconectar?',
      recommendedGenres: ['drama', 'comedia', 'aventura'],
    },
    {
      chatResponse: 'Cuéntame un poco más. ¿Prefieres algo intenso o algo más relajado para esta sesión?',
      recommendedGenres: ['thriller', 'comedia', 'documental'],
    },
    {
      chatResponse: '¿Estás de humor para algo nuevo o prefieres un clásico que nunca falla?',
      recommendedGenres: ['acción', 'drama', 'ciencia ficción'],
    },
  ];
  
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

export default aiService;
