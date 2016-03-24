/*
 * WeChat social provider for uproxy
 * @author Spencer Walden
 *
 */

var wechat = require("../node_modules/wechat-webclient/wechat.js");

var MESSAGE_TYPE = {
  INVITE: 0,
  RETURN_INVITE: 1
};

/*
 * Constructor for a WechatSocialProvider object.
 */
var WechatSocialProvider = function(dispatchEvent) {
  this.client = new wechat.weChatClient(true, true);
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = "wechat";
  this.initLogger_("WechatSocialProvider");
  this.storage = freedom["core.storage"]();

  this.syncInterval = 4000;  // This seems like a good interval (August 1st, 2015)

  this.loggedIn = null;

  this.CONTACT_NAME_SCHEME = "uProxy_"; // + user1 / user2

  // initialize in the initState function so that it may be called later to blank everything
  // that should be blanked out when for example going through wechat login twice in one
  // browser/uProxy session
  this.clientStates = null;
  this.wxids = null;
  this.userProfiles = null;

  this.invitesSent = {}; // wxid => invite timestamp mapping
  this.invitesReceived = {}; // wxid => received invite timestamp mapping

  this.initState_();
  this.initHandlers_();
  this.wxidToUsernameMap = {};
};  // End of constructor

/*
 * Initializes the state of this WechatSocialProvider
 */
WechatSocialProvider.prototype.initState_ = function() {
  this.storage.get("WechatSocialProvider-was-QQ-user").then(function(value) {
    if (value !== null) {
      this.client.isQQuser = value;
    }
  }.bind(this), this.client.handleError.bind(this.client));
  this.wxids = 0;
  this.clientStates = {};
  this.userProfiles = {};
};

/*
 * Initializes event handlers
 */
