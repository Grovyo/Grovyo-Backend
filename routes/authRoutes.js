const express = require("express");
const router = express.Router();

const {
  checkemail,
  getdp,
  signupmobile,
  updatenotification,
  reporting,
  returnuser,
  updateaccount,
  fetchinterest,
  checkusername,
  fetchnoti,
  fcom,
  fconv,
  updateaddress,
  forwcc,
  passexist,
  ispasscorrect,
  verifytoken,
  signout,
  changepass,
  intrestcoms,
  joinmasscoms,
  createnewaccount,
  createnewaccountemail,
  newpasscode,
  interests,
  postguide,
} = require("../controllers/auth");
const upload = require("../middlewares/multer");

router.post("/v1/checkacc", checkemail);
router.get("/getdp/:userId", getdp);
router.post("/signup-mobile", signupmobile);
router.post("/updatenotification/:userId", updatenotification);
router.get("/getdetails/:id", returnuser);
router.post("/updateaccount/:id", upload.single("image"), updateaccount);
router.get("/v1/fetchinterest", fetchinterest);
router.post("/checkusername", checkusername);
router.get("/v1/fetchnoti/:id", fetchnoti);
router.get("/v1/fcom/:id", fcom);
router.get("/v1/fconv/:id", fconv);
router.post("/updateaddress/:userId", updateaddress);
router.post("/upinterest/:userId", interests);
router.post("/v1/forwcc", forwcc);
router.post("/v1/reporting/:userid", reporting);
router.get("/v1/passexist/:id", passexist);
router.post("/v1/newpasscode/:id", newpasscode);
router.get("/v1/intrestcoms/:id", intrestcoms);
router.post("/v1/ispasscorrect/:id", ispasscorrect);
router.post("/v1/verifytoken", verifytoken);
router.post("/v1/changepass", changepass);
router.post("/v1/joinmasscoms", joinmasscoms);
router.post("/v1/createnewaccount", upload.single("image"), createnewaccount);
router.post(
  "/v1/createnewaccountemail",
  upload.single("image"),
  createnewaccountemail
);
router.post("/signout/:id", signout);
router.post("/postguide/:id", postguide);

module.exports = router;
