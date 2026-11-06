import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FinancesScreen } from '../screens/FinancesScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { NildeScreen } from '../screens/NildeScreen';
import { useTheme } from '../theme/ThemeContext';
import { useNotifications } from '../context/NotificationContext';

const Tab = createBottomTabNavigator();

// Nomes das rotas ficam iguais (links/atalhos antigos); só o rótulo ganha acento.
const TABS = {
  Inicio: { label: 'Início', icon: 'home-variant-outline', iconActive: 'home-variant' },
  Financas: { label: 'Finanças', icon: 'cash-multiple', iconActive: 'cash-multiple' },
  Tarefas: { label: 'Tarefas', icon: 'clipboard-check-outline', iconActive: 'clipboard-check' },
  Nilde: { label: 'Nilde', icon: 'rabbit', iconActive: 'rabbit' },
  Feed: { label: 'Feed', icon: 'message-text-outline', iconActive: 'message-text' },
};

export function AppNavigator() {
  const { colors, typography, layout, shadow } = useTheme();
  const { notificationCount } = useNotifications();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        title: TABS[route.name].label,
        tabBarLabel: TABS[route.name].label,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: layout.tabBarHeight + 8,
          paddingTop: 6,
          paddingBottom: 8,
          ...shadow(2),
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { ...typography.overline, textTransform: 'none', letterSpacing: 0, fontSize: 11 },
        tabBarIcon: ({ color, focused }) => <MaterialCommunityIcons name={focused ? TABS[route.name].iconActive : TABS[route.name].icon} size={24} color={color} />,
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="Financas" component={FinancesScreen} />
      <Tab.Screen name="Tarefas" component={TasksScreen} />
      <Tab.Screen name="Nilde" component={NildeScreen} />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarBadge: notificationCount > 0 ? (notificationCount > 99 ? '99+' : notificationCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.onDanger, fontSize: 10, fontWeight: '700' },
        }}
      />
    </Tab.Navigator>
  );
}
