# Digital Tapli 🖐️

A free, multiplayer gag app where you and your friends can upload photos of each other and give digital taplis (head slaps)!

---

## ⚡ Free Cross-Device Cloud Sync (Firebase)

To let **anyone upload photos from their phone and have it show up on everyone's phones instantly**:

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a free project (e.g. `my-tapli-gang`).
2. Click the **Web** icon (`</>`) to add a web app. Copy the `firebaseConfig` keys into [`firebase-config.js`](file:///C:/Users/06xus/tapli/firebase-config.js).
3. In the Firebase sidebar, go to **Firestore Database** → click **Create database** → select **Start in test mode**.
4. Done! Now anyone who visits your hosted link can upload photos and it will sync in real time to everyone.

*(Note: If Firebase config is left empty, the app runs locally using `localStorage` on that specific device).*

---

## 🚀 How to Host for Free (Share Link with Friends)

You can host this for $0 on any static hosting platform:

### GitHub Pages:
1. Push this folder to a GitHub repository.
2. In repo **Settings > Pages**, set Branch to `main` and hit Save.
3. Share the URL with your friends!

### Vercel / Netlify:
- Drag & drop the folder onto [Netlify Drop](https://app.netlify.com/drop) or deploy via [Vercel](https://vercel.com) for a free instant HTTPS link.
