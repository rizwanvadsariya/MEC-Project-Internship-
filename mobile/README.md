# Mobile — React Native (Expo, TypeScript)

Field-facing app for all four roles (RD, DG, MEO, Support). Talks only to the
Express API (`../backend`) over HTTPS + JWT — never directly to Supabase for
data, per `../architecture.md` §2.

## Layout

| Path                                                   | Responsibility                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/`                                             | Typed API client (axios + JWT refresh interceptor), one module per resource.                                                                                                                                                                      |
| `src/auth/`                                            | AuthProvider, `useAuth`, refresh-token kept in `expo-secure-store` (never AsyncStorage).                                                                                                                                                          |
| `src/navigation/`                                      | Root navigator + one navigator per role (role-based routing). Deep-link config.                                                                                                                                                                   |
| `src/screens/`                                         | Screens grouped by role: `auth/`, `common/`, `regionalDirector/`, `directorGeneral/`, `meo/`, `supportUser/`. `common/SecuritySettingsScreen.tsx` is the self-service TOTP MFA enrollment screen (backend-proxied, never a direct Supabase call). |
| `src/components/`                                      | Reusable UI: `common/`, `forms/` (dynamic template renderer), `charts/`, `map/`.                                                                                                                                                                  |
| `src/features/`                                        | Per-domain hooks + query definitions (schemes, teams, approvals, siteVisits, issues).                                                                                                                                                             |
| `src/offline/`                                         | SQLite store + sync queue for MEO forms/photos captured offline (Phase 2).                                                                                                                                                                        |
| `src/i18n/`                                            | English / Urdu / Sindhi string catalogs (Phase 2).                                                                                                                                                                                                |
| `src/theme/`, `src/utils/`, `src/hooks/`, `src/types/` | Cross-cutting.                                                                                                                                                                                                                                    |

## Getting started

```bash
npm install

# The API base URL comes from API_BASE_URL in app.config.js.
# Do not use localhost for a physical phone: localhost means the phone itself.
# Find the Wi-Fi address in Windows PowerShell:
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Wi-Fi' -and $_.IPAddress -notlike '169.254.*' } | Select-Object IPAddress

# Start the backend in a separate terminal first, from the repository root:
cd ..\backend
npm install
npm run dev

# In this mobile terminal, use your computer's Wi-Fi address:
cd ..\mobile
$env:API_BASE_URL = 'http://192.168.100.7:4000/api/v1'
npx expo start -c
# Expo Go -> scan the QR code, or enter the displayed exp:// URL manually.
```

The address `192.168.100.7` is an example from the current development machine.
Replace it whenever the computer changes Wi-Fi networks. To avoid setting it in
every terminal, create `mobile/.env` (it is git-ignored) with:

```env
API_BASE_URL=http://192.168.100.7:4000/api/v1
```

Then run `npx expo start -c` from `mobile/`. The phone and computer must be on
the same Wi-Fi network, and Windows Firewall must allow Node.js on that network.
Verify the backend is reachable from the computer with:

```powershell
Invoke-WebRequest http://192.168.100.7:4000/api/v1/health
```
