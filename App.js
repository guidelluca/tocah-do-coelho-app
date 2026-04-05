import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useThemeMode } from './src/context/ThemeContext';
import { ResidentProvider } from './src/context/ResidentContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { darkTheme, lightTheme } from './src/constants/theme';

function Root() {
  const { isDark } = useThemeMode();
  const colors = isDark ? darkTheme : lightTheme;
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };
  return (
    <NavigationContainer theme={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} translucent={false} />
        <AppNavigator />
      </View>
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

