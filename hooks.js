/* List of all available hooks we can handle */
module.exports = [
    'capabilities', 'connect', 'connect_init', 'data',
    'data_post', 'deferred', 'deny', 'ehlo',
    'get_mx', 'helo', 'init_http', 'init_master', 'init_wss',
    'lookup_rdns', 'mail', 'max_data_exceeded',
    'noop', 'pre_send_trans_email', 'queue_ok',
    'quit', 'rcpt', 'rcpt_ok',
    'rset', 'send_email', 'unrecognized_command', 'vrfy',
    'disconnect', 'queue_outbound', 'reset_transaction',
    'queue'
    // 'log'
];