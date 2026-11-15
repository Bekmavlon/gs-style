import type { CapacitorConfig } from '@capacitor/cli';

// Android ilova (APK) konfiguratsiyasi. Veb-kod `dist/` dan olinadi.
const config: CapacitorConfig = {
  appId: 'uz.gsstyle.app',
  appName: 'G.S.Style',
  webDir: 'dist',
  android: {
    backgroundColor: '#f6f4f0'
  },
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // Android 15+ edge-to-edge: xavfsiz hudud qiymatlari CSS o'zgaruvchilari orqali beriladi
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT'
    }
  }
};

export default config;
