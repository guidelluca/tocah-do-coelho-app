import { View } from 'react-native';
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
  Financas: { label: 'Finanças', icon: 'wallet-outline', iconActive: 'wallet' },
  Tarefas: { label: 'Tarefas', icon: 'broom', iconActive: 'broom' },
  Nilde: { label: 'Nilde', icon: 'rabbit-variant-outline', iconActive: 'rabbit-variant' },
  Feed: { label: 'Feed', icon: 'forum-outline', iconActive: 'forum' },
};

/** Ícone com "pílula" atrás quando a aba está ativa (padrão Material 3). */
function TabIcon({ name, color, focused, background }) {
  return (
    <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? background : 'transparent' }}>
      <MaterialCommunityIcons name={name} size={22} color={color} />
    </View>
  );
}

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
        tabBarActiveTintColor: colors.onPrimarySoft,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { ...typography.overline, textTransform: 'none', letterSpacing: 0, fontSize: 11 },
        tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? TABS[route.name].iconActive : TABS[route.name].icon} color={color} focused={focused} background={colors.primarySoft} />,
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
