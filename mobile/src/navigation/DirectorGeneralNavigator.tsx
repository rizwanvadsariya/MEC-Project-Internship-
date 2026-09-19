/** Director General stack — Phase 0 home stub + Security settings; Phase 1
 *  adds ApprovalQueueScreen (already stubbed under screens/directorGeneral),
 *  plus a view-only VisitForm (Step 15 — the DG has division-scoped read
 *  access even when not a team member; VisitForm owns the whole
 *  form/photos/issue report flow now). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';
import SecuritySettingsScreen from '../screens/common/SecuritySettingsScreen';
import SchemeBrowserScreen from '../screens/common/SchemeBrowserScreen';
import ApprovalQueueScreen from '../screens/directorGeneral/ApprovalQueueScreen';
import SiteVisitListScreen from '../screens/common/SiteVisitListScreen';
import SiteVisitDetailScreen from '../screens/common/SiteVisitDetailScreen';
import VisitFormScreen from '../screens/meo/VisitFormScreen';
import VisitReportScreen from '../screens/meo/VisitReportScreen';
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
      <Stack.Screen name="VisitForm" component={VisitFormScreen} options={{ title: 'Visit form' }} />
      <Stack.Screen name="VisitReport" component={VisitReportScreen} options={{ title: 'Submitted report' }} />
    </Stack.Navigator>
  );
}
