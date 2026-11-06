import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../theme/ThemeContext';
import { formatRelativeTime } from '../utils/date';
import { displayName } from '../utils/text';
import { AppText, Avatar, BottomSheet, EmptyState, ListRow } from './ui';

function describe(item) {
  if (item.type === 'check') return `concluiu ${item.tarefa ? `“${item.tarefa}”` : 'a tarefa da semana'}`;
  if (item.type === 'rating') return `avaliou a tarefa de ${displayName(item.target)}`;
  if (String(item.target).toUpperCase() === 'NILDE') return `deu comida pra Nilde (${item.tarefa})`;
  return `postou: “${String(item.content || '').slice(0, 80)}”`;
}

export function NotificationsSheet({ visible, onClose }) {
  const { notificationItems } = useNotifications();
  const { colors, spacing } = useTheme();
  const navigation = useNavigation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Notificações" subtitle="O que rolou na casa nesta semana">
      {!notificationItems.length && <EmptyState icon="bell-sleep-outline" title="Tudo calmo por aqui" message="Quando alguém postar, concluir tarefa ou cuidar da Nilde, aparece aqui." compact />}
      {notificationItems.map((item) => (
        <ListRow
          key={`${item.ts}-${item.rowIndex}`}
          onPress={() => {
            onClose?.();
            navigation.navigate('Feed');
          }}
          left={
            <View>
              <Avatar name={item.type === 'rating' ? '?' : item.actor} size={40} />
              {item.isUnread && <View style={{ position: 'absolute', right: -1, top: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.surface }} />}
            </View>
          }
          title={
            <AppText variant={item.isUnread ? 'bodyStrong' : 'body'} numberOfLines={2}>
              <AppText variant="bodyStrong">{item.type === 'rating' ? 'Alguém' : displayName(item.actor)} </AppText>
              {describe(item)}
            </AppText>
          }
          subtitle={formatRelativeTime(item.ts)}
          style={{ paddingVertical: spacing.sm }}
        />
      ))}
    </BottomSheet>
  );
}
