# Firebase Configuration — iOS

## Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create or select project **SECT**
3. Add an iOS app with bundle ID: `ci.sect.app.ios`
4. Download `GoogleService-Info.plist` and place it in this directory
5. The file is excluded from git via `.gitignore`

## Required

The `GoogleService-Info.plist` file must contain:
- `BUNDLE_ID` — Must be `ci.sect.app.ios`
- `PROJECT_ID` — Firebase project ID (e.g., `sect-app`)
- `GOOGLE_APP_ID` — Firebase app ID
- `GCM_SENDER_ID` — FCM sender ID (same as project number)

## Verification

After placing the file, add it to the Xcode project:
1. Open `iosApp.xcodeproj` in Xcode
2. Right-click the `iosApp` group → "Add Files to iosApp"
3. Select `GoogleService-Info.plist`
4. Ensure "Copy items if needed" is checked

## APNs Configuration

Also configure APNs with Firebase:
1. Firebase Console → Project Settings → Cloud Messaging
2. Upload your APNs key (.p8 file) from Apple Developer Portal
3. Enter Key ID and Team ID
