const express = require("express");
const {
  newforyoufetchMore,
  joinedcomnews3,
  newfetchfeed,
  compostfeed,
  fetchallposts,
  gettopicmessages,
  readalltcm,
  fetchallcomments,
  likepost,
  create,
  deletepost,
  createpollcom,
  votenowpoll,
  postanythings3,
} = require("../controllers/post");
const upload = require("../middlewares/multer");
const router = express.Router();

router.get("/v1/getfeed/:id", newfetchfeed);
router.get("/v1/fetchmore/:id", newforyoufetchMore);
router.get("/v1/getfollowingfeed/:userId", joinedcomnews3);
router.post("/v1/compostfeed/:id/:comId", compostfeed);
router.post("/v1/fetchallposts/:id/:comId", fetchallposts);
router.get("/v1/gettopicmessages/:id/:topicId", gettopicmessages);
router.post(`/v1/readalltcm/:id/:topicid`, readalltcm);
router.get("/fetchallcomments/:userId/:postId", fetchallcomments);
router.post("/likepost/:userId/:postId", likepost);
router.post("/addcomment/:userId/:postId", create);
router.delete("/deletepost/:userId/:postId", deletepost);
router.post("/votenowpoll/:id/:postId/:opId", votenowpoll);
router.post("/createpollcom/:id/:comId/:topicId", upload.any(), createpollcom);
router.post(
  "/v1/postanything/:userId/:comId/:topicId",
  upload.any(),
  postanythings3
);

module.exports = router;
