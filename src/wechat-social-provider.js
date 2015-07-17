/*
 * WeChat social provider
 */

var wechat = require('../node_modules/wechat-webclient/wechat.js');

var WechatSocialProvider = function(dispatchEvent) {
  this.client = new wechat.weChatClient();
  this.loginData = null;
  this.dispatchEvent_ = dispatchEvent;
  this.client.events.onMessage = function(message) {
    this.dispatchEvent_("onMessage", message);
  };
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
      return oauth.launchAuthFlow('https://' + url, stateObj).then(function(responseUrl) {
        return responseUrl;
      });
    });
  }.bind(this);
  this.networkName_ = 'wechat';
  this.initLogger_('WechatSocialProvider');
  this.initState_();
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
      var clientState = {
        userId: loginData.wxuin,  // WeiXin unique identifying number
        clientId: this.client.thisUser.UserName, // WeiXin session UserName
        status: "ONLINE",
        lastUpdated: Date.now(),
        lastSeen: Date.now()
      };
      fulfillLogin(clientState);
      this.loginData = loginData;
      this.client.webwxgetcontact(loginData).then(function(){
        for (var i = 0; i < this.client.contacts.length; i++) {
          var friend = this.client.contacts[i];
          var userProfile = { //TODO: is this for this.client.thisUser as well? YES.
            userId: friend.Uin,  //this.client.contacts[x].UserName
            name: friend.NickName || '', //this.client.contacts[x].NickName
            lastUpdated: Date.now(),
            url: friend.url || '',  // <this isn't a thing in wechat... therefore leave blank, i.e. ''
            imageData: this.client.WEBDOM + friend.HeadImgUrl  //this.client.contacts[x].HeadImgUrl
          };
          this.dispatchEvent_('onUserProfile', userProfile); //TODO: how to dispatchEvent_?
          var clientState = {
            userId: friend.Uin,
            clientId: friend.UserName,
            status: 'ONLINE',
            lastUpdated: Date.now(),
            lastSeen: Date.now()
          };
          this.dispatchEvent_('onClientState', clientState);
        }
      }.bind(this));
      setTimeout(this.client.synccheck.bind(this, loginData), 3000);
    }.bind(this), this.client.handleError);  // end of getOAuthToken_
  }.bind(this));  // end of return new Promise
};

/*
 * Returns a Promise which fulfills with all known ClientStates.
 */
WechatSocialProvider.prototype.getClients = function() {
  return Promise.resolve({

  });
};

/*
 * Returns a Promise which fulfills with all known UserProfiles
 */
WechatSocialProvider.prototype.getUsers = function() {
  // This is just a getter method.
  return new Promise(function (fulfillGetUsers, rejectGetUsers) {
    if (this.client.contacts) fulfillGetUsers(this.client.contacts);
    else rejectGetUsers();
  }.bind(this));
};

/*
 * Sends a message to another clientId.
 */
WechatSocialProvider.prototype.sendMessage = function(friend, message) {
  //<friend>.UserName and message string to be sent (hidden)
  //TODO: friend is clientId string.
  return new Promise(function (fulfullSendMessage, rejectSendMessage) {
    var msg = {
      "type": 1,  // type: 51 for hidden messages, type 1 for plaintext
      "content": message,
      "recipient": friend,
      "id": +new Date() + Math.random().toFixed(3).replace(".", "")
    };
    this.client.webwxsendmsg(this.loginData, msg);
  }.bind(this));
};

/*
 * Logs out of the social network.
 */
WechatSocialProvider.prototype.logout = function() {
  return new Promise(function (fulfillLogout, rejectLogout) {
    this.client.webwxlogout(this.loginData).then(function() {
     fulfillLogout(this.addOrUpdateClient_(this.loginData.wxuin, this.client.thisUser.UserName, "OFFLINE"));
     //TODO: is this good?
    }.bind(this), rejectLogout);
  }.bind(this));
};

/*
 * Initialize state.
 */
WechatSocialProvider.prototype.initState_ = function() {
  this.addOrUpdateClient_('','',"OFFLINE"); //FIXME???????
};

/*
 * Adds a UserProfile.
 */
WechatSocialProvider.prototype.addUserProfile_ = function(friend) {
  //TODO: what is the format of the friend being passed to me?
  var userProfile = { //TODO: is this for this.client.thisUser as well? YES.
    userId: friend.userId,  //this.client.contacts[x].UserName
    name: friend.name || '', //this.client.contacts[x].NickName
    lastUpdated: Date.now(),
    url: friend.url || '',  // <this isn't a thing in wechat... therefore leave blank, i.e. ''
    imageData: friend.imageData || ''  //this.client.contacts[x].HeadImgUrl
  };
  this.dispatchEvent_('onUserProfile', userProfile); //TODO: how to dispatchEvent_?
};

/*
 * Adds a or updates a client.  Returns the modified ClientState object.
 */
WechatSocialProvider.prototype.addOrUpdateClient_ = function(userId, clientId, status) {
  var clientState = {
    userId: userId,
    clientId: clientId,
    status: status,
    lastUpdated: Date.now(),
    lastSeen: Date.now()
  };
  this.dispatchEvent_('onClientState', clientState);
  return clientState;
};

/*
 * Handles new messages and information about clients.
 */
WechatSocialProvider.prototype.handleMessage_ = function(clientState, message) {
  this.dispatchEvent_('onMessage', {from: clientState, message: message});
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(WechatSocialProvider);
  } else {
    freedom.social().providePromises(WechatSocialProvider);
  }
}
