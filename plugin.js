const fs = require('fs');
const path = require('path');
const vm = require('vm');
const hooks = require('./hooks.js');
const constants   = require('haraka-constants');

class CommandBag {
    constructor (plugin) {
        this.plugin = plugin;
        this.register_hook = plugin.register_hook.bind(plugin);
    }

    inspect () {
        return '[' + this.plugin.name + '] ';
    }

    get name () {
        return this.plugin.name;
    }
}

class Plugin {
    constructor (manager, name) {
        this.name = name;
        this.manager = manager;
        this.plugin = manager.plugin;
        this.commands = new CommandBag(this);
        this.hooks = {};
        this.hasPackageJson = false;
        this.plugin_path = '';

        this.load_plugin();
    }

    _make_custom_require () {
        const plugin = this;

        let require_paths;

        if (plugin.hasPackageJson) {
            // external plugin, ./ references to local plugin dir
            require_paths = [
                path.resolve(path.dirname(this.plugin_path), 'node_modules'),
                path.resolve(path.dirname(this.plugin_path)),
                path.resolve('node_modules'),
                path.resolve('.'),
                path.resolve('..'),
            ];
        } else {
            // internal plugin, means that ./ references to HARAKA_ENV,
            require_paths = [
                path.resolve(path.dirname(this.plugin_path), 'node_modules'),
                path.resolve('node_modules'),
                path.resolve('.'),
                path.resolve('..'),
            ];
        }

        return function (module) {
            for (var i = 0; i < require_paths.length; i++) {
                var test_path = path.resolve(require_paths[i], module);

                if (fs.existsSync(test_path + '.js')) {
                    return require(test_path + '.js');
                }

                if (fs.existsSync(test_path)) {
                    return require(test_path);
                }

                if (fs.existsSync(path.join(test_path, 'package.json'))) {
                    return require(test_path);
                }
            }

            if (plugin.hasPackageJson) {
                try {
                    const mod = require(module);
                    constants.import(global);
                    global.server = plugin.plugin.server;
                    return mod;
                } catch (err) {
                    plugin.plugin.logerror(err);
                    throw err;
                }
            }

            if (module === './config') {
                return plugin.plugin.config;
            }

            if (!/^\./.test(module)) {
                return require(module);
            }

            if (fs.existsSync(path.join(__dirname, `${module}.js`)) ||
                fs.existsSync(path.join(__dirname, module))) {
                return require(module);
            }

            return require(path.join(path.dirname(plugin.plugin.plugin_path), module));
        };
    }
    /*
        Searches for the plugin in different paths
    */
    find_plugin_path () {
        var name = this.name;

        if (/^haraka-plugin-/.test(name)) {
            name = name.replace(/^haraka-plugin-/, '');
        }

        var paths = [
            path.resolve('plugins', name + '.js'),
            path.resolve('node_modules', 'haraka-plugin-' + name, 'package.json'),
            path.resolve('..', 'haraka-plugin-' + name, 'package.json'),
        ];

        for (var i = 0; i < paths.length; i++) {
            var ppath = paths[i];

            try {
                if (fs.statSync(ppath)) {
                    if (path.basename(ppath) === 'package.json') {
                        this.hasPackageJson = true;
                    }

                    return ppath;
                }
            }
            catch (ignore) {}
        }

        return null;
    }

    /*
        Retrieves a plugin code
    */
    get_code () {
        if (this.hasPackageJson) {
            let packageDir = path.dirname(this.plugin_path);
            //return 'var _p = require("' + packageDir + '"); for (var k in _p) { exports[k] = _p[k] }';

            return '"use strict"; ' + fs.readFileSync(packageDir + '/index.js');
        }

        return '"use strict"; ' + fs.readFileSync(this.plugin_path);
    }

