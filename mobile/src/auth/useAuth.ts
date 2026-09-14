/** Hook to read the auth context: { user, role, divisionId, signIn, signOut }. */
import { useAuthContext } from './AuthProvider';

export function useAuth() {
  const { user, accessToken, isLoading, signIn, signOut, updateSession } = useAuthContext();
  return {
    user,
    role: user?.role ?? null,
    divisionId: user?.divisionId ?? null,
    departmentId: user?.departmentId ?? null,
    accessToken,
    isAuthenticated: !!user,
    isLoading,
    signIn,
    signOut,
    updateSession,
  };
}
