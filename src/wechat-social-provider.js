/*
 * WeChat social provider
 */

var wechat = require("../node_modules/wechat-webclient/wechat.js");

var WechatSocialProvider = function(dispatchEvent) {
  this.client = new wechat.weChatClient(true, true);
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = "wechat";
  this.initLogger_("WechatSocialProvider");
  this.storage = freedom["core.storage"]();

  this.syncInterval = 4000;  // This seems like a good interval (August 1st, 2015)

  this.initState_();
  this.initHandlers_();
  
};  // End of constructor

/*
 * Initializes the states of several variables such as the clientStates.
 */
WechatSocialProvider.prototype.initState_ = function() {
  this.client.isQQuser = this.storage.get("WechatSocialProvider-was-QQ-user");
  this.clientStates = {};
  this.userProfiles = {};
};

/*
 * Sets up event handlers
 */ 
WechatSocialProvider.prototype.initHandlers_ = function() {

  this.client.events.onMessage = function(message) {
    var availability = "ONLINE_WITH_OTHER_APP";
    if (message.MsgType === this.client.HIDDENMSGTYPE) {
      availability = "ONLINE";
    }
    var eventMessage = {
      "from": {
        "userId": this.clientStates[message.FromUserName].userId,
        "clientId": message.FromUserName,
        "status": availability,
        "lastUpdated": Date.now(),
        "lastSeen": Date.now()
      },
      "message": message.Content
    };
    this.client.log(5, eventMessage.message, -1);
    this.dispatchEvent_("onMessage", eventMessage);
  }.bind(this);

  this.client.events.onUUID = function(url) {
    var OAUTH_REDIRECT_URLS = [
        "https://www.uproxy.org/oauth-redirect-uri",
        "http://freedomjs.org/",
        "http://localhost:8080/",
        "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/"
      ];
    var oauth = freedom["core.oauth"]();
    var qrsrc = url;
    url = "<h1 text-align='center'>File any issues at https://github.com/freedomjs/freedom-social-wechat</h1>";
    url += "<img src='" + qrsrc + "' text-align='center'/>";
    url = "data:text/html," + encodeURIComponent(url);
    this.client.log(1, "QR code can be scanned at: " + url, -1);

    oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
      return oauth.launchAuthFlow(url, stateObj).then(function(responseUrl) {
        return responseUrl;
      });
    });
  }.bind(this);

  this.client.events.onIcon = function(iconJSON) {
    if (iconJSON) {
      try {
        var jason = JSON.parse(iconJSON);
        var clientId = jason.iconURLPath.split("?")[1].split("&")[1].split("=")[1];
        var friend = this.userProfiles[this.clientStates[clientId].userId];
        if (friend) {
          friend.imageData = jason.dataURL;
          this.dispatchEvent_('onUserProfile', friend);
        } else this.client.handleError("Icon corresponds to unknown contact.");
      } catch (e) {
        this.client.handleError(e);
      }
    }
  }.bind(this);

  this.client.events.onWrongDom = function() {
    this.storage.set("WechatSocialProvider-was-QQ-user", this.client.isQQuser);
    return this.client.getUUID()
    .then(this.client.checkForScan.bind(this.client), this.client.handleError)
    .then(this.client.webwxnewloginpage.bind(this.client), this.client.handleError);
  }.bind(this);
};

/*
* Initialize this.logger using the module name.
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
 * Login to social network, returns a Promise that fulfills on login.
 */
WechatSocialProvider.prototype.login = function(loginOpts) {
  return new Promise(function(fulfillLogin, rejectLogin) {
    this.client.getUUID()
    .then(this.client.checkForScan.bind(this.client), this.client.handleError)
    .then(this.client.webwxnewloginpage.bind(this.client), this.client.handleError)
    .then(this.client.webwxinit.bind(this.client), this.client.handleError)
    .then(function () {
      this.client.webwxgetcontact(false).then(function() {  // TODO: T vs F
        var me = this.addOrUpdateClient_(this.client.thisUser, "ONLINE");
        this.addUserProfile_(this.client.thisUser);
        for (var friend in this.client.contacts) {
          this.addOrUpdateClient_(this.client.contacts[friend], "ONLINE");  //FIXME
          //ONLINE_WITH_OTHER_APP will change when they ping back
          this.addUserProfile_(this.client.contacts[friend]);
        }
        fulfillLogin(me);
      }.bind(this), this.client.handleError);
      setTimeout(this.client.synccheck.bind(this.client), this.syncInterval);
    }.bind(this), this.client.handleError);  // end of getOAuthToken_
  }.bind(this));  // end of return new Promise
};

/*
 * Returns a Promise which fulfills with all known ClientStates.
 */
WechatSocialProvider.prototype.getClients = function() {
  return this.clientStates;
};

/*
 * Returns a Promise which fulfills with all known UserProfiles
 */
WechatSocialProvider.prototype.getUsers = function() {
  return this.userProfiles;
};

/*
 * Sends a message to another clientId.
 */
WechatSocialProvider.prototype.sendMessage = function(friend, message) {
  //<friend>.UserName and message string to be sent (hidden)
  return new Promise(function (fulfullSendMessage, rejectSendMessage) {
    var msg = {
      "type": this.client.HIDDENMSGTYPE,
      "content": message,
      "recipient": friend
    };
    this.client.log(3, "WechatSocialProvider sending message", msg.content);
    this.client.webwxsendmsg(msg).then(fulfullSendMessage, rejectSendMessage); 
  }.bind(this));
};

/*
 * Logs out of the social network.
 */
WechatSocialProvider.prototype.logout = function() {
  return new Promise(function (fulfillLogout, rejectLogout) {
    if (this.client.loginData) {
      this.client.webwxlogout().then(function() {
        this.addOrUpdateClient_(this.client.thisUser, "OFFLINE");
        this.client.log(0, "WechatSocialProvider logout");
        this.initState_();
        fulfillLogout();
      }.bind(this), this.client.handleError);
    } else {
      this.client.log(-1, "Couldn't log out; not logged in");
      rejectLogout();
    }
  }.bind(this));
};

/*
 * Adds a UserProfile.
 */
WechatSocialProvider.prototype.addUserProfile_ = function(friend) {
  var userProfile = { 
    "userId": friend.Uin || '',  // Unique identification number
    "name": friend.NickName || '',  // Their display name
    "lastUpdated": Date.now(),
    "url": friend.url || '',  // N/A
    "imageData": ("https://" + this.client.WEBDOM + friend.HeadImgUrl) || '' //FIXME??? 
  };
  this.userProfiles[friend.Uin] = userProfile;
  this.dispatchEvent_('onUserProfile', userProfile);
  return userProfile;
};

/*
 * Adds or updates a client.  Returns the modified ClientState object.
 */
WechatSocialProvider.prototype.addOrUpdateClient_ = function(friend, availability) {
  if (this.clientStates[friend.UserName]) {
    this.clientStates[friend.UserName].status = availability;
    this.clientStates[friend.UserName].lastUpdated = Date.now();
    this.clientStates[friend.UserName].lastSeen = Date.now();
  } else {
    this.clientStates[friend.UserName] = {
      "userId": friend.Uin,  // Unique identification number
      "clientId": friend.UserName,  // Session username
      "status": availability,  // All caps string saying online, offline, or online on another app.
      "lastUpdated": Date.now(),
      "lastSeen": Date.now()
    };
  }
  this.dispatchEvent_('onClientState', this.clientStates[friend.UserName]);
  return this.clientStates[friend.UserName];
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(WechatSocialProvider);
  } else {
    freedom.social().providePromises(WechatSocialProvider);
  }
}
