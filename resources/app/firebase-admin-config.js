/**
 * Firebase Admin SDK Configuration for EasyPOS OCR Bridge
 * Provides Node.js backend access to Firestore database
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let db = null;

/**
 * Initialize Firebase Admin SDK
 * @returns {Object} Firestore database instance
 */
function initializeFirebase() {
    if (db) {
        return db; // Already initialized
    }

    try {
        const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
        
        // Check if service account key exists
        if (!fs.existsSync(serviceAccountPath)) {
            console.error('❌ serviceAccountKey.json not found!');
            console.error('📝 Instructions:');
            console.error('   1. Go to Firebase Console → Project Settings → Service Accounts');
            console.error('   2. Click "Generate new private key"');
            console.error('   3. Save the file as: ' + serviceAccountPath);
            console.error('   4. Restart the OCR Bridge');
            throw new Error('Firebase service account key not found');
        }

        const serviceAccount = require(serviceAccountPath);
        
        // Initialize Firebase Admin
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });

        db = admin.firestore();
        
        console.log('✅ Firebase Admin SDK initialized successfully');
        console.log(`   Project: ${serviceAccount.project_id}`);
        
        return db;
        
    } catch (error) {
        console.error('❌ Failed to initialize Firebase:', error.message);
        throw error;
    }
}

/**
 * Get Firestore database instance
 * @returns {Object} Firestore database
 */
function getFirestore() {
    if (!db) {
        return initializeFirebase();
    }
    return db;
}

/**
 * Get Firebase Admin instance
 * @returns {Object} Firebase Admin
 */
function getAdmin() {
    return admin;
}

module.exports = {
    initializeFirebase,
    getFirestore,
    getAdmin
};
