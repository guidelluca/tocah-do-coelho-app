import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { ResidentProvider } from './src/context/ResidentContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { MoradorPinProvider } from './src/context/MoradorPinContext';
import { UpdateBanner } from './src/components/UpdateBanner';
import { SyncProvider, invalidateResources } from './src/data/store';
import { useConfig } from './src/data/hooks';
import { ensureConfig } from './src/services/api';
import { FeedbackProvider } from './src/components/ui';
import { FirstRunGate } from './src/components/FirstRunGate';
import { AppNavigator } from './src/navigation/AppNavigator';

/**
 * Web (iPhone/Android): trava a tela para não "sambar".
 * - sem zoom de pinça/duplo toque e sem zoom automático ao focar campos;
 * - sem arrastar a página para os lados e sem o "elástico" do Safari.
 */
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  const style = document.createElement('style');
  style.textContent = [
    'html, body, #root { height: 100%; width: 100%; overflow: hidden; overscroll-behavior: none; }',
    'body { position: fixed; inset: 0; touch-action: manipulation; -webkit-text-size-adjust: 100%; }',
    'input, textarea { font-size: 16px !important; }',
    '* { -webkit-tap-highlight-color: transparent; }',
  ].join('\n');
  document.head.appendChild(style);
}

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
      <UpdateBanner />
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
                <MoradorPinProvider>
                <Root />
                </MoradorPinProvider>
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
