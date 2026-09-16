/** Director General stack — Phase 0 home stub + Security settings; Phase 1
 *  adds ApprovalQueueScreen (already stubbed under screens/directorGeneral). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';
import SecuritySettingsScreen from '../screens/common/SecuritySettingsScreen';
import SchemeBrowserScreen from '../screens/common/SchemeBrowserScreen';
import ApprovalQueueScreen from '../screens/directorGeneral/ApprovalQueueScreen';
import SiteVisitListScreen from '../screens/common/SiteVisitListScreen';
import SiteVisitDetailScreen from '../screens/common/SiteVisitDetailScreen';
import { stackScreenOptions } from '../theme';

const Stack = createNativeStackNavigator();

export default function DirectorGeneralNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DgHome" component={RoleHomeScreen} options={{ title: 'Director General' }} />
      <Stack.Screen name="Security" component={SecuritySettingsScreen} options={{ title: 'Security' }} />
      <Stack.Screen name="Schemes" component={SchemeBrowserScreen} options={{ title: 'Scheme browser' }} />
      <Stack.Screen name="ApprovalQueue" component={ApprovalQueueScreen} options={{ title: 'Approval queue' }} />
      <Stack.Screen name="SiteVisits" component={SiteVisitListScreen} options={{ title: 'Site visits' }} />
      <Stack.Screen name="SiteVisitDetail" component={SiteVisitDetailScreen} options={{ title: 'Site visit' }} />
    </Stack.Navigator>
  );
}
