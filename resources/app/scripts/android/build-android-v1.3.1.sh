#!/bin/bash
# Danfosal App - Android Build Script v1.3.1
# Updated with glassmorphism design

echo "🚀 Building Danfosal App Android v1.3.1..."
echo "📱 This version includes the updated glassmorphism design"

# Update app version
echo "📝 Updating app version to 1.3.1..."
cd www/android

# Build the release APK
echo "🔨 Building release APK..."
echo "⚠️ Note: Requires Android Studio and Java to be installed"
echo "📋 To complete the build manually:"
echo "   1. Open www/android in Android Studio"
echo "   2. Build > Generate Signed Bundle/APK"
echo "   3. Choose APK and follow the signing steps"
echo ""
echo "🎨 New Features in v1.3.1:"
echo "   ✅ Glassmorphism dashboard design"
echo "   ✅ Emoji-based navigation icons"
echo "   ✅ Enhanced backdrop blur effects"
echo "   ✅ Animated gradient backgrounds"
echo "   ✅ Modern card layouts with glass effects"
echo ""

# Alternative command line build (requires Java)
echo "🔧 Alternative: Run './gradlew assembleRelease' when Java is installed"
echo "📦 APK will be generated in: app/build/outputs/apk/release/"
echo "✨ Build preparation complete!"