const { URL, POST_URL } = require("../helpers/config");
const User = require("../models/userAuth");
const Community = require("../models/community");
const Post = require("../models/post");

exports.searchpros = async (req, res) => {
  const { query } = req.query;
  try {
    if (!query) {
      return res
        .status(400)
        .json({ success: false, message: "Query is required" });
    }

    const processedQuery = query.trim().toLowerCase();

    const pros = await User.find({
      $or: [
        { fullname: { $regex: new RegExp(processedQuery, "i") } },
        { username: { $regex: new RegExp(processedQuery, "i") } },
      ],
    })
      .select("fullname profilepic username isverified createdAt")
      .lean()
      .limit(100)
      .exec();

    const dps = pros.map((pro) => URL + pro.profilepic);

    res.status(200).json({ success: true, data: { pros, dps } });
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.searchcoms = async (req, res) => {
  const { id } = req.params;
  const { query } = req.query;
  try {
    if (!query) {
      res.status(400).json({ success: false });
    } else {
      const coms = await Community.find({
        title: { $regex: `.*${query}.*`, $options: "i" },
        type: "public",
        blocked: { $nin: id },
      })
        .populate("creator", "fullname username profilepic isverified")
        .select("title createdAt dp memberscount")
        .limit(100)
        .lean()
        .exec();

      const dps = coms.map((com) => URL + com.dp);
      const creatordps = coms.map((com) => URL + com.creator?.profilepic);

      res.status(200).json({ data: { coms, dps, creatordps }, success: true });
    }
  } catch (e) {
    console.log(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.searchall = async (req, res) => {
  const { query } = req.query;
  const { id } = req.params;

  if (!query) {
    return res
      .status(400)
      .json({ success: false, message: "Query is required" });
  }

  const processedQuery = query.trim().toLowerCase();

  try {
    // Fetch public communities and their IDs
    const publicCommunities = await Community.find({ type: "public" })
      .select("_id")
      .lean();
    const publicCommunityIds = publicCommunities.map(
      (community) => community._id
    );

    // Fetch posts from public communities
    const posts = await Post.find({
      $or: [
        { title: { $regex: `.*${processedQuery}.*`, $options: "i" } },
        { desc: { $regex: `.*${processedQuery}.*`, $options: "i" } },
      ],
      community: { $in: publicCommunityIds },
      status: "Unblock",
    })
      .select("title desc post topicId community sender")
      .limit(5)
      .populate("community", "dp title createdAt")
      .populate("sender", "fullname")
      .lean();

    const mergedPosts = posts.map((post) => ({
      ...post,
      img:
        POST_URL +
        (post.post[0].type === "image/jpg"
          ? post.post[0].content
          : post.post[0].thumbnail || post.post[0].content),
      dps: post.community ? URL + post.community.dp : URL + "default.png",
    }));

    // Fetch public communities matching the query
    const communities = await Community.find({
      title: { $regex: `.*${processedQuery}.*`, $options: "i" },
      type: "public",
      blocked: { $nin: id },
    })
      .populate("creator", "fullname username profilepic isverified")
      .select("title createdAt dp memberscount")
      .limit(5)
      .lean();

    const mergedCommunities = communities.map((com) => ({
      ...com,
      img: URL + com.dp,
      dps: URL + com?.creator?.profilepic,
    }));

    // Fetch users matching the query
    const users = await User.find({
      $or: [
        { fullname: { $regex: `.*${processedQuery}.*`, $options: "i" } },
        { username: { $regex: `.*${processedQuery}.*`, $options: "i" } },
      ],
    })
      .select("fullname profilepic username isverified createdAt")
      .lean()
      .limit(5);

    const mergedUsers = users.map((user) => ({
      ...user,
      dps: URL + user.profilepic,
    }));

    return res.status(200).json({
      success: true,
      mergedpros: mergedUsers || [],
      mergedcoms: mergedCommunities || [],
      mergedposts: mergedPosts || [],
    });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.searchnow = async (req, res) => {
  const { query } = req.query;
  try {
    if (!query) {
      return res
        .status(400)
        .json({ success: false, message: "Query is required" });
    }

    const processedQuery = query.trim().toLowerCase();

    const postsByTitleAndDesc = await Post.find({
      $or: [
        { title: { $regex: new RegExp(processedQuery, "i") } },
        { desc: { $regex: new RegExp(processedQuery, "i") } },
      ],
      status: "Unblock",
    })
      .select("title desc post topicId community sender")
      .populate("community", "dp title createdAt type category")
      .populate("sender", "fullname")
      .limit(100)
      .lean()
      .exec();

    const postsByCategory = await Post.find({
      status: "Unblock",
    })
      .populate({
        path: "community",
        select: "dp title createdAt",
        match: { category: { $regex: new RegExp(processedQuery, "i") } },
      })
      .populate("sender", "fullname")
      .limit(100)
      .lean()
      .exec();

    const combinedPosts = [...postsByTitleAndDesc, ...postsByCategory];
    const uniqposts = new Map();
    combinedPosts.forEach((post) => {
      if (post.community) {
        uniqposts.set(post._id.toString(), post);
      }
    });
    const posts = Array.from(uniqposts.values()).slice(0, 100);

    let imgs = posts.map((post) =>
      post.post[0].type === "image/jpg"
        ? POST_URL + post.post[0].content
        : POST_URL + (post.post[0].thumbnail || post.post[0].content)
    );

    let dp = posts.map((post) =>
      post.community ? URL + post.community.dp : URL + "default.png"
    );

    res.status(200).json({ success: true, posts, imgs, dp });
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false, message: e.message });
  }
};

// Remove recent prosite search
exports.removeRecentSearchProsite = async (req, res) => {
  try {
    const { sId } = req.body;
    const { id } = req.params;

    // Fetch user and get recentPrositeSearches
    const user = await User.findById(id).select("recentPrositeSearches");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Filter out nulls and check if sId exists
    const recentPrositeSearches = user.recentPrositeSearches.filter(
      (item) => item !== null
    );
    const sIdIndex = recentPrositeSearches.findIndex(
      (item) => item.toString() === sId
    );
    if (sIdIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "sId not found in recent searches" });
    }

    // Remove sId from the array
    recentPrositeSearches.splice(sIdIndex, 1);

    // Update recentPrositeSearches in a single query
    await User.findByIdAndUpdate(id, { recentPrositeSearches }, { new: true });

    return res
      .status(200)
      .json({ success: true, message: "Search Prosite removed successfully" });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(400).json({ message: error.message, success: false });
  }
};

exports.removeRecentSearchCommunity = async (req, res) => {
  try {
    const { sId } = req.body;
    const { id } = req.params;

    // Fetch user and get recentCommunitySearches
    const user = await User.findById(id).select("recentCommunitySearches");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Filter out nulls and check if sId exists
    const recentCommunitySearches = user.recentCommunitySearches.filter(
      (item) => item !== null
    );
    const sIdIndex = recentCommunitySearches.findIndex(
      (item) => item.toString() === sId
    );
    if (sIdIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "sId not found in recent community searches",
      });
    }

    // Remove sId from the array
    recentCommunitySearches.splice(sIdIndex, 1);

    // Update recentCommunitySearches in a single query
    await User.findByIdAndUpdate(
      id,
      { recentCommunitySearches },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Search Community removed successfully",
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(400).json({ message: error.message, success: false });
  }
};

exports.removeRecentPost = async (req, res) => {
  try {
    const { sId } = req.body;
    const { id } = req.params;

    // Fetch user and get recentPosts
    const user = await User.findById(id).select("recentPosts");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Filter out nulls and check if sId exists
    const recentPosts = user.recentPosts.filter((item) => item !== null);
    const sIdIndex = recentPosts.findIndex((item) => item.toString() === sId);
    if (sIdIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "sId not found in recent posts" });
    }

    // Remove sId from the array
    recentPosts.splice(sIdIndex, 1);

    // Update recentPosts in a single query
    await User.findByIdAndUpdate(id, { recentPosts }, { new: true });

    return res
      .status(200)
      .json({ success: true, message: "Search Post removed successfully" });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(400).json({ message: error.message, success: false });
  }
};

