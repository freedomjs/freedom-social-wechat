/* jslint moz:true */

function setupListeners(chat, displayWorker) {
  chat.on(displayWorker.port.emit.bind(displayWorker.port));

  displayWorker.port.on('login', function() {
    chat.login();
  });

  displayWorker.port.on('logout', function() {
    chat.logout();
  });

  displayWorker.port.on('send', function(data) {
    chat.send(data.to, data.msg);
  });

  displayWorker.port.on('test', function(data) {
    console.log('Test message: ' + data);
  });
}

exports.setupListeners = setupListeners;