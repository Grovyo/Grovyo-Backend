const express = require("express");
const router = express.Router();

const { verifydm, reducedm, createconv } = require("../controllers/membership");

router.post("/verifydm/:userId", verifydm);
router.post("/reducedm/:userId", reducedm);
router.post("/createconv/:sender/:reciever", createconv);

module.exports = router;