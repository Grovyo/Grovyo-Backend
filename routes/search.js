const express = require("express");
const { searchpros,
    searchcoms,
    searchall,
    searchnow,
    addRecentSearchProsite,
    addRecentSearchCommunity,
    removeRecentSearchCommunity,
    removeRecentSearchProsite,
    recentSearches,
    addRecentPosts,
    removeRecentPost
} = require("../controllers/search");
const router = express.Router();

router.post("/searchpros", searchpros);
router.post("/searchcoms/:id", searchcoms);
router.post("/searchall/:id", searchall);
router.post("/searchnow/:id", searchnow);
router.post("/addRecentSearchProsite/:id", addRecentSearchProsite);
router.post("/addRecentSearchCommunity/:id", addRecentSearchCommunity);
router.post("/removeRecentSearchCommunity/:id", removeRecentSearchCommunity);
router.post("/removeRecentSearchProsite/:id", removeRecentSearchProsite);
router.post("/removeRecentPost/:id", removeRecentPost);
router.post("/addRecentPosts/:id", addRecentPosts);
router.get("/recentSearches/:id", recentSearches);

module.exports = router;