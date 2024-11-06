const express = require("express");
const {
  convexists,
  fetchconvs,
  fetchallchatsnew,
  muting,
  removeconversation,
  fetchallmsgreqs,
  acceptorrejectmesgreq,
  fetchmorehiddenconv,
  blockpeople,
  loadmoremessages,
  createmessagereqnew,
  createmessagereqs,
  deletemessages,
  resethidden,
  fetchblocklist,
  sendexistingmsg,
  hideconvmsg,
  loadmorechatmsgs,
  sendchatfile
} = require("../controllers/conversation");
const upload = require("../middlewares/multer");
const router = express.Router();

router.post("/checkconv", convexists);
router.get("/v1/fetchconvs/:id/:convId/:otherid", fetchconvs);
router.post("/v1/fetchallchatsnew/:id", fetchallchatsnew);
router.post("/v1/mute", muting);
router.post("/removeconversation/:id", removeconversation);
router.get("/fetchallmsgreqs/:id", fetchallmsgreqs);
router.post("/acceptorrejectmesgreq", acceptorrejectmesgreq);
router.get("/v1/fetchmorehiddenconv/:id", fetchmorehiddenconv);
router.post("/blockpeople/:id", blockpeople);
router.get("/v1/loadmoremessages/:id/:topicId/:sequence", loadmoremessages);
router.post("/v1/createmessagereqnew", createmessagereqnew);
router.post("/createmessagereqs", createmessagereqs);
router.get("/fetchblocklist/:id", fetchblocklist);
router.post("/sendexistingmsg/:convId", sendexistingmsg);
router.post("/v1/deletemessages/:id", deletemessages)
router.post("/v1/hideconvmsg/:id", hideconvmsg);
router.post("/v1/loadmorechatmsgs/:id", loadmorechatmsgs);
router.post("/v1/resethidden", resethidden);
router.post("/v1/sendchatfile", upload.any(), sendchatfile);

module.exports = router;