WechatSocialProvider.prototype.initHandlers_ = function() {

  /**
   *  Gets called if/when syncchecking errors out (normal for logging out)
   */
  this.client.events.synccheckError = function(retcode) {
    this.initState_();
  }.bind(this);

  /*
   * Defines how to handle a newly received message.
   * @param {Object} message
   */
  this.client.events.onMessage = function(message) {
    // Uncomment below when hidden messages can be sent/received reliably.
    // if (message.MsgType !== this.client.HIDDENMSGTYPE) {
    //   return; // No need to consider non-uProxy messages.
    // }
    var availability = "ONLINE";
    var fromUser = this.client.contacts[message.FromUserName];
    var fromUserId = this.userProfiles[fromUser.Uin || fromUser.wxid];
    var eventMessage = {
      "from": {
        "userId": fromUser.wxid,
        "clientId": message.FromUserName,
        "status": availability,
        "lastUpdated": Date.now(),
        "lastSeen": Date.now()
      },
      "message": message.Content
    };
    try {
      var jason = JSON.parse(message.Content);
      if (jason.userStatus === MESSAGE_TYPE.INVITE ||
          jason.userStatus === MESSAGE_TYPE.RETURN_INVITE) {
        var wxidOfInvite = this.client.contacts[message.FromUserName].wxid;
        this.invitesReceived[wxidOfInvite] = jason.timestamp;
        this.storage.set("received_" + this.client.thisUser.Uin, JSON.stringify(this.invitesReceived));
        // if we've sent them an invite, and just got an invite from them, resend ours so they get it.
        if (this.invitesSent[wxidOfInvite]) {
          this.addOrUpdateClient_(this.client.contacts[message.FromUserName], "ONLINE");
          if (jason.userStatus === MESSAGE_TYPE.INVITE) {
            var returnInvite = this.createInvisibleInvite_(
                MESSAGE_TYPE.RETURN_INVITE, wxidOfInvite);
            this.client.webwxsendmsg(returnInvite);
          }
        }
        this.client.log(5, eventMessage.message, -1);
        this.dispatchEvent_("onMessage", eventMessage);
        return;
      }
    } catch(e) {
      return; // don't want to kill uProxy, just means we haven't gotten an invite message
    }
  }.bind(this);

  /*
   *  Updates clientStates and userProfiles using the information of a modified chatroom.
   *  @param {Object} — modified chatroom from this.client.webwxsync
   */
  this.client.events.onModChatroom = function(modChatroom) {
    // Don't know if they are online or offline here... let's be safe, and say offline?
    this.addOrUpdateClient_(modChatroom, "OFFLINE");
    // TODO: actually verify they're your uProxy friend........
    if (modChatroom.MemberCount === 2 && modChatroom.NickName.startsWith(this.CONTACT_NAME_SCHEME)) {
      for (var i = 0; i < modChatroom.MemberCount; i++) {
        var member = modChatroom.MemberList[i];
        if (member.Uin !== this.client.thisUser.Uin) {
          var channelUser = {
            "Uin": modChatroom.NickName,
            "NickName": member.NickName + " ("+modChatroom.NickName+")",
            // look into getting imageData...
          };
          this.addUserProfile_(channelUser);
        }
      }
    }
    //var userProfile = {
    //  "userId": uid,  // Unique identification number
    //  "name": friend.NickName || '',  // Their display name
    //  "lastUpdated": Date.now(),
    //  "url": friend.url || '',  // N/A
    //  "imageData": '' // Gets added later.
    //};
  }.bind(this);

  /*
   * Defines how to handle the receiving of a new UUID from the WeChat webservice.
   * @param {String} url of QR code
   */
  this.client.events.onUUID = function(qrsrc) {
    var OAUTH_REDIRECT_URLS = [
      "https://www.uproxy.org/oauth-redirect-uri",
      "http://freedomjs.org/",
      "http://localhost:8080/",
      "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/"
    ];
    var oauth = freedom["core.oauth"]();
    var url = "<h1>File any issues at https://github.com/freedomjs/freedom-social-wechat</h1>";
    url += "<img src='" + qrsrc + "'/>";
    url = "data:text/html," + encodeURIComponent(url);
    this.client.log(1, "QR code can be scanned at: " + url, -1);

    oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
      return oauth.launchAuthFlow(url, stateObj).then(function(responseUrl) {
        return responseUrl;
      });
    });
  }.bind(this);

  /*
   * Defines how to handle the receiving of a new Icon from the WeChat webservice.
   * @ param {Object} JSON object containing the dataURL of the QR code, and
   *   the HeadImgUrl of the given icon as (iconURLPath).
   */
  this.client.events.onIcon = function(iconJSON) {
    if (iconJSON) {
      try {
        var jason = JSON.parse(iconJSON);
        var userName = jason.iconURLPath.split("?")[1].split("&")[1].split("=")[1];
        var user = this.client.contacts[userName] || this.client.chatrooms[userName];
        var friend = this.userProfiles[user.Uin || user.wxid];
        if (!friend && user.wxid === this.client.contacts[this.client.thisUser.UserName].wxid) {
          // have wxid here, but thisUser only has a Uin... 
          // TODO: detect myself here to give myself my icon.
          friend = this.userProfiles[this.client.thisUser.Uin];
        }
        if (friend) {
          friend.imageData = jason.dataURL;
          this.dispatchEvent_("onUserProfile", friend);
        } else
          this.client.handleError("Icon corresponds to unknown contact.").bind(this);
      } catch (e) {
        this.client.handleError(e).bind(this);
      }
    }
  }.bind(this);

  /*
   * Defines the function that handles the case where the retrieved UUID corresponds
   * to the wrong domain for this user trying to get in. Also saves which domain
   * the user was associated with for future reference.
   *
   * @param {String} referral URL address.
   * TODO: referral isn't used, consider excluding.
   * @returns {Promise} that fulfills if restepping through the beginning of the
   *  login process went sucessfully, rejects promise if there was an error.
   */
  this.client.events.onWrongDom = function(referral) {
    this.storage.set("WechatSocialProvider-was-QQ-user", this.client.isQQuser);
    return this.preLogin(referral);
  }.bind(this);

  /**
   *  handler for wxids -> userID
   */
  this.client.events.onWXIDs = function(wxids) {
    var expected = Object.keys(this.client.contacts).length +
                      Object.keys(this.client.chatrooms).length;
    var myself = this.client.thisUser.UserName;  // this user
    if (this.wxids !== expected) {
      for (var userName in wxids) {
        var wxid = wxids[userName];
        this.wxidToUsernameMap[wxid] = userName;
        if (!userName.startsWith("@@") && this.client.contacts[userName]) {
          this.client.log(1, "contact wxid found: " + this.client.contacts[userName].NickName);
          this.client.contacts[userName].wxid = wxid;
          if (!this.userProfiles[wxid]) {
            this.wxids++;
          }
          if (userName === myself) {
            this.client.contacts[userName].wxid = wxid; 
            this.client.thisUser.wxid = wxid;
            // TODO: decide if i need to do this, since it's already done at wechat login...
            this.addOrUpdateClient_(this.client.contacts[userName], "ONLINE");
          } else {
            this.addUserProfile_(this.client.contacts[userName]);
          }
          // if (this.invitesSent[wxid] && this.invitesReceived[wxid]) {
          //   this.addOrUpdateClient_(this.client.contacts[userName], "ONLINE");
          // }
        } else if (userName.startsWith("@@") && this.client.chatrooms[userName]) {
          this.client.log(1, "chatroom wxid found: " + this.client.chatrooms[userName].NickName);
          this.client.chatrooms[userName].wxid = wxid;
          if (!this.userProfiles[wxid]) {
            this.wxids++;
          }
          this.addUserProfile_(this.client.chatrooms[userName]);
          // if (this.invitesSent[wxid] && this.invitesReceived[wxid]) {
          //   this.addOrUpdateClient_(this.client.contacts[userName], "ONLINE");
          // }
        }
        if (this.wxids === expected) {
          this.client.log(0, "wxids fully resolved: " + this.wxids + "/" + expected);
          this.client.webwxgeticon();
          for (var invitedWxid in this.invitesSent) {
            if (!this.invitesReceived[invitedWxid]) {
              var invite = this.createInvisibleInvite_(MESSAGE_TYPE.INVITE, invitedWxid);
              this.client.webwxsendmsg(invite);
            } else {
              this.addOrUpdateClient_(this.client.contacts[userName], "ONLINE");
            }
          }
          this.loggedIn(this.clientStates[myself]);
        } else {
          this.client.log(-1, "wxids not fully resolved: " + this.wxids + "/" + expected);
        }
      }
    }
  }.bind(this);
};

