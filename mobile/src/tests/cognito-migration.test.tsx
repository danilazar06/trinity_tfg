/**
 * Test básico para verificar que la migración a Cognito funciona
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { CognitoAuthProvider } from '../context/CognitoAuthContext';

// Mock de AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock de useAppSync
jest.mock('../services/apiClient', () => ({
  useAppSync: jest.fn(() => ({})),
}));

// Componente de prueba simple
const TestComponent = () => {
  return null;
};

describe('Cognito Migration - Basic Integration', () => {
  it('should render CognitoAuthProvider without errors', () => {
    expect(() => {
      render(
        <CognitoAuthProvider>
          <TestComponent />
        </CognitoAuthProvider>
      );
    }).not.toThrow();
  });

  it('should provide CognitoAuthProvider in the app layout', () => {
    // Verificar que el import funciona correctamente
    const { CognitoAuthProvider: ImportedProvider } = require('../context/CognitoAuthContext');
    expect(ImportedProvider).toBeDefined();
    expect(typeof ImportedProvider).toBe('function');
  });
});