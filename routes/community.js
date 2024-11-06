const express = require("express");
const {
  create,
  unjoinmember,
  joinmember,
  getallmembers,
  addTopic,
  deletemessagestopic,
  mutecom,
  setcomtype,
  fetchmembers,
  forcejoincom,
  blockpcom
} = require("../controllers/community");
const upload = require("../middlewares/multer");
const router = express.Router();

router.post("/createcom/:userId", upload.single("image"), create);
router.post("/joincom/:userId/:comId", joinmember);
router.post("/unjoin/:userId/:comId", unjoinmember);
router.get("/v1/getallmembers/:id/:comId", getallmembers);
router.post("/addtopic/:userId/:comId", addTopic);
router.post("/v1/deletemessagestopic/:id", deletemessagestopic);
router.post("/v1/mutecom/:id/:comId", mutecom);
router.post("/v1/setcomtype/:id/:comId", setcomtype);
router.get("/v1/fetchmembers/:id/:comId", fetchmembers);
router.post("/v1/forcejoincom/:id/:comId", forcejoincom);
router.post("/v1/blockpcom/:id/:comId", blockpcom);

module.exports = router;
