export default {
  "name": "danfosal-app",
  "version": "1.3.1",
  "description": "A business management application with auto-updates and Instagram integration",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder --win",
    "dist:portable": "electron-builder --win portable",
    "publish": "electron-builder --win --publish always",
    "package": "electron-packager . --platform=win32 --arch=x64 --out=release-build --overwrite"
  },
  "author": "Danfosal",
  "license": "ISC",
  "devDependencies": {
    "@capacitor/cli": "^7.4.2",
    "electron": "^37.2.5",
    "electron-builder": "^24.13.3",
    "electron-packager": "^17.1.2"
  },
  "dependencies": {
    "@capacitor/android": "^7.4.2",
    "@capacitor/local-notifications": "^7.0.3",
    "electron-updater": "^6.6.2"
  },
  "build": {
    "appId": "com.danfosal.app",
    "productName": "Danfosal App",
    "directories": {
      "app": ".",
      "output": "dist-installer"
    },
    "files": [
      "**/*",
      "!node_modules/**/*",
      "!{.git,docs,test,final-build,release-build}/**/*"
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "publisherName": "Danfosal"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Danfosal App",
      "differentialPackage": false
    },
    "compression": "store"
  }
}