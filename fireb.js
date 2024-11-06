const serviceKey = require("./grovyo-89dc2-ff6415ff18de.json");
const admin = require("firebase-admin");

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceKey),
    databaseURL: "https://grovyo-89dc2.firebaseio.com",
  });
  console.log("Firebase Admin initialized successfully!");
} catch (error) {
  console.error("Firebase Admin initialization error:", error);
}

module.exports = admin;
