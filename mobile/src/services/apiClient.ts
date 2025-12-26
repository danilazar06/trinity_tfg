import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Detectar si estamos en desarrollo o producción
const getApiUrl = () => {
  // En desarrollo, usar la IP local del servidor
  // Cambiar esta IP por la de tu máquina si es diferente
  const DEV_API_URL = 'http://192.168.1.59:3000/api';
  const PROD_API_URL = 'https://api.trinity.app/api'; // URL de producción
  
  return __DEV__ ? DEV_API_URL : PROD_API_URL;
};

const API_BASE_URL = getApiUrl();

interface RequestConfig {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await AsyncStorage.getItem('authToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(endpoint: string, config: RequestConfig): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw { response: { data, status: response.status } };
      }
      
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'PUT',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
