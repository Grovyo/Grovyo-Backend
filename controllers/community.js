const User = require("../models/userAuth");
const { BUCKET_NAME, URL } = require("../helpers/config");
const s3 = require("../helpers/s3.config");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const Community = require("../models/community");
const Topic = require("../models/topic");
const uuid = require("uuid").v4;
const mongoose = require("mongoose");
const Analytics = require("../models/Analytics");
const Message = require("../models/message");
const Conversation = require("../models/conversation");

exports.create = async (req, res) => {
  try {
    const { title, desc, category, iddata, nature } =
      req.body;
    const { userId } = req.params;
    const image = req.file;

    if (!image) {
      return res
        .status(400)
        .json({ message: "Please upload an image", success: false });
    }

    const uuidString = uuid();
    const objectName = `${Date.now()}_${uuidString}_${image.originalname}`;

    // Upload image to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectName,
        Body: image.buffer,
        ContentType: image.mimetype,
      })
    );

    // Create Community
    const community = new Community({
      title,
      creator: userId,
      dp: objectName,
      desc,
      category,
      type: nature,
    });
    const savedCommunity = await community.save();

    // Create Topics
    const topics = [
      new Topic({
        title: "Posts",
        creator: userId,
        community: savedCommunity._id,
        nature: "post",
      }),
      new Topic({
        title: "All",
        creator: userId,
        community: savedCommunity._id,
      }),
    ];
    const [topic1, topic2] = await Promise.all(
      topics.map((topic) => topic.save())
    );

    // Prepare Update Data
    const communityUpdates = {
      $push: {
        members: userId,
        admins: userId,
        topics: [topic1._id, topic2._id],
      },
      $inc: { memberscount: 1 },
    };
    const userUpdates = {
      $push: {
        topicsjoined: [topic1._id, topic2._id],
        communityjoined: savedCommunity._id,
        communitycreated: savedCommunity._id,
      },
      $inc: { totaltopics: 2, totalcom: 1 },
    };

    // Update Community and User
    await Promise.all([
      Community.updateOne({ _id: savedCommunity._id }, communityUpdates),
      User.updateOne({ _id: userId }, userUpdates),
      Topic.updateOne(
        { _id: topic1._id },
        {
          $push: {
            members: userId,
            notifications: { id: userId, muted: false },
          },
          $inc: { memberscount: 1 },
        }
      ),
      Topic.updateOne(
        { _id: topic2._id },
        {
          $push: {
            members: userId,
            notifications: { id: userId, muted: false },
          },
          $inc: { memberscount: 1 },
        }
      ),
    ]);

    // Handle additional topics from `iddata`
    if (iddata) {
      const topicIds = iddata.map((id) => mongoose.Types.ObjectId(id));
      await Promise.all([
        Community.updateOne(
          { _id: savedCommunity._id },
          { $push: { topics: { $each: topicIds } } }
        ),
        User.updateOne(
          { _id: userId },
          { $push: { topicsjoined: { $each: topicIds } } }
        ),
      ]);
    }

    res
      .status(200)
      .json({ community: savedCommunity, topic: topic1._id, success: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.unjoinmember = async (req, res) => {
  const { userId, comId } = req.params;

  try {
    const [user, community] = await Promise.all([
      User.findById(userId).select(
        "_id communityjoined topicsjoined totalcom totaltopics"
      ),
      Community.findById(comId)
        .populate("topics")
        .select("creator members memberscount notifications topics"),
    ]);

    if (!user || !community) {
      return res
        .status(404)
        .json({ message: "User or Community not found", success: false });
    }

    const isOwner = community.creator.equals(user._id);
    const isSubscriber = community.members.includes(user._id);

    if (isOwner) {
      return res.status(403).json({
        message: "You can't unjoin your own community!",
        success: false,
      });
    }

    if (!isSubscriber) {
      return res
        .status(400)
        .json({ message: "Not Subscribed", success: false });
    }

    // Perform all update operations in parallel to improve efficiency
    await Promise.all([
      Community.updateOne(
        { _id: comId },
        { $pull: { members: user._id }, $inc: { memberscount: -1 } }
      ),
      User.updateOne(
        { _id: userId },
        { $pull: { communityjoined: community._id }, $inc: { totalcom: -1 } }
      ),
      Community.updateOne(
        { _id: comId },
        { $pull: { notifications: { id: user._id } } }
      ),
      ...community.topics.map((topic) =>
        Topic.updateOne(
          { _id: topic._id },
          {
            $pull: { members: user._id, notifications: { id: user._id } },
            $inc: { memberscount: -1 },
          }
        )
      ),
      User.updateMany(
        { _id: userId },
        {
          $pull: {
            topicsjoined: { $in: community.topics.map((topic) => topic._id) },
          },
          $inc: { totaltopics: -community.topics.length },
        }
      ),
    ]);

    // Counting unjoined members in analytics
    const today = new Date();
    const formattedDate = today
      .toLocaleDateString("en-GB")
      .split("/")
      .join("/");

    const analytics = await Analytics.findOne({
      date: formattedDate,
      id: community._id,
    });

    if (analytics) {
      await Analytics.updateOne({ _id: analytics._id }, { $inc: { Y3: 1 } });
    } else {
      const newAnalytics = new Analytics({
        date: formattedDate,
        id: community._id,
        Y3: 1,
      });
      await newAnalytics.save();
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};

exports.joinmember = async (req, res) => {
  const { userId, comId } = req.params;

  try {
    const [user, community] = await Promise.all([
      User.findById(userId).select("_id DOB gender address"),
      Community.findById(comId).select(
        "_id creator members type topics location demographics"
      ),
    ]);

    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }
    if (!community) {
      return res
        .status(404)
        .json({ message: "Community not found", success: false });
    }

    const isOwner = community.creator.equals(user._id);
    const isSubscriber = community.members.includes(user._id);

    if (isOwner) {
      return res.status(201).json({
        message: "You already have joined your own community!",
        success: false,
      });
    } else if (isSubscriber) {
      const publicTopicsPromises = community.topics.map((topicId) =>
        Topic.findById(topicId).select("_id type")
      );
      const topics = await Promise.all(publicTopicsPromises);
      const publictopic = topics.filter((topic) => topic?.type === "free");

      return res.status(201).json({
        message: "Already Subscriber",
        success: false,
        publictopic,
      });
    }

    if (community.type === "public") {
      let today = new Date();
      let formattedDate = `${String(today.getDate()).padStart(2, "0")}/${String(
        today.getMonth() + 1
      ).padStart(2, "0")}/${today.getFullYear()}`;

      const birthdate = new Date(user.DOB.split("/").reverse().join("/"));
      let age = today.getFullYear() - birthdate.getFullYear();
      if (
        today.getMonth() < birthdate.getMonth() ||
        (today.getMonth() === birthdate.getMonth() &&
          today.getDate() < birthdate.getDate())
      ) {
        age--;
      }

      let genderKey = user.gender.toLowerCase();
      if (["male", "female"].includes(genderKey)) {
        let ageGroup;
        if (age >= 18 && age <= 24) ageGroup = "18-24";
        else if (age >= 25 && age <= 34) ageGroup = "25-34";
        else if (age >= 35 && age <= 44) ageGroup = "35-44";
        else if (age >= 45 && age <= 64) ageGroup = "45-64";
        else if (age >= 65) ageGroup = "65+";

        if (ageGroup) {
          await Community.updateOne(
            { _id: community._id },
            {
              $inc: {
                [`demographics.gender.${genderKey}`]: 1,
                [`demographics.age.${ageGroup}`]: 1,
              },
            }
          );
        }
      }

      // **Fix: Check if address and state exist**
      if (user.address && user.address.state) {
        let address = user.address.state.toLowerCase().trim();
        community.location[address] = (community.location[address] || 0) + 1;
        await community.save();
      }

      let analytics = await Analytics.findOne({
        date: formattedDate,
        id: community._id,
      });
      if (analytics) {
        await Analytics.updateOne({ _id: analytics._id }, { $inc: { Y1: 1 } });
      } else {
        const newAnalytics = new Analytics({
          date: formattedDate,
          id: community._id,
          Y1: 1,
        });
        await newAnalytics.save();
        if (!newAnalytics?.newmembers?.includes(user._id)) {
          await Analytics.updateOne(
            { _id: newAnalytics._id },
            { $addToSet: { newmembers: user._id } }
          );
        }
      }

      const notif = { id: user._id, muted: false };
      await Promise.all([
        Community.updateOne(
          { _id: comId },
          {
            $push: { members: user._id, notifications: notif },
            $inc: { memberscount: 1 },
          }
        ),
        User.updateOne(
          { _id: userId },
          { $push: { communityjoined: community._id }, $inc: { totalcom: 1 } }
        ),
      ]);

      const topicIds = community.topics
        .filter((topic) => topic.type === "free")
        .map((topic) => topic._id);
      await Promise.all([
        Topic.updateMany(
          { _id: { $in: topicIds } },
          {
            $push: { members: user._id, notifications: notif },
            $inc: { memberscount: 1 },
          }
        ),
        User.updateOne(
          { _id: userId },
          {
            $push: { topicjoined: { $each: topicIds } },
            $inc: { totaltopic: topicIds.length },
          }
        ),
      ]);

      return res.status(201).json({
        message: "Successfully joined the community!",
        success: true,
      });
    } else {
      return res.status(403).json({
        message: "Community is not public. Joining is restricted.",
        success: false,
      });
    }
  } catch (error) {
    console.error("Error joining the community:", error);
    return res.status(500).json({
      message: "An error occurred while joining the community.",
      success: false,
    });
  }
};

exports.getallmembers = async (req, res) => {
  try {
    const { id, comId } = req.params;

    // Fetch the community and populate necessary fields
    const community = await Community.findById(comId)
      .select("creator members admins blocked")
      .populate({
        path: "members",
        select: "fullname pic isverified username profilepic",
        options: { limit: 150 },
      })
      .populate({
        path: "admins",
        model: "User",
        select: "fullname pic isverified username profilepic",
      })
      .populate({
        path: "blocked",
        model: "User",
        select: "_id", // Only need the _id to compare with blocked members
      });

    if (!community) {
      return res
        .status(404)
        .json({ message: "Community not found", success: false });
    }

    const admin = community?.admins[0];
    const admindp = URL + admin?.profilepic;
    const isAdmin = admin?._id?.toString() === id;

    // Create a Set for blocked member IDs for efficient look-up
    const blockedIds = new Set(community.blocked.map((b) => b._id.toString()));

    // Map members to include their profile picture URLs and blocked status
    const members = community.members
      .filter(
        (member) => member._id.toString() !== community.creator.toString()
      ) // Exclude creator
      .map((c) => ({
        ...c.toObject(), // Convert member to plain object
        dp: URL + c.profilepic,
        blocked: blockedIds.has(c._id.toString()), // Check if the member is blocked
      }));

    return res.status(200).json({
      success: true,
      members,
      admin,
      admindp,
      isAdmin,
    });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ message: e.message, success: false });
  }
};

exports.addTopic = async (req, res) => {
  const { userId, comId } = req.params;
  const { title, message, type, price, nature } = req.body;

  try {
    // Create and save the topic in one go
    const topic1 = new Topic({
      title,
      message,
      type,
      creator: userId,
      price,
      community: comId,
      nature,
    });


    await topic1.save();

    await Promise.all([
      Topic.updateOne(
        { _id: topic1._id },
        { $push: { members: userId, notifications: { id: userId } }, $inc: { memberscount: 1 } }
      ),
      User.updateOne(
        { _id: userId },
        { $push: { topicsjoined: topic1._id }, $inc: { totaltopics: 1 } }
      ),
      Community.updateOne(
        { _id: comId },
        { $push: { topics: topic1._id }, $inc: { totaltopics: 1 } }
      )
    ]);

    res.status(200).json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

exports.deletemessagestopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { topicId, msgIds, action } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "No user found" });
    }

    if (action === "everyone") {
      await Message.updateMany(
        { mesId: { $in: msgIds }, topicId: topicId },
        { $set: { status: "deleted" } }
      );
    } else {
      await Message.updateMany(
        { mesId: { $in: msgIds }, topicId: topicId },
        { $push: { deletedfor: id } }
      );
    }
    res.status(200).json({ success: true });

  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

