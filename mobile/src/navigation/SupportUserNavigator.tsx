/** Support User navigation — a bottom tab bar (Home / Site visits / More)
 *  sits as the first screen of the existing stack, so every other screen
 *  below keeps navigating exactly as before via
 *  `navigation.navigate('RouteName')` (React Navigation bubbles unmatched
 *  route names up to this outer stack automatically). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';
import MoreScreen from '../screens/common/MoreScreen';
import SecuritySettingsScreen from '../screens/common/SecuritySettingsScreen';
import LanguageSettingsScreen from '../screens/common/LanguageSettingsScreen';
import SchemeBrowserScreen from '../screens/common/SchemeBrowserScreen';
import SchemeDetailScreen from '../screens/common/SchemeDetailScreen';
import QrScanScreen from '../screens/common/QrScanScreen';
import GisMapScreen from '../screens/common/GisMapScreen';
import SiteVisitListScreen from '../screens/common/SiteVisitListScreen';
import SiteVisitDetailScreen from '../screens/common/SiteVisitDetailScreen';
import VisitFormScreen from '../screens/meo/VisitFormScreen';
import VisitReportScreen from '../screens/meo/VisitReportScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import LanguageSwitcherButton from '../i18n/LanguageSwitcherButton';
import { colors, stackScreenOptions } from '../theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function SupportUserTabs() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => <LanguageSwitcherButton />,
        headerStyle: { backgroundColor: colors.primaryDark },
        headerTintColor: colors.white,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen
        name="SupportHome"
        component={RoleHomeScreen}
        options={{ title: t('navigation.supportUser'), tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="SiteVisitsTab"
        component={SiteVisitListScreen}
        options={{ title: t('navigation.siteVisits'), tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: t('navigation.more'), tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-outline" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}

export default function SupportUserNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{ ...stackScreenOptions, headerRight: () => <LanguageSwitcherButton /> }}>
      <Stack.Screen name="Tabs" component={SupportUserTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('navigation.notifications') }} />
      <Stack.Screen name="Security" component={SecuritySettingsScreen} options={{ title: t('navigation.security') }} />
      <Stack.Screen name="Language" component={LanguageSettingsScreen} options={{ title: t('navigation.language') }} />
      <Stack.Screen name="Schemes" component={SchemeBrowserScreen} options={{ title: t('navigation.schemeBrowser') }} />
      <Stack.Screen name="SchemeDetail" component={SchemeDetailScreen} options={{ title: t('navigation.schemeDetail') }} />
      <Stack.Screen name="QrScan" component={QrScanScreen} options={{ title: t('navigation.qrScan') }} />
      <Stack.Screen name="GisMap" component={GisMapScreen} options={{ title: t('navigation.gisMap') }} />
      <Stack.Screen name="SiteVisits" component={SiteVisitListScreen} options={{ title: t('navigation.siteVisits') }} />
      <Stack.Screen name="SiteVisitDetail" component={SiteVisitDetailScreen} options={{ title: t('navigation.siteVisit') }} />
      <Stack.Screen name="VisitForm" component={VisitFormScreen} options={{ title: t('navigation.visitForm') }} />
      <Stack.Screen name="VisitReport" component={VisitReportScreen} options={{ title: t('navigation.submittedReport') }} />
    </Stack.Navigator>
  );
}
