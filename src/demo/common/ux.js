/*globals freedom, console, self*/
/*jslint sloppy:true */

/**
 * Bind handlers on startup
 */
var theBuddylist;  // TODO: remove
function start(instance) {
  console.log('start called!');
  var chatClient = instance(),
    // If messages are going to a specific user, store that here.
    activeBuddylistEntry,
    buddylist,
    input;

  document.getElementById('msg-input').focus();

  function clearLog() {
    var log = document.getElementById('messagelist');
    log.innerHTML = "";
  }

  function appendLog(elt) {
    var log = document.getElementById('messagelist'),
      br;
    //Trim old messages
    while (log.childNodes.length > 36) {
      log.removeChild(log.firstChild);
    }
    log.appendChild(elt);
    br = document.createElement('br');
    log.appendChild(br);
    br.scrollIntoView();
  }

  function makeDisplayString(buddylistEntry) {
    return buddylistEntry.name && buddylistEntry.name !== buddylistEntry.clientId ?
        buddylistEntry.name + ' (' + buddylistEntry.clientId + ')' :
        buddylistEntry.clientId;
  }

  function redrawBuddylist() {
    var onClick = function (buddylistEntry, child) {
      console.log("Messages will be sent to: " + buddylistEntry.clientId);
      activeBuddylistEntry = buddylistEntry;
      redrawBuddylist();
      document.getElementById('msg-input').focus();
    },
      buddylistDiv = document.getElementById('buddylist'),
      clientId,
      child;

    // Remove all elements in there now
    buddylistDiv.innerHTML = "<b>Buddylist</b>";

    // Create a new element for each buddy
    for (clientId in buddylist) {
      if (buddylist.hasOwnProperty(clientId)) {
        child = document.createElement('div');
        if (activeBuddylistEntry === buddylist[clientId]) {
          child.innerHTML = "[" + makeDisplayString(buddylist[clientId]) + "]";
        } else {
          child.innerHTML = makeDisplayString(buddylist[clientId]);
        }
        // If the user clicks on a buddy, change our current destination for messages
        child.addEventListener('click', onClick.bind(this, buddylist[clientId], child), true);
        buddylistDiv.appendChild(child);
      }
    }

  }

  // on changes to the buddylist, redraw entire buddylist
  chatClient.on('recv-buddylist', function (val) {
    buddylist = val;
    theBuddylist = buddylist;
    console.log('got buddylist', buddylist);
    redrawBuddylist();
  });

  // On new messages, append it to our message log
  chatClient.on('recv-message', function (data) {
    // Show the name instead of the clientId, if it's available.
    var clientId = data.from.clientId,
      displayName = buddylist[clientId].name || clientId,
      message = displayName + ": " + data.message;
    appendLog(document.createTextNode(message));
  });

  // On new messages, append it to our message log
  chatClient.on('recv-err', function (data) {
    document.getElementById('uid').textContent = "Error: " + data.message;
  });

  // Display our own clientId when we get it
  chatClient.on('recv-uid', function (data) {
    document.getElementById('uid').textContent = "Logged in as: " + data;
  });

  // Display the current status of our connection to the Social provider
  chatClient.on('recv-status', function (msg) {
    if (msg && msg === 'online') {
      document.getElementById('msg-input').disabled = false;
    } else {
      document.getElementById('msg-input').disabled = true;
    }
    clearLog();
    var elt = document.createElement('b');
    elt.appendChild(document.createTextNode('Status: ' + msg));
    appendLog(elt);
  });

  // Listen for the enter key and send messages on return
  input = document.getElementById('msg-input');
  input.onkeydown = function (evt) {
    if (evt.keyCode === 13) {
      var text = input.value;
      input.value = "";
      appendLog(document.createTextNode("You: " + text));
      chatClient.send(activeBuddylistEntry.clientId, text);
    }
  };

  // Just call boot when login is clicked
  console.log('connecting login!');
  var loginButton = document.getElementById('uid');
  console.log('loginButton: ' + loginButton);
  loginButton.addEventListener('click', function() {
    console.log('login clicked');
    chatClient.login();
  });
}

/**
 * In Firefox, window.freedom is not defined
 * Instead, communicate with listener.js, which will forward the messages
 * to the root freedom.js module
 **/

window.onload = function (port) {
  if (typeof freedom !== 'undefined') {
    freedom('demo.json').then(start);
  } else if (typeof port !== 'undefined') { // Firefox
    port.emit('test', 'Initializing self.port');
    start(function() {
      return {
        send: function(to, msg) {
          port.emit('send', {to: to, msg: msg});
        },
        login: function() {
          port.emit('login');
        },
        logout: function() {
          port.emit('logout');
        },
        on: port.on.bind(port)
      };
    });
  } else {
    console.error("Error initializing: cannot detect environment");
  }
}.bind({}, self.port);
