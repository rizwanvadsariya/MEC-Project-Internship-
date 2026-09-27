/** Hook to read the language context — mirrors auth/useAuth.ts's thin
 *  relationship to useAuthContext. */
import { useLanguageContext } from './LanguageProvider';

export function useLanguage() {
  const { isLoading, language, isRTL, restartNeeded, setLanguage, restartNow } = useLanguageContext();
  return { isLoading, language, isRTL, restartNeeded, setLanguage, restartNow };
}
