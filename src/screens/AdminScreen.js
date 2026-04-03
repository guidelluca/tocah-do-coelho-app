import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { triggerAdminAction } from '../services/api';
import { AppHeader } from '../components/AppHeader';

export function AdminScreen() {
  const { isDark } = useThemeMode();
  const colors = isDark ? darkTheme : lightTheme;
  const confirmAction = (title, action) => {
    Alert.alert(title, 'Tem certeza que deseja executar agora?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Executar', onPress: () => callAction(action) },
    ]);
  };
  const callAction = async (action) => {
    try {
      const response = await triggerAdminAction(action, 'ADMIN');
      Alert.alert('Sucesso', response?.message || 'Acao executada');
    } catch (error) {
      Alert.alert('Erro', error?.message || 'Nao foi possivel executar agora');
    }
  };
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Bot Admin" subtitle="Comandos da casa" />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Admin</Text>
        <Text style={[styles.helper, { color: colors.muted }]}>Use com cuidado: estas acoes afetam todos os moradores.</Text>
        <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => confirmAction('Disparar cobranca', 'dispararCobrancaAluguel')}>
          <Text style={styles.btnText}>Disparar Cobranca de Aluguel</Text>
        </Pressable>
        <Pressable style={[styles.btn, { backgroundColor: '#d32f2f' }]} onPress={() => confirmAction('Cobrar atrasados', 'cobrarAtrasados')}>
          <Text style={styles.btnText}>Cobrar Atrasados</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 6 },
  card: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 10 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  helper: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10 },
  btnText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
});
