const hooks = require('./hooks.js');
const Plugin = require('./plugin.js');

const vm = require('vm');

class PluginManager {
    constructor (plugin) {
        this.plugin = plugin;
        this.plugins = [];
        this.all_plugins = {};
    }

    register () {
        for (var i = 0; i < hooks.length; i++) {
            this.plugin.register_hook(hooks[i], 'hook', 0);
        }

        this.plugin.config.get('plugin_manager.yaml', 'yaml', () => {
            this.plugin.loginfo('Reloading Config');
            this.load_config();
        });

        this.load_config();
    }

    load_config () {
        var cfg = this.plugin.config.get('plugin_manager.yaml')

        if (!('plugins' in cfg)) {
            return this.plugin.logerror('No config found!');
        }

        // reset plugins before repopulating config
        this.plugins = [];

        for (var name in cfg.plugins) {
            var code = '"use strict"; exports.check = ' + cfg.plugins[name].check;
            var context = { console: { log: this.plugin.loginfo.bind(this.plugin) }, exports: { } };

            try {
                vm.runInNewContext(code, context);
            } catch (err) {
                this.plugin.logerror('Unable to load queue ' + name + ': ' + err);
                continue;
            }

            this.plugins.push({
                name: name,
                check: context.exports.check,
                plugins: this.load_plugins(cfg.plugins[name].plugins)
            });
        }
    }

    load_plugins (plugins) {
        var loaded_plugins = [];

        for (var i = 0; i < plugins.length; i++) {
            var name = plugins[i];

            if (!(name in this.all_plugins)) {
                this.all_plugins[name] = new Plugin(this, name);
                this.all_plugins[name].register();
            }

            loaded_plugins.push(this.all_plugins[name]);
        }

        return loaded_plugins;
    }

    handle_hook (hook, next, connection, params) {
        this.plugin.logdebug('Handling hook');

        /*
            Handles a single plugin collection,
            and calls the corresponding plugin callbacks
        */
        var run_hooks = function (run_plugins, plugins, idx, return_code, msg) {
            if (return_code !== undefined) {
                return run_plugins(return_code, msg);
            }

            if (idx < plugins.length) {
                var plugin = plugins[idx];

                this.plugin.logdebug('running ' + hook + ' plugin ' + plugin.name);
                plugin.run_hook(hook, run_hooks.bind(this, run_plugins, plugins, idx + 1), connection, params);
            } else {
                run_plugins();
            }
        }.bind(this);

        /*
          Handles a each plugin collection
        */
        var run_plugin_collection = function (idx, return_code, msg) {
            if (return_code !== undefined) {
                return next(return_code, msg);
            }

            if (idx < this.plugins.length) {
                var plugins = this.plugins[idx];

                if (plugins.check(connection)) {
                    this.plugin.logdebug('running ' + hook + ' plugin collection ' + plugins.name);
                    run_hooks(run_plugin_collection.bind(this, idx + 1), plugins.plugins, 0);
                } else {
                    this.plugin.logdebug('skipping ' + hook + ' plugin collection ' + plugins.name);
                    run_plugin_collection(idx + 1);
                }
            } else {
                next();
            }
        }.bind(this);

        // run through each plugin collection
        run_plugin_collection(0);
    }
}

module.exports = PluginManager;