exports.addRecentSearchProsite = async (req, res) => {
  try {
    const { sId } = req.body;
    const { id } = req.params;

    // First, remove the item if it exists to prevent duplication
    await User.findByIdAndUpdate(id, { $pull: { recentPrositeSearches: sId } });

    // Then add the item to the start of the array, limiting to the 10 most recent entries
    const result = await User.findByIdAndUpdate(
      id,
      {
        $push: {
          recentPrositeSearches: { $each: [sId], $position: 0, $slice: 10 },
        },
      },
      { new: true, select: "recentPrositeSearches" }
    );

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(201).json({
      success: true,
      message: "Search Prosite updated successfully",
      recentPrositeSearches: result.recentPrositeSearches,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.addRecentSearchCommunity = async (req, res) => {
  try {
    const { sId } = req.body;
    const { id } = req.params;

    await User.findByIdAndUpdate(id, {
      $pull: { recentCommunitySearches: sId },
    });

    const result = await User.findByIdAndUpdate(
      id,
      {
        $push: {
          recentCommunitySearches: { $each: [sId], $position: 0, $slice: 10 },
        },
      },
      { new: true, select: "recentCommunitySearches" }
    );

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(201).json({
      success: true,
      message: "Search Community updated successfully",
      recentCommunitySearches: result.recentCommunitySearches,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.addRecentPosts = async (req, res) => {
  try {
    const { sId } = req.body;
    const { id } = req.params;

    await User.findByIdAndUpdate(id, { $pull: { recentPosts: sId } });

    const result = await User.findByIdAndUpdate(
      id,
      { $push: { recentPosts: { $each: [sId], $position: 0, $slice: 10 } } },
      { new: true, select: "recentPosts" }
    );

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(201).json({
      success: true,
      message: "Post updated successfully",
      recentPosts: result.recentPosts,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.recentSearches = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id)
      .select("recentPrositeSearches recentCommunitySearches recentPosts")
      .lean();

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found!" });
    }

    // Fetch recent prosite searches in parallel
    const recentSearchesProsites = await Promise.all(
      user.recentPrositeSearches.map(async (prositeId) => {
        const anotherUser = await User.findById(prositeId)
          .select("fullname username profilepic isverified")
          .lean();
        if (!anotherUser) return null; // Filter out null values
        return {
          id: anotherUser._id,
          fullname: anotherUser.fullname,
          username: anotherUser.username,
          dp: URL + anotherUser.profilepic,
          isverified: anotherUser.isverified,
        };
      })
    );

    // Fetch recent community searches in parallel
    const recentSearchesCommunity = await Promise.all(
      user.recentCommunitySearches.map(async (communityId) => {
        const anotherCommunity = await Community.findById(communityId)
          .select("title dp memberscount isverified")
          .lean();
        if (!anotherCommunity) return null;
        return {
          id: anotherCommunity._id,
          title: anotherCommunity.title,
          dp: URL + anotherCommunity.dp,
          member: anotherCommunity.memberscount,
          isverified: anotherCommunity.isverified,
        };
      })
    );

    // Fetch recent posts in parallel
    const recentPosts = await Promise.all(
      user.recentPosts.map(async (postId) => {
        const anotherPost = await Post.findById(postId)
          .populate("community", "memberscount")
          .select("title desc dp community topicId post createdAt")
          .lean();
        if (!anotherPost) return null;

        const postContent = anotherPost?.post?.[0]?.type.startsWith("image")
          ? POST_URL + anotherPost?.post?.[0]?.content
          : anotherPost?.post?.[0]?.thumbnail
          ? POST_URL + anotherPost?.post?.[0]?.thumbnail
          : POST_URL + anotherPost?.post?.[0]?.content;

        return {
          id: anotherPost?._id,
          title: anotherPost?.title,
          dp: postContent,
          desc: anotherPost?.desc,
          comId: anotherPost?.community,
          topicId: anotherPost?.topicId,
          createdAt: anotherPost?.createdAt,
        };
      })
    );

    // Filter out null values from the results
    const filteredRecentSearchesProsites =
      recentSearchesProsites.filter(Boolean);
    const filteredRecentSearchesCommunity =
      recentSearchesCommunity.filter(Boolean);
    const filteredRecentPosts = recentPosts.filter(Boolean);

    res.status(200).json({
      success: true,
      recentSearchesCommunity: filteredRecentSearchesCommunity,
      recentSearchesProsites: filteredRecentSearchesProsites,
      recentPost: filteredRecentPosts,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(400).json({ success: false, message: "Something Went Wrong!" });
  }
};
