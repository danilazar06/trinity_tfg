import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CognitoAuthProvider } from '../src/context/CognitoAuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from '../src/components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <CognitoAuthProvider>
            <StatusBar style="light" backgroundColor="#0D0D0F" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0D0D0F' },
                animation: 'slide_from_right',
              }}
            />
          </CognitoAuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
