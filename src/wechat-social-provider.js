/*
 * WeChat social provider
 */

var wechat = require('../node_modules/wechat-webclient/wechat.js');

var WechatSocialProvider = function(dispatchEvent) {
  this.client = new wechat.weChatClient();
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'wechat';
  this.initLogger_('WechatSocialProvider');

  this.syncInterval = 4000;  // This seems like a good interval (August 1st, 2015)

  this.initState_();
  this.initHandlers_();
  
};  // End of constructor

/*
 * Initializes the states of several variables such as the clientStates.
 */
WechatSocialProvider.prototype.initState_ = function() {
  this.loginData = null;
  this.clientStates = [];
  this.userProfiles = [];
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
        "userId": message.Uin,
        "clientId": message.FromUserName,
        "status": availability,
        "lastUpdated": Date.now(),
        "lastSeen": Date.now()
      },
      "message": message.Content
    };
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
    this.client.log(1, "QR code can be scanned at: " + url, -1);

    oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
      return oauth.launchAuthFlow(url, stateObj).then(function(responseUrl) {
        return responseUrl;
      });
    });
  }.bind(this);

  this.client.events.onIcon = function(iconJSON) {
    //this.client.log(0, "onIcon");
    if (iconJSON) {
      try {
        var jason = JSON.parse(iconJSON);
        var friend = null;
        for (var i = 0; i < this.client.contacts.length; i++) {
          if (this.client.contacts[i].HeadImgUrl === jason.iconURLPath) {
            friend = this.client.contacts[i];
            this.client.log(0, "icon to friend match", friend.NickName);

            i = this.client.contacts.length;  // ends loop
          }
        }
        // Will run if a friend was found that matched this iconURLPath
        if (friend) this.updateUserProfile__(friend, jason.dataURL);
        else this.client.handleError("Icon corresponds to unknown contact.");
      } catch (e) {
        this.client.handleError(e);
      }
    }
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
    this.client.getUUID().then(function(uuid) {
      return this.client.checkForScan(uuid, true);
    }.bind(this), this.client.handleError)
    .then(this.client.webwxnewloginpage.bind(this.client), this.client.handleError)
    .then(this.client.webwxinit.bind(this.client), this.client.handleError)
    .then(function (loginData) {
      fulfillLogin(this.addOrUpdateClient_(this.client.thisUser, "ONLINE"));
      this.loginData = loginData;
      this.client.webwxgetcontact(loginData, false).then(function() {  // TODO: T vs F
        for (var i = 0; i < this.client.contacts.length; i++) {
          var friend = this.client.contacts[i];
          this.addOrUpdateClient_(friend, "ONLINE");  //FIXME
          //ONLINE_WITH_OTHER_APP will change when they ping back
          this.addUserProfile_(friend);
        }
      }.bind(this), this.client.handleError);
      setTimeout(this.client.synccheck.bind(this.client, loginData), this.syncInterval);
    }.bind(this), this.client.handleError);  // end of getOAuthToken_
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
 */
WechatSocialProvider.prototype.sendMessage = function(friend, message) {
  //<friend>.UserName and message string to be sent (hidden)
  return new Promise(function (fulfullSendMessage, rejectSendMessage) {
    var msg = {
      "type": this.client.HIDDENMSGTYPE,
      "content": message,
      "recipient": friend,
    };
    this.client.log(2, "WechatSocialProvider sending message", msg);
    this.client.webwxsendmsg(this.loginData, msg).then(fulfullSendMessage, rejectSendMessage); 
  }.bind(this));
};

/*
 * Logs out of the social network.
 */
WechatSocialProvider.prototype.logout = function() {
  return new Promise(function (fulfillLogout, rejectLogout) {
    if (this.loginData) {
      this.client.webwxlogout(this.loginData).then(function() {
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
  this.userProfiles.push(userProfile);
  this.dispatchEvent_('onUserProfile', userProfile);
  return userProfile;
};

/*
 * Adds or updates a client.  Returns the modified ClientState object.
 */
WechatSocialProvider.prototype.addOrUpdateClient_ = function(friend, availability) {
  var update = false;
  var clientState = null;
  for (var i = 0; i < this.clientStates.length; i++) {
    clientState = this.clientStates[i];
    if (clientState.userId === friend.Uin) {  // is this what i want to check/do here????
      //might want to check the clientId here, and keep it fixed...
      clientState.clientId = friend.UserName;
      clientState.status = availability;
      clientState.lastUpdated = Date.now();
      clientState.lastSeen = Date.now();
      update = true;
    }
  }
  if (!update) {
    clientState = {
      "userId": friend.Uin,  // Unique identification number
      "clientId": friend.UserName,  // Session username
      "status": availability,  // All caps string saying online, offline, or online on another app.
      "lastUpdated": Date.now(),
      "lastSeen": Date.now()
    };
    this.clientStates.push(clientState);
  }
  this.dispatchEvent_('onClientState', clientState);
  return clientState;
};

/*
 * Handles new messages and information about clients.
 */
WechatSocialProvider.prototype.handleMessage_ = function(clientState, message) {
  this.dispatchEvent_('onMessage', {"from": clientState, "message": message});
};


/*
 *  getIcon_ helper method. updates the userProfile corresponding to the given 
 *  friend with the given imageData url.
 */
WechatSocialProvider.prototype.updateUserProfile__ = function(friend, iconURL) {
  this.client.log(0, "I'm updating the userProfile", friend.NickName);
  for (var i = 0; i < this.userProfiles.length; i++) {
    if (this.userProfiles[i].userId === friend.userId) {
      this.userProfiles[i].imageData = iconURL;
      this.dispatchEvent_('onUserProfile', this.userProfiles[i]);
      //TODO: consider URL.revokeObjectURL(iconURL); here since it's already been set?
      // really, it should be done once the image has loaded...

      i = this.userProfiles.length;  // ends loop when we've found the match.
    }
  }
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(WechatSocialProvider);
  } else {
    freedom.social().providePromises(WechatSocialProvider);
  }
}