/*
 *  Initialize this.logger using the module name
 */
WechatSocialProvider.prototype.initLogger_ = function(moduleName) {
  this.logger = console;  // Initialize to console if it exists.
  if (typeof freedom !== 'undefined' && typeof freedom.core === 'function') {
    freedom.core().getLogger('[' + moduleName + ']').then(function(log) {
      this.logger = log;
    }.bind(this));
  }
};

/*
 * Logs the user into WeChat
 * @returns {Promise} -- fulfills on proper login, rejects on failure.
 */
WechatSocialProvider.prototype.login = function(loginOpts) {
  return new Promise(function(fulfillLogin, rejectLogin) {
  this.client.preLogin(false)
    .then(this.client.webwxinit.bind(this.client), this.client.handleError.bind(this))
    .then(function () {
      setTimeout(this.client.synccheck.bind(this.client), this.syncInterval);
      this.storage.get("invited_" + this.client.thisUser.Uin)
          .then(function(invitesString) {
        var invites = JSON.parse(invitesString);
        this.invitesSent = invites || {};
        this.storage.get("received_" + this.client.thisUser.Uin)
            .then(function(receivedString) {
          var received = JSON.parse(receivedString);
          this.invitesReceived = received || {};
        }.bind(this), this.client.handleError.bind(this.client));
      }.bind(this), this.client.handleError.bind(this.client));
      this.client.webwxgetcontact(false).then(function() {
        this.addOrUpdateClient_(this.client.thisUser, "ONLINE");
        this.addUserProfile_(this.client.thisUser);
        this.loggedIn = fulfillLogin;
      }.bind(this), this.client.handleError.bind(this));
    }.bind(this), this.client.handleError.bind(this));  // end of getOAuthToken_
  }.bind(this));  // end of return new Promise
};

/*
 * Returns a Promise which fulfills with all known ClientStates.
 */
WechatSocialProvider.prototype.getClients = function() {
  return Promise.resolve(this.clientStates);
};

/*
 * Returns a Promise which fulfills with all known UserProfiles
 */
WechatSocialProvider.prototype.getUsers = function() {
  return Promise.resolve(this.userProfiles);
};

/*
 * Sends a message to another clientId.
 * @param {String} friend's clientId
 * @param {String} message you wish to send them
 */
WechatSocialProvider.prototype.sendMessage = function(friend, message) {
  //<friend>.UserName and message string to be sent (hidden)
  return new Promise(function (fulfullSendMessage, rejectSendMessage) {
    var msg = {
      "type": this.client.HIDDENMSGTYPE,
      "content": message,
      "recipient": friend
    };
    //this.client.log(3, "WechatSocialProvider sending message", msg.content);
    this.client.webwxsendmsg(msg).then(fulfullSendMessage, rejectSendMessage);
  }.bind(this));
};

