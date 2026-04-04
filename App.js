import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider, useThemeMode } from './src/context/ThemeContext';
import { ResidentProvider } from './src/context/ResidentContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { AppNavigator } from './src/navigation/AppNavigator';

function Root() {
  const { isDark } = useThemeMode();
  return (
    <NavigationContainer>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <StatusBar style={isDark ? 'light' : 'dark'} translucent={false} />
        <AppNavigator />
      </SafeAreaView>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ResidentProvider>
          <NotificationProvider>
            <Root />
          </NotificationProvider>
        </ResidentProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

