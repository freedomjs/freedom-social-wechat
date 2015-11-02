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
        var clientId = jason.iconURLPath.split("?")[1].split("&")[1].split("=")[1];
        var friend = this.userProfiles[this.clientStates[clientId].userId];
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
    return this.beginLogin_();
  }.bind(this);

  this.client.events.onWXIDs = function(wxids) {

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
 * Logs the user into WeChat
 * @returns {Promise} -- fulfills on proper login, rejects on failure.
 */
WechatSocialProvider.prototype.login = function(loginOpts) {
  return new Promise(function(fulfillLogin, rejectLogin) {
    this.client.preLogin(false)  // HEADSUP: for webview, set to true.
    .then(this.client.webwxinit.bind(this.client), this.client.handleError.bind(this))
    .then(function () {
      setTimeout(this.client.synccheck.bind(this.client), this.syncInterval);
      this.client.webwxgetcontact(true).then(function() {
        var me = this.addOrUpdateClient_(this.client.thisUser, "ONLINE");
        this.addUserProfile_(this.client.thisUser);
        for (var friend in this.client.contacts) {
          this.addOrUpdateClient_(this.client.contacts[friend], "ONLINE");  //FIXME
          //ONLINE_WITH_OTHER_APP will change when/if they ping back
          this.addUserProfile_(this.client.contacts[friend]);
        }
        fulfillLogin(me);
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
  var userProfile = {
    "userId": friend.NickName,
    "name": friend.NickName || '',  // Their display name
    "lastUpdated": Date.now(),
    "url": friend.url || '',  // N/A
    "imageData": '' // Gets added later.
  };
  this.userProfiles[friend.NickName] = userProfile;
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
      "userId": friend.NickName,
      "clientId": friend.UserName,  // Session username
      "status": availability,  // All caps string saying online, offline, or online on another app.
      "lastUpdated": Date.now(),
      "lastSeen": Date.now()
    };
  }
  this.clientStates[friend.UserName] = state;
  this.dispatchEvent_('onClientState', this.clientStates[friend.UserName]);
  return this.clientStates[friend.UserName];
};

/*
 * Steps through the beginning parts of the WeChat login process.
 * @returns {Promise} resolves on sucessfully getting loginData, rejects otherwise.
 */
WechatSocialProvider.prototype.beginLogin_ = function() {
  return new Promise(function (resolve, reject) {
    this.client.getUUID()
    .then(this.client.checkForScan.bind(this.client), this.client.handleError.bind(this))
    .then(this.client.webwxnewloginpage.bind(this.client), this.client.handleError.bind(this))
    .then(resolve, reject);
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