/*
 * Logs the user out of WeChat, and reinitializes the social provider state.
 * @returns {Promise} fullfills on successful logout, rejects on failure to logout.
 */
WechatSocialProvider.prototype.logout = function() {
  return new Promise(function (fulfillLogout, rejectLogout) {
    if (this.client.loginData) {
      this.client.webwxlogout().then(function() {
        this.addOrUpdateClient_(this.client.thisUser, "OFFLINE");
        //this.client.log(0, "WechatSocialProvider logout");
        this.initState_();
        fulfillLogout();
      }.bind(this), this.client.handleError.bind(this));
    } else {
      this.client.log(-1, "Couldn't log out; not logged in");
      rejectLogout();
    }
  }.bind(this));
};

/*
 * Adds a UserProfile.
 * @param {Object} WeChat friend JSON object.
 */
WechatSocialProvider.prototype.addUserProfile_ = function(friend) {
  var uid = friend.Uin || friend.wxid || '';
  var userProfile = {
    "userId": uid,  // Unique identification number
    "name": friend.NickName || '',  // Their display name
    "lastUpdated": Date.now(),
    "url": friend.url || '',  // N/A
    "imageData": '' // Gets added later.
  };
  this.userProfiles[uid] = userProfile;
  this.dispatchEvent_('onUserProfile', userProfile);
  return userProfile;
};

/*
 * Adds or updates a client.
 * @param {Object} WeChat friend JSON object.
 * @param {String} friend's uProxy status. ("ONLINE", "OFFLINE", "ONLINE_WITH_OTHER_APP")
 * @returns {Object} modified ClientState object
 *
 */
WechatSocialProvider.prototype.addOrUpdateClient_ = function(friend, availability) {
  var state = this.clientStates[friend.UserName];
  if (state) {
    state.status = availability;
    state.lastUpdated = Date.now();
    state.lastSeen = Date.now();
  } else {
    state = {
      "userId": friend.Uin || friend.wxid || '',  // Unique identification number
      "clientId": friend.UserName,  // Session username
      "status": availability,  // All caps string saying online, offline, or online on another app.
      "lastUpdated": Date.now(),
      "lastSeen": Date.now()
    };
    if (friend.UserName.startsWith("@@") && !friend.Uin && !friend.wxid &&
        friend.NickName.startsWith(this.CONTACT_NAME_SCHEME)) {
      state.userId = friend.NickName;
    }
  }
  this.clientStates[friend.UserName] = state;
  this.dispatchEvent_('onClientState', this.clientStates[friend.UserName]);
  return this.clientStates[friend.UserName];
};

/**
 *  Included to conform with API; is a noop function in this context
 */
WechatSocialProvider.prototype.acceptUserInvitation = function(invite) {
  return Promise.reject(); // always reject if function is called.
};

/**
 *  Invites a contact to use uProxy with you. If two users invite each other, they are then
 *  uProxy contacts with each other. Two invites are sent, one that is useful for uProxy to use
 *  and another invite that is visible/legible to the invited user. The visible invite is only
 *  sent if the recipient hasn't invited the current user.
 */
WechatSocialProvider.prototype.inviteUser = function(contact) {
  return new Promise(function (resolve, reject) {
    this.createInvisibleInvite_(MESSAGE_TYPE.INVITE, contact)
    .then(function(invisible_invite) {
      if (this.invitesReceived[contact]) {
        this.addOrUpdateClient_({"UserName": this.wxidToUsernameMap[contact], "wxid": contact}, "ONLINE");
        this.client.webwxsendmsg(invisible_invite);
        return;
      }
      var friendName = "friend";
      if (this.client.contacts[this.wxidToUsernameMap[contact]] &&
          this.client.contacts[this.wxidToUsernameMap[contact]].NickName) {
        friendName = this.client.contacts[this.wxidToUsernameMap[contact]].NickName;
      }
      var info = "Hi " + friendName + "! I'd like to use uProxy with you. You can find more ";
      info += "information at www.uproxy.org, or ask me about it!";
      // TODO: add in information about the group chat created here?
      var plaintext_invite = {
          "type": 1,
          "content": info,
          "recipient": this.wxidToUsernameMap[contact]
      };
      this.client.webwxsendmsg(invisible_invite);
      this.client.webwxsendmsg(plaintext_invite);
      resolve();
    }.bind(this), this.client.handleError.bind(this.client));
  }.bind(this));
};

