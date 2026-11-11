import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { FeedPhoto } from '../components/FeedPhoto';
import { AvaliarTab, DeliveryCard, DesempenhoTab, EntregasCard } from '../components/tasks';
import { AppText, BottomSheet, Card, Chip, Icon, SkeletonCard } from '../components/ui';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { useAvaliacao, useDesempenho, useNilde } from '../data/hooks';
import { invalidateResources } from '../data/store';

export function TasksScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { spacing } = useTheme();
  const { resident } = useResident();
  const av = useAvaliacao(resident);
  const desempenho = useDesempenho();
  const nilde = useNilde();
  const [tab, setTab] = useState('semana');
  const [photoTs, setPhotoTs] = useState('');

  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.at, route.params?.tab]);

  const data = av.data;
  const key = data?.emAvaliacao;
  const emAvaliacao = key ? [data?.anterior, data?.atual].find((c) => c && c.key === key) : null;
  const prog = emAvaliacao?.avaliacoes?.porAvaliador?.[String(resident || '').toUpperCase()];
  const faltam = prog ? prog.total - prog.feitas : 0;
  const nildeToday = nilde.data ? Object.keys(nilde.data.log?.[nilde.data.today] || {}).length : null;
  const anteriorPendente = data?.anterior && data.anterior.phase === 'entregas' ? data.anterior : null;

  const refresh = () => {
    invalidateResources('avaliacao', 'feed', 'ratings', 'escala');
    return av.refresh();
  };

  return (
    <Screen title="Tarefas" subtitle={data?.atual ? `Tarefas · ${data.atual.periodo}` : 'Tarefas'} onRefresh={refresh}>
      <View style={[styles.tabs, { gap: spacing.sm, marginBottom: spacing.md }]} accessibilityRole="tablist">
        <Chip label="Semana" icon="calendar-check-outline" selected={tab === 'semana'} onPress={() => setTab('semana')} />
        <Chip label="Avaliar" icon="star-outline" selected={tab === 'avaliar'} onPress={() => setTab('avaliar')} count={faltam > 0 ? faltam : undefined} />
        <Chip label="Desempenho" icon="podium" selected={tab === 'desempenho'} onPress={() => setTab('desempenho')} />
      </View>

      {av.loading && !data && <SkeletonCard lines={4} />}

      {tab === 'semana' && (
        <>
          <DeliveryCard />
          {emAvaliacao && faltam > 0 && (
            <Card variant="primary" onPress={() => setTab('avaliar')} style={{ marginBottom: spacing.md }} accessibilityLabel="Abrir avaliação">
              <View style={[styles.row, { gap: spacing.md }]}>
                <Icon name="star-circle" size={28} color="onPrimarySoft" />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" color="onPrimarySoft">Avaliação da semana {emAvaliacao.periodo} aberta</AppText>
                  <AppText variant="caption" color="onPrimarySoft">Faltam {faltam} nota{faltam > 1 ? 's' : ''} suas</AppText>
                </View>
                <Icon name="chevron-right" color="onPrimarySoft" />
              </View>
            </Card>
          )}
          {anteriorPendente && <EntregasCard ciclo={anteriorPendente} titulo={`Semana passada · ${anteriorPendente.periodo}`} me={resident} onPhoto={setPhotoTs} />}
          {data?.atual && <EntregasCard ciclo={data.atual} titulo="Entregas desta semana" me={resident} onPhoto={setPhotoTs} />}
          <Card onPress={() => navigation.navigate('Nilde')} variant="primary" accessibilityLabel="Abrir Nilde">
            <View style={[styles.row, { gap: spacing.md }]}>
              <Icon name="rabbit" size={28} color="onPrimarySoft" />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" color="onPrimarySoft">Nilde (todo dia)</AppText>
                <AppText variant="caption" color="onPrimarySoft">{nildeToday === null ? 'Feno à vontade, água fresca e 3 checks por dia.' : `Hoje: ${nildeToday} de 3 refeições registradas`}</AppText>
              </View>
              <Icon name="chevron-right" color="onPrimarySoft" />
            </View>
          </Card>
        </>
      )}

      {tab === 'avaliar' && data && <AvaliarTab data={data} />}
      {tab === 'desempenho' && (desempenho.loading && !desempenho.data ? <SkeletonCard lines={5} /> : <DesempenhoTab data={data} desempenho={desempenho.data} />)}

      <BottomSheet visible={!!photoTs} onClose={() => setPhotoTs('')} title="Foto da tarefa">
        {!!photoTs && <FeedPhoto ts={photoTs} />}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap' },
});
