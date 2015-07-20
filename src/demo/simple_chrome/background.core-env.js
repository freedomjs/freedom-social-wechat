/// <reference path='../../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../../third_party/freedom-typings/freedom-core-env.d.ts' />


var script = document.createElement('script');
script.src = 'freedom-for-chrome/freedom-for-chrome.js';
document.head.appendChild(script);
// Keep a background timeout running continuously, to prevent chrome from
// putting the app to sleep.
function keepAlive() {
    setTimeout(keepAlive, 5000);
}
keepAlive();
exports.freedomModule = null;
function runFreedomModule(modulePath) {
    freedom(modulePath, {
        'logger': 'uproxy-lib/loggingprovider/freedom-module.json',
        'debug': 'debug'
    }).then(function (freedomModuleFactory) {
        exports.freedomModule = freedomModuleFactory();
    }, function (e) {
        throw e;
    });
}
exports.runFreedomModule = runFreedomModule;
console.info('This is a sample app to run top level freedom modules. \n' + 'This can be helpful to debug integration test failures, for example. + \n' + 'Example usage: \n ' + '  browserified_exports.runFreedomModule(' + '\'uproxy-networking/integration-tests/tcp/freedom-module.json\'); \n' + 'or \n' + '  browserified_exports.runFreedomModule(' + '\'uproxy-networking/simple-socks/freedom-module.json\'); \n' + 'Then, once loaded, you can bind the module with something like this: \n' + '  var m = browserified_exports.freedomModule; \n');
