/*
 * WeChat social provider
 */

var WechatSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'wechat';
  this.initLogger_('WechatSocialProvider');
  this.initState_();
};

/*
 * Initialize this.logger using the module name.
 */
WechatSocialProvider.prototype.initLogger_ = function(moduleName) {
  this.logger = console;  // Initialize to console if it exists.
  if (typeof freedom !== 'undefined' &&
      typeof freedom.core === 'function') {
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
    // TODO: get a real token and get real client state.
      var clientState = {
        userId: 'myUserId',
        clientId: 'myClientId',
        status: "ONLINE",
        lastUpdated: Date.now(),
        lastSeen: Date.now()
      };
      fulfillLogin(clientState);
    }.bind(this));  // end of getOAuthToken_
  }.bind(this));  // end of return new Promise
};

/*
 * Returns a Promise which fulfills with all known ClientStates.
 */
WechatSocialProvider.prototype.getClients = function() {
  return Promise.resolve({});
};

/*
 * Returns a Promise which fulfills with all known UserProfiles
 */
WechatSocialProvider.prototype.getUsers = function() {
  return Promise.resolve({});
};

/*
 * Sends a message to another clientId.
 */
WechatSocialProvider.prototype.sendMessage = function(friend, message) {
  return Promise.resolve();
};

/*
 * Logs out of the social network.
 */
WechatSocialProvider.prototype.logout = function() {
  return Promise.resolve();
};

/*
 * Initialize state.
 */
WechatSocialProvider.prototype.initState_ = function() {
};

/*
 * Adds a UserProfile.
 */
WechatSocialProvider.prototype.addUserProfile_ = function(friend) {
  var userProfile = {
    userId: friend.userId,
    name: friend.name || '',
    lastUpdated: Date.now(),
    url: friend.url || '',
    imageData: friend.imageData || ''
  };
  this.dispatchEvent_('onUserProfile', userProfile);
};

/*
 * Adds a or updates a client.  Returns the modified ClientState object.
 */
WechatSocialProvider.prototype.addOrUpdateClient_ =
    function(userId, clientId, status) {
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
WechatSocialProvider.prototype.handleMessage_ =
    function(clientState, message) {
  this.dispatchEvent_(
      'onMessage', {from: clientState, message: message});
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(WechatSocialProvider);
  } else {
    freedom.social().providePromises(WechatSocialProvider);
  }
}
