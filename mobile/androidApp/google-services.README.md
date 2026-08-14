# Firebase Configuration — Android

## Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create or select project **SECT**
3. Add an Android app with package name: `com.ftci.sect`
4. Download `google-services.json` and place it in this directory
5. The file is excluded from git via `.gitignore`

## Required

The `google-services.json` file must contain:
- `project_info.project_number` — Firebase project number
- `project_info.project_id` — Firebase project ID (e.g., `sect-app`)
- `client[0].client_info.mobile_client_id` — Android app ID
- `client[0].package_name` — Must be `com.ftci.sect`
- `client[0].api_key[0].current_key` — Firebase API key

## Verification

After placing the file, verify the build works:
```bash
cd /home/z/SECT-project/mobile
./gradlew :androidApp:assembleDebug
```

If you see `google-services.json is missing`, the file is not in the correct location.