exports.mutecom = async (req, res) => {
  try {
    const { id, comId } = req.params;

    // Fetch the community and ensure it exists
    const com = await Community.findById(comId).select("notifications topics");
    if (!com) {
      return res.status(404).json({ message: "Community not found", success: false });
    }

    // Mute or unmute community notifications
    if (com.notifications?.length > 0) {
      const notificationIndex = com.notifications.findIndex(
        (notification) => notification.id.toString() === id
      );

      if (notificationIndex !== -1) {
        com.notifications[notificationIndex].muted = !com.notifications[notificationIndex].muted;
        await com.save();
      }
    }

    // Fetch all topics associated with the community concurrently
    const topics = await Topic.find({ _id: { $in: com.topics } }).select("notifications");

    // Mute or unmute notifications for each topic
    const updatePromises = topics.map((topic) => {
      const notificationIndex = topic.notifications.findIndex(
        (notification) => notification.id?.toString() === id
      );

      if (notificationIndex !== -1) {
        topic.notifications[notificationIndex].muted = !topic.notifications[notificationIndex].muted;
        return topic.save();
      }
      return null; 
    });

    // Execute all updates concurrently
    await Promise.all(updatePromises);

    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.setcomtype = async (req, res) => {
  try {
    const { id, comId } = req.params;
   
    const com = await Community.findById(comId).select("_id type").lean();
    if (id && com) {
   
      await Community.updateOne(
        { _id: comId },
        {
          $set: { type: com.type === "public" ? "private" : "public" },
        }
      );

      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ message: "User not found!", success: false });
    }
  } catch (e) {
    console.log(e);
    res
      .status(400)
      .json({ success: false, message: "Something went wrong..." });
  }
};

