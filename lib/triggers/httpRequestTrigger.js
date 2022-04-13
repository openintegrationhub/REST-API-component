const { processMethod } = require('../utils.js');

function processTrigger(msg, cfg, snapshot, headers, tokenData = {}) {
  // eslint-disable-next-line no-param-reassign
  msg.body = {};
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);
  const TOKEN = cfg.token || tokenData.apiKey;
  return processMethod.call(this, msg, cfg, snapshot, TOKEN);
}

exports.process = processTrigger;
