import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FinancesScreen } from '../screens/FinancesScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { NildeScreen } from '../screens/NildeScreen';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { useNotifications } from '../context/NotificationContext';

const Tab = createBottomTabNavigator();

export function AppNavigator() {
  const { isDark } = useThemeMode();
  const { notificationCount } = useNotifications();
  const colors = isDark ? darkTheme : lightTheme;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          height: 82,
          paddingBottom: 10,
          paddingTop: 10,
          marginHorizontal: 12,
          marginBottom: 4,
          borderRadius: 20,
          shadowColor: isDark ? '#000' : '#4b3b83',
          shadowOpacity: isDark ? 0.3 : 0.15,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 9,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontWeight: '800', fontSize: 11 },
        tabBarItemStyle: { borderRadius: 12 },
        tabBarActiveBackgroundColor: isDark ? colors.secondary : '#f3efff',
        tabBarIcon: ({ color, size }) => {
          const map = { Inicio: 'home-outline', Financas: 'cash-multiple', Tarefas: 'clipboard-list-outline', Nilde: 'rabbit', Feed: 'message-text-outline' };
          return <MaterialCommunityIcons name={map[route.name]} size={size} color={color} />;
        },
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
          tabBarBadgeStyle: { backgroundColor: '#ef4444', color: '#fff', fontSize: 10, fontWeight: '800' },
        }}
      />
    </Tab.Navigator>
  );
}