exports.fetchmembers = async (req, res) => {
  try {
    const { id, comId } = req.params;
    
    const [user, community] = await Promise.all([
      User.findById(id).select('_id conversations'), // Select necessary fields for the user
      Community.findById(comId).select('_id members') // Select necessary fields for the community
    ]);

    if (!user || !community) {
      return res.status(404).json({ message: "User or community not found!", success: false });
    }

    // Fetch conversations and filter member IDs
    const conversations = await Conversation.find({
      _id: { $in: user.conversations },
      members: user._id,
    }).select('members'); // Select only the 'members' field

    // Get unique user IDs from conversations excluding the current user
    const userIds = new Set();
    conversations.forEach(convo => {
      convo.members.forEach(memberId => {
        if (memberId.toString() !== user._id.toString()) {
          userIds.add(memberId.toString());
        }
      });
    });

    // Fetch user details for the filtered member IDs
    const users = await User.find({
      _id: { $in: Array.from(userIds) }, // Convert Set to Array
    }).select('_id fullname username profilepic'); // Select necessary fields

    // Filter users that are not part of the community and format the response
    const finalMembers = users
      .filter(u => !community.members.includes(u._id.toString()))
      .map(u => ({
        id: u._id,
        fullname: u.fullname,
        username: u.username,
        dp: URL + u.profilepic,
      }));

    res.status(200).json({ final: finalMembers, success: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, message: "Something went wrong..." });
  }
};

