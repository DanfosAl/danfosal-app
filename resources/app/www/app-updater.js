// Auto-updater for all platforms
// Checks for new versions and prompts user to update

class AppUpdater {
    constructor() {
        this.currentVersion = '1.2.0';
        this.updateCheckUrl = 'https://firebasestorage.googleapis.com/v0/b/danfosal-app.appspot.com/o/updates%2Fupdate-manifest.json?alt=media';
        this.checkInterval = 60 * 60 * 1000; // Check every hour
        this.platform = this.detectPlatform();
    }

    detectPlatform() {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('android')) return 'android';
        if (userAgent.includes('electron')) return 'windows';
        return 'web';
    }

    // Check for updates
    async checkForUpdates() {
        try {
            const response = await fetch(this.updateCheckUrl + '&t=' + Date.now());
            const manifest = await response.json();
            
            const platformUpdate = manifest[this.platform];
            if (!platformUpdate) return null;

            if (this.isNewerVersion(platformUpdate.version, this.currentVersion)) {
                return platformUpdate;
            }
            return null;
        } catch (error) {
            console.log('Update check failed:', error);
            return null;
        }
    }

    // Compare versions (e.g., "1.1.0" vs "1.0.0")
    isNewerVersion(remoteVersion, currentVersion) {
        const remote = remoteVersion.split('.').map(Number);
        const current = currentVersion.split('.').map(Number);
        
        for (let i = 0; i < 3; i++) {
            if (remote[i] > current[i]) return true;
            if (remote[i] < current[i]) return false;
        }
        return false;
    }

    // Show update dialog
    showUpdateDialog(updateInfo) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #1f2937;
            border-radius: 12px;
            padding: 24px;
            max-width: 400px;
            width: 100%;
            color: white;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        `;

        dialog.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">🚀</div>
                <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 8px; color: #f97316;">
                    Update Available!
                </h2>
                <p style="color: #9ca3af; margin-bottom: 20px;">
                    Version ${updateInfo.version} is now available
                </p>
                <div style="background: #374151; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: left;">
                    <p style="font-size: 13px; color: #d1d5db; margin: 0;">
                        ${updateInfo.releaseNotes}
                    </p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button id="update-later" style="
                        flex: 1;
                        padding: 12px;
                        background: #374151;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                    ">
                        Later
                    </button>
                    <button id="update-now" style="
                        flex: 1;
                        padding: 12px;
                        background: linear-gradient(to right, #f97316, #fb923c);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                    ">
                        Update Now
                    </button>
                </div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Later button
        dialog.querySelector('#update-later').addEventListener('click', () => {
            overlay.remove();
        });

        // Update now button
        dialog.querySelector('#update-now').addEventListener('click', () => {
            this.downloadAndInstall(updateInfo);
            overlay.remove();
        });

        return overlay;
    }

    // Download and install update
    downloadAndInstall(updateInfo) {
        if (this.platform === 'android') {
            // For Android, open download link
            window.open(updateInfo.url, '_blank');
            
            // Show installation instructions
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                right: 20px;
                background: linear-gradient(to right, #f97316, #fb923c);
                color: white;
                padding: 16px;
                border-radius: 8px;
                z-index: 9999;
                text-align: center;
                font-weight: 600;
            `;
            notification.innerHTML = '📥 Downloading update... Open the downloaded APK to install.';
            document.body.appendChild(notification);

            setTimeout(() => notification.remove(), 8000);
            
        } else if (this.platform === 'windows') {
            // For Windows Electron app
            if (window.electronAPI) {
                window.electronAPI.downloadUpdate(updateInfo);
            } else {
                window.open(updateInfo.url, '_blank');
            }
        } else {
            // For web, reload to get new version
            window.location.reload();
        }
    }

    // Start automatic update checks
    async startAutoCheck() {
        // Check on app start (after 3 seconds)
        setTimeout(async () => {
            const updateInfo = await this.checkForUpdates();
            if (updateInfo) {
                this.showUpdateDialog(updateInfo);
            }
        }, 3000);

        // Check periodically
        setInterval(async () => {
            const updateInfo = await this.checkForUpdates();
            if (updateInfo) {
                this.showUpdateDialog(updateInfo);
            }
        }, this.checkInterval);
    }
}

// Initialize updater
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.appUpdater = new AppUpdater();
        window.appUpdater.startAutoCheck();
    });
} else {
    window.appUpdater = new AppUpdater();
    window.appUpdater.startAutoCheck();
}
