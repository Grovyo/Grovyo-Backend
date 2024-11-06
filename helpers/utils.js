const aesjs = require("aes-js");
const { SECKEY } = require("./config");

//encryption and decryption
const encryptaes = (data) => {
  const textBytes = aesjs.utils.utf8.toBytes(data);
  const aesCtr = new aesjs.ModeOfOperation.ctr(JSON.parse(SECKEY), new aesjs.Counter(5));
  return aesjs.utils.hex.fromBytes(aesCtr.encrypt(textBytes));
};

const decryptaes = (data) => {
  try {
    if (typeof data !== "string") {
      data = JSON.stringify(data);
    }

    const encryptedBytes = aesjs.utils.hex.toBytes(data);
    const aesCtr = new aesjs.ModeOfOperation.ctr(JSON.parse(SECKEY), new aesjs.Counter(5));

    return aesjs.utils.utf8.fromBytes(aesCtr.decrypt(encryptedBytes));
  } catch (e) {
    console.error("Decryption error:", e);
    throw new Error("Decryption failed");
  }
};

const cleanArray = arr => arr.filter(Boolean).map(String).filter(s => s.trim() !== "");

module.exports = { encryptaes, decryptaes, cleanArray };