# Auto Video Generator (AI Reel & Montage Maker)

An automated video generator built with React, Vite, HTML5 Canvas 2D/WebCodecs, and Web Audio API. 
The user selects photos and videos and provides an audio track (YouTube link with timestamp trimming or local audio file); the application **automatically** detects audio beats, paces the clips, applies dynamic Ken Burns pan & zoom to photos, renders beat transitions, and exports a high-quality vertical 9:16 MP4 video.

---

## 🚀 How to Run Locally (PC Debugging)

### Option 1: Quick Launch (Windows)
Double-click `start_dev.bat` in the root folder.

### Option 2: Manual Terminal Launch
1. **Start Backend (YouTube Audio Proxy)**:
   ```bash
   cd server
   node server.js
   ```
   *Runs on `http://localhost:3001`*

2. **Start Frontend Client**:
   ```bash
   cd client
   npm run dev
   ```
   *Open `http://localhost:5173` in your browser.*

---

## 📱 How to Convert to an Android APK

This project is built to standard web distribution standards (`client/dist`) and includes `capacitor.config.json`.

Whenever you are ready to generate an Android APK:
1. In `client/`, install Capacitor Android dependencies:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   ```
2. Build the web app bundle:
   ```bash
   npm run build
   ```
3. Initialize and add the Android platform:
   ```bash
   npx cap add android
   npx cap copy
   ```
4. Open in Android Studio to build your `.apk`:
   ```bash
   npx cap open android
   ```
   *(Inside Android Studio, click **Build &rarr; Build Bundle(s) / APK(s) &rarr; Build APK(s)**)*.
