import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { ResidentProvider } from './src/context/ResidentContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { SyncProvider, invalidateResources } from './src/data/store';
import { useConfig } from './src/data/hooks';
import { ensureConfig } from './src/services/api';
import { FeedbackProvider } from './src/components/ui';
import { FirstRunGate } from './src/components/FirstRunGate';
import { AppNavigator } from './src/navigation/AppNavigator';

/** Cria a aba Config (com os textos padrão) na primeira vez que o app novo roda. */
function ConfigBootstrap() {
  const config = useConfig();
  useEffect(() => {
    if (config.data && config.data.exists === false) {
      ensureConfig().then(() => invalidateResources('config')).catch(() => {});
    }
  }, [config.data?.exists]);
  return null;
}

function Root() {
  const { isDark, colors, layout, ready } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary, notification: colors.danger },
  };
  if (!ready) return <View style={[styles.fill, { backgroundColor: colors.bg }]} />;
  return (
    <NavigationContainer
      theme={navigationTheme}
      documentTitle={{ formatter: (options) => (options?.title ? `${options.title} · Tocah` : 'Tocah') }}
    >
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <StatusBar style="light" />
        <View style={[styles.fill, styles.column, { maxWidth: layout.maxWidth }]}>
          <AppNavigator />
        </View>
      </View>
      <FirstRunGate />
      <ConfigBootstrap />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <SyncProvider>
            <ResidentProvider>
              <NotificationProvider>
                <Root />
              </NotificationProvider>
            </ResidentProvider>
          </SyncProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: '100%', alignSelf: 'center' },
});
