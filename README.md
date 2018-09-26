# Plugin Manager

This plugin replaces the normal haraka plugin manager, by subscribing to all hooks available and providing it's own plugin architecture.

## How to use?

Add plugin_manager as only entry into your plugins file. Configuration files and all plugin folders stay the same.

```
plugin_manager
```

Configure the plugins you'd like to use in the plugin_manager.yaml file:

```
plugins:
    global:
        check: "function (connection) { return true; }"
        plugins:
         - tls
         - auth-ldap

    relay:
        check: "function (connection) { return connection.__proto__.constructor.name == 'Connection' && connection.relaying === true; }"
        plugins:
         - dkim_sign

    inbound:
        check: "function (connection) { return connection.__proto__.constructor.name == 'Connection' && connection.relaying === false; }"
        plugins:
         - spf
         - dkim_verify
         - rcpt-ldap
         - karma
         - queue/lmtp

    outbound:
        check: "function (connection) { return connection.__proto__.constructor.name == 'HMailItem'; }"
        plugins:
         - queue/lmtp
```

There are currently 4 different queues for plugins defined in the example config, you can add as many as you'd like.

The queues are:

global:   executed on each connection, independet if outbound or inbound
relay:    executed on inbound relay connections (e.g. authenticated)
inbound:  executed on inbound connections without relay (normal inbound email)
outbound: executed on outbound connections

Be careful that some plugins need inbound and outbound configuration (e.g. queue/lmtp), each plugin is loaded only once!

## What is tested?

Executing haraka directly with the module, execution as globally installed application is *not tested*.
