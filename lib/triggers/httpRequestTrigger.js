const { processMethod } = require('../utils.js');
const { wrapper } = require('@blendededge/ferryman-extensions');

function processTrigger(msg, cfg, snapshot, headers, tokenData = {}) {
  const wrapped = wrapper(this, msg, cfg, snapshot);
  // eslint-disable-next-line no-param-reassign
  msg.body = {};
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);
  const TOKEN = cfg.token || tokenData.apiKey;
  return processMethod.call(wrapped, msg, cfg, snapshot, TOKEN);
}

exports.process = processTrigger;
