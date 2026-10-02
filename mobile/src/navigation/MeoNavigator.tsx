/** Lead MEO stack — Phase 0 home stub + Security settings; Phase 1 adds
 *  VisitFormScreen (owns the whole field-report flow: form, photos, and an
 *  optional issue report, all under screens/meo). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';
import SecuritySettingsScreen from '../screens/common/SecuritySettingsScreen';
import LanguageSettingsScreen from '../screens/common/LanguageSettingsScreen';
import SchemeBrowserScreen from '../screens/common/SchemeBrowserScreen';
import SchemeDetailScreen from '../screens/common/SchemeDetailScreen';
import QrScanScreen from '../screens/common/QrScanScreen';
import GisMapScreen from '../screens/common/GisMapScreen';
import KpiDashboardScreen from '../screens/common/KpiDashboardScreen';
import SiteVisitListScreen from '../screens/common/SiteVisitListScreen';
import SiteVisitDetailScreen from '../screens/common/SiteVisitDetailScreen';
import VisitCalendarScreen from '../screens/common/VisitCalendarScreen';
import VisitFormScreen from '../screens/meo/VisitFormScreen';
import VisitReportScreen from '../screens/meo/VisitReportScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import CommentsScreen from '../screens/common/CommentsScreen';
import LanguageSwitcherButton from '../i18n/LanguageSwitcherButton';
import { stackScreenOptions } from '../theme';

const Stack = createNativeStackNavigator();

export default function MeoNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{ ...stackScreenOptions, headerRight: () => <LanguageSwitcherButton /> }}>
      <Stack.Screen name="MeoHome" component={RoleHomeScreen} options={{ title: t('navigation.leadMeo') }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('navigation.notifications') }} />
      <Stack.Screen name="Security" component={SecuritySettingsScreen} options={{ title: t('navigation.security') }} />
      <Stack.Screen name="Language" component={LanguageSettingsScreen} options={{ title: t('navigation.language') }} />
      <Stack.Screen name="Schemes" component={SchemeBrowserScreen} options={{ title: t('navigation.schemeBrowser') }} />
      <Stack.Screen name="SchemeDetail" component={SchemeDetailScreen} options={{ title: t('navigation.schemeDetail') }} />
      <Stack.Screen name="QrScan" component={QrScanScreen} options={{ title: t('navigation.qrScan') }} />
      <Stack.Screen name="GisMap" component={GisMapScreen} options={{ title: t('navigation.gisMap') }} />
      <Stack.Screen name="KpiDashboard" component={KpiDashboardScreen} options={{ title: t('navigation.kpiDashboard') }} />
      <Stack.Screen name="SiteVisits" component={SiteVisitListScreen} options={{ title: t('navigation.siteVisits') }} />
      <Stack.Screen name="SiteVisitDetail" component={SiteVisitDetailScreen} options={{ title: t('navigation.siteVisit') }} />
      <Stack.Screen name="VisitCalendar" component={VisitCalendarScreen} options={{ title: t('navigation.visitCalendar') }} />
      <Stack.Screen name="VisitForm" component={VisitFormScreen} options={{ title: t('navigation.visitForm') }} />
      <Stack.Screen name="VisitReport" component={VisitReportScreen} options={{ title: t('navigation.submittedReport') }} />
      <Stack.Screen name="Comments" component={CommentsScreen} options={{ title: t('navigation.discussion') }} />
    </Stack.Navigator>
  );
}
