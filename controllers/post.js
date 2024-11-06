const Post = require("../models/post");
const User = require("../models/userAuth");
const Interest = require("../models/Interest");
const Community = require("../models/community");
const Ads = require("../models/ads");
const { cleanArray } = require("../helpers/utils");
const {
  URL,
  POST_URL,
  MSG_URL,
  PRODUCT_URL,
  POST_BUCKET,
  AD_URL,
} = require("../helpers/config");
const Message = require("../models/message");
const Topic = require("../models/topic");
const Tag = require("../models/Tags");
const Analytics = require("../models/Analytics");
const Comment = require("../models/comment");
const Notification = require("../models/notification");
const {
  DeleteObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} = require("@aws-sdk/client-s3");
const s3 = require("../helpers/s3.config");
const { v4: uuid } = require("uuid");
const admin = require("../fireb");

function getRandomIndex(post) {
  return Math.floor(Math.random() * (Math.floor(post.length / 2) + 1));
}

function getRandomIndexForAd(post) {
  return Math.floor(Math.random() * Math.floor(post.length / 2));
}

function buildUrls(post) {
  const urls = [];
  for (const item of post.post) {
    const content = POST_URL + item.content;
    const thumbnail = item.thumbnail ? POST_URL + item.thumbnail : undefined;

    urls.push({ content, thumbnail, type: item.type, link: item.link });
  }
  return urls;
}

function isWithin30Day(timestamp) {
  const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp < thirtyDaysInMs;
}

function isUserMemberOfTopic(topic, user) {
  if (topic.creator?.equals(user?._id)) {
    return true;
  }

  return (
    topic.type !== "paid" &&
    user.communityjoined.some(
      (communityId) => communityId.toString() === topic.community.toString()
    )
  );
}

function hasPurchasedTopic(topic, user, isWithin30Days) {
  return (
    topic.purchased.some(
      (memberId) => memberId.id.toString() === user._id.toString()
    ) && isWithin30Days
  );
}

exports.newfetchfeed = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select("activeinterests interest")
      .lean();

    const interestsWithTags = await Interest.find({
      title: { $in: user.interest }, // Find interests that match user.interest
    })
      .select("tags")
      .populate("tags", "title")
      .lean()
      .limit(3);

    const limitedInterests = interestsWithTags.map((interest) => ({
      ...interest,
      tags: interest.tags.slice(0, 3), // Limit tags to the first 3
    }));

    // Extract and log tag titles from the limited tags
    const tags = limitedInterests.flatMap(
      (interest) => interest.tags.map((tag) => tag.title) // Extract only the title
    );

    const cleanedTags = cleanArray(tags);

    // Step 3: Fetch banner ad
    const banner = await Ads.findOne({
      status: "active",
      $or: [{ type: "banner" }],
    })
      .sort({ cpa: -1 })
      .populate({
        path: "postid",
        select:
          "desc post title kind likes likedby comments members community cta ctalink sender totalcomments adtype date createdAt",
        populate: [
          {
            path: "community",
            select: "dp title isverified memberscount members",
            populate: { path: "members", select: "profilepic" },
          },
          { path: "sender", select: "profilepic fullname" },
        ],
      })
      .limit(1);

    // Step 4: Aggregate posts with necessary lookups
    const posts = await Post.aggregate([
      {
        $lookup: {
          from: "communities",
          localField: "community",
          foreignField: "_id",
          as: "communityInfo",
        },
      },
      {
        $match: {
          $or: [
            { "communityInfo.category": { $in: user.interest } }, // Match community categories
            {
              $or: [
                { tags: { $in: cleanedTags } },
                { tags: { $exists: false } },
              ],
            },
          ],
        },
      },
      { $sample: { size: 15 } },
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
        },
      },
      {
        $lookup: {
          from: "communities",
          localField: "community",
          foreignField: "_id",
          as: "community",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "community.members",
          foreignField: "_id",
          as: "members",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "community.type",
          foreignField: "_id",
          as: "type",
        },
      },
      {
        $addFields: {
          sender: { $arrayElemAt: ["$sender", 0] },
          community: { $arrayElemAt: ["$community", 0] },
        },
      },
      {
        $addFields: {
          "community.members": {
            $map: {
              input: "$members",
              as: "member",
              in: {
                _id: "$$member._id",
                fullname: "$$member.fullname",
                profilepic: "$$member.profilepic",
              },
            },
          },
        },
      },
      {
        $match: {
          "community.type": { $eq: "public" }, // Excluding posts with community type other than "public"
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          createdAt: 1,
          status: 1,
          likedby: 1,
          likes: 1,
          dislike: 1,
          comments: 1,
          totalcomments: 1,
          tags: 1,
          view: 1,
          desc: 1,
          isverified: 1,
          post: 1,
          contenttype: 1,
          date: 1,
          sharescount: 1,
          sender: {
            _id: 1,
            fullname: 1,
            profilepic: 1,
          },
          community: {
            _id: 1,
            title: 1,
            dp: 1,
            members: 1,
            memberscount: 1,
            isverified: 1,
            type: 1,
          },
          topicId: 1,
        },
      },
    ]);

    if (!posts) {
      res.status(201).json({ message: "No post found", success: false });
      return;
    }

    // Process posts
    const mergedData = posts.map((post) => {
      const liked = post.likedby?.some(
        (id) => id.toString() === user._id.toString()
      );
      const subscribed = post.community.members
        .map((member) => member._id?.toString())
        .includes(user._id.toString())
        ? "subscribed"
        : "unsubscribed";

      const dps = URL + post.community.dp;

      const urls = post.post.map((p) => ({
        content: p.link
          ? POST_URL + p.content + "640.mp4"
          : POST_URL + p.content,
        thumbnail: p.thumbnail ? POST_URL + p.thumbnail : undefined,
        type: p.type,
      }));

      const memdps = post.community.members
        .slice(0, 4)
        .map((member) => URL + member.profilepic);

      return {
        dps,
        memdps,
        urls,
        liked,
        subs: subscribed,
        posts: post,
      };
    });

    if (banner) {
      mergedData.unshift({
        dps: URL + banner.postid.community.dp,
        memdps: banner.postid.community.members
          .slice(0, 4)
          .map((member) => URL + member.profilepic),
        urls: banner.postid.post.map((p) => ({
          content: p.link
            ? POST_URL + p.content + "640.mp4"
            : POST_URL + p.content,
          thumbnail: p.thumbnail ? POST_URL + p.thumbnail : undefined,
          type: p.type,
        })),
        liked: banner.postid.likedby?.some(
          (id) => id.toString() === user._id.toString()
        ),
        subs: banner.postid.community.members.includes(user._id)
          ? "subscribed"
          : "unsubscribed",
        posts: banner.postid,
      });
    }

    res.status(200).json({
      mergedData,
      success: true,
    });
  } catch (err) {
    console.log("Error:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch user data", success: false });
  }
};

