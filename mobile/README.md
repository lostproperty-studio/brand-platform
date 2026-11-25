# LP Platform for iOS

A native iPhone and iPad app for the brand platform. Clients sign in, browse their brand (guidelines, resources,
showcase) and use the apps (Writer and the rest) with a native feel: a tab bar, the safe areas, haptics,
notifications, and links that open in the app.

It's a native shell (Capacitor 7) around the platform itself: the app opens the platform's pages, so every change
to the platform reaches the app straight away, without a new App Store release. A new release is only needed when
something here (in `mobile/`) changes.

## How it fits together

- `capacitor.config.ts`: which platform the app opens (staging by default for now), its name and bundle ID
  (`studio.lostproperty.platform`). The app adds `LPPlatformApp` to its user agent; the platform sees it and switches
  to its app look (`app/layout.tsx` adds `in-app` to the page, styles in `app/globals.css`).
- `components/NativeBridge.tsx` (in the platform): talks to the phone. Links from emails open in the app, other
  sites and downloads open in a Safari sheet, the tab bar taps, and it asks for notifications once someone's signed in.
- Sign-in: the email has a 6-digit code as well as the link, so people can sign in inside the app. With universal
  links set up (below), tapping the link in the email opens the app too.
- `ios/App`: the Xcode project. The icon and launch screen are the LP monogram.

## First build (a Mac with Xcode 16)

1. `cd mobile && npm install`
2. `npm run staging` (or `npm run live` once the changes are live) to write the settings into the Xcode project.
3. `npm run open` opens Xcode. Choose the **App** target → Signing & Capabilities → your Lost Property team.
4. Run it on a simulator or a plugged-in iPhone.

## Before the App Store

1. **Apple Developer account** for Lost Property (organisation, £79 a year), so the app is published as Lost Property.
2. **Universal links**: in Vercel set `APPLE_TEAM_ID` (Apple Developer → Membership). The platform then serves
   `/.well-known/apple-app-site-association`, and links in sign-in emails open the app.
3. **Notifications**: in Apple Developer → Keys, make an APNs key. Phones register in the `app_devices` table
   (migration 0016); sending (approvals waiting, replies from Lost Property) is the next step once the key exists.
   Set `aps-environment` in `ios/App/App/App.entitlements` to `production` for the App Store build.
4. **Branded sign-in email**: the code appears in the platform's own sign-in email. If Supabase sends the plain
   email instead (no email service set), add `{{ .Token }}` to its Magic Link template too.
5. **TestFlight**: Product → Archive in Xcode, upload, then invite clients to test before the App Store.
6. **App Store review**: Apple asks that an app does more than show a website. This one has native navigation,
   notifications, universal links, sharing and offline handling, and is for signed-in clients, which fits
   their guidance. A demo account for the reviewer is needed (a test client portal with an email that can sign in).

Google sign-in is hidden in the app (Google doesn't allow it inside apps); the studio team and clients use email.
