const PluginManager = require('./plugin_manager.js');
var manager;

exports.register = function register () {
    const plugin = this;
    manager = new PluginManager(this);
    manager.register();
}

exports.hook = function (next, connection, params) {
    const plugin = this;

    manager.handle_hook(connection.hook, next, connection, params);
}