exports.newforyoufetchMore = async (req, res) => {
  try {
    const { fetchAds } = req.body;

    let adIds = [];
    if (fetchAds && fetchAds.adIds) {
      try {
        adIds = JSON.parse(fetchAds.adIds);
      } catch (error) {
        console.log("Error parsing adIds:", error.message);
        adIds = [];
      }
    }

    const { id } = req.params;

    const user = await User.findById(id)
      .select(
        "activeinterests interest fullname username profilepic isverified"
      )
      .lean();

    if (!user) {
      return res.status(201).json({ message: "No user found", success: false });
    }

    const interestsWithTags = await Interest.find({
      title: { $in: user.activeinterests },
    })
      .select("tags")
      .populate("tags", "title")
      .lean()
      .limit(3);

    const limitedInterests = interestsWithTags.map((interest) => ({
      ...interest,
      tags: interest.tags.slice(0, 3),
    }));

    const tags = limitedInterests.flatMap((interest) =>
      interest.tags.map((tag) => tag.title)
    );

    const cleanedTags = cleanArray(tags);

    let query = {
      status: "active",
      $or: [{ type: "infeed" }],
    };

    if (adIds && adIds.length > 0) {
      query._id = { $nin: adIds };
    }

    const infeedad = await Ads.findOne(query).populate({
      path: "postid",
      select:
        "desc post title kind likes comments community cta ctalink likedby sender totalcomments adtype date createdAt",
      populate: [
        {
          path: "community",
          select: "dp title isverified memberscount members",
          populate: { path: "members", select: "profilepic" },
        },
        { path: "sender", select: "profilepic fullname" },
      ],
    });

    const posts = await Post.aggregate([
      {
        $lookup: {
          from: "communities",
          localField: "community",
          foreignField: "_id",
          as: "communityInfo",
        },
      },
      {
        $match: {
          $or: [
            { "communityInfo.category": { $in: user.interest } },
            {
              $or: [
                { tags: { $in: cleanedTags } },
                { tags: { $exists: false } },
              ],
            },
          ],
        },
      },
      { $sample: { size: 7 } },
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
        },
      },
      {
        $lookup: {
          from: "communities",
          localField: "community",
          foreignField: "_id",
          as: "community",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "community.members",
          foreignField: "_id",
          as: "members",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "community.type",
          foreignField: "_id",
          as: "type",
        },
      },
      {
        $addFields: {
          sender: { $arrayElemAt: ["$sender", 0] },
          community: { $arrayElemAt: ["$community", 0] },
        },
      },
      {
        $addFields: {
          "community.members": {
            $map: {
              input: "$members",
              as: "member",
              in: {
                _id: "$$member._id",
                fullname: "$$member.fullname",
                profilepic: "$$member.profilepic",
              },
            },
          },
        },
      },
      {
        $match: {
          "community.type": { $eq: "public" },
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          createdAt: 1,
          status: 1,
          likedby: 1,
          likes: 1,
          dislike: 1,
          comments: 1,
          totalcomments: 1,
          tags: 1,
          view: 1,
          desc: 1,
          isverified: 1,
          post: 1,
          contenttype: 1,
          date: 1,
          sharescount: 1,
          sender: {
            _id: 1,
            fullname: 1,
            profilepic: 1,
          },
          community: {
            _id: 1,
            title: 1,
            dp: 1,
            members: 1,
            memberscount: 1,
            isverified: 1,
            type: 1,
          },
          topicId: 1,
        },
      },
    ]);

    if (!posts) {
      res.status(201).json({ message: "No post found", success: false });
      return;
    }

    const mergedData = posts.map((post) => {
      const liked = post.likedby?.some(
        (id) => id.toString() === user._id.toString()
      );
      const subscribed = post.community.members
        .map((member) => member._id?.toString())
        .includes(user._id.toString())
        ? "subscribed"
        : "unsubscribed";

      const dps = URL + post.community?.dp;

      const urls = post?.post?.map((p) => ({
        content: p.link
          ? POST_URL + p?.content + "640.mp4"
          : POST_URL + p?.content,
        thumbnail: p?.thumbnail ? POST_URL + p?.thumbnail : undefined,
        type: p?.type,
      }));

      const memdps = post?.community?.members
        ?.slice(0, 4)
        .map((member) => URL + member?.profilepic);

      return {
        dps,
        memdps,
        urls,
        liked,
        subs: subscribed,
        posts: post,
      };
    });

    if (infeedad) {
      mergedData.push({
        dps: URL + infeedad.postid.community.dp,
        memdps: infeedad.postid.community.members
          .slice(0, 4)
          .map((member) => URL + member.profilepic),
        urls: infeedad.postid.post.map((p) => ({
          content: p.link
            ? POST_URL + p.content + "640.mp4"
            : POST_URL + p.content,
          thumbnail: p.thumbnail ? POST_URL + p.thumbnail : undefined,
          type: p.type,
        })),
        liked: infeedad.postid.likedby?.some(
          (id) => id.toString() === user._id.toString()
        ),
        subs: infeedad.postid.community.members.includes(user._id)
          ? "subscribed"
          : "unsubscribed",
        posts: infeedad.postid,
      });
    }

    res.status(200).json({
      mergedData,
      adid: infeedad ? infeedad._id : null,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

exports.joinedcomnews3 = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId)
      .select("_id communityjoined")
      .lean();

    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }
    const communityPromises = user.communityjoined.map((com) => {
      return Community.findById(com)
        .populate("members", "profilepic")
        .populate("creator", "fullname")
        .populate("topics", "title nature")
        .select("creator topics dp members _id memberscount title posts")
        .lean();
    });

    // Fetch owned communities count
    const ownedComsPromise = Community.countDocuments({ creator: userId });

    // Execute all queries concurrently
    const [communitiesWithOutfilter, ownedComs] = await Promise.all([
      Promise.all(communityPromises), // Fetch all community data concurrently
      ownedComsPromise,
    ]);

    const communities = communitiesWithOutfilter.filter(Boolean);

    if (!communities || communities.length === 0) {
      return res
        .status(200)
        .json({ message: "No communities found", success: true });
    }

    // Create promises to handle topic and post processing
    const topicPromises = communities.map(async (community) => {
      const nontopic = await Promise.all(
        community?.topics?.map(async (topic, index) => {
          const msgCount = await Message.countDocuments({
            topicId: topic._id,
            readby: { $nin: [userId], $exists: true },
          });

          return {
            title: topic.title,
            _id: topic._id,
            msg: msgCount,
            nature: topic.nature,
            index,
          };
        })
      );
      return nontopic;
    });

    const postPromises = communities.map((community) =>
      Post.find({ community: community._id, type: "Post" })
        .populate("sender", "fullname")
        .sort({ createdAt: -1 })
        .limit(1)
        .select("sender likedby title likes post createdAt")
        .lean()
    );

    const [topics, posts] = await Promise.all([
      Promise.all(topicPromises),
      Promise.all(postPromises),
    ]);

    // Continue with the rest of your code...
    const dps = communities.map((community) => URL + community.dp);
    const memdps = communities.map((community) =>
      community.members?.slice(0, 4)?.map((member) => URL + member.profilepic)
    );

    const urls = posts.map((postArray) => {
      if (!postArray || postArray.length === 0) return [];

      return postArray[0].post.map((postItem) => {
        const contentUrl = postItem.link
          ? POST_URL + postItem.content + "640.mp4"
          : POST_URL + postItem.content;

        if (postItem.thumbnail) {
          const thumbnailUrl = POST_URL + postItem.thumbnail;
          return {
            content: contentUrl,
            thumbnail: thumbnailUrl,
            type: postItem.type,
          };
        }
        return { content: contentUrl, type: postItem.type };
      });
    });

    const liked = posts.map((postArray) => {
      if (postArray && postArray.length > 0) {
        return postArray[0].likedby.some(
          (likedById) => likedById.toString() === userId
        );
      }
      return false;
    });

    const mergedData = communities.map((community, index) => ({
      dps: dps[index],
      memdps: memdps[index],
      urls: urls[index],
      liked: liked[index],
      community,
      posts: posts[index],
      topics: topics[index],
    }));

    // Sort by the latest post creation date
    mergedData.sort((a, b) => {
      const timeA = a.posts[0]?.createdAt || 0;
      const timeB = b.posts[0]?.createdAt || 0;
      return timeB - timeA;
    });

    res.status(200).json({
      mergedData,
      success: true,
      cancreate: ownedComs < 2,
    });
  } catch (e) {
    console.error(e);

    res.status(400).json({ message: e.message, success: false });
  }
};

