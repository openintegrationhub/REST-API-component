const { processMethod } = require('../utils.js');

function processAction(msg, cfg, snapshot, headers, tokenData = {}) {
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);
  this.logger.debug('snapshot: ', snapshot);
  const TOKEN = cfg.token || tokenData.apiKey;
  return processMethod.call(this, msg, cfg, snapshot, TOKEN);
}

exports.process = processAction;
