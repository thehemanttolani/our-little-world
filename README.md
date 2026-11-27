# Our Little World 💗

A tiny private-feeling chat and calling web app for two people. It uses GitHub Pages for the static website and Firebase Authentication + Realtime Database for messages, online presence and WebRTC call signalling.

## Important privacy note

- Both people use the same PIN. The PIN in `firebase-config.js` is a **front-end convenience gate**, not strong authentication. Anyone who can inspect the public source can discover it.
- The actual room key is generated in the URL fragment (`#room=...`) and is not sent to GitHub Pages as part of the web request. Treat the invite URL as a secret: only send it to your girlfriend.
- Firebase anonymous authentication and the database rules prevent unauthenticated database access, but anyone with the invite URL can create an anonymous session and access that room. Do not use this for highly sensitive conversations.
- WebRTC calls use public STUN servers. Some networks may require TURN relay infrastructure; calls may not connect on every network without it. Calls require HTTPS and microphone/camera permission.
- This starter does not provide end-to-end encryption, push notifications, message deletion, or robust multi-device identity. Messages remain in Firebase until deleted from the database.

## 1. Create Firebase project (free tier is usually enough for light personal use)

1. Go to https://console.firebase.google.com/ and create a project.
2. In **Build → Authentication → Sign-in method**, enable **Anonymous**.
3. In **Build → Realtime Database**, create a database. Choose a region close to you.
4. In Realtime Database → Rules, paste the contents of `database.rules.json` and click Publish.
5. In Project settings → General → Your apps, create a **Web app** and copy its Firebase config.
6. Open `firebase-config.js` and replace the placeholder values with your config. Copy the exact `databaseURL` shown by Firebase.
7. Change `SHARED_PIN` to a PIN you both know. Again, this is only a casual screen lock.

## 2. Test locally

Because this uses JavaScript modules, serve the folder over localhost (not by double-clicking `index.html`). For example, with Python installed:

```bash
python -m http.server 8000
```

Open http://localhost:8000. The first visit creates a room key in the URL. Copy the invite link using the Invite button and open it in a second browser/device. Enter the same PIN.

## 3. Publish on GitHub Pages

1. Create a new GitHub repository, e.g. `our-little-world`.
2. Upload all files from this folder to the repository root.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Wait for GitHub Pages to publish. Your site URL will look like `https://YOUR-USERNAME.github.io/our-little-world/`.
6. Open that URL, enter the PIN, and use **Invite** to copy the full link containing the private room key. Send that exact link to your girlfriend.

## 4. First-use checklist

- Test messaging in two different browsers or devices.
- Check the online indicator by closing one browser and waiting a few seconds.
- Test calls on two devices, with microphone/camera permissions enabled.
- Use headphones to avoid audio feedback.
- If calls fail across networks, configure a TURN service and add its credentials to `rtcConfig` in `app.js`.

## Troubleshooting

- **"Couldn't connect"**: check Firebase config, Anonymous sign-in, database URL, and database rules.
- **Camera/mic unavailable**: use the published HTTPS GitHub Pages URL and allow browser permissions.
- **No incoming call**: both people must have the app open; calls are not push notifications.
- **Messages don't sync**: confirm both people opened the exact same invite URL (including `#room=...`).

## Files

- `index.html` – page structure
- `style.css` – responsive romantic theme
- `app.js` – chat, presence, WebRTC calling
- `firebase-config.js` – your Firebase settings and shared PIN
- `database.rules.json` – Realtime Database access rules