exports.compostfeed = async (req, res) => {
  try {
    const { id, comId } = req.params;
    const { postId } = req.body;

    // Fetch user and community in parallel
    const [user, community] = await Promise.all([
      User.findById(id),
      Community.findById(comId)
        .populate("topics", "title type price nature")
        .populate("creator", "fullname username profilepic isverified"),
    ]);

    if (!user || !community) {
      return res.status(404).json({ message: "User or Community not found" });
    }

    // Get today's date formatted
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, "0")}/${String(
      today.getMonth() + 1
    ).padStart(2, "0")}/${today.getFullYear()}`;

    // Visitor count and analytics updates
    await Analytics.findOneAndUpdate(
      { date: formattedDate, id: community._id },
      {
        $inc: { Y2: 1 },
        $addToSet: {
          activemembers: user._id,
          ...(community.members.includes(user._id)
            ? { returningvisitor: user._id }
            : { newvisitor: user._id }),
        },
      },
      { new: true, upsert: true }
    );

    await Community.updateOne(
      { _id: community._id },
      { $inc: { visitors: 1 } }
    );

    // Creator data and community permissions
    const creatordp = URL + community.creator.profilepic;
    const dp = URL + community.dp;
    const subs =
      community.admins.includes(user._id) ||
      community.moderators.includes(user._id) ||
      community.members.includes(user._id);
    const canedit =
      (community.admins.includes(user._id) ||
        community.moderators.includes(user._id)) &&
      community.memberscount > 150;
    const canpost =
      community.admins.includes(user._id) ||
      community.moderators.includes(user._id);

    // Fetch posts and comments in parallel
    const posts = await Post.find({ community: community._id })
      .populate("sender", "fullname profilepic username isverified")
      .sort({ createdAt: -1 });
    const commentsPromises = posts.map((post) =>
      Comment.find({ postId: post._id }).sort({ createdAt: -1 }).limit(1)
    );
    const comments = await Promise.all(commentsPromises);

    const totalComments = await Promise.all(
      posts.map((post) => Comment.countDocuments({ postId: post._id }))
    );

    // Determine if user liked posts and construct the response data
    const liked = posts.map((post) =>
      post.likedby?.some((id) => id.toString() === user._id.toString())
    );
    const dps = posts.map((post) => URL + post.sender.profilepic);

    // Check if community is private and user is a member
    const ismember =
      community.type !== "public" && community.members.includes(user._id);

    // Prepare topics with message counts
    const topicPromises = community.topics.map(async (topicId) => {
      const msgCount = await Message.countDocuments({
        topicId,
        readby: { $nin: [user._id], $exists: true },
      });
      return { ...topicId.toObject(), msg: msgCount };
    });
    const topic = await Promise.all(topicPromises);

    // Merge all the data for response
    const mergedData = posts.map((post, i) => ({
      dpdata: dps[i],
      urls: post.post.map((p) => ({
        content: POST_URL + p.content,
        type: p.type,
      })),
      liked: liked[i],
      posts: post,
      totalcomments: totalComments[i],
      comments: comments[i].length ? comments[i] : "no comment",
    }));

    res.status(200).json({
      muted: community.notifications?.some(
        (notification) => notification.id?.toString() === user._id.toString()
      ),
      mergedData,
      index: postId
        ? posts.findIndex((post) => post._id.toString() === postId)
        : 0,
      dp,
      community,
      creatordp,
      subs,
      canedit,
      canpost,
      ismember,
      topic,
      category: community?.category,
      success: true,
    });
  } catch (e) {
    console.log(e);
    res
      .status(400)
      .json({ message: "Something went wrong...", success: false });
  }
};

exports.fetchallposts = async (req, res) => {
  try {
    const { id, comId } = req.params;
    const { postId, topicId } = req.body;
    const user = await User.findById(id).select("_id communityjoined").lean();
    const community = await Community.findById(comId)
      .select(
        "type ismonetized topics dp title isverified members memberscount"
      )
      .lean();

    let topic;
    let feedad = [];
    let vidadarray = [];
    let post = [];
    if (!topicId) {
      topic = await Topic.findOne({
        title: "Posts",
        community: community._id.toString(),
      });
    } else {
      topic = await Topic.findById(topicId);
    }

    if (user && community) {
      const postold = await Post.find({ topicId: topic?._id }).populate(
        "sender",
        "fullname profilepic"
      );

      if (
        community.type === "public" &&
        topic.postcount > 0 &&
        community.ismonetized
      ) {
        // Remove non-existing posts
        for (const postId of topic.posts) {
          const existingPost = await Post.findById(postId);
          if (!existingPost) {
            await Topic.updateOne(
              { _id: topic._id },
              { $pull: { posts: postId }, $inc: { postcount: -1 } }
            );
          }
        }

        // Fetch ads
        const infeedAds = await Ads.find({
          status: "active",
          type: "infeed",
        }).populate({
          path: "postid",
          select:
            "desc post title kind likes comments community cta ctalink sender totalcomments adtype date createdAt",
          populate: [
            { path: "community", select: "dp title isverified memberscount" },
            { path: "sender", select: "profilepic fullname" },
          ],
        });

        feedad = infeedAds.map((ad) => ad.postid);

        const videoAds = await Ads.find({
          status: "active",
          $or: [{ type: "skipable" }, { type: "non-skipable" }],
        }).populate({
          path: "postid",
          select:
            "desc post title kind likes comments community cta ctalink sender totalcomments adtype date createdAt",
          populate: [
            { path: "community", select: "dp title isverified memberscount" },
            { path: "sender", select: "profilepic fullname" },
          ],
        });

        vidadarray = videoAds.map((ad) => {
          const url = AD_URL + ad.postid?.post[0].content;
          const comdp = URL + ad.postid?.community?.dp;
          return {
            ...ad.postid.toObject(),
            url,
            comdp,
          };
        });
      }

      // Prepare posts
      post = postold.map((po) => ({
        _id: po._id,
        likedby: po.likedby,
        likes: po.likes,
        dislike: po.dislike,
        dislikedby: po.dislikedby,
        comments: po.comments,
        totalcomments: po.totalcomments,
        tags: po.tags,
        views: po.views,
        title: po.title,
        desc: po.desc,
        community: po.community,
        sender: po.sender,
        isverified: po.isverified,
        kind: po.kind,
        post: po.post,
        votedby: po.votedby,
        totalvotes: po.totalvotes,
        contenttype: po.contenttype,
        date: po.date,
        status: po.status,
        sharescount: po.sharescount,
        type: po.type,
        options: po.options,
        createdAt: po.createdAt,
        topicId: po.topicId,
        forwardid: po.forwardid,
      }));

      // Randomly mix ads with posts
      for (const ad of vidadarray) {
        const randomIndex = getRandomIndexForAd(post);
        if (post[randomIndex]?.post[0]?.type === "video/mp4") {
          post[randomIndex].ad = ad;
        }
      }

      // Determine muted notifications
      let muted =
        topic?.notifications?.filter(
          (f) => f.id?.toString() === user._id.toString()
        ) || [];
      post.reverse();

      // Mix in-feed ads with posts
      for (const ad of feedad) {
        const randomIndex = getRandomIndex(post);
        post.splice(randomIndex, 0, ad);
      }

      // Find index of specific post
      let index = post.findIndex((p) => p._id.toString() === postId);
      if (!postId) index = 0;

      // Fetch comments
      const comments = await Promise.all(
        post.map(async (p) => {
          const comment = await Comment.find({ postId: p._id.toString() })
            .limit(1)
            .sort({ createdAt: -1 });
          return comment.length > 0 ? comment : "no comment";
        })
      );

      const liked = post.map((p) =>
        p.likedby?.some((id) => id.toString() === user._id.toString())
      );
      const dps = post.map((p) =>
        p.kind === "ad" ? URL + p.community.dp : URL + p.sender.profilepic
      );

      // Build merged data
      const mergedData = post.map((p, i) => ({
        dpdata: dps[i],
        urls: buildUrls(p),
        liked: liked[i],
        posts: p,
        totalcomments: comments[i].length,
        comments: comments[i],
      }));

      if (!community.members.some((memberId) => memberId.equals(user._id))) {
        return res.status(203).json({
          message: "You are not a member of the Community",
          success: true,
          topicjoined: false,
          mergedData,
        });
      }

      // Check topic membership
      const purchaseIndex = topic.purchased.findIndex(
        (f) => f.id?.toString() === user._id?.toString()
      );
      const timestamp = topic.purchased[purchaseIndex]?.broughton || 0;
      const isWithin30Days =
        topic.title === "Posts" || isWithin30Day(timestamp);

      if (isUserMemberOfTopic(topic, user)) {
        return res
          .status(200)
          .json({ muted, mergedData, index, success: true, topicjoined: true });
      }

      if (
        topic.type === "paid" &&
        hasPurchasedTopic(topic, user, isWithin30Days)
      ) {
        return res
          .status(200)
          .json({ muted, mergedData, index, success: true, topicjoined: true });
      } else {
        return res.status(203).json({
          messages: "Not joined",
          success: true,
          topicjoined: false,
          topic: {
            id: topic?._id,
            price: topic?.price,
            desc: topic?.message,
            members: topic?.memberscount,
            name: topic?.title,
          },
          mergedData,
        });
      }
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.readalltcm = async (req, res) => {
  try {
    const { id, topicid } = req.params;

    await Message.updateMany(
      { topicId: topicid },
      { $addToSet: { readby: id } }
    );
    res.status(200).json({ success: true });
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

exports.gettopicmessages = async (req, res) => {
  try {
    const { id, topicId } = req.params;

    // Fetch the topic and select only necessary fields
    const topic = await Topic.findById(topicId)
      .select(
        "_id notifications purchased price message memberscount title type"
      )
      .lean();

    if (!topic) {
      return res
        .status(404)
        .json({ message: "Topic not found", success: false });
    }

    // Fetch the community and select only necessary fields
    const community = await Community.findOne({ topics: { $in: [topic._id] } })
      .select("members")
      .lean();

    if (!community) {
      return res
        .status(404)
        .json({ message: "Community not found", success: false });
    }

    // Check if the user is a member of the community
    if (
      !Array.isArray(community.members) ||
      !community.members.some((member) => member.toString() === id)
    ) {
      return res.status(203).json({
        message: "You are not a member of the Community",
        success: true,
        topicjoined: false,
      });
    }

    // Fetch messages, excluding those deleted for the user
    const msg = await Message.find({
      topicId: topicId,
      deletedfor: { $nin: [id] },
    })
      .limit(20)
      .sort({ createdAt: -1 })
      .populate("sender", "profilepic fullname isverified");

    // Process messages and build the response
    const messages = msg.map((m) => {
      let url;
      switch (m.typ) {
        case "image":
        case "video":
        case "doc":
        case "glimpse":
          url = MSG_URL + (m.content?.uri || "");
          break;
        case "gif":
          url = m.content?.uri || "";
          break;
        case "post":
          url = POST_URL + (m.content?.uri || "");
          return {
            ...m.toObject(),
            dp: URL + (m.sender?.profilepic || ""),
            comId: null,
          }; // Post-specific processing
        case "product":
          url = PRODUCT_URL + (m.content?.uri || "");
          break;
        default:
          return { ...m.toObject(), dp: URL + (m.sender?.profilepic || "") };
      }
      return { ...m.toObject(), url, dp: URL + (m.sender?.profilepic || "") };
    });

    // Check if notifications are muted
    let muted = null;
    if (topic?.notifications?.length > 0) {
      muted = topic?.notifications?.filter((f) => {
        return f.id?.toString() === id;
      });
    }
    // Check if the topic is purchased
    const purchaseIndex = Array.isArray(topic.purchased)
      ? topic.purchased.findIndex((p) => p.id?.toString() === id?.toString())
      : -1;

    const isPurchased = purchaseIndex !== -1;
    const timestamp = isPurchased
      ? topic.purchased[purchaseIndex]?.broughton
      : 0;
    const isWithin30Days = Date.now() - timestamp <= 30 * 24 * 60 * 60 * 1000;

    const isPaidTopic = topic.type === "paid";
    if (isPaidTopic && (!isPurchased || !isWithin30Days)) {
      return res.status(203).json({
        messages: [],
        success: true,
        topicjoined: false,
        topic: {
          id: topic._id,
          price: topic.price,
          desc: topic.message,
          members: topic.memberscount,
          name: topic.title,
          type: topic.type,
        },
      });
    }

    // Send the response
    res.status(200).json({ muted, messages, success: true, topicjoined: true });
  } catch (e) {
    console.error(e);
    res
      .status(400)
      .json({ message: "Something went wrong...", success: false });
  }
};

exports.gettopicmessages = async (req, res) => {
  try {
    const { id, topicId } = req.params;
    const user = await User.findById(id);
    const topic = await Topic.findById(topicId);
    const community = await Community.find({ topics: { $in: [topic._id] } });
    if (community && topic && user) {
      const msg = await Message.find({
        topicId: topicId,
        // status: "active",
        deletedfor: { $nin: [user._id.toString()] },
      })
        .limit(20)
        .sort({ createdAt: -1 })
        .populate("sender", "profilepic fullname isverified");

      let messages = [];

      for (let i = 0; i < msg?.length; i++) {
        if (
          msg[i].typ === "image" ||
          msg[i].typ === "video" ||
          msg[i].typ === "doc" ||
          msg[i].typ === "glimpse"
        ) {
          const url = MSG_URL + msg[i]?.content?.uri;

          messages.push({
            ...msg[i].toObject(),
            url,
            dp: URL + msg[i].sender.profilepic,
          });
        } else if (msg[i].typ === "gif") {
          const url = msg[i]?.content?.uri;

          messages.push({
            ...msg[i].toObject(),
            url,
            dp: URL + msg[i].sender.profilepic,
          });
        } else if (msg[i].typ === "post") {
          const url = POST_URL + msg[i]?.content?.uri;
          const post = await Post.findById(msg[i].forwardid);
          messages.push({
            ...msg[i].toObject(),
            url,
            comId: post?.community,
            dp: URL + msg[i].sender.profilepic,
          });
        } else if (msg[i].typ === "product") {
          const url = PRODUCT_URL + msg[i]?.content?.uri;

          messages.push({
            ...msg[i].toObject(),
            url,
            dp: URL + msg[i].sender.profilepic,
          });
        } else {
          messages.push({
            ...msg[i].toObject(),
            dp: URL + msg[i].sender.profilepic,
          });
        }
      }

      messages.reverse();

      //muted and unmuted topics
      let muted = null;
      if (topic?.notifications?.length > 0) {
        muted = topic?.notifications?.filter((f) => {
          return f.id?.toString() === user._id.toString();
        });
      }

      if (!community[0].members.includes(user._id)) {
        res.status(203).json({
          message: "You are not the member of the Community",
          success: true,
          topicjoined: false,
        });
      } else {
        //checking if brought topic is valid
        let purchaseindex = topic.purchased.findIndex(
          (f) => f.id?.toString() === user._id?.toString()
        );

        const timestamp = topic.purchased[purchaseindex]?.broughton || 0;
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

        const currentTimestamp = Date.now();

        const difference = currentTimestamp - timestamp;

        const isWithin30Days = difference <= thirtyDaysInMs;
        let topicdetail = {
          id: topic?._id,
          price: topic?.price,
          desc: topic?.message,
          members: topic?.memberscount,
          name: topic?.title,
        };

        if (
          topic.type !== "paid" &&
          topic.members.some((memberId) => memberId.equals(user?._id))
        ) {
          res.status(200).json({
            muted,
            messages,
            success: true,
            topicjoined: true,
          });
        } else {
          if (topic?.type === "paid") {
            if (
              topic.purchased.some((memberId) =>
                memberId.id.equals(user?._id)
              ) &&
              isWithin30Days
            ) {
              res.status(200).json({
                muted,
                messages,
                success: true,
                topicjoined: true,
              });
            } else {
              res.status(203).json({
                messages: "Not joined",
                success: true,
                topicjoined: false,
                topic: topicdetail,
              });
            }
          } else {
            res.status(200).json({
              muted,
              messages,
              success: true,
              topicjoined: true,
            });
          }
        }
      }
    } else {
      res.status(404).json({ message: "Something not found!", success: false });
    }
  } catch (e) {
    console.log(e);
    res
      .status(400)
      .json({ message: "Something went wrong...", success: false });
  }
};

exports.fetchallcomments = async (req, res) => {
  const { userId, postId } = req.params;
  try {
    const comments = await Comment.find({ postId })
      .populate("senderId", "fullname profilepic username")
      .limit(50)
      .sort({ createdAt: -1 });

    if (!comments || comments.length === 0) {
      return res
        .status(203)
        .json({ success: false, message: "No comments found", merged: [] });
    }

    // Process comments to merge the data in a single loop
    const merged = comments.map((comment) => {
      const isLiked = comment.likedby.includes(userId) ? "liked" : "not liked";
      const dp = URL + (comment.senderId?.profilepic || "");

      return {
        dp,
        comments: comment,
        likes: isLiked,
      };
    });

    res.status(200).json({ success: true, merged });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message, success: false });
  }
};

exports.likepost = async (req, res) => {
  const { userId, postId } = req.params;

  try {
    const [user, post] = await Promise.all([
      User.findById(userId).select("fullname _id likedposts"),
      Post.findById(postId).populate(
        "sender",
        "fullname _id likedby likes views"
      ),
    ]);

    if (!post) {
      return res.status(400).json({ message: "No post found" });
    }

    const userHasLikedPost = post.likedby.includes(userId);

    // Use a single database update call for either liking or unliking the post
    if (userHasLikedPost) {
      await Promise.all([
        Post.updateOne(
          { _id: postId },
          { $pull: { likedby: user._id }, $inc: { likes: -1 } }
        ),
        User.updateOne({ _id: user._id }, { $pull: { likedposts: post._id } }),
      ]);

      return res.status(200).json({ success: true });
    } else {
      await Promise.all([
        Post.updateOne(
          { _id: postId },
          { $push: { likedby: user._id }, $inc: { likes: 1, views: 4 } }
        ),
        User.updateOne({ _id: user._id }, { $push: { likedposts: post._id } }),
      ]);

      if (user._id.toString() !== post.sender._id.toString()) {
        const notification = new Notification({
          senderId: user._id,
          recId: post.sender._id,
          text: `${user.fullname} liked your post`,
        });

        await Promise.all([
          notification.save(),
          User.updateOne(
            { _id: post.sender._id },
            {
              $push: { notifications: notification._id },
              $inc: { notificationscount: 1 },
            }
          ),
        ]);
      }

      return res.status(200).json({ success: true });
    }
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  const { userId, postId } = req.params;
  const { text } = req.body;
  const post = await Post.exists({ _id: postId });
  if (!post) {
    res.status(404).json({ message: "Post not found" });
  } else {
    try {
      const newComment = new Comment({
        senderId: userId,
        postId: postId,
        text: text,
      });
      await newComment.save();
      await Post.updateOne(
        { _id: postId },
        { $push: { comments: newComment._id }, $inc: { totalcomments: 1 } }
      );
      res.status(200).json(newComment);
    } catch (e) {
      res.status(400).json(e.message);
    }
  }
};

exports.deletepost = async (req, res) => {
  const { userId, postId } = req.params;

  try {
    // Fetch the post and populate only the required fields
    const post = await Post.findById(postId).populate("community", "category");

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.sender.toString() !== userId) {
      return res.status(400).json({ message: "You can't delete others' post" });
    }

    // Prepare updates for Community and Interest models
    const communityUpdate = Community.updateOne(
      { _id: post.community._id },
      { $inc: { totalposts: -1 }, $pull: { posts: post._id } }
    );

    const int = await Interest.findOne({ title: post.community.category });

    // Process all tags in parallel
    const tagUpdates = post.tags?.map(async (tagTitle) => {
      const tag = await Tag.findOne({ title: tagTitle.toLowerCase() });
      if (tag) {
        const tagUpdate = Tag.updateOne(
          { _id: tag._id },
          { $inc: { count: -1 }, $pull: { post: post._id } }
        );

        if (int) {
          const interestUpdate = Interest.updateOne(
            { _id: int._id },
            { $inc: { count: -1 }, $pull: { post: post._id, tags: tag._id } }
          );
          return Promise.all([tagUpdate, interestUpdate]);
        }

        return tagUpdate;
      }
    });

    // Fetch the topic and prepare the update if it exists
    const topic = await Topic.findOne({
      community: post.community._id,
      nature: "post",
      title: "Posts",
    });

    const topicUpdate = topic
      ? Topic.updateOne(
          { _id: topic._id },
          { $pull: { posts: post._id }, $inc: { postcount: -1 } }
        )
      : Promise.resolve();

    // Delete all associated S3 objects concurrently
    const s3Deletes = post.post?.map((content) =>
      s3.send(
        new DeleteObjectCommand({
          Bucket: POST_BUCKET,
          Key: content.content,
        })
      )
    );

    // Perform all updates and deletions concurrently
    await Promise.all([
      communityUpdate,
      Promise.all(tagUpdates),
      topicUpdate,
      Promise.all(s3Deletes),
      Post.findByIdAndDelete(postId),
    ]);

    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(404).json({ message: "Something went wrong", success: false });
  }
};

exports.votenowpoll = async (req, res) => {
  try {
    const { id, postId, opId } = req.params;

    // Helper function to calculate vote strengths
    function calculateVoteStrengths(votedCount, totalVotes) {
      return totalVotes === 0 ? 0 : (votedCount / totalVotes) * 100;
    }

    // Perform database lookups in parallel
    const [user, post] = await Promise.all([
      User.exists({ _id: id }),
      Post.findById(postId).select("options votedby totalvotes"),
    ]);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // Check and remove previous vote if necessary
    if (post.votedby.includes(id)) {
      const prevoteIndex = post.options.findIndex((option) =>
        option.votedby.some((voterId) => voterId.equals(id))
      );

      if (prevoteIndex !== -1) {
        post.options[prevoteIndex].votedby.pull(id);
        await Promise.all([
          post.save(),
          Post.updateOne(
            { _id: postId },
            { $inc: { totalvotes: -1 }, $pull: { votedby: id } }
          ),
        ]);
      }
    }

    // Add the new vote
    await Post.updateOne(
      { _id: postId, "options._id": opId },
      {
        $addToSet: { "options.$.votedby": id, votedby: id },
        $inc: { totalvotes: 1 },
      }
    );

    // Fetch the updated post with only the necessary fields
    const updatedPost = await Post.findById(postId).select(
      "options totalvotes"
    );

    // Calculate strengths
    updatedPost.options.forEach((option) => {
      option.strength = calculateVoteStrengths(
        option.votedby.length,
        updatedPost.totalvotes
      );
    });

    // Save the updated post with the new strengths
    await updatedPost.save();

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.status(400).json({ success: false, message: "Something went wrong" });
  }
};

exports.createpollcom = async (req, res) => {
  try {
    const { id, comId, topicId } = req.params;
    const { options, title, tag, desc } = req.body;

    if (!id) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const pos = [];

    if (req.files?.length > 0) {
      // Use Promise.all to handle concurrent file uploads
      const uploadPromises = req.files.map(async (file) => {
        const uuidString = uuid();
        const objectName = `${Date.now()}_${uuidString}_${file.originalname}`;

        // Upload the file to S3 using AWS SDK v3
        await s3.send(
          new PutObjectCommand({
            Bucket: POST_BUCKET,
            Key: objectName,
            Body: file.buffer,
            ContentType: file.mimetype,
          })
        );

        // Push the file details to the 'pos' array
        pos.push({ content: objectName, type: file.mimetype });
      });

      // Wait for all file uploads to complete
      await Promise.all(uploadPromises);
    }

    // Create and save the new poll post
    const poll = new Post({
      title,
      desc,
      options,
      community: comId,
      sender: id,
      post: pos,
      tags: tag,
      kind: "poll",
      type: "Poll",
      topicId,
    });

    const savedpost = await poll.save();

    // Update the community with the new post in one database call
    await Community.updateOne(
      { _id: comId },
      { $push: { posts: savedpost._id }, $inc: { totalposts: 1 } }
    );

    res.status(200).json({ success: true });
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

// Main upload handler function
exports.postanythings3 = async (req, res) => {
  const { userId, comId, topicId } = req.params;
  const { title, desc, tags, category, type, people } = req.body;

  try {
    const tagArray = tags ? tags.split(",") : [];
    const peopleArray = people ? JSON.parse(people) : [];

    // Retrieve user, community, and topic data
    const [user, community, topic] = await Promise.all([
      User.findById(userId).select("_id fullname notificationtoken").lean(),
      Community.findById(comId).select("_id title dp members").lean(),
      Topic.findById(topicId).select("_id title price").lean(),
    ]);

    if (!user || !community || !topic || !req.files || req.files.length === 0) {
      return res.status(404).json({
        message: "User, Community, or Topic not found, or no files provided!",
        success: false,
      });
    }

    const chunkSize = 5 * 1024 * 1024;
    const maxRetries = 3;
    const objectNames = [];

    const uploadChunkedFileToS3 = async (file) => {
      const objectName = `${Date.now()}_${uuid()}_${file.originalname}`;
      const createUploadResponse = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket: POST_BUCKET,
          Key: objectName,
          ContentType: file.mimetype,
        })
      );
      const uploadId = createUploadResponse.UploadId;
      const chunks = Math.ceil(file.buffer.length / chunkSize);
      const uploadPromises = [];

      const uploadWithRetry = async (partNumber, chunk) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const response = await s3.send(
              new UploadPartCommand({
                Bucket: POST_BUCKET,
                Key: objectName,
                PartNumber: partNumber,
                UploadId: uploadId,
                Body: chunk,
              })
            );
            return { ETag: response.ETag, PartNumber: partNumber };
          } catch (error) {
            if (attempt === maxRetries) throw error;
          }
        }
      };

      for (let partNumber = 1; partNumber <= chunks; partNumber++) {
        const start = (partNumber - 1) * chunkSize;
        const chunk = file.buffer.slice(start, start + chunkSize);
        uploadPromises.push(uploadWithRetry(partNumber, chunk));
      }

      try {
        const uploadedParts = await Promise.all(uploadPromises);

        await s3.send(
          new CompleteMultipartUploadCommand({
            Bucket: POST_BUCKET,
            Key: objectName,
            UploadId: uploadId,
            MultipartUpload: { Parts: uploadedParts },
          })
        );

        return objectName;
      } catch (error) {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: POST_BUCKET,
            Key: objectName,
            UploadId: uploadId,
          })
        );
        throw error;
      }
    };

    for (const file of req.files) {
      const objectName = await uploadChunkedFileToS3(file);
      objectNames.push(objectName);
    }

    // Save post to the database
    const newPost = new Post({
      title,
      desc,
      community: comId,
      sender: userId,
      post: objectNames, // Array of S3 keys/URLs
      tags: tagArray,
      topicId,
      peopletags: peopleArray,
    });
    const savedPost = await newPost.save();

    // Handle tags and interests in bulk for efficiency
    const updateTagsAndInterests = async () => {
      const interest = await Interest.findOne({ title: category })
        .select("_id")
        .lean();

      await Promise.all(
        tagArray.map(async (tag) => {
          const lowerCaseTag = tag.toLowerCase();
          const existingTag = await Tag.findOneAndUpdate(
            { title: lowerCaseTag },
            { $inc: { count: 1 }, $addToSet: { post: newPost._id } },
            { new: true, upsert: true }
          ).lean();

          if (interest) {
            await Interest.updateOne(
              { _id: interest._id },
              {
                $inc: { count: 1 },
                $addToSet: { post: newPost._id, tags: existingTag._id },
              }
            );
          }
        })
      );
    };

    await updateTagsAndInterests();

    // Update Community and Topic references
    await Promise.all([
      Community.updateOne(
        { _id: comId },
        { $push: { posts: savedPost._id }, $inc: { totalposts: 1 } }
      ),
      Topic.updateOne(
        { _id: topicId },
        { $push: { posts: savedPost._id }, $inc: { postcount: 1 } }
      ),
    ]);

    // Notifications to community members
    const tokens = community.members
      .filter(
        (member) => member._id.toString() !== userId && member.notificationtoken
      )
      .map((member) => member.notificationtoken);

    if (tokens.length > 0) {
      const msg = {
        notification: {
          title: `${community.title} - New Post!`,
          body: newPost.title,
        },
        data: {
          screen: "CommunityChat",
          sender_fullname: user.fullname,
          comId: community._id.toString(),
          postId: savedPost._id.toString(),
          type: "post",
        },
        tokens,
      };

      await admin
        .messaging()
        .sendMulticast(msg)
        .then(() => console.log("Successfully sent message"))
        .catch((error) => console.error("Error sending message:", error));
    }

    res.status(200).json({ savedPost, success: true });
  } catch (error) {
    console.error("Error:", error);
    res.status(400).json({ message: "Something went wrong", success: false });
  }
};
