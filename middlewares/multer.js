const multer = require("multer");

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000000 },
});

// Export the upload instance
module.exports = upload;