    /*
        Loads a plugin based on the initialized name
    */
    load_plugin () {
        this.plugin_path = this.find_plugin_path();

        if (!this.plugin_path) {
            this.plugin.logerror('[' + this.name + '] Unable to find plugin code - is the plugin installed?');
            return;
        }

        var code = this.get_code();
        var plugin = this;

        const sandbox = {
            require: this._make_custom_require(),
            __filename: this.plugin_path,
            __dirname: path.dirname(this.plugin_path),
            exports: this.commands,
            setTimeout: setTimeout,
            clearTimeout: clearTimeout,
            setInterval: setInterval,
            clearInterval: clearInterval,
            process: process,
            Buffer: Buffer,
            Math: Math,
            console: console,
            server: server,
            setImmediate: setImmediate
        };

        if (this.hasPackageJson) {
            delete sandbox.__filename;
        }

        constants.import(sandbox);

        try {
            vm.runInNewContext(code, sandbox, this.plugin_path);
        } catch (err) {
            console.log(err);
            this.plugin.logerror('[' + this.name + '] Unable to execute plugin code: ' + err);
        }

        for (var name in Object.getPrototypeOf(this.plugin)) {
            this.commands[name] = this.forward_log.bind(this, name);
        }

        this.commands.config = this.plugin.config;
        this.commands.inherits = this.inherits.bind(this);
        this.commands.haraka_require = this.plugin.haraka_require;
    }

    /*
        Inherit function used in some plugins
    */
    inherits (parent_name) {
        this.forward_log('loginfo', 'Loading parent ' + parent_name);
        const parent_plugin = new Plugin(this.manager, parent_name);

        for (const method in parent_plugin.commands) {
            if (!this.commands[method]) {
                this.commands[method] = parent_plugin.commands[method];
            }
        }

        if (parent_plugin.commands.register) {
            parent_plugin.commands.register.call(this.commands);
        }

        // this.base[parent_name] = parent_plugin;
    }

    /*
        Forwards logs to the real plugin
    */
    forward_log (func, text) {
        var prepend = [];
        var args = Array.prototype.slice.call(arguments, 1)

        if (!(arguments[1] instanceof CommandBag)) {
            prepend.push(this.commands);
        }

        this.plugin[func].apply(this.plugin, prepend.concat(args));
    }

    /*
        Registers the plugin with the plugin manager
    */
    register () {
        if ('register' in this.commands) {
            this.commands.register.call(this.commands);
        } else {
            this.forward_log('logerror', this.commands, 'Unable to find register function - fine if you don\'t need one!');
        }

        // register any hook_blah methods.
        for (const method in this.commands) {
            const result = method.match(/^hook_(\w+)\b/);

            if (result) {
                this.commands.register_hook(result[1], method);
            }
        }
    }

    /*
        Register a hook for this plugin
    */
    register_hook (hook, callback, priority) {
        if (hooks.indexOf(hook) === -1) {
            this.plugin.logerror(this.commands, 'Unable to register hook ' + hook + ' - not available');
            return;
        }

        if (typeof callback !== 'function') {
            if (!(callback in this.commands)) {
                this.plugin.logerror('Unable to register callback for hook ' + hook + ' - not a function');
                return;
            }

            callback = this.commands[callback].bind(this.commands);
        }

        if (!(hook in this.hooks)) {
            this.hooks[hook] = [];
        }

        this.hooks[hook].push(callback);
        this.commands.loginfo(this.commands, 'Hook ' + hook + ' registered');

        // this.manager.register_plugin_hook(this, hook, callback, priority);
    }

    /*
        Runs a specific hook for this plugin
    */
    run_hook (hook, next, connection, params) {
        var run_hooks = function (idx, return_code, msg) {
            if (return_code !== undefined) {
                return next(return_code, msg);
            }

            if (idx < this.hooks[hook].length) {
                var hook_callback = this.hooks[hook][idx];

                this.commands.loginfo('Handling hook ' + hook);

                // handle the plugin callback
                hook_callback(run_hooks.bind(this, idx + 1), connection, params);
            } else {
                // fallback in case no hook says "OK"
                next();
            }
        }.bind(this);

        // if we got hooks registered call them
        if (hook in this.hooks) {
            return run_hooks(0);
        }

        // fallback in case we don't have this hook
        next();
    }

    toString () {
        return this.name;
    }
}

module.exports = Plugin;