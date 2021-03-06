/*
 * WeChat social provider for uproxy
 * @author Spencer Walden
 *
 */

var wechat = require("../node_modules/wechat-webclient/wechat.js");

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
  this.wxids = 0;

  this.CONTACT_NAME_SCHEME = "uProxy_"; // + user1 / user2
  
  this.inviteds = {}; // wxid => invite mapping

  this.initState_();
  this.initHandlers_();
  
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
  this.clientStates = {};
  this.userProfiles = {};
};

/*
 * Initializes event handlers
 */ 
WechatSocialProvider.prototype.initHandlers_ = function() {

  /*
   * Defines how to handle a newly received message.
   * @param {Object} message
   */
  this.client.events.onMessage = function(message) {
    var availability = "ONLINE_WITH_OTHER_APP";
    if (message.MsgType === this.client.HIDDENMSGTYPE) {
      availability = "ONLINE";
    }
    var fromUser = this.client.contacts[message.FromUserName];
    var fromUserId = this.userProfiles[fromUser.Uin || fromUser.wxid];
    var eventMessage = {
      "from": {
        "userId": fromUserId,
        "clientId": message.FromUserName,
        "status": availability,
        "lastUpdated": Date.now(),
        "lastSeen": Date.now()
      },
      "message": message.Content
    };
    try {
      var jason = JSON.parse(message.Content);
      if (jason.userStatus === 0) {
        this.storage.get("invited_" + this.client.thisUser.Uin)
        .then(function(invites) {
          var iContact = invites[fromUserId];
          if (iContact.timestamp < jason.timestamp) {
            resolve(true);  // If timestamp of my invite sent before theirs, I create chatroom
          } else {
            resolve(false);
          }
        }.bind(this), this.client.handleError.bind(this.client))
        .then(function(chatroomCreater) {
          if (chatroomCreater) {
            var chatroomname = this.CONTACT_NAME_SCHEME + this.client.contacts[contact].NickName; // FIXME, better naming scheme
            this.client.log(1, "Social Provider: creating chatroom with name " + chatroomname);
            var THE_INVISIBLE_CONTACT = "filehelper";
            var list = [contact, THE_INVISIBLE_CONTACT];
            this.client.webwxcreatechatroom(list)
            .then(this.client.webwxbatchgetcontact.bind(this.client),
                      this.client.handleError.bind(this.client))
            .then(this.client.webwxupdatechatroom.bind(this.client, "modtopic", chatroomname),
                      this.client.handleError.bind(this.client))
            //.then(this.client.webwxupdatechatroom.bind(this.client, "delmember", arbitrarycontact), this.client.handleError.bind(this.client)) 
            .then(function(chatroom) {
              var hey = "Hey, " + this.client.contacts[contact].NickName + "! We're now friends ";
              hey += "on uProxy! I made this group between us so we can use uProxy privately.";
              var welcome = {
                "type": 1,
                "content": hey,
                "recipient": chatroom
              };
              delete this.inviteds[fromUserId];
              this.storage.set("invited_" + this.client.thisUser.Uin, this.inviteds);
              return this.client.webwxsendmsg(welcome);
            }.bind(this), this.client.handleError.bind(this.client));
          } else {
            delete this.inviteds[fromUserId];
            this.storage.set("invited_" + this.client.thisUser.Uin, this.inviteds);
          }
        }.bind(this), this.client.handleError.bind(this.client));
      }
    } catch(e) {
      console.error(e); // don't want to kill uProxy, just means we haven't gotten an invite message
    }
    this.client.log(5, eventMessage.message, -1);
    this.dispatchEvent_("onMessage", eventMessage);
  }.bind(this);

  /*
   *  Updates clientStates and userProfiles using the information of a modified chatroom.
   *  @param {Object} — modified chatroom from this.client.webwxsync
   */
  this.client.events.onModChatroom = function(modChatroom) {
    this.addOrUpdateClient_(modChatroom);
    //for (var i = 0; i < modChatroom.MemberCount; i++) {
    //  var member = modChatroom.MemberList[i];
    //  var clientId = member.UserName;
    //  if (member.wxid && !this.clientStates[clientId].userId) {
    //    this.client.log(1, "contact Uin discovered: " + member.NickName + " => " + member.wxid);
    //    this.clientStates[clientId].userId = member.wxid;
    //    this.dispatchEvent_("onClientState", this.clientStates[clientId]);
    //    this.addUserProfile_(member);
    //  }
    //}
  }.bind(this);

  /*
   * Defines how to handle the receiving of a new UUID from the WeChat webservice.
   * @param {String} url of QR code
   */
  this.client.events.onUUID = function(url) {
    var OAUTH_REDIRECT_URLS = [
        "https://www.uproxy.org/oauth-redirect-uri",
        "http://freedomjs.org/",
        "http://localhost:8080/",
        "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/"
      ];
    var oauth = freedom["core.oauth"]();
    var qrsrc = url;
    url = "<h1>File any issues at https://github.com/freedomjs/freedom-social-wechat</h1>";
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
        var user = this.client.contacts[userName];
        var friend = this.userProfiles[user.Uin || user.wxid];
        if (friend) {
          friend.imageData = jason.dataURL;
          this.dispatchEvent_('onUserProfile', friend);
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
    var selfContact = this.client.thisUser.UserName;
    if (this.wxids !== expected) {
      for (var userName in wxids) {
        console.log(userName);
        if (userName.startsWith("@@") && this.client.chatrooms[userName]) {
          this.client.log(1, "chatroomUser wxid found: " + this.client.chatrooms[userName].NickName);
          this.client.chatrooms[userName].wxid = wxids[userName];
          if (!this.userProfiles[wxids[userName]]) {
            this.wxids++;
          }
          if (this.client.chatrooms[userName].NickName.startsWith(this.CONTACT_NAME_SCHEME)) {
            this.addOrUpdateClient_(this.client.chatrooms[userName], "ONLINE");  //FIXME
          }
        } else if (!userName.startsWith("@@") && this.client.contacts[userName]){
          this.client.log(1, "contact wxid found: " + this.client.contacts[userName].NickName);
          this.client.contacts[userName].wxid = wxids[userName];
          if (!this.userProfiles[wxids[userName]]) {
            this.wxids++;
          }
          if (userName !== this.client.thisUser.UserName) {
            //this.addOrUpdateClient_(this.client.contacts[userName], "ONLINE"); //FIXME
            this.addUserProfile_(this.client.contacts[userName]);
          }
         // else {
         //   this.addOrUpdateClient_(this.client.thisUser, "ONLINE");
         //   this.addUserProfile_(this.client.thisUser);
         // }
        }
      }
      if (this.wxids === expected) {
        this.client.log(0, "wxids fully resolved");
        this.client.webwxgeticon();
        this.storage.get("invited_" + this.client.thisUser.Uin)
        .then(function(invites) {
          for (var invite in invites) {
            this.client.webwxsendmsg(invite);
          }
        }.bind(this), this.client.handleError.bind(this.client));
        this.loggedIn(this.clientStates[selfContact]);
      } else {
        this.client.log(-1, "wxids not fully resolved");
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
    if (friend.MemberCount === 2) {
      for (var member in friend.MemberList) {
        if (member.UserName !== this.client.thisUser.UserName) {
          state = {
            "userId": member.Uin || member.wxid || '',  // Unique identification number
            "clientId": member.UserName,  // Session username
            "status": availability,  // All caps string saying online, offline, or online on another app.
            "lastUpdated": Date.now(),
            "lastSeen": Date.now()
          };
        }
      }
    } else if (friend.MemberCount === 0) {
      state = {
        "userId": friend.Uin || friend.wxid || '',  // Unique identification number
        "clientId": friend.UserName,  // Session username
        "status": availability,  // All caps string saying online, offline, or online on another app.
        "lastUpdated": Date.now(),
        "lastSeen": Date.now()
      };
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
  return Promise.reject(); // this shall just do nothing.
};

// This is just a stub for how some of the invite process will go.
WechatSocialProvider.prototype.inviteUser = function(contact) {
  return new Promise(function (resolve, reject) {
    var uProxy_info = JSON.stringify({
      "userStatus": 0, // friend request
      "timestamp": Date.now()
    });
    var uProxy_invite = {
      "type": this.client.HIDDENMSGTYPE,
      "content": uProxy_info,
      "recipient": contact.UserName
    };
    this.inviteds[contact.wxid] = uProxy_invite;
    var plaintext_invite = {
        "type": 1,
        "content": "Hey " + this.client.contacts[contact].NickName + "! You should use uProxy!", // FIXME
        "recipient": contact.UserName
    };
    this.client.webwxsendmsg(uProxy_invite);
    this.client.webwxsendmsg(plaintext_invite);
    this.storage.set("invited_" + this.client.thisUser.Uin, this.inviteds);
  }.bind(this));
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(WechatSocialProvider);
  } else {
    freedom.social().providePromises(WechatSocialProvider);
  }
}
