/** Lead MEO stack — Phase 0 home stub + Security settings; Phase 1 adds
 *  VisitFormScreen (owns the whole field-report flow: form, photos, and an
 *  optional issue report, all under screens/meo). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';
import SecuritySettingsScreen from '../screens/common/SecuritySettingsScreen';
import SchemeBrowserScreen from '../screens/common/SchemeBrowserScreen';
import SiteVisitListScreen from '../screens/common/SiteVisitListScreen';
import SiteVisitDetailScreen from '../screens/common/SiteVisitDetailScreen';
import VisitFormScreen from '../screens/meo/VisitFormScreen';
import VisitReportScreen from '../screens/meo/VisitReportScreen';
import { stackScreenOptions } from '../theme';

const Stack = createNativeStackNavigator();

export default function MeoNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="MeoHome" component={RoleHomeScreen} options={{ title: 'Lead MEO' }} />
      <Stack.Screen name="Security" component={SecuritySettingsScreen} options={{ title: 'Security' }} />
      <Stack.Screen name="Schemes" component={SchemeBrowserScreen} options={{ title: 'Scheme browser' }} />
      <Stack.Screen name="SiteVisits" component={SiteVisitListScreen} options={{ title: 'Site visits' }} />
      <Stack.Screen name="SiteVisitDetail" component={SiteVisitDetailScreen} options={{ title: 'Site visit' }} />
      <Stack.Screen name="VisitForm" component={VisitFormScreen} options={{ title: 'Visit form' }} />
      <Stack.Screen name="VisitReport" component={VisitReportScreen} options={{ title: 'Submitted report' }} />
    </Stack.Navigator>
  );
}