exports.forcejoincom = async (req, res) => {
  try {
    const { id, comId } = req.params;

    // Fetch the user and community in parallel
    const [userExists, community] = await Promise.all([
      User.exists({ _id: id }),
      Community.findById(comId).select("topics"),
    ]);

    if (!userExists || !community) {
      return res.status(404).json({ message: "User or Community not found!", success: false });
    }

    // Fetch all topics in parallel and filter for "free" topics
    const topics = await Topic.find({ _id: { $in: community.topics } }).select("type");
    const publicTopics = topics.filter((topic) => topic.type === "free");
    const topicIds = publicTopics.map((topic) => topic._id);

    // Prepare notification object
    const notification = { id, muted: false };

    // Perform database updates in parallel
    await Promise.all([
      Community.updateOne(
        { _id: comId },
        {
          $push: { members: id, notifications: notification, admins: id },
          $inc: { memberscount: 1 },
        }
      ),
      User.updateOne(
        { _id: id },
        {
          $push: { communityjoined: community._id },
          $inc: { totalcom: 1 },
        }
      ),
      Topic.updateMany(
        { _id: { $in: topicIds } },
        {
          $push: { members: id, notifications: notification },
          $inc: { memberscount: 1 },
        }
      ),
      User.updateOne(
        { _id: id },
        {
          $push: { topicsjoined: topicIds },
          $inc: { totaltopics: topicIds.length }, // Adjusted to the number of topics joined
        }
      ),
    ]);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.status(400).json({ success: false, message: "Something went wrong..." });
  }
};

exports.blockpcom = async (req, res) => {
  try {
    const { id, comId } = req.params;
   
    const com = await Community.findById(comId).select("blocked").lean();

    if (!id || !com) {
      return res
        .status(404)
        .json({ message: "User or Community not found", success: false });
    }

    if (com.blocked.some((blockedId) => blockedId.toString() === id)) {
      await Community.updateOne(
        { _id: com._id },
        {
          $pull: {
            blocked: id,
          },
        }
      );
    } else {
      await Community.updateOne(
        { _id: com._id },
        {
          $push: {
            blocked: id,
          },
        }
      );
    }
    res.status(200).json({ success: true });
  } catch (e) {
    console.log(e);
    res.status(400).json({ message: "Something went wrong", success: false });
  }
};