import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getAWSConfig } from '../config/aws-config';
import { appSyncService } from './appSyncService';

// Detectar si estamos en desarrollo o producción
const getApiUrl = () => {
  // DEPRECATED: Migrating to AWS AppSync GraphQL
  // Keeping for backward compatibility during transition
  const DEV_API_URL = 'http://192.168.0.27:3002/api';
  const PROD_API_URL = 'https://api.trinity.app/api'; // URL de producción
  
  return __DEV__ ? DEV_API_URL : PROD_API_URL;
};

const API_BASE_URL = getApiUrl();

// AWS Configuration
const AWS_CONFIG = getAWSConfig();

interface RequestConfig {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Callback para manejar logout automático en caso de 401
let onUnauthorizedCallback: (() => void) | null = null;

export const setOnUnauthorizedCallback = (callback: () => void) => {
  onUnauthorizedCallback = callback;
};

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
        // Si es 401 y no es un endpoint de auth, hacer logout automático
        if (response.status === 401 && !endpoint.startsWith('/auth/')) {
          if (onUnauthorizedCallback) {
            onUnauthorizedCallback();
          }
        }
        throw { response: { data, status: response.status } };
      }
      
      return data;
    } catch (error) {
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

// AWS AppSync Integration
export const useAppSync = () => {
  console.log('🔗 Using AWS AppSync for GraphQL operations');
  console.log('📍 Region:', AWS_CONFIG.region);
  console.log('🔗 GraphQL Endpoint:', AWS_CONFIG.graphqlEndpoint);
  
  return {
    // Room operations via AppSync
    createRoom: appSyncService.createRoom.bind(appSyncService),
    joinRoom: appSyncService.joinRoom.bind(appSyncService),
    getRoom: appSyncService.getRoom.bind(appSyncService),
    getUserRooms: appSyncService.getUserRooms.bind(appSyncService),
    
    // Voting operations via AppSync
    vote: appSyncService.vote.bind(appSyncService),
    
    // Movie operations via AppSync
    getMovieDetails: appSyncService.getMovieDetails.bind(appSyncService),
    
    // AI operations via AppSync
    getAIRecommendations: appSyncService.getAIRecommendations.bind(appSyncService),
    
    // Real-time subscriptions
    subscribeToVoteUpdates: appSyncService.subscribeToVoteUpdates.bind(appSyncService),
    subscribeToMatchFound: appSyncService.subscribeToMatchFound.bind(appSyncService),
    
    // Health check
    healthCheck: appSyncService.healthCheck.bind(appSyncService),
  };
};