/**
 *  Creates an invite that is useful for uProxy. This will also create a group chat for use with
 *  uProxy.
 */
WechatSocialProvider.prototype.createInvisibleInvite_ = function(messageType, recipientWxid) {
  return new Promise(function(resolve, reject) { 
    var timestamp = this.invitesSent[recipientWxid] || Date.now();
    var uProxy_info = JSON.stringify({
      "userStatus": messageType,
      "timestamp": timestamp
    });
    // check if chatroom between two users exists; 
    // if yes, set recipient to that.
    // else create chatroom and set recipient to that
    console.log("recipientWxid: " + recipientWxid);
    console.log("thisUser.wxid: " + this.client.thisUser.wxid);
    console.log("thisUser.Uin: " + this.client.thisUser.Uin);
    var chatHash1 = this.chatHash_(this.client.thisUser.wxid, recipientWxid);
    var chatHash2 = this.chatHash_(recipientWxid, this.client.thisUser.wxid);
    this.createSignalChannel_(this.wxidToUsernameMap[recipientWxid], chatHash1, chatHash2)
    .then(function(chatroomUserName) {
      var invite = {
        "type": this.client.HIDDENMSGTYPE,
        "content": uProxy_info,
        "recipient": chatroomUserName 
      };
      this.invitesSent[recipientWxid] = timestamp;
      this.storage.set("invited_" + this.client.thisUser.Uin, JSON.stringify(this.invitesSent));
      resolve(invite);
    }.bind(this), this.client.handleError.bind(this.client));
  }.bind(this));
};

/**
 *  resolves with chatroomUserName
 */
WechatSocialProvider.prototype.createSignalChannel_ = function(contact, chatroomName, altName) {
  return new Promise(function (resolve, reject) {
    for (var chatroom in this.client.chatrooms) { // TODO: possibly make lookup table for this
      if (this.client.chatrooms[chatroom].NickName === chatroomName) {
        this.client.log(1, "SP: using original chatroom: " + chatroomName);
        resolve(chatroom);
        return; // chatroom already exists
      } else if (this.client.chatrooms[chatroom].NickName === altName) {
        this.client.log(1, "SP: using Alt chatroom: " + chatroomName);
        resolve(chatroom);
        return; // chatroom already exists
      }
    }
    this.client.log(1, "SP: creating chatroom with name " + chatroomName);
    var THE_INVISIBLE_CONTACT = "filehelper";
    var list = [contact, THE_INVISIBLE_CONTACT];
    this.client.webwxcreatechatroom(list)
    .then(this.client.webwxbatchgetcontact.bind(this.client), this.client.handleError.bind(this.client))
    .then(this.client.webwxupdatechatroom.bind(this.client, "modtopic", chatroomName), this.client.handleError.bind(this.client))
    //.then(this.client.webwxupdatechatroom.bind(this.client, "delmember", arbitrarycontact), this.client.handleError.bind(this.client)) 
    //.then(resolve, reject);
    .then(function(chatroomUserName) {
      this.client.log(1, "SP: Chatroom fully updated", chatroomUserName);
      resolve(chatroomUserName);
    }.bind(this), reject);
  }.bind(this));
};

/**
 *  Generate a token that is (ideally) unique to a given pair of users. This
 *  will incorporate both users wxids to create a token that can be part of
 *  their groupname. 
 */
WechatSocialProvider.prototype.chatHash_ = function(wxid1, wxid2) {
  var one = wxid1.match(/wxid_(.*)/)[1];
  var two = wxid2.match(/wxid_(.*)/)[1];
  var temp = "";
  for (var i = 0; i < one.length; i++) { // length 14
    temp += i % 2 === 0 ? one[i] : two[i];
  }
  temp = btoa(temp); // length 20
  var result = "";
  for (i = 0; i < temp.length; i++) {
    result += i % 2 === 0 ? temp[i] : ""; // take every other char
  }
  // result.length = 10;
  return this.CONTACT_NAME_SCHEME + result;
  // this is length of 17 as of Jan 24th, 2016
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(WechatSocialProvider);
  } else {
    freedom.social().providePromises(WechatSocialProvider);
  }
}
